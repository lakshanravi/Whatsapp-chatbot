import json
import re
import sqlite3
from contextlib import closing
from pathlib import Path
from threading import RLock


class FTSStore:
    """Persistent lexical search built from already-indexed Chroma chunks."""

    def __init__(self, path: str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=NORMAL")
        return connection

    def _initialize(self) -> None:
        with closing(self._connect()) as connection:
            connection.execute(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                    chunk_id UNINDEXED,
                    company_id UNINDEXED,
                    document_id UNINDEXED,
                    is_active UNINDEXED,
                    model_keys,
                    product_keys,
                    document_name,
                    section_heading,
                    content,
                    metadata_json UNINDEXED,
                    tokenize='unicode61 remove_diacritics 2'
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS fts_state(
                    company_id TEXT PRIMARY KEY,
                    chunk_count INTEGER NOT NULL,
                    signature TEXT NOT NULL DEFAULT ''
                )
                """
            )

    @staticmethod
    def _keys(value: object) -> str:
        if isinstance(value, (list, tuple, set)):
            items = value
        else:
            items = str(value or "").split(",")
        normalized = {
            re.sub(r"[^A-Z0-9]", "", str(item).upper())
            for item in items
            if str(item).strip()
        }
        return " ".join(sorted(item for item in normalized if item))

    @staticmethod
    def _match_query(question: str) -> str:
        stopwords = {
            "a", "an", "and", "are", "can", "do", "does", "for", "from",
            "how", "i", "in", "is", "it", "my", "of", "on", "or", "the",
            "this", "to", "use", "what", "which", "with", "you", "your",
        }
        terms = []
        for term in re.findall(r"[a-z0-9]+", question.casefold()):
            if len(term) < 2 or term in stopwords or term in terms:
                continue
            terms.append(term)
        return " OR ".join(f'"{term}"' for term in terms[:24])

    @staticmethod
    def _signature(ids: list[str]) -> str:
        if not ids:
            return ""
        return f"{ids[0]}:{ids[-1]}:{len(ids)}"

    def is_current(self, company_id: str, ids: list[str]) -> bool:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT chunk_count, signature FROM fts_state WHERE company_id = ?",
                (company_id,),
            ).fetchone()
        return bool(
            row
            and int(row["chunk_count"]) == len(ids)
            and row["signature"] == self._signature(ids)
        )

    def has_count(self, company_id: str, chunk_count: int) -> bool:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT chunk_count FROM fts_state WHERE company_id = ?",
                (company_id,),
            ).fetchone()
        return bool(row and int(row["chunk_count"]) == chunk_count)

    def rebuild(
        self,
        company_id: str,
        ids: list[str],
        documents: list[str],
        metadatas: list[dict],
    ) -> None:
        rows = []
        for chunk_id, content, metadata in zip(ids, documents, metadatas):
            model_values = ",".join(filter(None, [
                str(metadata.get("model_ids", "")),
                str(metadata.get("document_model_ids", "")),
            ]))
            rows.append((
                chunk_id,
                company_id,
                str(metadata.get("document_id", "")),
                "1" if metadata.get("is_active", True) else "0",
                self._keys(model_values),
                self._keys(metadata.get("product_names", "")),
                str(metadata.get("document_name", "")),
                str(metadata.get("section_heading", "")),
                str(content or ""),
                json.dumps(metadata, ensure_ascii=False, separators=(",", ":")),
            ))
        with self._lock, closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "DELETE FROM chunks_fts WHERE company_id = ?",
                (company_id,),
            )
            connection.executemany(
                """
                INSERT INTO chunks_fts(
                    chunk_id, company_id, document_id, is_active, model_keys,
                    product_keys, document_name, section_heading, content,
                    metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
            connection.execute(
                """
                INSERT INTO fts_state(company_id, chunk_count, signature)
                VALUES (?, ?, ?)
                ON CONFLICT(company_id) DO UPDATE SET
                    chunk_count=excluded.chunk_count,
                    signature=excluded.signature
                """,
                (company_id, len(ids), self._signature(ids)),
            )
            connection.commit()

    def invalidate(self, company_id: str) -> None:
        with self._lock, closing(self._connect()) as connection:
            connection.execute(
                "DELETE FROM fts_state WHERE company_id = ?",
                (company_id,),
            )

    def search(
        self,
        company_id: str,
        question: str,
        limit: int,
        allowed_document_ids: set[str] | None = None,
        required_model_ids: set[str] | None = None,
        required_product_names: set[str] | None = None,
    ) -> list[dict]:
        match_query = self._match_query(question)
        if not match_query:
            return []
        clauses = [
            "chunks_fts MATCH ?",
            "company_id = ?",
            "is_active = '1'",
        ]
        parameters: list[object] = [match_query, company_id]
        allowed = sorted(allowed_document_ids or set())
        if allowed:
            clauses.append(
                "document_id IN (" + ",".join("?" for _ in allowed) + ")"
            )
            parameters.extend(allowed)
        model_keys = sorted({
            re.sub(r"[^A-Z0-9]", "", value.upper())
            for value in (required_model_ids or set())
            if value
        })
        if model_keys:
            clauses.append(
                "(" + " OR ".join("model_keys LIKE ?" for _ in model_keys) + ")"
            )
            parameters.extend(f"%{value}%" for value in model_keys)
        product_keys = sorted({
            re.sub(r"[^A-Z0-9]", "", value.upper())
            for value in (required_product_names or set())
            if value
        })
        if product_keys:
            clauses.append(
                "(" + " OR ".join(
                    "product_keys LIKE ? OR "
                    "replace(replace(upper(document_name), '-', ''), ' ', '') LIKE ? OR "
                    "replace(replace(upper(content), '-', ''), ' ', '') LIKE ?"
                    for _ in product_keys
                ) + ")"
            )
            for value in product_keys:
                parameters.extend((f"%{value}%", f"%{value}%", f"%{value}%"))
        parameters.append(max(1, limit))
        sql = f"""
            SELECT chunk_id, document_id, document_name, section_heading,
                   content, metadata_json, bm25(chunks_fts,
                       0.0, 0.0, 0.0, 0.0, 2.0, 1.5, 2.5, 1.5, 3.0, 0.0
                   ) AS lexical_score
            FROM chunks_fts
            WHERE {' AND '.join(clauses)}
            ORDER BY lexical_score
            LIMIT ?
        """
        with closing(self._connect()) as connection:
            rows = connection.execute(sql, parameters).fetchall()
        return [
            {
                "chunk_id": row["chunk_id"],
                "document_id": row["document_id"],
                "document_name": row["document_name"],
                "section_heading": row["section_heading"],
                "content": row["content"],
                "metadata": json.loads(row["metadata_json"]),
                "lexical_score": float(row["lexical_score"]),
            }
            for row in rows
        ]

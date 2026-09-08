"""Inspect a Chroma persistent-index export without loading its vector model."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from tempfile import TemporaryDirectory


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("index", type=Path, help="Chroma directory, SQLite file, or ZIP")
    parser.add_argument("--schema", action="store_true", help="Print the SQLite schema")
    parser.add_argument("--output-dir", type=Path, help="Write a full chunk audit here")
    args = parser.parse_args()

    with TemporaryDirectory(prefix="chroma-inspect-") as temp_dir:
        source = args.index.resolve()
        if source.suffix.casefold() == ".zip":
            with zipfile.ZipFile(source) as archive:
                archive.extract("chroma.sqlite3", temp_dir)
            database = Path(temp_dir, "chroma.sqlite3")
        elif source.is_dir():
            database = source / "chroma.sqlite3"
        else:
            database = source

        connection = sqlite3.connect(database)
        connection.row_factory = sqlite3.Row
        tables = connection.execute(
            "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        print(f"Database: {database}")
        print(f"SQLite: {sqlite3.sqlite_version}")
        print("Tables:", ", ".join(row["name"] for row in tables))
        for row in tables:
            count = connection.execute(
                f'SELECT COUNT(*) FROM "{row["name"]}"'
            ).fetchone()[0]
            print(f"  {row['name']}: {count:,}")
            if args.schema:
                print(row["sql"] or "")

        collections = connection.execute(
            "SELECT id, name, dimension, config_json_str FROM collections ORDER BY name"
        ).fetchall()
        print("Collections:")
        for collection in collections:
            metadata_rows = connection.execute(
                "SELECT key, str_value, int_value, float_value, bool_value "
                "FROM collection_metadata WHERE collection_id=? ORDER BY key",
                (collection["id"],),
            ).fetchall()
            metadata = {
                row["key"]: next(
                    value for value in (
                        row["str_value"], row["int_value"],
                        row["float_value"], row["bool_value"],
                    ) if value is not None
                )
                for row in metadata_rows
            }
            segment_ids = [
                row[0] for row in connection.execute(
                    "SELECT id FROM segments WHERE collection=? AND scope='METADATA'",
                    (collection["id"],),
                )
            ]
            placeholders = ",".join("?" for _ in segment_ids) or "NULL"
            count = connection.execute(
                f"SELECT COUNT(*) FROM embeddings WHERE segment_id IN ({placeholders})",
                segment_ids,
            ).fetchone()[0]
            print(
                f"  {collection['name']}: {count:,} chunks, "
                f"dimension={collection['dimension']}, metadata={metadata}"
            )

        if args.output_dir:
            output_dir = args.output_dir.resolve()
            output_dir.mkdir(parents=True, exist_ok=True)
            dump_path = output_dir / "chunks.jsonl"
            summary_path = output_dir / "summary.md"
            collection_path = output_dir / "collections.json"

            segment_to_collection = {
                row["segment_id"]: row["collection_name"]
                for row in connection.execute(
                    "SELECT s.id AS segment_id, c.name AS collection_name "
                    "FROM segments s JOIN collections c ON c.id=s.collection "
                    "WHERE s.scope='METADATA'"
                )
            }
            document_stats: dict[tuple[str, str, str], dict] = defaultdict(
                lambda: {
                    "chunk_count": 0,
                    "pages": set(),
                    "section_headings": set(),
                    "evidence_types": Counter(),
                    "model_ids": set(),
                    "document_model_ids": set(),
                    "product_names": set(),
                    "active_values": set(),
                    "total_characters": 0,
                }
            )
            metadata_keys: Counter[str] = Counter()
            evidence_totals: Counter[str] = Counter()
            active_totals: Counter[str] = Counter()
            model_scope_totals: Counter[str] = Counter()
            chunk_lengths: list[int] = []
            content_hashes: Counter[str] = Counter()
            largest_chunks: list[tuple[int, str, str, object, str]] = []
            blank_chunks = 0
            total_characters = 0
            rows_written = 0
            with dump_path.open("w", encoding="utf-8", newline="\n") as dump:
                embeddings = connection.execute(
                    "SELECT id, segment_id, embedding_id, created_at "
                    "FROM embeddings ORDER BY segment_id, embedding_id"
                )
                for embedding in embeddings:
                    metadata_rows = connection.execute(
                        "SELECT key, string_value, int_value, float_value, bool_value "
                        "FROM embedding_metadata WHERE id=? ORDER BY key",
                        (embedding["id"],),
                    ).fetchall()
                    metadata: dict[str, object] = {}
                    for item in metadata_rows:
                        metadata_keys[item["key"]] += 1
                        value = next(
                            (
                                value for value in (
                                    item["string_value"], item["int_value"],
                                    item["float_value"], item["bool_value"],
                                ) if value is not None
                            ),
                            None,
                        )
                        metadata[item["key"]] = value
                    content = str(metadata.pop("chroma:document", "") or "")
                    record = {
                        "collection": segment_to_collection.get(embedding["segment_id"], ""),
                        "embedding_id": embedding["embedding_id"],
                        "created_at": embedding["created_at"],
                        "content": content,
                        "metadata": metadata,
                    }
                    dump.write(json.dumps(record, ensure_ascii=False) + "\n")
                    rows_written += 1
                    total_characters += len(content)
                    chunk_lengths.append(len(content))
                    content_hashes[hashlib.sha256(content.encode("utf-8")).hexdigest()] += 1
                    largest_chunks.append((
                        len(content),
                        str(metadata.get("document_name", "")),
                        embedding["embedding_id"],
                        metadata.get("page_number", ""),
                        str(metadata.get("evidence_type", "unknown")),
                    ))
                    if not content.strip():
                        blank_chunks += 1
                    evidence_totals[str(metadata.get("evidence_type", "unknown"))] += 1
                    active_totals[str(metadata.get("is_active", "unknown"))] += 1
                    model_scope_totals[str(metadata.get("model_scope", "unknown"))] += 1

                    key = (
                        record["collection"],
                        str(metadata.get("document_id", "")),
                        str(metadata.get("document_name", "")),
                    )
                    stats = document_stats[key]
                    stats["chunk_count"] += 1
                    stats["total_characters"] += len(content)
                    for field, target in (
                        ("page_number", "pages"),
                        ("section_heading", "section_headings"),
                        ("is_active", "active_values"),
                    ):
                        value = metadata.get(field)
                        if value not in (None, ""):
                            stats[target].add(value)
                    stats["evidence_types"][str(metadata.get("evidence_type", "unknown"))] += 1
                    for field in ("model_ids", "document_model_ids", "product_names"):
                        value = str(metadata.get(field, "") or "")
                        stats[field].update(part for part in value.split(",") if part)

            collection_records = [dict(row) for row in collections]
            collection_path.write_text(
                json.dumps(collection_records, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            sorted_lengths = sorted(chunk_lengths)
            average_length = total_characters / rows_written if rows_written else 0
            median_length = (
                sorted_lengths[len(sorted_lengths) // 2] if sorted_lengths else 0
            )
            evidence_summary = ", ".join(
                f"{name}: {count:,}" for name, count in sorted(evidence_totals.items())
            )
            active_summary = ", ".join(
                f"{name}: {count:,}" for name, count in sorted(active_totals.items())
            )
            model_scope_summary = ", ".join(
                f"{name}: {count:,}" for name, count in sorted(model_scope_totals.items())
            )
            duplicate_records = sum(count - 1 for count in content_hashes.values() if count > 1)
            over_1200 = sum(length > 1200 for length in chunk_lengths)
            over_2000 = sum(length > 2000 for length in chunk_lengths)
            under_50 = sum(length < 50 for length in chunk_lengths)
            lines = [
                "# Chroma index inventory",
                "",
                f"- Collections: {len(collections):,}",
                f"- Documents: {len(document_stats):,}",
                f"- Chunks: {rows_written:,}",
                f"- Stored chunk characters: {total_characters:,}",
                f"- Chunk length: min {min(sorted_lengths) if sorted_lengths else 0:,}, "
                f"median {median_length:,}, average {average_length:,.1f}, "
                f"max {max(sorted_lengths) if sorted_lengths else 0:,} characters",
                f"- Blank chunks: {blank_chunks:,}",
                f"- Very short chunks (<50 characters): {under_50:,}",
                f"- Large chunks (>1,200 characters): {over_1200:,}; "
                f">2,000 characters: {over_2000:,}",
                f"- Exact duplicate-content records: {duplicate_records:,}",
                f"- Evidence types: {evidence_summary}",
                f"- Active values: {active_summary}",
                f"- Model scopes: {model_scope_summary}",
                f"- Metadata fields: {', '.join(sorted(metadata_keys))}",
                "",
                "## Largest chunks",
                "",
                "| Characters | Document | Chunk ID | Page | Evidence |",
                "|---:|---|---|---:|---|",
            ]
            for length, name, chunk_id, page, evidence_type in sorted(
                largest_chunks, reverse=True
            )[:10]:
                safe_name = name.replace("|", "\\|").replace("\n", " ")
                lines.append(
                    f"| {length:,} | {safe_name} | {chunk_id} | {page} | {evidence_type} |"
                )
            lines.extend([
                "",
                "## Documents",
                "",
                "| Collection | Document | Document ID | Chunks | Pages | Evidence | Active | Models | Products |",
                "|---|---|---|---:|---|---|---|---|---|",
            ])
            for (collection_name, document_id, document_name), stats in sorted(
                document_stats.items(), key=lambda item: (
                    item[0][0].casefold(), item[0][2].casefold(), item[0][1]
                )
            ):
                pages = sorted(stats["pages"], key=lambda value: (str(type(value)), value))
                page_display = (
                    f"{pages[0]}–{pages[-1]} ({len(pages)} pages)" if pages else "—"
                )
                evidence = ", ".join(
                    f"{name}: {count}" for name, count in sorted(stats["evidence_types"].items())
                )
                active = ", ".join(map(str, sorted(stats["active_values"], key=str))) or "—"
                models = ", ".join(sorted(stats["document_model_ids"] or stats["model_ids"])) or "—"
                products = ", ".join(sorted(stats["product_names"])) or "—"
                escaped = [
                    str(value).replace("|", "\\|").replace("\n", " ")
                    for value in (
                        collection_name, document_name, document_id,
                        stats["chunk_count"], page_display, evidence,
                        active, models, products,
                    )
                ]
                lines.append("| " + " | ".join(escaped) + " |")
            lines.extend([
                "",
                "## Complete chunk dump",
                "",
                "Every stored chunk is in `chunks.jsonl`, one JSON object per line. "
                "Each object includes collection, embedding ID, creation time, full content, and metadata.",
                "",
            ])
            summary_path.write_text("\n".join(lines), encoding="utf-8")
            print(f"Wrote {summary_path}")
            print(f"Wrote {dump_path}")
            print(f"Wrote {collection_path}")


if __name__ == "__main__":
    main()

import gc
import os
import shutil
import sys
import tempfile
import threading
import zipfile
import secrets
from pathlib import Path

import chromadb
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask
from chromadb.config import Settings as ChromaSettings

from app.config import settings
from app.models.schemas import (
    DeleteDocumentRequest,
    DeleteResponse,
    HealthResponse,
    IngestRequest,
    IngestResponse,
    QueryRequest,
    QueryResponse,
    UpdateDocumentActiveRequest,
)
from app.services.rag_engine import RAGEngine
from app.services.pdf_processor import extract_embedded_images

app = FastAPI(
    title="RAG Service",
    description="Multi-tenant PDF knowledge retrieval and Q&A",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = RAGEngine()
engine_lock = threading.RLock()


@app.middleware("http")
async def require_service_key(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)
    expected = settings.rag_service_api_key
    provided = request.headers.get("x-rag-service-key", "")
    if not expected:
        return JSONResponse(
            status_code=503,
            content={"detail": "RAG_SERVICE_API_KEY is not configured"},
        )
    if not provided or not secrets.compare_digest(provided, expected):
        return JSONResponse(status_code=401, content={"detail": "Invalid service key"})
    return await call_next(request)


def _remove_file(path: str) -> None:
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def _restart_service() -> None:
    os.execv(
        sys.executable,
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            str(settings.rag_service_port),
        ],
    )


def _safe_extract_index(archive_path: str, destination: str) -> None:
    max_bytes = int(os.getenv("INDEX_BACKUP_MAX_BYTES", str(20 * 1024 ** 3)))
    with zipfile.ZipFile(archive_path) as archive:
        total = 0
        for item in archive.infolist():
            parts = Path(item.filename).parts
            if not parts or Path(item.filename).is_absolute() or ".." in parts:
                raise ValueError("Unsafe path in Chroma index backup")
            total += item.file_size
            if total > max_bytes:
                raise ValueError("Chroma index backup is too large")
        archive.extractall(destination)


def _plain_embeddings(values):
    return [value.tolist() if hasattr(value, "tolist") else list(value) for value in values]


def _compact_index(source_client, destination: str) -> dict:
    compact_client = chromadb.PersistentClient(
        path=destination,
        settings=ChromaSettings(anonymized_telemetry=False),
    )
    collection_count = 0
    record_count = 0
    try:
        for listed in source_client.list_collections():
            name = listed if isinstance(listed, str) else listed.name
            source = source_client.get_collection(name=name)
            create_options = {"name": name}
            if source.metadata:
                create_options["metadata"] = source.metadata
            target = compact_client.create_collection(**create_options)
            total = source.count()
            collection_count += 1
            for offset in range(0, total, 1000):
                batch = source.get(
                    limit=min(1000, total - offset),
                    offset=offset,
                    include=["embeddings", "documents", "metadatas"],
                )
                if not batch["ids"]:
                    continue
                target.add(
                    ids=batch["ids"],
                    embeddings=_plain_embeddings(batch["embeddings"]),
                    documents=batch["documents"],
                    metadatas=batch["metadatas"],
                )
                record_count += len(batch["ids"])
    finally:
        try:
            compact_client._system.stop()
        except Exception:
            pass
    return {"collections": collection_count, "records": record_count}


@app.get("/index-backup")
def backup_index():
    index_dir = Path(settings.chroma_persist_dir)
    index_dir.mkdir(parents=True, exist_ok=True)
    temp_dir = tempfile.mkdtemp(prefix="chroma-export-")
    compact_dir = os.path.join(temp_dir, "compact")
    archive_base = os.path.join(temp_dir, "chroma-index")
    with engine_lock:
        stats = _compact_index(engine.store.client, compact_dir)
        archive_path = shutil.make_archive(archive_base, "zip", root_dir=compact_dir)
    print(
        f"[index-backup] Compacted {stats['records']} records "
        f"from {stats['collections']} collections",
        flush=True,
    )
    return FileResponse(
        archive_path,
        media_type="application/zip",
        filename="chroma-index.zip",
        background=BackgroundTask(shutil.rmtree, temp_dir, True),
    )


@app.post("/index-restore")
async def restore_index(request: Request):
    global engine
    temp_dir = tempfile.mkdtemp(prefix="chroma-import-")
    archive_path = os.path.join(temp_dir, "chroma-index.zip")
    extracted = os.path.join(temp_dir, "extracted")
    os.makedirs(extracted)
    try:
        with open(archive_path, "wb") as output:
            async for chunk in request.stream():
                output.write(chunk)
        _safe_extract_index(archive_path, extracted)
        target = Path(settings.chroma_persist_dir)
        target.mkdir(parents=True, exist_ok=True)
        with engine_lock:
            try:
                engine.store.client._system.stop()
            except Exception:
                pass
            engine = None
            gc.collect()
            for child in target.iterdir():
                shutil.rmtree(child) if child.is_dir() else child.unlink()
            for child in Path(extracted).iterdir():
                destination = target / child.name
                shutil.copytree(child, destination) if child.is_dir() else shutil.copy2(child, destination)
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise

    shutil.rmtree(temp_dir, ignore_errors=True)
    return JSONResponse(
        {"success": True, "message": "Chroma index restored; service is restarting"},
        background=BackgroundTask(_restart_service),
    )


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok", service="rag-service")


@app.post("/ingest", response_model=IngestResponse)
def ingest_document(request: IngestRequest):
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

    try:
        with engine_lock:
            chunks = engine.ingest(
            company_id=request.company_id,
            document_id=request.document_id,
            file_path=request.file_path,
            document_name=request.document_name,
            document_version=request.document_version,
            effective_date=request.effective_date,
            is_active=request.is_active,
        )
        media_dir = str(Path(request.file_path).parent / "media" / request.document_id)
        media = extract_embedded_images(request.file_path, media_dir)
        return IngestResponse(
            success=True,
            chunks_indexed=chunks,
            message=f"Indexed {chunks} chunks for document {request.document_id}",
            media=media,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


@app.delete("/documents", response_model=DeleteResponse)
def delete_document(request: DeleteDocumentRequest):
    try:
        with engine_lock:
            engine.delete_document(request.company_id, request.document_id)
        return DeleteResponse(
            success=True,
            message=f"Deleted vectors for document {request.document_id}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


@app.patch("/documents/active", response_model=DeleteResponse)
def update_document_active(request: UpdateDocumentActiveRequest):
    try:
        with engine_lock:
            engine.store.set_document_active(
                request.company_id,
                request.document_id,
                request.is_active,
            )
        return DeleteResponse(
            success=True,
            message=f"Updated active state for document {request.document_id}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Active-state update failed: {str(e)}")


@app.post("/query", response_model=QueryResponse)
def query_knowledge(request: QueryRequest):
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

    try:
        with engine_lock:
            return engine.query(
                company_id=request.company_id,
                question=request.question,
                top_k=request.top_k,
                history=request.history,
                preferred_document_ids=request.preferred_document_ids,
                preferred_product_names=request.preferred_product_names,
                preferred_model_ids=request.preferred_model_ids,
                response_language=request.response_language,
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")

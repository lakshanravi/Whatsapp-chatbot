import base64
import hashlib
from io import BytesIO
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

import fitz  # PyMuPDF
import pdfplumber
import pytesseract
from PIL import Image
from openai import OpenAI

from app.config import settings

_vision_client = OpenAI(
    api_key=settings.openai_api_key,
    timeout=settings.openai_request_timeout_seconds,
    max_retries=settings.openai_max_retries,
)

if settings.tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd

@dataclass
class PdfPage:
    page_number: int
    text: str


@dataclass
class PdfChunk:
    content: str
    page_number: int
    section_heading: str = ""
    evidence_type: str = "text"
    evidence_confidence: float = 1.0


def extract_embedded_images(file_path: str, output_dir: str) -> list[dict]:
    """Extract useful raster images and retain their PDF page relationship."""
    destination = Path(output_dir)
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True, exist_ok=True)
    extracted: list[dict] = []
    seen_hashes: set[str] = set()
    document = fitz.open(file_path)
    try:
        for page_index, page in enumerate(document):
            page_count = 0
            for image_info in page.get_images(full=True):
                if page_count >= settings.max_described_images_per_page:
                    break
                try:
                    payload = document.extract_image(image_info[0])
                    data = payload.get("image", b"")
                    width = int(payload.get("width") or 0)
                    height = int(payload.get("height") or 0)
                    if not data or width < settings.min_image_size or height < settings.min_image_size:
                        continue
                    digest = hashlib.sha256(data).hexdigest()
                    if digest in seen_hashes:
                        continue
                    seen_hashes.add(digest)
                    extension = re.sub(r"[^a-z0-9]", "", str(payload.get("ext") or "png").lower()) or "png"
                    filename = f"page-{page_index + 1}-image-{page_count + 1}-{digest[:10]}.{extension}"
                    (destination / filename).write_bytes(data)
                    extracted.append({
                        "file_name": filename,
                        "page_number": page_index + 1,
                        "width": width,
                        "height": height,
                        "mime_type": f"image/{'jpeg' if extension in ('jpg', 'jpeg') else extension}",
                        "alt_text": f"Image from PDF page {page_index + 1}",
                        "context_text": page.get_text("text")[:2000],
                    })
                    page_count += 1
                except Exception:
                    continue
            # Some manuals contain vector diagrams rather than embedded raster
            # images. Preserve a readable page rendering for those diagrams.
            if page_count == 0 and len(page.get_drawings()) >= settings.min_vector_drawings_for_visual_page:
                try:
                    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
                    data = pixmap.tobytes("png")
                    digest = hashlib.sha256(data).hexdigest()
                    if digest not in seen_hashes:
                        seen_hashes.add(digest)
                        filename = f"page-{page_index + 1}-visual-{digest[:10]}.png"
                        (destination / filename).write_bytes(data)
                        extracted.append({
                            "file_name": filename,
                            "page_number": page_index + 1,
                            "width": pixmap.width,
                            "height": pixmap.height,
                            "mime_type": "image/png",
                            "alt_text": f"Visual PDF page {page_index + 1}",
                            "context_text": page.get_text("text")[:2000],
                        })
                except Exception:
                    pass
    finally:
        document.close()
    return extracted


def _table_to_markdown(table: list[list[str | None]]) -> str:
    rows = [
        [re.sub(r"\s+", " ", (cell or "")).strip().replace("|", "\\|") for cell in row]
        for row in table
        if row and any((cell or "").strip() for cell in row)
    ]
    if not rows:
        return ""
    table_title = ""
    if (
        len(rows) > 1
        and sum(bool(value) for value in rows[0]) == 1
        and sum(bool(value) for value in rows[1]) > 1
    ):
        table_title = next(value for value in rows.pop(0) if value)
    header, *body = rows
    column_count = max(len(row) for row in rows)
    header = (header + [""] * column_count)[:column_count]
    header = [value or f"Column {index + 1}" for index, value in enumerate(header)]
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join(["---"] * len(header)) + " |"]
    for row in body:
        row = (row + [""] * len(header))[: len(header)]
        lines.append("| " + " | ".join(row) + " |")
    searchable_rows = [
        "Table row: " + "; ".join(
            f"{column} = {value}"
            for column, value in zip(header, row)
            if column and value
        )
        for row in body
    ]
    search_text = "\n".join(row for row in searchable_rows if row)
    title = f"Table title: {table_title}\n" if table_title else ""
    return title + "\n".join(lines) + (
        f"\n\nTable search text:\n{search_text}" if search_text else ""
    )

def _is_usable_table(rows: tuple[tuple[str, ...], ...], *, borderless: bool) -> bool:
    """Reject page-column/prose layouts that pdfplumber mistakes for tables."""
    if len(rows) < 2:
        return False
    column_count = max((len(row) for row in rows), default=0)
    if column_count < 2:
        return False

    populated_counts = [sum(bool(cell) for cell in row) for row in rows]
    structured_rows = sum(count >= 2 for count in populated_counts)
    if structured_rows < 2 or structured_rows / len(rows) < 0.6:
        return False

    populated_cells = [cell for row in rows for cell in row if cell]
    if not populated_cells:
        return False
    long_cells = [cell for cell in populated_cells if len(cell) > 180]
    if long_cells and (
        len(long_cells) / len(populated_cells) > 0.2
        or sum(len(cell) for cell in populated_cells) / len(populated_cells) > 100
    ):
        return False

    # Borderless extraction is the most likely to interpret two text columns as
    # a table. Require either several compact rows or obvious specification data.
    if borderless:
        if column_count > 8:
            return False
        header_tokens = re.findall(r"[A-Za-z0-9]+", " ".join(rows[0]))
        fragmented_header_tokens = sum(len(token) == 1 for token in header_tokens)
        if header_tokens and fragmented_header_tokens / len(header_tokens) >= 0.3:
            return False
        has_data_values = sum(
            bool(re.search(r"\d|\b(?:yes|no|on|off|model|rating|voltage|current)\b", cell, re.I))
            for cell in populated_cells
        ) >= 2
        if len(rows) < 3 and not has_data_values:
            return False
    return True


def _extract_tables(page):
    """Try ruled then borderless tables without indexing competing layouts."""
    strategies = [
        {},
        {
            "vertical_strategy": "lines_strict",
            "horizontal_strategy": "lines_strict",
            "snap_tolerance": 4,
            "join_tolerance": 4,
        },
        {
            "vertical_strategy": "text",
            "horizontal_strategy": "text",
            "snap_x_tolerance": 5,
            "snap_y_tolerance": 5,
            "intersection_tolerance": 5,
        },
    ]
    # Stop after the first strategy that finds usable tables. Running the text
    # strategy together with a successful ruled-table strategy produces several
    # differently split copies of the same specifications and floods retrieval.
    for strategy_index, table_settings in enumerate(strategies):
        tables, signatures = [], set()
        try:
            extracted = page.extract_tables(table_settings=table_settings) or []
        except Exception:
            continue
        for table in extracted:
            normalized = tuple(
                tuple(re.sub(r"\s+", " ", cell or "").strip() for cell in row)
                for row in table or []
                if row and any((cell or "").strip() for cell in row)
            )
            if len(normalized) < 2 or normalized in signatures:
                continue
            if not _is_usable_table(
                normalized,
                borderless=strategy_index == len(strategies) - 1,
            ):
                continue
            signatures.add(normalized)
            tables.append(table)
        if tables:
            return tables
    return []


def _extract_page_text(page) -> str:
    """Keep ingestion alive when one of pdfplumber's text modes fails."""
    for kwargs in ({"layout": True}, {}):
        try:
            text = (page.extract_text(**kwargs) or "").strip()
            if text:
                return text
        except Exception:
            continue
    return ""


def _describe_image(image_bytes: bytes, *, full_page: bool = False) -> str:
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            converted = BytesIO()
            image.convert("RGB").save(converted, format="PNG")
        b64 = base64.b64encode(converted.getvalue()).decode("utf-8")
        resp = _vision_client.chat.completions.create(
            model=settings.openai_vision_model,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": (
                        "Extract searchable evidence from this technical PDF "
                        + ("page" if full_page else "image")
                        + ". Transcribe all visible text exactly, including model numbers, labels, "
                        "dimensions, tolerances, values, and units. Convert every visible table into "
                        "plain rows in the form 'Table row: heading = value'. For diagrams, describe "
                        "only explicit visual relationships: connector names, wiring paths, arrows, "
                        "terminal positions, mounting-hole positions, orientation, and dimension lines. "
                        "Inspect mounting hardware carefully: identify top/bottom/side mounting flanges "
                        "or tabs, count visible round, slotted, and keyhole-shaped mounting openings, "
                        "and state their positions relative to the four corners. Examine each labeled "
                        "top, front, and side view independently. Do not confuse electrical ports, "
                        "vent holes, fasteners, or enclosure screws with mounting holes. "
                        "Say when text is unreadable. Never guess, calculate, or infer a missing value. "
                        "Return compact technical evidence, not introductory prose."
                    )},
                    {"type": "image_url", "image_url": {
                        "url": f"data:image/png;base64,{b64}",
                        "detail": "high",
                    }},
                ],
            }],
            max_tokens=settings.vision_max_tokens,
            temperature=0,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception:
        return ""


def _ocr_page(page: fitz.Page) -> str:
    """Run free, local OCR on a rendered PDF page."""
    try:
        pixmap = page.get_pixmap(dpi=settings.ocr_dpi, alpha=False)
        with Image.open(BytesIO(pixmap.tobytes("png"))) as image:
            return pytesseract.image_to_string(
                image,
                lang=settings.ocr_language,
            ).strip()
    except pytesseract.TesseractNotFoundError:
        # Keep text-based ingestion available on hosts where OCR is optional.
        return ""
    except pytesseract.TesseractError:
        return ""


def _large_image_count(page: fitz.Page) -> int:
    return sum(
        1
        for image in page.get_images(full=True)
        if len(image) > 3
        and image[2] >= settings.min_image_size
        and image[3] >= settings.min_image_size
    )


def _vector_drawing_count(page: fitz.Page) -> int:
    try:
        return len(page.get_drawings())
    except Exception:
        return 0


def _is_visual_page(text: str, large_images: int, vector_drawings: int) -> bool:
    text_length = len(text.strip())
    return (
        text_length < settings.ocr_min_page_characters
        or vector_drawings >= settings.min_vector_drawings_for_visual_page
        or (
            large_images > 0
            and text_length < settings.vision_page_character_limit
        )
    )


def _render_page(page: fitz.Page) -> bytes:
    return page.get_pixmap(
        dpi=settings.vision_page_dpi,
        alpha=False,
    ).tobytes("png")


def _merge_extracted_text(existing: str, extra: str) -> str:
    """Merge OCR/vision text without repeating lines already extracted."""
    existing_lines = {
        re.sub(r"\W+", " ", line.casefold()).strip()
        for line in existing.splitlines()
        if line.strip()
    }
    unique_extra = []
    for line in extra.splitlines():
        normalized = re.sub(r"\W+", " ", line.casefold()).strip()
        if normalized and normalized not in existing_lines:
            unique_extra.append(line.strip())
            existing_lines.add(normalized)
    return "\n\n".join(part for part in (existing.strip(), "\n".join(unique_extra)) if part)


def extract_pages_from_pdf(file_path: str) -> list[PdfPage]:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {file_path}")
    if path.suffix.lower() != ".pdf":
        raise ValueError("Only PDF files are supported")

    pages: list[str] = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            parts = []
            text = _extract_page_text(page)
            if text:
                parts.append(text)
            tables = _extract_tables(page)
            for table in tables:
                md = _table_to_markdown(table)
                if md:
                    parts.append(f"[Table]\n{md}")
            pages.append("\n\n".join(parts))

    if settings.enable_local_ocr or settings.describe_pdf_images:
        doc = fitz.open(str(path))
        for i in range(len(doc)):
            large_images = _large_image_count(doc[i])
            vector_drawings = _vector_drawing_count(doc[i])
            visual_page = _is_visual_page(pages[i], large_images, vector_drawings)
            should_ocr = len(pages[i].strip()) < settings.ocr_min_page_characters or (
                settings.ocr_image_rich_pages
                and visual_page
                and len(pages[i].strip()) < settings.ocr_image_page_character_limit
            )
            if (
                settings.enable_local_ocr
                and should_ocr
            ):
                ocr_text = _ocr_page(doc[i])
                if ocr_text:
                    pages[i] = _merge_extracted_text(pages[i], f"[OCR]\n{ocr_text}")

            if not settings.describe_pdf_images:
                continue

            descs = []
            if settings.describe_full_visual_pages and visual_page:
                try:
                    rendered_page = _render_page(doc[i])
                except Exception:
                    rendered_page = b""
                desc = (
                    _describe_image(rendered_page, full_page=True)
                    if rendered_page else ""
                )
                if desc:
                    descs.append(f"[Visual page extraction]\n{desc}")

            # On text-rich pages, process meaningful embedded figures directly.
            # A rendered full-page extraction already contains every embedded image.
            if not descs:
                for img in doc[i].get_images(full=True):
                    try:
                        base = doc.extract_image(img[0])
                    except Exception:
                        continue
                    if base["width"] < settings.min_image_size or base["height"] < settings.min_image_size:
                        continue  # skip logos/icons/bullets
                    desc = _describe_image(base["image"])
                    if desc:
                        descs.append(f"[Image extraction]\n{desc}")
                    if len(descs) >= settings.max_described_images_per_page:
                        break
            if descs:
                for desc in descs:
                    pages[i] = _merge_extracted_text(pages[i], desc)
        doc.close()

    if not any(p.strip() for p in pages):
        raise ValueError("No extractable text found in PDF")
    return [
        PdfPage(page_number=i + 1, text=text)
        for i, text in enumerate(pages)
        if text.strip()
    ]


def extract_text_from_pdf(file_path: str) -> str:
    """Backward-compatible plain-text extraction."""
    return "\n\n".join(page.text for page in extract_pages_from_pdf(file_path))






def _split_on_paragraphs(text: str) -> list[str]:
    paragraphs = re.split(r"\n\s*\n", text)
    return [p.strip() for p in paragraphs if p.strip()]


def _is_heading(text: str) -> bool:
    line = " ".join(text.split())
    if not line or len(line) > 120 or "\n" in text.strip():
        return False
    words = line.split()
    return (
        line.isupper()
        or line.endswith(":")
        or bool(re.match(r"^(\d+(\.\d+)*|[A-Z])[\s.)-]+", line))
        or (len(words) <= 10 and line == line.title())
    )


def _split_long_unit(text: str, limit: int) -> list[str]:
    if len(text) <= limit:
        return [text]
    if text.startswith("[Table]"):
        lines = [line for line in text.splitlines() if line.strip()]
        separator_index = next(
            (index for index, line in enumerate(lines) if line.startswith("| ---")),
            -1,
        )
        if separator_index < 1 or separator_index == len(lines) - 1:
            return [text[start:start + limit] for start in range(0, len(text), limit)]
        prefix = "\n".join(lines[:separator_index + 1])
        units, current = [], prefix
        for row in lines[separator_index + 1:]:
            if len(current) + len(row) + 1 > limit and current != prefix:
                units.append(current)
                current = prefix
            current = f"{current}\n{row}"
        if current != prefix:
            units.append(current)
        return units
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", text)
        if sentence.strip()
    ]
    if len(sentences) <= 1:
        return [
            text[start:start + limit]
            for start in range(0, len(text), limit)
        ]
    units, current = [], ""
    for sentence in sentences:
        if current and len(current) + len(sentence) + 1 > limit:
            units.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        units.append(current)
    return units


def chunk_text(text: str) -> list[str]:
    """Create section-aware chunks without cutting sentences or tables."""
    chunk_size = settings.chunk_size
    overlap = settings.chunk_overlap
    paragraphs = _split_on_paragraphs(text)
    chunks, current_units = [], []
    current_heading = ""

    def flush() -> None:
        if not current_units:
            return
        body = "\n\n".join(current_units)
        content = (
            f"Section: {current_heading}\n\n{body}"
            if current_heading and current_heading not in body else body
        )
        chunks.append(content)

    for paragraph in paragraphs:
        if _is_heading(paragraph):
            flush()
            current_units = []
            current_heading = " ".join(paragraph.split())
            continue

        for unit in _split_long_unit(paragraph, chunk_size):
            projected = len("\n\n".join([*current_units, unit]))
            if current_units and projected > chunk_size:
                previous_tail = current_units[-1]
                flush()
                current_units = (
                    [previous_tail[-overlap:]]
                    if overlap and not previous_tail.startswith("[Table]")
                    else []
                )
            current_units.append(unit)

    flush()
    return chunks or [text[:chunk_size]]


def chunk_pages(pages: list[PdfPage]) -> list[PdfChunk]:
    """Chunk each page separately so retrieval can retain reliable citations."""
    chunks: list[PdfChunk] = []
    for page in pages:
        # Keep generated OCR/vision descriptions separate from native PDF text.
        # This lets retrieval lower their authority for ordinary numeric specs.
        segments = re.split(
            r"(?=^\[(?:OCR|Visual page extraction|Image extraction)\]\s*$)",
            page.text,
            flags=re.M,
        )
        for segment in (item.strip() for item in segments if item.strip()):
            if segment.startswith("[Visual page extraction]") or segment.startswith("[Image extraction]"):
                evidence_type, confidence = "vision", 0.65
            elif segment.startswith("[OCR]"):
                evidence_type, confidence = "ocr", 0.8
            else:
                evidence_type, confidence = "text", 1.0
            for content in chunk_text(segment):
                match = re.match(r"Section:\s*([^\n]+)", content, flags=re.I)
                chunks.append(PdfChunk(
                    content=content,
                    page_number=page.page_number,
                    section_heading=match.group(1).strip() if match else "",
                    evidence_type=evidence_type,
                    evidence_confidence=confidence,
                ))
    return chunks


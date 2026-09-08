"""Product-model extraction shared by ingestion and retrieval."""

import re


# Model numbers are usually compact uppercase/alphanumeric codes. Spaces and
# hyphens are formatting variants and are removed by normalization.
_MODEL_PATTERN = re.compile(
    r"(?<![A-Za-z0-9])(?:"
    r"[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,12}){2,6}"
    r"|"
    r"(?:[A-Za-z]{1,8}-){1,5}[A-Za-z]{1,8}\s*\d{2,}[A-Za-z0-9]*(?:-[A-Za-z0-9]+)*"
    r"|[A-Za-z]{1,8}\s+\d{2,}[A-Za-z0-9]*(?:-[A-Za-z0-9]+)*"
    r"|[A-Za-z]{1,12}\d{2,}[A-Za-z0-9]*(?:-[A-Za-z0-9]+)*"
    r"|[A-Za-z]{1,8}\d[A-Za-z0-9]*(?:-[A-Za-z0-9]+)+"
    r")(?![A-Za-z0-9])"
)

_NON_MODEL_PREFIXES = {
    "PAGE", "SOURCE", "FIGURE", "TABLE", "SECTION", "STEP", "OPTION",
    "ERROR", "CODE", "HTTP", "HTTPS", "ISBN", "YEAR",
    "MANUAL", "GUIDE", "DATASHEET", "DOCUMENT", "PRODUCT", "VERSION",
    "AT", "EN", "PA", "FUSE", "BATTERY", "INPUT", "OUTPUT", "VOLTAGE", "CURRENT",
    "POWER", "RATING", "MAX", "MIN", "TEMPERATURE", "TEMP", "PORT",
    "PIN", "CHARGE", "CHARGER", "CAPACITY", "FREQUENCY",
}
_NON_MODEL_CODES = re.compile(
    r"^(?:E|F|ERR|ERROR)\d{1,4}$|"
    r"^(?:IP|UL|IEC|IEEE|ISO|FCC|CE|ROHS|RS|RJ|USB|COM|MODBUS)\d+[A-Z0-9]*$|"
    r"^(?:NFPA|NEC|ANSI|CSA|DIN|ETL|ATEX|MS|MD)\d+[A-Z0-9]*$|"
    r"^(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d+[A-Z0-9]*$|"
    r"^(?:AGM|EARTH|LVD)\d+[A-Z0-9]*$|"
    r"^(?:V|VAC|VDC|A|AMP|W|KW|HZ|AH|MAH)\d+[A-Z0-9]*$"
)

# Victron and several other electrical-product vendors use ratings as model
# identifiers (75/10, 100/20, 12/12-30).  These cannot be recognized by the
# general alphanumeric pattern without also mistaking specifications such as
# 120/240 VAC for product models, so require nearby model/product language.
_SLASH_MODEL_PATTERN = re.compile(
    r"(?<![\d.])\d{2,3}/\d{1,3}(?:-\d{1,3})?(?![\d.])"
)
_SLASH_MODEL_CONTEXT = re.compile(
    r"\b(?:model|models|victron|smartsolar|bluesolar|orion|mppt|charger|"
    r"controller|inverter|converter)\b",
    re.I,
)


def normalize_model_id(value: str) -> str:
    """Normalize display variations while preserving meaningful suffixes."""
    return re.sub(r"[^A-Za-z0-9]", "", str(value or "")).upper()


def _extract_slash_model_ids(text: str) -> set[str]:
    source = str(text or "")
    if not _SLASH_MODEL_CONTEXT.search(source):
        return set()
    found = set()
    for match in _SLASH_MODEL_PATTERN.finditer(source):
        tail = source[match.end():match.end() + 12]
        if re.match(r"\s*(?:V|VAC|VDC|A|W|Hz)\b", tail, re.I):
            continue
        found.add(normalize_model_id(match.group(0)))
    return found


def extract_model_ids(text: str) -> set[str]:
    """Extract likely product IDs without treating error/spec codes as models."""
    found: set[str] = set()
    source = str(text or "")
    for match in _MODEL_PATTERN.finditer(source):
        raw_value = match.group(0)
        # In "MPPT 75/10", MPPT 75 is only a prefix of the slash-form model.
        if match.end() < len(source) and source[match.end()] == "/":
            continue
        # A spaced model prefix (for example "IC 121040") is code-like and
        # uppercase. This prevents ordinary phrases such as "at 10.5V" or
        # "fuse 450A" from becoming fake model filters.
        if re.search(r"\s", raw_value):
            prefix = re.split(r"[\s\d]", raw_value, maxsplit=1)[0]
            if prefix != prefix.upper():
                continue
        model_id = normalize_model_id(raw_value)
        if len(model_id) < 4 or not any(char.isdigit() for char in model_id):
            continue
        if _NON_MODEL_CODES.fullmatch(model_id):
            continue
        if any(model_id.startswith(prefix) for prefix in _NON_MODEL_PREFIXES):
            continue
        found.add(model_id)
    found.update(_extract_slash_model_ids(source))
    return found


def serialize_model_ids(model_ids: set[str]) -> str:
    """Chroma metadata values must be primitive, so store IDs as CSV."""
    return ",".join(sorted(model_ids))


def deserialize_model_ids(value: object) -> set[str]:
    return {
        normalized
        for item in str(value or "").split(",")
        if (normalized := normalize_model_id(item))
    }


def item_model_ids(document: str, metadata: dict) -> set[str]:
    """Read persisted IDs, with a fallback for documents indexed before this fix."""
    persisted = deserialize_model_ids(metadata.get("model_ids", ""))
    if persisted:
        # Augment old indexes with slash-form IDs discoverable in their raw
        # content. This makes the fix effective without forcing a re-upload.
        return persisted | _extract_slash_model_ids(document or "")
    # The filename identifies what the document belongs to. Mentions of other
    # models inside that document must not make it a source for those models.
    filename_ids = extract_model_ids(metadata.get("document_name", ""))
    return filename_ids or extract_model_ids(document or "")


def matches_model_ids(document: str, metadata: dict, required: set[str]) -> bool:
    return not required or bool(item_model_ids(document, metadata) & required)

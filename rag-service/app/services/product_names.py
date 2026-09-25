"""Conservative product-family name extraction for retrieval scoping."""

import re


# Product families such as SunSaver and SureSine use an internal capital. This
# deliberately avoids guessing ordinary title-cased words as product names.
_CAMEL_CASE_PRODUCT = re.compile(
    r"(?<![A-Za-z0-9])([A-Z][a-z]+(?:[A-Z][A-Za-z0-9]+)+)(?![A-Za-z0-9])"
)

# High-confidence product or manufacturer names that use ordinary title case
# and therefore cannot be distinguished from prose by the CamelCase rule.
# These are matched in both questions and legacy document filenames so the
# repair works without regenerating existing embeddings.
_KNOWN_PRODUCT_PATTERNS = {
    "pecron": re.compile(r"(?<![a-z0-9])pecron(?![a-z0-9])", re.I),
    "victron": re.compile(r"(?<![a-z0-9])victron(?:\s+energy)?(?![a-z0-9])", re.I),
    "midnitesolar": re.compile(r"(?<![a-z0-9])midnite\s*solar(?![a-z0-9])", re.I),
    "srne": re.compile(r"(?<![a-z0-9])srne(?![a-z0-9])", re.I),
    "morningstar": re.compile(r"(?<![a-z0-9])morningstar(?![a-z0-9])", re.I),
    "volthium": re.compile(r"(?<![a-z0-9])volthium(?![a-z0-9])", re.I),
    "solark": re.compile(r"(?<![a-z0-9])sol[\s_-]*ark(?![a-z0-9])", re.I),
    "luxpowertek": re.compile(
        r"(?<![a-z0-9])lux[\s_-]*power(?:[\s_-]*tek)?(?![a-z0-9])",
        re.I,
    ),
}

_PRODUCT_ALIASES = {
    "luxpower": "luxpowertek",
    "midnite": "midnitesolar",
}


def normalize_product_name(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9]", "", str(value or "")).casefold()
    return _PRODUCT_ALIASES.get(normalized, normalized)


def extract_product_names(text: str) -> set[str]:
    """Return normalized, high-confidence product-family names."""
    source = str(text or "")
    found = {
        normalized
        for match in _CAMEL_CASE_PRODUCT.finditer(source)
        if (normalized := normalize_product_name(match.group(1)))
    }
    found.update(
        product_name
        for product_name, pattern in _KNOWN_PRODUCT_PATTERNS.items()
        if pattern.search(source)
    )
    return {normalize_product_name(product_name) for product_name in found}


def serialize_product_names(product_names: set[str]) -> str:
    return ",".join(sorted(product_names))


def deserialize_product_names(value: object) -> set[str]:
    return {
        normalized
        for item in str(value or "").split(",")
        if (normalized := normalize_product_name(item))
    }


def item_product_names(document: str, metadata: dict) -> set[str]:
    persisted = deserialize_product_names(metadata.get("product_names", ""))
    # Augment legacy metadata from the filename and raw chunk. Old indexes can
    # have an empty or noisy product_names value; discovery at query time keeps
    # multi-brand comparison retrieval complete without requiring reindexing.
    return persisted | extract_product_names(
        f"{metadata.get('document_name', '')}\n{document or ''}"
    )


def matches_product_names(document: str, metadata: dict, required: set[str]) -> bool:
    return not required or bool(item_product_names(document, metadata) & required)

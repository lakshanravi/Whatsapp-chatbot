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

_LABEL_STOP_WORDS = {
    "has", "have", "is", "are", "was", "were", "features", "includes",
    "contains", "comes", "provides", "offers", "uses", "supports", "with",
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


def extract_product_labels(text: str) -> dict[str, str]:
    """Return conservative normalized product keys with customer-facing labels."""
    source = str(text or "")
    labels: dict[str, str] = {}
    for line in source.splitlines():
        clean_line = " ".join(line.strip().split())
        if not clean_line:
            continue
        for match in _CAMEL_CASE_PRODUCT.finditer(clean_line):
            key = normalize_product_name(match.group(1))
            tail = clean_line[match.start():]
            tail = re.split(
                r"\s+(?:[-–—|:]\s*)?(?:SKU|model(?:\s+number)?|item\s+code)\b|[.;!?]",
                tail,
                maxsplit=1,
                flags=re.I,
            )[0].strip(" -–—|:")
            words = tail.split()
            kept: list[str] = []
            for word in words[:8]:
                if kept and re.sub(r"[^A-Za-z]", "", word).casefold() in _LABEL_STOP_WORDS:
                    break
                kept.append(word)
            label = " ".join(kept).strip(" -–—|:") or match.group(1)
            if len(label) > 100:
                label = match.group(1)
            current = labels.get(key, "")
            if not current or len(label) > len(current):
                labels[key] = label

    for key, pattern in _KNOWN_PRODUCT_PATTERNS.items():
        match = pattern.search(source)
        if match and key not in labels:
            labels[key] = " ".join(match.group(0).split())
    return labels


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

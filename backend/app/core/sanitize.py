import bleach


def clean_text(value: str | None) -> str:
    """Elimină orice HTML/markup din textul introdus de utilizator (anti-XSS la stocare)."""
    if not value:
        return ""
    return bleach.clean(value, tags=[], attributes={}, strip=True).strip()

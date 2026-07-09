"""Teste unitare pentru `app/core/security.py` și `app/core/sanitize.py`."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.config import settings
from app.core.sanitize import clean_text
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_ip,
    hash_password,
    verify_password,
)

# Testele din acest fișier sunt sincrone (unit pur); nu au nevoie de marca asyncio.

# --- Parole (argon2) ----------------------------------------------------------
def test_hash_password_produce_hash_argon2():
    h = hash_password("secret123")
    assert h != "secret123"
    assert h.startswith("$argon2")


def test_verify_password_corect():
    h = hash_password("secret123")
    assert verify_password("secret123", h) is True


def test_verify_password_gresit():
    h = hash_password("secret123")
    assert verify_password("altceva", h) is False


def test_doua_hashuri_diferite_pentru_aceeasi_parola():
    """Argon2 folosește sare aleatoare → hashuri diferite, ambele valide."""
    a = hash_password("secret123")
    b = hash_password("secret123")
    assert a != b
    assert verify_password("secret123", a)
    assert verify_password("secret123", b)


# --- JWT ----------------------------------------------------------------------
def test_jwt_roundtrip():
    token = create_access_token(42)
    assert decode_access_token(token) == "42"


def test_jwt_roundtrip_cu_subject_string():
    token = create_access_token("7")
    assert decode_access_token(token) == "7"


def test_jwt_token_invalid_returneaza_none():
    assert decode_access_token("nu.e.un.token") is None
    assert decode_access_token("") is None


def test_jwt_semnat_cu_alt_secret_respins():
    fake = jwt.encode(
        {"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        "alt-secret-total-diferit",
        algorithm=settings.JWT_ALGORITHM,
    )
    assert decode_access_token(fake) is None


def test_jwt_expirat_returneaza_none():
    expired = jwt.encode(
        {"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    assert decode_access_token(expired) is None


# --- hash_ip ------------------------------------------------------------------
def test_hash_ip_deterministic_si_lungime():
    a = hash_ip("1.2.3.4")
    b = hash_ip("1.2.3.4")
    assert a == b
    assert len(a) == 32


def test_hash_ip_gol():
    assert hash_ip("") == ""


def test_hash_ip_diferit_pentru_ipuri_diferite():
    assert hash_ip("1.2.3.4") != hash_ip("5.6.7.8")


# --- clean_text (anti-XSS la stocare) -----------------------------------------
def test_clean_text_elimina_tag_uri():
    assert clean_text("<b>hello</b>") == "hello"


def test_clean_text_elimina_scriptul_ca_markup():
    out = clean_text("<script>alert('x')</script>")
    assert "<" not in out and ">" not in out
    assert "script" not in out.lower() or "alert" in out  # markup-ul e eliminat


def test_clean_text_elimina_img_onerror():
    assert clean_text("<img src=x onerror=alert(1)>") == ""


def test_clean_text_none_si_gol():
    assert clean_text(None) == ""
    assert clean_text("") == ""


def test_clean_text_trim():
    assert clean_text("  spaced  ") == "spaced"


def test_clean_text_pastreaza_text_simplu():
    assert clean_text("promoție de vară 2026") == "promoție de vară 2026"

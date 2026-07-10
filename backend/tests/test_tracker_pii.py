"""Gardă împotriva scurgerii de PII prin trackerul t.js.

Handlerul de click al trackerului citea `el.innerText || el.textContent || el.value`.
Pentru `<input>` și `<textarea>` primele două sunt goale, deci se cădea pe `el.value`
— adică exact ce tastase vizitatorul (nume, email, telefon, mesaj, chiar și parola
dacă pixelul ajungea pe o pagină de login) pleca spre /px/collect ca `element_text`.

Acestea sunt aserțiuni pe sursă, nu teste de comportament: t.js rulează în browser,
iar suita asta e pytest. Rolul lor e să prindă o revenire accidentală la vechiul
tipar. Comportamentul a fost verificat separat, în jsdom: click pe input/textarea/
select/contenteditable trimite `element_text: ""`, iar etichetele butoanelor rămân.
"""

from pathlib import Path

import pytest

TRACKER = Path(__file__).resolve().parents[1] / "app" / "static" / "t.js"


@pytest.fixture(scope="module")
def source() -> str:
    return TRACKER.read_text(encoding="utf-8")


def test_trackerul_exista(source: str) -> None:
    assert "px/collect" in source


def test_nu_citeste_valoarea_campurilor_in_lantul_de_text(source: str) -> None:
    """Vechiul tipar vulnerabil nu are voie să reapară."""
    assert "el.innerText || el.textContent || el.value" not in source


def test_textul_clickului_trece_printr_un_singur_helper(source: str) -> None:
    assert "function clickText(el)" in source
    assert "var text = clickText(el);" in source


def test_campurile_de_formular_sunt_excluse(source: str) -> None:
    """INPUT (mai puțin butoanele), TEXTAREA, SELECT și zonele editabile."""
    assert 'tag === "TEXTAREA"' in source
    assert 'tag === "SELECT"' in source
    assert "isEditable(el)" in source
    # Doar butoanele randate ca <input> își păstrează eticheta din `value`.
    assert "/^(button|submit|reset)$/i.test(el.type" in source


def test_singura_citire_de_value_e_pentru_eticheta_butoanelor(source: str) -> None:
    reads = [line.strip() for line in source.splitlines() if "el.value" in line and "//" not in line]
    assert reads == ['? (el.value || "").trim()'], reads

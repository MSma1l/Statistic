"""Gardă împotriva scurgerii de date prin trackerul t.js.

Trackerul trebuie să trimită DOAR activitate (unde s-a dat click, cât s-a derulat,
cât s-a stat pe pagină), niciodată conținut. Patru canale cărau date și au fost
închise:

1. `el.value` — handlerul citea `el.innerText || el.textContent || el.value`. Pentru
   `<input>` primele două sunt goale, deci se cădea pe valoarea tastată de vizitator
   (nume, email, telefon, mesaj, chiar parola pe o pagină de login).
2. `element_text` de pe orice element — un click pe un paragraf trimitea textul lui.
   Acum se trimite doar eticheta unui control de interfață (link, buton).
3. `props.href` brut — cu query string și fragment (token-uri), plus scheme
   `mailto:`/`tel:` care conțin date de contact.
4. `document.referrer` brut — URL-ul complet al paginii de proveniență, inclusiv
   query string-ul, unde ajung frecvent token-uri sau adrese de email.

Acestea sunt aserțiuni pe sursă, nu teste de comportament: t.js rulează în browser,
iar suita asta e pytest. Rolul lor e să prindă o revenire accidentală la vechiul
tipar. Comportamentul a fost verificat separat, în jsdom: click pe input/textarea/
select/contenteditable/paragraf trimite `element_text: ""`, un href cu token devine
doar calea, `mailto:ion@exemplu.md` devine `mailto:`, iar referrer-ul își pierde
query string-ul — în timp ce etichetele butoanelor și destinația linkurilor rămân.
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


def test_textul_vine_doar_de_pe_controale_de_interfata(source: str) -> None:
    """Un click pe text de conținut nu are voie să trimită acel text."""
    assert "closest('a, button, summary, [role=\"button\"]')" in source


def test_hrefurile_sunt_curatate_de_query_si_scheme_de_contact(source: str) -> None:
    assert "function safeHref(raw)" in source
    assert "props: { href: safeHref(href)" in source


def test_referrerul_este_curatat_de_query(source: str) -> None:
    assert "function safeReferrer()" in source
    assert "referrer: REFERRER," in source
    # Referrer-ul brut nu mai are voie să ajungă direct în evenimente.
    assert "referrer: document.referrer" not in source

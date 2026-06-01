"""Generare QR coduri, opțional cu un logo în centru (din galerie)."""

import base64
import io

import qrcode
from PIL import Image
from qrcode.constants import ERROR_CORRECT_H


def _normalize_logo(logo_bytes: bytes, target_px: int) -> Image.Image:
    """Deschide logo-ul, îl aduce la RGBA și îl redimensionează păstrând proporțiile."""
    logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
    logo.thumbnail((target_px, target_px))
    return logo


def _make_qr(data: str) -> qrcode.QRCode:
    # ERROR_CORRECT_H => până la ~30% redundanță, deci QR-ul rămâne scanabil
    # chiar cu un logo în centru.
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=10, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    return qr


def qr_png_bytes(data: str, logo_bytes: bytes | None = None) -> bytes:
    qr = _make_qr(data)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    if logo_bytes:
        w, h = img.size
        target = int(w * 0.22)
        logo = _normalize_logo(logo_bytes, target)
        lw, lh = logo.size
        pad = max(4, int(target * 0.12))
        # Pătrat alb în spatele logo-ului (ca să nu „spargă" pătratele QR)
        box = Image.new("RGB", (lw + 2 * pad, lh + 2 * pad), "white")
        bx, by = (w - box.width) // 2, (h - box.height) // 2
        img.paste(box, (bx, by))
        img.paste(logo, ((w - lw) // 2, (h - lh) // 2), logo)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def qr_svg_bytes(data: str, logo_bytes: bytes | None = None) -> bytes:
    """SVG construit din matricea QR (vectorial). Logo-ul e încorporat ca <image> base64."""
    qr = _make_qr(data)
    matrix = qr.get_matrix()  # include și marginea (quiet zone)
    n = len(matrix)
    scale = 10
    size = n * scale

    rects = []
    for r, row in enumerate(matrix):
        for c, val in enumerate(row):
            if val:
                rects.append(
                    f'<rect x="{c * scale}" y="{r * scale}" width="{scale}" height="{scale}"/>'
                )

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 {size} {size}" shape-rendering="crispEdges">',
        f'<rect width="{size}" height="{size}" fill="#ffffff"/>',
        f'<g fill="#000000">{"".join(rects)}</g>',
    ]

    if logo_bytes:
        # Re-encodăm logo-ul ca PNG, ca data-URI consistent
        logo = _normalize_logo(logo_bytes, int(size * 0.24))
        lbuf = io.BytesIO()
        logo.save(lbuf, format="PNG")
        b64 = base64.b64encode(lbuf.getvalue()).decode()
        ls = int(size * 0.24)
        pad = max(4, int(ls * 0.12))
        x = (size - ls) // 2
        y = (size - ls) // 2
        parts.append(
            f'<rect x="{x - pad}" y="{y - pad}" width="{ls + 2 * pad}" '
            f'height="{ls + 2 * pad}" fill="#ffffff"/>'
        )
        parts.append(
            f'<image x="{x}" y="{y}" width="{ls}" height="{ls}" '
            f'href="data:image/png;base64,{b64}" preserveAspectRatio="xMidYMid meet"/>'
        )

    parts.append("</svg>")
    return "".join(parts).encode("utf-8")

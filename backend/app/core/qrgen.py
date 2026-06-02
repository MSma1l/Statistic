"""Generare QR coduri, opțional cu un logo frumos integrat în centru."""

import base64
import io

import qrcode
from PIL import Image, ImageChops, ImageDraw, ImageOps
from qrcode.constants import ERROR_CORRECT_H

# Rezoluție: modul mai mare => QR mai mare și mai clar la descărcare/print.
BOX_SIZE = 18
BORDER = 3
# Logo-ul ocupă ~24% din latura QR-ului (sigur scanabil cu corecție de eroare H).
LOGO_RATIO = 0.24


def _make_qr(data: str) -> qrcode.QRCode:
    # ERROR_CORRECT_H => până la ~30% redundanță, deci QR-ul rămâne scanabil
    # chiar cu un logo mare în centru.
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=BOX_SIZE, border=BORDER)
    qr.add_data(data)
    qr.make(fit=True)
    return qr


def _rounded_logo(logo_bytes: bytes, target_px: int) -> Image.Image:
    """Logo redimensionat (păstrând proporțiile) cu colțuri rotunjite."""
    logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
    logo = ImageOps.contain(logo, (target_px, target_px))
    lw, lh = logo.size
    radius = int(min(lw, lh) * 0.18)
    mask = Image.new("L", (lw, lh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, lw - 1, lh - 1], radius=radius, fill=255)
    # Combinăm masca rotunjită cu transparența proprie a logo-ului
    alpha = ImageChops.multiply(logo.split()[3], mask)
    logo.putalpha(alpha)
    return logo


def _logo_card(logo: Image.Image) -> Image.Image:
    """Card alb cu colțuri rotunjite + bordură fină, cu logo-ul centrat."""
    lw, lh = logo.size
    pad = max(6, int(max(lw, lh) * 0.16))
    cw, ch = lw + 2 * pad, lh + 2 * pad
    radius = int(min(cw, ch) * 0.24)
    card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle(
        [0, 0, cw - 1, ch - 1],
        radius=radius,
        fill=(255, 255, 255, 255),
        outline=(226, 232, 240, 255),  # slate-200, discret
        width=max(2, int(pad * 0.22)),
    )
    card.alpha_composite(logo, (pad, pad))
    return card


def qr_png_bytes(data: str, logo_bytes: bytes | None = None) -> bytes:
    qr = _make_qr(data)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
    if logo_bytes:
        w, h = img.size
        logo = _rounded_logo(logo_bytes, int(w * LOGO_RATIO))
        card = _logo_card(logo)
        img.alpha_composite(card, ((w - card.width) // 2, (h - card.height) // 2))
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    return buf.getvalue()


def qr_svg_bytes(data: str, logo_bytes: bytes | None = None) -> bytes:
    """SVG vectorial construit din matricea QR. Logo-ul e încorporat ca <image> rotunjit."""
    qr = _make_qr(data)
    matrix = qr.get_matrix()  # include și marginea (quiet zone)
    n = len(matrix)
    scale = 20
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
        # Re-encodăm logo-ul ca PNG (data-URI consistent), redimensionat
        ls = int(size * LOGO_RATIO)
        logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
        logo = ImageOps.contain(logo, (ls, ls))
        lw, lh = logo.size
        lbuf = io.BytesIO()
        logo.save(lbuf, format="PNG")
        b64 = base64.b64encode(lbuf.getvalue()).decode()

        pad = max(6, int(max(lw, lh) * 0.16))
        cw, ch = lw + 2 * pad, lh + 2 * pad
        cx = (size - cw) // 2
        cy = (size - ch) // 2
        lx = (size - lw) // 2
        ly = (size - lh) // 2
        card_r = int(min(cw, ch) * 0.24)
        logo_r = int(min(lw, lh) * 0.18)
        parts.append(
            f'<rect x="{cx}" y="{cy}" width="{cw}" height="{ch}" rx="{card_r}" '
            f'ry="{card_r}" fill="#ffffff" stroke="#e2e8f0" stroke-width="{max(2, int(pad * 0.22))}"/>'
        )
        parts.append(f'<clipPath id="lc"><rect x="{lx}" y="{ly}" width="{lw}" height="{lh}" rx="{logo_r}" ry="{logo_r}"/></clipPath>')
        parts.append(
            f'<image x="{lx}" y="{ly}" width="{lw}" height="{lh}" clip-path="url(#lc)" '
            f'href="data:image/png;base64,{b64}" preserveAspectRatio="xMidYMid meet"/>'
        )

    parts.append("</svg>")
    return "".join(parts).encode("utf-8")

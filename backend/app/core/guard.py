"""Guard de securitate: detecție SQLi/XSS la fiecare request + security headers.

Acesta este un strat de apărare suplimentar (defense-in-depth) peste:
  - SQLAlchemy ORM cu query parametrizat (apărarea principală anti-SQLi)
  - escaparea automată din React + sanitizarea `bleach` la stocare (anti-XSS)
"""

import re
from urllib.parse import unquote

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# Rate limiter folosit pe rutele sensibile (login, ingestie)
limiter = Limiter(key_func=get_remote_address)

# Pattern-uri tipice de SQL injection
_SQLI_PATTERNS = [
    r"(?i)\bunion\b\s+\bselect\b",
    r"(?i)\bselect\b.+\bfrom\b",
    r"(?i)\binsert\b\s+\binto\b",
    r"(?i)\bdrop\b\s+\btable\b",
    r"(?i)\bdelete\b\s+\bfrom\b",
    r"(?i)\bupdate\b.+\bset\b",
    r"(?i)\bor\b\s+\d+\s*=\s*\d+",        # OR 1=1
    r"(?i)'\s*or\s*'?\d",                  # ' OR '1
    r"(?i)(--|#)\s*$",                     # comentariu SQL la final
    r"(?i);\s*(drop|delete|insert|update)\b",
]

# Pattern-uri tipice de XSS
_XSS_PATTERNS = [
    r"(?i)<\s*script",
    r"(?i)</\s*script",
    r"(?i)javascript\s*:",
    r"(?i)\bon\w+\s*=",                    # onerror=, onload=, onclick=
    r"(?i)<\s*iframe",
    r"(?i)<\s*img[^>]+src[^>]*=[^>]*onerror",
    r"(?i)document\.cookie",
]

_COMPILED = [re.compile(p) for p in (_SQLI_PATTERNS + _XSS_PATTERNS)]

# Rute unde corpul conține LEGITIM cod/markup care altfel ar fi blocat:
#  - /px/collect: ingestie pixel (ex. textul unui buton), sanitizat la stocare;
#  - /api/landings: sursa landing-urilor găzduite (HTML/CSS/JS scris de owner) —
#    e conținutul propriu al userului autentificat (require_cap), nu input public.
#  - /api/live-patches: valorile patch-urilor DOM (text/CSS/atribut) scrise de owner;
#    t.js le aplică prin textContent/style/setAttribute (nu innerHTML), deci nu execută.
# SQLi rămâne acoperit oricum de ORM-ul parametrizat.
_RELAXED_PREFIXES = ("/px/collect", "/api/landings", "/api/live-patches")

# Prefixul paginilor găzduite servite public. Lor le dăm un CSP PERMISIV (pot folosi
# fonturi/imagini/scripturi externe), nu pe cel strict al dashboard-ului.
_LANDING_SERVE_PREFIX = "/lp"
_LANDING_SERVE_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval'",
}


def is_malicious(value: str) -> bool:
    if not value:
        return False
    decoded = unquote(value)
    return any(pattern.search(decoded) for pattern in _COMPILED)


_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'"
    ),
}


class SecurityGuardMiddleware:
    """Middleware ASGI care scanează query + body și adaugă security headers."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        relaxed = any(path.startswith(p) for p in _RELAXED_PREFIXES)

        # Nu scanăm corpurile binare (upload de fișiere): datele binare ar declanșa
        # false-pozitive, iar fișierele sunt validate separat la endpoint.
        content_type = ""
        for k, v in scope.get("headers", []):
            if k == b"content-type":
                content_type = v.decode("latin-1").lower()
                break
        is_binary_body = content_type.startswith("multipart/form-data")

        # 1) Scanare query string
        query = scope.get("query_string", b"").decode("latin-1")
        if query and is_malicious(query):
            await self._reject(send)
            return

        # 2) Citește corpul (îl re-injectăm pentru handler-ul real).
        #    Pe rutele relaxate (ex. /px/collect, cea mai frecventă) NU bufferizăm
        #    corpul — îl lăsăm să curgă direct, economisind o copie pe fiecare beacon.
        body = b""
        if not relaxed and scope["method"] in ("POST", "PUT", "PATCH", "DELETE"):
            chunks: list[bytes] = []
            more = True
            while more:
                message = await receive()
                chunks.append(message.get("body", b""))
                more = message.get("more_body", False)
            body = b"".join(chunks)

            if not is_binary_body and body:
                text = body.decode("utf-8", "ignore")
                if is_malicious(text):
                    await self._reject(send)
                    return

        sent_body = False

        async def wrapped_receive() -> Message:
            nonlocal sent_body
            if not sent_body:
                sent_body = True
                return {"type": "http.request", "body": body, "more_body": False}
            return {"type": "http.disconnect"}

        async def wrapped_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                # Paginile găzduite primesc CSP permisiv; restul, headerele stricte.
                chosen = (
                    _LANDING_SERVE_HEADERS
                    if path.startswith(_LANDING_SERVE_PREFIX)
                    else _SECURITY_HEADERS
                )
                for key, value in chosen.items():
                    headers[key] = value
            await send(message)

        receive_fn = wrapped_receive if body else receive
        await self.app(scope, receive_fn, wrapped_send)

    @staticmethod
    async def _reject(send: Send) -> None:
        body = b'{"detail":"Cerere blocata de filtrul de securitate (SQLi/XSS)."}'
        await send(
            {
                "type": "http.response.start",
                "status": 400,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})

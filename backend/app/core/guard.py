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

# Rute publice de ingestie unde conținutul (ex. textul unui buton) poate
# conține caractere care altfel ar fi blocate; sunt sanitizate la stocare.
_RELAXED_PREFIXES = ("/px/collect",)


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

        # 2) Bufferizează corpul o singură dată și îl re-injectează pentru handler.
        #    Bufferizăm pentru TOATE metodele cu corp (inclusiv rutele relaxate ca
        #    /px/collect): slowapi + FastAPI pot citi corpul de mai multe ori, iar
        #    un replay IDEMPOTENT evită pierderea lui. Diferența pentru rutele
        #    relaxate/binare e doar că NU scanăm conținutul (nu că nu-l bufferizăm).
        body = b""
        has_body = scope["method"] in ("POST", "PUT", "PATCH", "DELETE")
        if has_body:
            chunks: list[bytes] = []
            more = True
            while more:
                message = await receive()
                chunks.append(message.get("body", b""))
                more = message.get("more_body", False)
            body = b"".join(chunks)

            if not relaxed and not is_binary_body and body:
                text = body.decode("utf-8", "ignore")
                if is_malicious(text):
                    await self._reject(send)
                    return

        body_sent = False

        async def wrapped_receive() -> Message:
            nonlocal body_sent
            if not body_sent:
                body_sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            # Replay idempotent: la re-citiri întoarcem un corp gol TERMINAT
            # (more_body=False), NU http.disconnect — altfel Starlette ar ridica
            # ClientDisconnect la a doua citire și corpul ar ajunge gol (login 422,
            # collect fără evenimente pe endpoint-urile cu rate-limit).
            return {"type": "http.request", "body": b"", "more_body": False}

        async def wrapped_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for key, value in _SECURITY_HEADERS.items():
                    headers[key] = value
            await send(message)

        receive_fn = wrapped_receive if has_body else receive
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

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configurare citită din variabile de mediu."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Bază de date
    DATABASE_URL: str = "postgresql+asyncpg://statistic:statistic@db:5432/statistic"

    # Securitate / JWT
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 zile
    COOKIE_NAME: str = "statistic_token"
    COOKIE_SECURE: bool = False
    # Sare separată pentru hash-ul de IP (ca să nu refolosim secretul JWT).
    # Gol => derivă din JWT_SECRET (compatibil cu instalările existente).
    IP_HASH_SALT: str = ""

    @property
    def ip_salt(self) -> str:
        return self.IP_HASH_SALT or (self.JWT_SECRET + "::ip")

    def is_production(self) -> bool:
        """Considerăm producție când rulează pe HTTPS sau pe un domeniu real."""
        return self.COOKIE_SECURE or "localhost" not in self.BASE_URL

    def assert_secure(self) -> None:
        """Fail-fast la pornire dacă în producție rămân secrete default."""
        if not self.is_production():
            return
        problems = []
        if self.JWT_SECRET in ("", "change-me-in-production"):
            problems.append("JWT_SECRET")
        if self.FIRST_ADMIN_PASSWORD == "admin1234":
            problems.append("FIRST_ADMIN_PASSWORD")
        if problems:
            raise RuntimeError(
                "Configurare nesigură în producție: setează "
                + ", ".join(problems)
                + " în .env (ex: openssl rand -hex 32)."
            )

    # URL-uri
    BASE_URL: str = "http://localhost:8000"
    FRONTEND_ORIGIN: str = "http://localhost:5173"
    # Domeniul PUBLIC, scurt și stabil, folosit DOAR pentru linkuri scurte, QR și
    # snippetul pixel. Setează-l o dată (ex: https://qr.domeniul-tau.ro) și nu-l
    # mai schimba, ca QR-urile deja printate să rămână valide pe viață.
    # Gol => se folosește BASE_URL.
    PUBLIC_BASE_URL: str = ""

    @property
    def public_url(self) -> str:
        return (self.PUBLIC_BASE_URL or self.BASE_URL).rstrip("/")

    # Admin inițial (seed)
    FIRST_ADMIN_EMAIL: str = "admin@statistic.app"
    FIRST_ADMIN_PASSWORD: str = "admin1234"

    # Galerie: limită totală per utilizator (25 MB)
    GALLERY_MAX_BYTES: int = 25 * 1024 * 1024

    # --- AI (consultant CRO + gardian GDPR) ---
    # Cheia API Anthropic. SECRET → stă DOAR în .env, niciodată în DB/UI.
    # Gol => feature-ul AI e dezactivat „grațios": endpoint-urile răspund clar
    # „AI indisponibil", iar restul aplicației merge perfect fără cheie.
    ANTHROPIC_API_KEY: str = ""
    # Modelul folosit. Configurabil din .env (nu se schimbă la cald, deci nu în DB).
    # Implicit: cel mai nou Claude disponibil.
    AI_MODEL: str = "claude-opus-4-8"

    @property
    def ai_enabled(self) -> bool:
        """AI e activ doar dacă avem cheie. Folosit ca să dezactivăm grațios."""
        return bool(self.ANTHROPIC_API_KEY.strip())

    @property
    def cors_origins(self) -> list[str]:
        origins = {self.FRONTEND_ORIGIN, self.BASE_URL}
        return [o for o in origins if o]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

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

    # URL-uri
    BASE_URL: str = "http://localhost:8000"
    FRONTEND_ORIGIN: str = "http://localhost:5173"

    # Admin inițial (seed)
    FIRST_ADMIN_EMAIL: str = "admin@statistic.app"
    FIRST_ADMIN_PASSWORD: str = "admin1234"

    # Galerie: limită totală per utilizator (25 MB)
    GALLERY_MAX_BYTES: int = 25 * 1024 * 1024

    @property
    def cors_origins(self) -> list[str]:
        origins = {self.FRONTEND_ORIGIN, self.BASE_URL}
        return [o for o in origins if o]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

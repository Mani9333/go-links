from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from the environment (and an optional .env).

    Mirrors the TypeScript service: when ``mongodb_uri`` is unset the service
    falls back to in-memory sample data so it runs with zero setup.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"
    env: str = "development"

    mongodb_uri: str | None = None
    mongodb_db: str = "golinks"
    mongodb_collection: str = "links"

    # Number of entries returned in "top" / "recent" lists.
    top_n: int = 5

    # Comma-separated CORS origins (only needed for cross-origin local dev;
    # in production nginx serves both services from one origin).
    cors_origins: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

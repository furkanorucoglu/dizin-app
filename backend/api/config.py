"""API configuration via environment variables."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DIZINAPP_", env_file=".env", extra="ignore")

    # Database
    database_url: str = "sqlite:///./dizinapp.db"

    # File storage
    storage_dir: Path = Path("./storage")
    max_upload_mb: int = 50
    s3_bucket: str | None = None
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_region: str = "us-east-1"

    # Auth
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    dev_mode: bool = True  # if True, bypass auth via X-Dev-User header

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
        _settings.storage_dir.mkdir(parents=True, exist_ok=True)
    return _settings

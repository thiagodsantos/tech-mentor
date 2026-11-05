from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    app_env: str = "development"
    database_url: str = "sqlite+aiosqlite:///./tech_mentor.db"
    fernet_key: str | None = None
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_timeout_seconds: float = 30.0
    models_cache_ttl_seconds: int = 300
    credits_poll_interval_seconds: int = 300
    minimum_credits_poll_interval_seconds: int = 60
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @field_validator("minimum_credits_poll_interval_seconds")
    @classmethod
    def validate_minimum_poll_interval(cls, value: int) -> int:
        if value < 30:
            raise ValueError("minimum credits poll interval must be at least 30 seconds")
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_config() -> AppConfig:
    return AppConfig()

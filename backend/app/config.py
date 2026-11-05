from functools import lru_cache
from typing import Annotated

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    app_env: str = "development"
    database_url: str = "sqlite+aiosqlite:///./tech_mentor.db"
    fernet_key: str | None = None
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_timeout_seconds: float = 30.0
    openrouter_batch_callback_url: str | None = None
    openrouter_webhook_secret: SecretStr | None = None
    models_cache_ttl_seconds: int = 300
    credits_poll_interval_seconds: int = 300
    minimum_credits_poll_interval_seconds: int = 60
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @field_validator("openrouter_batch_callback_url")
    @classmethod
    def validate_batch_callback_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if not value.startswith("https://"):
            raise ValueError("OpenRouter batch callback URL must use HTTPS")
        return value

    @model_validator(mode="after")
    def validate_webhook_configuration(self) -> "AppConfig":
        webhook_secret = (
            self.openrouter_webhook_secret.get_secret_value().strip()
            if self.openrouter_webhook_secret
            else ""
        )
        if self.openrouter_batch_callback_url and not webhook_secret:
            raise ValueError("OPENROUTER_WEBHOOK_SECRET is required when a batch callback URL is configured")
        return self

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

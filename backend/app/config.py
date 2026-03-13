from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql://p7erp:p7erp@localhost:5432/p7erp"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60
    tenant_strategy: str = "header"  # header | subdomain | path
    cors_origins: str = ""
    redis_url: str | None = None
    api_v1_prefix: str = "/api/v1"
    ai_confirmation_token_pepper: str = "change-me-ai-token-pepper"
    ai_rate_limit_window_seconds: int = 60
    ai_rate_limit_chat_per_window: int = 30
    ai_rate_limit_read_per_window: int = 50
    ai_rate_limit_heavy_per_window: int = 12
    ai_timeout_chat_seconds: int = 20
    ai_timeout_heavy_seconds: int = 35
    ai_circuit_breaker_failure_threshold: int = 5
    ai_circuit_breaker_cooldown_seconds: int = 45

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()

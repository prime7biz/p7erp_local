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

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()

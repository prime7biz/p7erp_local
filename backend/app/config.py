from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "postgresql://p7erp:p7erp@localhost:5432/p7erp"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60
    tenant_strategy: str = "header"  # header | subdomain | path
    cors_origins: str = ""
    redis_url: str | None = None
    # Global per-tenant API cap (Redis). All /api/v1 routes with X-Tenant-Id count, except exclusions in rate_limiter.
    # Set to 0 to disable this middleware limit when Redis is enabled.
    tenant_rate_limit_requests_per_minute: int = 2000
    api_v1_prefix: str = "/api/v1"
    # Absolute path to media root (tenant dirs: {media_root}/{tenant_id}/...). Empty = backend/media next to app package.
    media_root: str = ""
    ai_confirmation_token_pepper: str = "change-me-ai-token-pepper"
    allow_public_registration: bool = False
    # If set (non-empty), first-user POST /auth/register must send the same value in X-Bootstrap-Key header
    # or bootstrap_key in RegisterRequest (Finding #4). Per-tenant alternative: tenants.bootstrap_token_hash.
    # In non-dev environments, bootstrap requires that key or tenant hash unless you rely on dev-only bypass below.
    bootstrap_registration_key: str = ""
    ai_rate_limit_window_seconds: int = 60
    ai_rate_limit_chat_per_window: int = 30
    ai_rate_limit_read_per_window: int = 50
    ai_rate_limit_heavy_per_window: int = 12
    ai_timeout_chat_seconds: int = 20
    ai_timeout_heavy_seconds: int = 35
    ai_circuit_breaker_failure_threshold: int = 5
    ai_circuit_breaker_cooldown_seconds: int = 45

    # Production planning AI (Gemini). Use cheapest Flash-lite model; override via GEMINI_MODEL.
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash-lite"
    gemini_enabled: bool = True
    # 0 = unlimited; otherwise max Gemini API calls per calendar month (process-wide, persisted in media/)
    ai_monthly_budget_limit: int = 0

    # Platform admin (super admin panel): JWT lifetime and local backup directory
    platform_admin_jwt_expire_minutes: int = 480
    backup_dir: str = "./backups"

    # Trade document storage: currently backend uses local media/trade_docs; future: trade_docs_backend=local|s3, bucket, etc.
    # trade_docs_backend: str = "local"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    is_dev = settings.app_env.lower() in {"dev", "development", "local", "test", "testing"}
    if not is_dev:
        if settings.jwt_secret == "change-me-in-production":
            raise RuntimeError("JWT_SECRET must be set to a strong value in non-development environments.")
        if settings.ai_confirmation_token_pepper == "change-me-ai-token-pepper":
            raise RuntimeError(
                "AI_CONFIRMATION_TOKEN_PEPPER must be set to a strong value in non-development environments."
            )
    return settings

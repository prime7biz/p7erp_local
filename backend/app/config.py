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
    # Customer AI: retries for structured LLM calls after asyncio timeout (0 = no retry).
    customer_ai_llm_retry_count: int = 1
    # Suggestion and trace batches: default expiry window from creation (cleanup deletes after expires_at).
    customer_ai_batch_retention_days: int = 90

    # Production planning AI (Gemini). Use cheapest Flash-lite model; override via GEMINI_MODEL.
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    gemini_enabled: bool = True
    # 0 = unlimited; otherwise max Gemini API calls per calendar month (process-wide, persisted in media/)
    ai_monthly_budget_limit: int = 0
    # Tier-1 local routing model (Docker service name by default)
    ollama_enabled: bool = True
    ollama_url: str = "http://ollama:11434"
    ollama_model: str = "llama3"
    # Tier-2 paid provider (used only after explicit escalation approval)
    paid_llm_provider: str = ""
    paid_llm_api_key: str = ""
    paid_llm_model: str = ""
    # Mounted in-process with FastAPI (opt-in: avoids prod boot failure when secret unset; set MCP_ENABLED=true explicitly)
    mcp_enabled: bool = False
    # Require JWT auth + tenant binding on HTTP /mcp endpoint (default True for production safety)
    mcp_require_auth: bool = True
    # Tier-1 vLLM (OpenAI-compatible). Preferred over Ollama when enabled and URL set.
    vllm_enabled: bool = True
    vllm_url: str = "http://vllm:8000"
    vllm_model: str = "meta-llama/Meta-Llama-3-8B-Instruct"
    vllm_max_tokens: int = 1024
    # MCP COMMIT_REQUIRED tools: default False (production-safe). Set MCP_COMMIT_BYPASS=true for local demos.
    mcp_commit_bypass: bool = False
    # Optional shared secret validated when human_approval_confirmed=true on COMMIT_REQUIRED tools.
    mcp_human_approval_secret: str = ""
    # When True, COMMIT_REQUIRED MCP tools create an approval artifact instead of calling ERP immediately.
    mcp_commit_uses_artifact: bool = False
    # Celery / async jobs (defaults to redis_url when empty)
    celery_broker_url: str = ""
    celery_result_backend: str = ""
    forecast_max_concurrent: int = 2
    analysis_max_concurrent: int = 4
    # MCP sync forecast path: guardrails (async Celery path can raise these later)
    forecast_sync_max_horizon_days: int = 90
    forecast_sync_timeout_seconds: int = 30

    # Quotation read-only costing intelligence Phase 1 (deterministic). Set false for global kill-switch.
    quotation_ai_costing_phase1_enabled: bool = True
    # Quotation costing AI Phase 2 (review-mode line suggestions + apply). Off by default.
    quotation_ai_costing_phase2_enabled: bool = False
    # Cost benchmarking (Phase 13): advisory comparison vs historical quotations. Off by default.
    quotation_ai_cost_benchmark_enabled: bool = False

    # Phases 14–20: ERP AI evolution (advisory / read-only by default; enable per environment).
    production_planning_ai_enhanced_enabled: bool = False
    tna_followup_ai_enabled: bool = False
    document_ai_validation_enabled: bool = False
    finance_ai_readonly_enabled: bool = False
    executive_ai_dashboard_enabled: bool = False
    ai_copilot_readonly_enabled: bool = False
    ai_controlled_automation_enabled: bool = False

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
        if settings.mcp_enabled and not settings.mcp_commit_bypass and not (
            settings.mcp_human_approval_secret or ""
        ).strip():
            raise RuntimeError(
                "When MCP is enabled in non-development environments, set MCP_HUMAN_APPROVAL_SECRET when "
                "MCP_COMMIT_BYPASS is false, or set MCP_COMMIT_BYPASS=true only for controlled demos."
            )
    return settings

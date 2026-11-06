from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "postgresql://p7erp:p7erp@localhost:5432/p7erp"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    emails_from_email: str = ""
    emails_from_name: str = "Prime7 ERP"
    frontend_url: str = "https://prime7erp.com"
    # External portal JWT (customer / financier); subject uses ext:{id} to avoid collision with internal user ids.
    external_jwt_expire_minutes: int = 45
    external_jwt_refresh_expire_days: int = 14
    external_login_max_attempts: int = 8
    external_login_lockout_minutes: int = 30
    # Staff (internal) login lockout. After staff_login_max_attempts failures from one IP, that IP is
    # blocked for this account for staff_login_lockout_minutes (other IPs, e.g. the real user, still work).
    staff_login_max_attempts: int = 8
    staff_login_lockout_minutes: int = 30
    # Account-wide lock (all IPs) only after this many failures in total — slows distributed guessing
    # without letting one attacker lock a user out. 0 = never lock the whole account.
    staff_login_account_lock_threshold: int = 40
    # Platform super-admin login: failures per username before a temporary lock (cache-backed, no DB column).
    platform_admin_login_max_attempts: int = 5
    platform_admin_login_lockout_minutes: int = 15
    # true: platform admins without TOTP enrolled can only reach the MFA enrolment endpoints until they enrol.
    platform_admin_mfa_required: bool = False
    platform_admin_mfa_issuer: str = "Prime7 ERP"
    # Soft rate limit for POST /auth/login and external login (per IP + company), requests per minute.
    login_rate_limit_per_minute: int = 20
    # true: every staff user may be logged in on only one device at a time (newest login wins),
    # for all tenants. false: fall back to per-tenant feature flag `single_session_enforced`.
    single_session_global: bool = True
    # While single-session is enforced, staff tokens without the `sv` claim are refused. Set an ISO
    # date/time (UTC) here to keep accepting them until then, e.g. "2026-12-01T00:00:00".
    legacy_token_without_sv_grace_until: str = ""
    # true: alert scans / weekly AI reports / platform maintenance run as loops inside each API
    # process (advisory-locked so one runs). false: the Celery beat service schedules them.
    inprocess_schedulers_enabled: bool = True
    # Where website "Book a demo" leads are emailed (leads are always stored in marketing_leads).
    sales_notification_email: str = ""
    # Module RBAC for tenants that have no `rbac_enforcement` flag: off | shadow (log only) | enforce.
    # Keep "off" until rbac_access_report.py has been reviewed; "shadow" never blocks anyone.
    rbac_default_mode: str = "off"
    tenant_strategy: str = "header"  # header | subdomain | path
    cors_origins: str = ""
    redis_url: str | None = None
    # Global per-tenant API cap (Redis). All /api/v1 routes with X-Tenant-Id count, except exclusions in rate_limiter.
    # Set to 0 to disable this middleware limit when Redis is enabled.
    tenant_rate_limit_requests_per_minute: int = 2000
    # Requests without a valid access token (login pages, public sign-up, webhooks), per client IP. 0 = off.
    anon_rate_limit_requests_per_minute: int = 300
    api_v1_prefix: str = "/api/v1"
    # Absolute path to media root (tenant dirs: {media_root}/{tenant_id}/...). Empty = backend/media next to app package.
    media_root: str = ""
    ai_confirmation_token_pepper: str = "change-me-ai-token-pepper"
    allow_public_registration: bool = False
    # If set (non-empty), first-user POST /auth/register must send the same value in X-Bootstrap-Key header
    # or bootstrap_key in RegisterRequest (Finding #4). Per-tenant alternative: tenants.bootstrap_token_hash.
    # In non-dev environments, bootstrap requires that key or tenant hash unless you rely on dev-only bypass below.
    bootstrap_registration_key: str = ""
    # Public company sign-up (POST /tenants). false: requires X-Bootstrap-Key = BOOTSTRAP_REGISTRATION_KEY
    # or a platform-admin token. Always limited per client IP (tenant_signup_rate_limit_per_hour, 0 = off).
    public_tenant_signup_enabled: bool = True
    tenant_signup_rate_limit_per_hour: int = 10
    ai_rate_limit_window_seconds: int = 60
    ai_rate_limit_chat_per_window: int = 30
    ai_rate_limit_read_per_window: int = 50
    ai_rate_limit_heavy_per_window: int = 12
    # Per-tenant daily cap for AI tool chat + escalation (UTC day). 0 = unlimited (default).
    ai_max_requests_per_tenant_per_day: int = 0
    # Max completion/request budget for external OpenAI-compatible paid calls (MCP loop).
    ai_max_tokens_per_request: int = 4096
    ai_timeout_chat_seconds: int = 20
    ai_timeout_heavy_seconds: int = 35
    ai_circuit_breaker_failure_threshold: int = 5
    ai_circuit_breaker_cooldown_seconds: int = 45
    # Customer AI: retries for structured LLM calls after asyncio timeout (0 = no retry).
    customer_ai_llm_retry_count: int = 1
    # Suggestion and trace batches: default expiry window from creation (cleanup deletes after expires_at).
    customer_ai_batch_retention_days: int = 90

    # Google Gemini (optional). Disabled by default while testing OpenRouter + local Ollama.
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    gemini_enabled: bool = False
    # OpenRouter (OpenAI-compatible API). Tier-1 default when key + model are set.
    openrouter_enabled: bool = True
    openrouter_api_key: str = ""
    # Alternates: see app.common.openrouter_model_presets.OPENROUTER_MODEL_PRESETS and docs/OPENROUTER.md
    openrouter_model: str = "google/gemma-4-31b-it:free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # Optional OpenRouter attribution headers (recommended by OpenRouter).
    openrouter_site_url: str = ""
    openrouter_app_name: str = "P7 ERP"
    # When true with OpenRouter keys set, tier-1 chat / structured AI uses OpenRouter before local Ollama.
    openrouter_tier1_preferred: bool = True
    # When true, tenant-scoped text features (dashboard brief, weekly report, planning narrative, etc.)
    # call OpenRouter first via generate_text_for_tenant, then fall back to Gemini if configured.
    openrouter_tenant_text_enabled: bool = True
    # 0 = unlimited; otherwise max Gemini API calls per calendar month (process-wide, persisted in media/)
    ai_monthly_budget_limit: int = 0
    # Tier-1 local routing model (Docker service name by default)
    ollama_enabled: bool = True
    ollama_url: str = "http://ollama:11434"
    # Default: small Gemma 2 instruct (Q4_K_M) for CPU-only / low-RAM machines via Ollama; override with OLLAMA_MODEL.
    ollama_model: str = "gemma2:2b-instruct-q4_K_M"
    # Tier-2 paid provider (used only after explicit escalation approval)
    paid_llm_provider: str = ""
    paid_llm_api_key: str = ""
    paid_llm_model: str = ""
    # When set, OpenAI-compatible chat URL base (e.g. https://openrouter.ai/api/v1 for OpenRouter).
    paid_llm_base_url: str = ""
    # Mounted in-process with FastAPI. Docker compose enables MCP explicitly for dev/prod; code default stays safe.
    mcp_enabled: bool = False
    # Require JWT auth + tenant binding on HTTP /mcp endpoint (default True for production safety)
    mcp_require_auth: bool = True
    # Optional vLLM override. Keep off by default because Ollama is the standard local model in this repo.
    vllm_enabled: bool = False
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
    # 1 = a worker process reserves one task at a time (long tasks do not hoard queued ones).
    celery_worker_prefetch_multiplier: int = 1
    # Recycle a worker child after N tasks so slow memory growth (pandas/torch) is released. 0 = never.
    celery_worker_max_tasks_per_child: int = 200
    # Soft limit raises SoftTimeLimitExceeded inside the task; hard limit kills the child. 0 = no limit.
    celery_task_soft_time_limit_seconds: int = 3300
    celery_task_time_limit_seconds: int = 3600
    # Delete merch alert_scan_log rows older than this many days (platform maintenance). 0 = keep forever.
    alert_scan_log_retention_days: int = 30
    alert_scan_log_purge_batch_size: int = 5000
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

    # Facility / financier portal / business overview (deterministic core + AI advisory).
    facility_management_enabled: bool = True
    business_overview_enabled: bool = True
    business_overview_ai_enabled: bool = True
    financier_advanced_portal_enabled: bool = True
    financier_confidence_ai_enabled: bool = True
    # When True, external portal AI narratives require internal approval before visibility.
    external_ai_requires_approval: bool = False

    # Platform admin (super admin panel): JWT lifetime and local backup directory
    platform_admin_jwt_expire_minutes: int = 480
    backup_dir: str = "./backups"

    # Lemon Squeezy (Merchant of Record) — see backend/.env.example
    lemonsqueezy_api_key: str = ""
    lemonsqueezy_store_id: str = ""
    lemonsqueezy_webhook_secret: str = ""
    lemonsqueezy_api_base_url: str = "https://api.lemonsqueezy.com"
    lemonsqueezy_checkout_success_url: str = ""

    # Trade document storage: currently backend uses local media/trade_docs; future: trade_docs_backend=local|s3, bucket, etc.
    # trade_docs_backend: str = "local"

    # --- DB performance observability (all default off; no API response shape change) ---
    # Log slow API requests (path, tenant, duration). See RequestLoggingMiddleware.
    perf_timing_enabled: bool = False
    perf_timing_slow_ms: int = 750
    # When timing fires for a slow request, also emit SQLAlchemy pool stats (checked_in/out, overflow).
    perf_pool_metrics_enabled: bool = False
    # Warn once per request if the URL query string exceeds this many bytes (abnormally large GET).
    perf_request_query_warn_bytes: int = 8192
    # DB statement_timeout (ms). 0 = disabled. Use only after profiling. Direct Postgres: set once per
    # pooled connection (applies to every session of this process, incl. background jobs).
    # PgBouncer (USE_PGBOUNCER=true): SET LOCAL at the start of each API request instead.
    perf_session_statement_timeout_ms: int = 0
    # DB lock_timeout (ms). 0 = disabled. Same scope rules as perf_session_statement_timeout_ms.
    perf_session_lock_timeout_ms: int = 0

    # SQLAlchemy pool per process (each uvicorn worker / Celery child has its own pool).
    # Budget: (uvicorn workers + celery processes) x (pool + overflow) must stay below Postgres
    # max_connections (default 100) minus headroom for alembic/psql/backups.
    db_pool_size: int = 10
    db_max_overflow: int = 10
    db_pool_timeout: int = 10
    db_pool_recycle: int = 1800

    # Subscription plan enforcement: when True, block user creation over plan max_users and inactive subscriptions.
    plan_enforcement_enabled: bool = False

    # Optional PgBouncer: when True, use database_url_pgbouncer (transaction pooling; asyncpg needs statement_cache_size=0).
    use_pgbouncer: bool = False
    database_url_pgbouncer: str = "postgresql://p7erp:p7erp@pgbouncer:5432/p7erp"

    # Async platform jobs (Celery). Off by default for safe rollout.
    platform_bulk_tenant_async_enabled: bool = False
    data_migration_async_enabled: bool = False

    # Redis-backed API response cache for stable read endpoints.
    api_cache_enabled: bool = False
    api_cache_tax_config_ttl_seconds: int = 300

    # Dashboard "AI summary" card: reuse the LLM answer per tenant for this many seconds
    # (Redis when available, else in-process). 0 = call the LLM on every dashboard load.
    dashboard_ai_summary_ttl_seconds: int = 1800

    # Live currency rates (open.er-api.com): reuse a fetched rate table for this many seconds
    # (Redis when available, else in-process). 0 = fetch on every lookup.
    fx_rate_cache_seconds: int = 3600

    # Request audit log (RequestLoggingMiddleware). false = only log writes (POST/PUT/PATCH/DELETE) and 5xx errors.
    audit_log_read_requests: bool = True
    # Max audit rows waiting to be written; extra rows are dropped with a warning instead of piling up.
    audit_log_max_pending: int = 1000
    # Max audit rows written at the same time (each write uses one DB connection).
    audit_log_max_concurrency: int = 4

    # Minimum length for JWT_SECRET / AI_CONFIRMATION_TOKEN_PEPPER outside development.
    secret_min_length: int = 32

    # Business calendar: "today" for default voucher / payroll / leave dates when the tenant has no
    # timezone of its own (tenants.timezone). Storage timestamps stay UTC.
    app_timezone: str = "Asia/Dhaka"

    model_config = {"env_file": ".env", "extra": "ignore"}


_KNOWN_PLACEHOLDER_SECRETS = frozenset(
    {
        "change-me-in-production",
        "change-me-ai-token-pepper",
        "dev-secret-change-in-production",
        "dev-local-mcp-approval-secret",
    }
)


def _require_strong_secret(name: str, value: str | None, min_length: int) -> None:
    v = (value or "").strip()
    if not v or v in _KNOWN_PLACEHOLDER_SECRETS:
        raise RuntimeError(f"{name} must be set to a strong value in non-development environments.")
    if len(v) < min_length:
        raise RuntimeError(
            f"{name} must be at least {min_length} characters in non-development environments "
            f"(currently {len(v)}). Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
        )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    is_dev = settings.app_env.lower() in {"dev", "development", "local", "test", "testing"}
    if not is_dev:
        min_len = max(0, int(settings.secret_min_length or 0))
        _require_strong_secret("JWT_SECRET", settings.jwt_secret, min_len)
        _require_strong_secret("AI_CONFIRMATION_TOKEN_PEPPER", settings.ai_confirmation_token_pepper, min_len)
        if settings.mcp_enabled and not settings.mcp_commit_bypass and not (
            settings.mcp_human_approval_secret or ""
        ).strip():
            raise RuntimeError(
                "When MCP is enabled in non-development environments, set MCP_HUMAN_APPROVAL_SECRET when "
                "MCP_COMMIT_BYPASS is false, or set MCP_COMMIT_BYPASS=true only for controlled demos."
            )
    return settings

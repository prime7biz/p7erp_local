import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import get_settings
from app.common.permissions import require_internal_permission
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.tenant.router import router as tenant_router
from app.modules.users.router import router as users_router
from app.modules.roles.router import router as roles_router
from app.modules.customers.router import router as customers_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.reports.router import router as reports_router
from app.modules.inquiries.router import router as inquiries_router
from app.modules.quotations.router import router as quotations_router
from app.modules.orders.router import router as orders_router
from app.modules.orders.change_request_router import router as commercial_change_requests_router
from app.modules.costing.router import router as costing_router
from app.modules.currency.router import router as currency_router
from app.modules.merch.routers import router as merch_router
from app.modules.inventory.router import router as inventory_router
from app.modules.inventory.stock_hierarchy_router import router as stock_hierarchy_router
from app.modules.inventory.mrp_idt_router import router as mrp_idt_router
from app.modules.inventory.grn_qc_router import router as grn_qc_router
from app.modules.inventory.inventory_analytics_router import router as inventory_analytics_router
from app.modules.inventory.serial_kit_consignment_router import router as serial_kit_consignment_router
from app.modules.finance.router import router as finance_router
from app.modules.finance.party_ledger_router import router as party_ledger_router
from app.modules.finance.gst_tax_router import router as gst_tax_router
from app.modules.finance.advanced_voucher_router import router as advanced_voucher_router
from app.modules.finance.tds_router import router as tds_router
from app.modules.finance.mis_reports_router import router as mis_reports_router
from app.modules.facility.router import router as facility_router
from app.modules.manufacturing.router import router as manufacturing_router
from app.modules.marketing.router import router as marketing_public_router
from app.modules.production.router import router as production_router
from app.modules.hr.router import router as hr_router
from app.modules.hr_attendance.router import router as hr_attendance_router
from app.modules.hr_leave.router import router as hr_leave_router
from app.modules.hr_payroll.router import router as hr_payroll_router
from app.modules.hr_performance.router import router as hr_performance_router
from app.modules.hr_recruitment.router import router as hr_recruitment_router
from app.modules.hr_ess.router import router as hr_ess_router
from app.modules.hr_reports.router import router as hr_reports_router
from app.modules.hr_compliance.router import router as hr_compliance_router
from app.modules.settings.router import router as settings_router
from app.modules.commercial.router import router as commercial_router
from app.modules.parties.router import router as parties_router
from app.modules.ai_tool.router import router as ai_tool_router
from app.modules.ai_extract.router import router as ai_extract_router
from app.modules.erp_ai_phases.router import router as erp_ai_phases_router
from app.modules.tna_unified.router import router as tna_unified_router
from app.modules.trade_case.router import router as trade_case_router
from app.modules.logistics.router import router as logistics_router
from app.modules.control_tower.router import router as control_tower_router
from app.modules.compliance.router import router as compliance_router
from app.modules.data_migration.router import router as data_migration_router
from app.modules.files.router import router as files_router
from app.modules.admin.router import router as admin_router
from app.modules.billing_lemonsqueezy.router import router as lemonsqueezy_api_router
from app.modules.billing_lemonsqueezy.router import webhook_router as lemonsqueezy_webhook_router
from app.modules.announcements.router import router as announcements_router
from app.modules.support.router import router as tenant_support_router
from app.external_access.auth.router import router as external_auth_router
from app.external_access.customer_portal.router import router as external_customer_router
from app.external_access.financier_portal.router import router as external_financier_router
from app.modules.mcp_server import mount_mcp
from app.common.external_audit_middleware import ExternalAuditMiddleware
from app.common.request_logger import RequestLoggingMiddleware
from app.common.rate_limiter import TenantRateLimitMiddleware
settings = get_settings()
logger = logging.getLogger(__name__)

# Local Vite origins: only merged in dev-like envs (or when FRONTEND_URL itself is localhost).
# Production must use explicit CORS_ORIGINS only — never auto-union localhost.
_DEFAULT_LOCAL_VITE_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5174", "http://127.0.0.1:5174",
    "http://localhost:5175", "http://127.0.0.1:5175",
    "http://localhost:5176", "http://127.0.0.1:5176",
    "http://localhost:5177", "http://127.0.0.1:5177",
]

def _frontend_looks_local(url: str) -> bool:
    u = (url or "").strip().lower()
    return u.startswith("http://localhost:") or u.startswith("http://127.0.0.1:")


_configured_cors = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
# Keep in sync with app.config.Settings startup checks (dev-like environments).
_app_env = settings.app_env.lower()
_dev_like_app_env = _app_env in {"dev", "development", "local", "test", "testing"}
_merge_local_vite = _dev_like_app_env or _frontend_looks_local(settings.frontend_url)
if _merge_local_vite:
    origins = list(dict.fromkeys(_configured_cors + _DEFAULT_LOCAL_VITE_ORIGINS))
elif _configured_cors:
    origins = list(dict.fromkeys(_configured_cors))
else:
    origins = []


async def _every(name: str, job, *, first_delay: float, interval: float) -> None:
    """In-process scheduler loop: run ``job`` after ``first_delay`` s, then every ``interval`` s."""
    await asyncio.sleep(first_delay)
    while True:
        try:
            await job()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Scheduled job %s failed", name)
        await asyncio.sleep(interval)


async def _seed_system_coa_startup() -> None:
    """Self-heal: ensure system groups/ledgers/mappings exist for every tenant (idempotent)."""
    from app.common.scheduled_jobs import seed_system_coa_once

    try:
        await seed_system_coa_once()
    except Exception:
        logger.exception("System COA startup seed failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.common import scheduled_jobs as jobs

    await _seed_system_coa_startup()
    tasks: list[asyncio.Task] = []
    # Set INPROCESS_SCHEDULERS_ENABLED=false once the Celery beat service runs these instead.
    if get_settings().inprocess_schedulers_enabled:
        tasks = [
            asyncio.create_task(_every("merch_alert_scan", jobs.run_merch_alert_scan_once, first_delay=60, interval=60 * 15)),
            asyncio.create_task(_every("trade_alert_scan", jobs.run_trade_alert_scan_once, first_delay=60 * 5, interval=86400)),
            asyncio.create_task(_every("weekly_ai_reports", jobs.run_weekly_ai_reports_once, first_delay=86400, interval=86400)),
            asyncio.create_task(_every("platform_maintenance", jobs.run_platform_maintenance_once, first_delay=3600, interval=3600)),
        ]
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        for t in tasks:
            try:
                await t
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title="P7 ERP API",
    version="0.1.0",
    lifespan=lifespan,
    # Hide OpenAPI surface in non-dev to reduce recon / abuse surface.
    docs_url="/docs" if _dev_like_app_env else None,
    redoc_url="/redoc" if _dev_like_app_env else None,
    openapi_url="/openapi.json" if _dev_like_app_env else None,
)

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(ExternalAuditMiddleware)
app.add_middleware(TenantRateLimitMiddleware)
mount_mcp(app)
# CORS registered last so it wraps all other middleware: short-circuit responses (e.g. 429) still get
# Access-Control-Allow-Origin; otherwise browsers report a misleading CORS failure.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

# External stakeholder portals (separate JWT namespace; not under /api/v1).
app.include_router(external_auth_router, prefix="/api/external")
app.include_router(external_customer_router, prefix="/api/external")
app.include_router(external_financier_router, prefix="/api/external")

app.include_router(files_router, prefix=settings.api_v1_prefix)
app.include_router(marketing_public_router, prefix=settings.api_v1_prefix)
app.include_router(auth_router, prefix=settings.api_v1_prefix)
app.include_router(tenant_router, prefix=settings.api_v1_prefix)
app.include_router(
    users_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("settings.access"))],
)
app.include_router(
    roles_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("settings.access"))],
)
app.include_router(
    audit_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("settings.access"))],
)
app.include_router(
    customers_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("merch.access"))],
)
app.include_router(dashboard_router, prefix=settings.api_v1_prefix)
app.include_router(
    reports_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("reports.access"))],
)
app.include_router(
    inquiries_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("merch.access"))],
)
app.include_router(
    quotations_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("merch.access"))],
)
app.include_router(
    orders_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("merch.access"))],
)
app.include_router(
    commercial_change_requests_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("merch.access"))],
)
app.include_router(
    costing_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("merch.access"))],
)
app.include_router(
    currency_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("settings.access"))],
)
app.include_router(
    merch_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("merch.access"))],
)
app.include_router(inventory_router, prefix=settings.api_v1_prefix)
app.include_router(stock_hierarchy_router, prefix=settings.api_v1_prefix)
app.include_router(mrp_idt_router, prefix=settings.api_v1_prefix)
app.include_router(grn_qc_router, prefix=settings.api_v1_prefix)
app.include_router(inventory_analytics_router, prefix=settings.api_v1_prefix)
app.include_router(serial_kit_consignment_router, prefix=settings.api_v1_prefix)
app.include_router(finance_router, prefix=settings.api_v1_prefix)
app.include_router(party_ledger_router, prefix=settings.api_v1_prefix)
app.include_router(gst_tax_router, prefix=settings.api_v1_prefix)
app.include_router(advanced_voucher_router, prefix=settings.api_v1_prefix)
app.include_router(tds_router, prefix=settings.api_v1_prefix)
app.include_router(mis_reports_router, prefix=settings.api_v1_prefix)
app.include_router(facility_router, prefix=settings.api_v1_prefix)
app.include_router(manufacturing_router, prefix=settings.api_v1_prefix)
app.include_router(production_router, prefix=settings.api_v1_prefix)
app.include_router(
    hr_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("hr.access"))],
)
app.include_router(
    hr_attendance_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("hr.access"))],
)
app.include_router(
    hr_leave_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("hr.access"))],
)
app.include_router(
    hr_payroll_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("hr.access"))],
)
app.include_router(
    hr_performance_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("hr.access"))],
)
app.include_router(
    hr_recruitment_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("hr.access"))],
)
app.include_router(
    hr_ess_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("hr.access"))],
)
app.include_router(
    hr_compliance_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("hr.access"))],
)
app.include_router(
    hr_reports_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("hr.access"))],
)
app.include_router(settings_router, prefix=settings.api_v1_prefix)
app.include_router(
    commercial_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("merch.access"))],
)
app.include_router(
    parties_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("merch.access"))],
)
app.include_router(
    ai_tool_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("ai.access"))],
)
app.include_router(
    ai_extract_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("ai.access"))],
)
app.include_router(
    erp_ai_phases_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("ai.access"))],
)
app.include_router(
    tna_unified_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("merch.access"))],
)
app.include_router(
    trade_case_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("trade.access"))],
)
app.include_router(
    logistics_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("trade.access"))],
)
app.include_router(control_tower_router, prefix=settings.api_v1_prefix)
app.include_router(compliance_router, prefix=settings.api_v1_prefix)
app.include_router(data_migration_router, prefix=settings.api_v1_prefix)
app.include_router(admin_router, prefix=settings.api_v1_prefix + "/admin")
app.include_router(announcements_router, prefix=settings.api_v1_prefix)
app.include_router(tenant_support_router, prefix=settings.api_v1_prefix)
app.include_router(lemonsqueezy_api_router, prefix=settings.api_v1_prefix)
app.include_router(lemonsqueezy_webhook_router)


@app.get("/health")
async def health():
    started_at = time.perf_counter()
    overall_status = "healthy"
    components: dict[str, str] = {"api": "healthy"}

    try:
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        components["database"] = "healthy"
    except Exception:
        components["database"] = "unhealthy"
        overall_status = "degraded"

    redis_url = (settings.redis_url or "").strip()
    if redis_url:
        try:
            from app.common.redis_client import get_redis

            redis_client = get_redis()
            if redis_client is None:
                raise RuntimeError("Redis client is not initialized")
            pong = await asyncio.wait_for(redis_client.ping(), timeout=2.5)
            if pong:
                components["redis"] = "healthy"
            else:
                components["redis"] = "unhealthy"
                overall_status = "degraded"
        except Exception:
            components["redis"] = "unhealthy"
            overall_status = "degraded"
    else:
        components["redis"] = "disabled"

    payload: dict = {
        "status": overall_status,
        "version": os.getenv("APP_VERSION", "dev"),
        "components": components,
        "latency_ms": round((time.perf_counter() - started_at) * 1000, 2),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    # Do not leak APP_ENV on production /health.
    if _dev_like_app_env:
        payload["environment"] = settings.app_env
    return payload

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import get_settings
from app.common.permissions import require_any_internal_permission, require_internal_permission
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
from app.modules.orders.color_size_router import router as order_color_size_router
from app.modules.commission.router import router as commission_router
from app.modules.traceability.router import router as traceability_router
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
from app.modules.finance.exception_reports_router import router as exception_reports_router
from app.modules.finance.voucher_entry_assist_router import router as voucher_entry_assist_router
from app.modules.procurement.router import router as procurement_router
from app.modules.facility.router import router as facility_router
from app.modules.manufacturing.router import router as manufacturing_router
from app.modules.marketing.router import router as marketing_public_router
from app.modules.document_verify.public_router import router as document_verify_public_router
from app.modules.saved_views.router import router as saved_views_router
from app.modules.global_search.router import router as global_search_router
from app.modules.notifications.router import router as notifications_router
from app.modules.onboarding.router import router as onboarding_router
from app.modules.production.router import router as production_router
from app.modules.hr.router import router as hr_router
from app.modules.hr.compensation_router import router as hr_compensation_router
from app.modules.hr.onboarding_router import router as hr_onboarding_router
from app.modules.hr_attendance.router import router as hr_attendance_router
from app.modules.hr_attendance.device_router import push_router as hr_attendance_device_push_router
from app.modules.hr_attendance.device_router import router as hr_attendance_device_router
from app.modules.hr_attendance.iclock_router import router as hr_attendance_iclock_router
from app.modules.hr_attendance.hr_settings_router import router as hr_settings_router
from app.modules.hr_leave.router import router as hr_leave_router
from app.modules.hr_payroll.router import router as hr_payroll_router
from app.modules.hr_performance.router import router as hr_performance_router
from app.modules.hr_recruitment.router import router as hr_recruitment_router
from app.modules.hr_ess.router import router as hr_ess_router
from app.modules.hr_reports.router import router as hr_reports_router
from app.modules.hr_compliance.router import router as hr_compliance_router
from app.modules.hr_localization.routers import BD_HR_ROUTERS
from app.modules.settings.router import router as settings_router
from app.modules.commercial.router import router as commercial_router
from app.modules.commercial.lc_performance_router import router as lc_performance_router
from app.modules.parties.router import router as parties_router
from app.modules.ai_tool.router import router as ai_tool_router
from app.modules.ai_extract.router import router as ai_extract_router
from app.modules.erp_ai_phases.router import router as erp_ai_phases_router
from app.modules.tna_unified.router import router as tna_unified_router
from app.modules.trade_case.router import router as trade_case_router
from app.modules.logistics.router import router as logistics_router
from app.modules.logistics.carton_router import router as packing_carton_router
from app.modules.control_tower.router import router as control_tower_router
from app.modules.mfg_intelligence.router import router as mfg_intelligence_router
from app.modules.mfg_intelligence.finance_router import router as mfg_intelligence_finance_router
from app.modules.mfg_intelligence.predictive_router import router as mfg_intelligence_predictive_router
from app.modules.mfg_intelligence.advanced_planning_router import router as mfg_advanced_planning_router
from app.modules.mfg_planning.scheduler_router import router as mfg_scheduler_write_router
from app.modules.mfg_planning.predictive_router import router as mfg_predictive_write_router
from app.modules.mfg_planning.allocation_router import router as mfg_allocation_router
from app.modules.mfg_planning.planning_router import router as mfg_planning_router
from app.modules.mfg_planning.assignments_router import router as mfg_assignments_router
from app.modules.compliance.router import router as compliance_router
from app.modules.compliance.bd_router import bd_trade_router, bd_vat_router
from app.modules.data_migration.router import router as data_migration_router
from app.modules.files.router import router as files_router
from app.modules.profile.router import router as profile_router
from app.modules.admin.router import router as admin_router
from app.modules.billing_lemonsqueezy.router import router as lemonsqueezy_api_router
from app.modules.billing_lemonsqueezy.router import webhook_router as lemonsqueezy_webhook_router
from app.modules.announcements.router import router as announcements_router
from app.modules.support.router import router as tenant_support_router
from app.external_access.auth.router import router as external_auth_router
from app.external_access.customer_portal.router import router as external_customer_router
from app.external_access.financier_portal.router import router as external_financier_router
from app.external_access.supplier_portal.router import router as external_supplier_router
from app.external_access.supplier_portal.internal_router import router as supplier_updates_internal_router
from app.modules.inventory.po_color_size_router import router as po_color_size_router
from app.modules.governed_ai.router import router as governed_ai_router
from app.modules.mcp_server import mount_mcp
from app.common.external_audit_middleware import ExternalAuditMiddleware
from app.common.cache_headers import ApiNoStoreMiddleware
from app.common.gzip_middleware import SelectiveGZipMiddleware
from app.common.request_logger import RequestLoggingMiddleware
from app.common.rate_limiter import TenantRateLimitMiddleware
from app.common.legacy_verify_redirect import LegacyVerifyRedirectMiddleware
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

# Cookies (HttpOnly refresh token) may only be sent cross-origin to explicitly listed origins.
# With "*" every website would be allowed to make credentialed calls, so credentials are turned off.
_cors_allow_credentials = "*" not in origins
if not _cors_allow_credentials:
    logger.warning("CORS_ORIGINS contains '*': credentialed CORS is disabled. List explicit origins instead.")


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


def _seconds_until_weekly(weekday: int, hour: int, minute: int = 0, now: datetime | None = None) -> float:
    """Seconds from ``now`` (UTC) until the next ``weekday`` (Mon=0..Sun=6) at ``hour:minute`` UTC."""
    now = now or datetime.now(timezone.utc)
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    target += timedelta(days=(weekday - now.weekday()) % 7)
    if target <= now:
        target += timedelta(days=7)
    return (target - now).total_seconds()


async def _weekly_at(name: str, job, *, weekday: int, hour: int, minute: int = 0) -> None:
    """In-process scheduler loop pinned to a wall-clock slot, so restarts/deploys do not shift it."""
    while True:
        await asyncio.sleep(_seconds_until_weekly(weekday, hour, minute))
        try:
            await job()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Scheduled job %s failed", name)
        # Step past the slot so a very fast run cannot fire twice in the same minute.
        await asyncio.sleep(61)


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
            # Sunday 02:00 UTC — same slot as the Celery beat crontab (scheduled.weekly_ai_reports).
            asyncio.create_task(
                _weekly_at(
                    "weekly_ai_reports",
                    lambda: jobs.run_weekly_ai_reports_once(only_on_sunday=False),
                    weekday=6,
                    hour=2,
                )
            ),
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
        from app.common.http_clients import close_shared_http_clients

        await close_shared_http_clients()


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
# Added before the rate limiter so it runs inside it: legacy QR scans still count against the per-IP limit.
app.add_middleware(LegacyVerifyRedirectMiddleware, api_v1_prefix=settings.api_v1_prefix)
app.add_middleware(TenantRateLimitMiddleware)
# Compress JSON responses >= 1 KB when the client accepts gzip. Added before CORS so CORS stays outermost.
app.add_middleware(SelectiveGZipMiddleware, minimum_size=1024)
app.add_middleware(ApiNoStoreMiddleware)
mount_mcp(app)
# CORS registered last so it wraps all other middleware: short-circuit responses (e.g. 429) still get
# Access-Control-Allow-Origin; otherwise browsers report a misleading CORS failure.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=_cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

# External stakeholder portals (separate JWT namespace; not under /api/v1).
app.include_router(external_auth_router, prefix="/api/external")
app.include_router(external_customer_router, prefix="/api/external")
app.include_router(external_financier_router, prefix="/api/external")
app.include_router(external_supplier_router, prefix="/api/external")

app.include_router(files_router, prefix=settings.api_v1_prefix)
app.include_router(profile_router, prefix=settings.api_v1_prefix)
app.include_router(marketing_public_router, prefix=settings.api_v1_prefix)
app.include_router(document_verify_public_router, prefix=settings.api_v1_prefix)
app.include_router(saved_views_router, prefix=settings.api_v1_prefix)
app.include_router(global_search_router, prefix=settings.api_v1_prefix)
app.include_router(notifications_router, prefix=settings.api_v1_prefix)
app.include_router(onboarding_router, prefix=settings.api_v1_prefix)
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
    order_color_size_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("merch.access"))],
)
app.include_router(
    commission_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("merch.access"))],
)
app.include_router(
    traceability_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("inventory.access"))],
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
_inventory_access = [Depends(require_internal_permission("inventory.access"))]
_finance_access = [Depends(require_internal_permission("finance.access"))]
app.include_router(inventory_router, prefix=settings.api_v1_prefix)
app.include_router(stock_hierarchy_router, prefix=settings.api_v1_prefix, dependencies=_inventory_access)
app.include_router(mrp_idt_router, prefix=settings.api_v1_prefix, dependencies=_inventory_access)
app.include_router(grn_qc_router, prefix=settings.api_v1_prefix, dependencies=_inventory_access)
app.include_router(inventory_analytics_router, prefix=settings.api_v1_prefix, dependencies=_inventory_access)
app.include_router(serial_kit_consignment_router, prefix=settings.api_v1_prefix, dependencies=_inventory_access)
app.include_router(finance_router, prefix=settings.api_v1_prefix)
app.include_router(party_ledger_router, prefix=settings.api_v1_prefix, dependencies=_finance_access)
app.include_router(gst_tax_router, prefix=settings.api_v1_prefix, dependencies=_finance_access)
app.include_router(advanced_voucher_router, prefix=settings.api_v1_prefix, dependencies=_finance_access)
app.include_router(tds_router, prefix=settings.api_v1_prefix, dependencies=_finance_access)
app.include_router(mis_reports_router, prefix=settings.api_v1_prefix, dependencies=_finance_access)
app.include_router(exception_reports_router, prefix=settings.api_v1_prefix, dependencies=_finance_access)
app.include_router(voucher_entry_assist_router, prefix=settings.api_v1_prefix)
app.include_router(
    procurement_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_any_internal_permission("inventory.access", "merch.access"))],
)
app.include_router(facility_router, prefix=settings.api_v1_prefix)
app.include_router(manufacturing_router, prefix=settings.api_v1_prefix)
app.include_router(production_router, prefix=settings.api_v1_prefix)
app.include_router(
    hr_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("hr.access"))],
)
app.include_router(
    hr_compensation_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("hr.access"))],
)
app.include_router(
    hr_onboarding_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("hr.access"))],
)
app.include_router(
    hr_attendance_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("hr.access"))],
)
app.include_router(
    hr_attendance_device_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("hr.access"))],
)
# Devices authenticate with their own X-Device-Key header, not a staff login.
app.include_router(hr_attendance_device_push_router, prefix=settings.api_v1_prefix)
# ZKTeco cloud push uses fixed /iclock/* paths (serial number + allowed IPs, no staff login).
app.include_router(hr_attendance_iclock_router)
app.include_router(
    hr_settings_router,
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
for _bd_hr_router in BD_HR_ROUTERS:
    app.include_router(
        _bd_hr_router,
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
    lc_performance_router,
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
app.include_router(
    supplier_updates_internal_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("inventory.access"))],
)
app.include_router(
    governed_ai_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("ai.access"))],
)
app.include_router(
    po_color_size_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("inventory.access"))],
)
app.include_router(
    packing_carton_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("trade.access"))],
)
app.include_router(
    control_tower_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_any_internal_permission("merch.access", "production.access"))],
)
app.include_router(
    mfg_intelligence_router,
    prefix=settings.api_v1_prefix,
)
app.include_router(
    mfg_intelligence_finance_router,
    prefix=settings.api_v1_prefix,
)
app.include_router(
    mfg_intelligence_predictive_router,
    prefix=settings.api_v1_prefix,
)
app.include_router(
    mfg_advanced_planning_router,
    prefix=settings.api_v1_prefix,
)
app.include_router(
    mfg_scheduler_write_router,
    prefix=settings.api_v1_prefix,
)
app.include_router(
    mfg_predictive_write_router,
    prefix=settings.api_v1_prefix,
)
app.include_router(
    mfg_allocation_router,
    prefix=settings.api_v1_prefix,
)
app.include_router(
    mfg_planning_router,
    prefix=settings.api_v1_prefix,
)
app.include_router(
    mfg_assignments_router,
    prefix=settings.api_v1_prefix,
)
app.include_router(
    compliance_router,
    prefix=settings.api_v1_prefix,
    dependencies=[
        Depends(require_any_internal_permission("settings.access", "finance.access", "hr.access", "trade.access"))
    ],
)
app.include_router(
    bd_trade_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("trade.access"))],
)
app.include_router(
    bd_vat_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("finance.access"))],
)
app.include_router(
    data_migration_router,
    prefix=settings.api_v1_prefix,
    dependencies=[Depends(require_internal_permission("settings.access"))],
)
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

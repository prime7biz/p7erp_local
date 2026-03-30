import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
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
from app.modules.finance.router import router as finance_router
from app.modules.manufacturing.router import router as manufacturing_router
from app.modules.production.router import router as production_router
from app.modules.hr.router import router as hr_router
from app.modules.hr_attendance.router import router as hr_attendance_router
from app.modules.hr_leave.router import router as hr_leave_router
from app.modules.hr_payroll.router import router as hr_payroll_router
from app.modules.hr_performance.router import router as hr_performance_router
from app.modules.hr_recruitment.router import router as hr_recruitment_router
from app.modules.hr_ess.router import router as hr_ess_router
from app.modules.hr_reports.router import router as hr_reports_router
from app.modules.settings.router import router as settings_router
from app.modules.commercial.router import router as commercial_router
from app.modules.parties.router import router as parties_router
from app.modules.ai_tool.router import router as ai_tool_router
from app.modules.ai_extract.router import router as ai_extract_router
from app.modules.erp_ai_phases.router import router as erp_ai_phases_router
from app.modules.tna_unified.router import router as tna_unified_router
from app.modules.trade_case.router import router as trade_case_router
from app.modules.logistics.router import router as logistics_router
from app.modules.files.router import router as files_router
from app.modules.admin.router import router as admin_router
from app.modules.announcements.router import router as announcements_router
from app.modules.support.router import router as tenant_support_router
from app.modules.mcp_server import mount_mcp
from app.common.request_logger import RequestLoggingMiddleware
from app.common.rate_limiter import TenantRateLimitMiddleware

settings = get_settings()
logger = logging.getLogger(__name__)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
if not origins:
    origins = [
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
        "http://localhost:5175", "http://127.0.0.1:5175",
        "http://localhost:5176", "http://127.0.0.1:5176",
        "http://localhost:5177", "http://127.0.0.1:5177",
    ]


async def _run_alert_scan_all_tenants() -> None:
    """Background: run merch alert scan for all tenants every 15 min."""
    from app.database import AsyncSessionLocal
    from app.modules.merch.alert_engine import run_scan, get_tenant_ids
    while True:
        await asyncio.sleep(60)  # wait 1 min after startup, then first run
        try:
            async with AsyncSessionLocal() as db:
                tenant_ids = await get_tenant_ids(db)
                for tid in tenant_ids:
                    try:
                        await run_scan(db, tid, trigger="scheduled")
                        await db.commit()
                    except Exception:
                        await db.rollback()
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Scheduled merch alert scan failed")
        await asyncio.sleep(60 * 14)  # 15 min total between runs


async def _run_weekly_ai_reports() -> None:
    """Background: generate weekly Gemini executive report per tenant (Sundays UTC)."""
    from app.database import AsyncSessionLocal
    from app.modules.ai_tool.weekly_report_service import generate_and_store_weekly_report
    from app.modules.merch.alert_engine import get_tenant_ids

    while True:
        await asyncio.sleep(86400)  # daily
        try:
            from datetime import datetime, timezone

            if datetime.now(timezone.utc).weekday() != 6:
                continue
            async with AsyncSessionLocal() as db:
                tenant_ids = await get_tenant_ids(db)
                for tid in tenant_ids:
                    try:
                        await generate_and_store_weekly_report(db, tid)
                        await db.commit()
                    except Exception:
                        await db.rollback()
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Weekly AI report job failed")


async def _run_trade_alert_scan_daily() -> None:
    """Background: run trade-only alert rules for all tenants once per day."""
    from app.database import AsyncSessionLocal
    from app.modules.merch.alert_engine import run_scan_trade_rules_only, get_tenant_ids
    while True:
        await asyncio.sleep(60 * 5)  # wait 5 min after startup, then first run
        try:
            async with AsyncSessionLocal() as db:
                tenant_ids = await get_tenant_ids(db)
                for tid in tenant_ids:
                    try:
                        await run_scan_trade_rules_only(db, tid, trigger="scheduled_daily")
                        await db.commit()
                    except Exception:
                        await db.rollback()
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Scheduled trade alert scan failed")
        await asyncio.sleep(86400)  # next run in 24h


async def _run_platform_daily_maintenance() -> None:
    """Daily: usage aggregation, overdue invoices, AI budget month reset, backup schedules."""
    from app.database import AsyncSessionLocal
    from app.modules.admin.tasks import run_platform_daily_maintenance

    while True:
        await asyncio.sleep(3600)  # hourly; internal tasks gate by day/month
        try:
            async with AsyncSessionLocal() as db:
                await run_platform_daily_maintenance(db)
                await db.commit()
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Platform daily maintenance failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    scan_task = asyncio.create_task(_run_alert_scan_all_tenants())
    trade_scan_task = asyncio.create_task(_run_trade_alert_scan_daily())
    weekly_ai_task = asyncio.create_task(_run_weekly_ai_reports())
    platform_maint_task = asyncio.create_task(_run_platform_daily_maintenance())
    try:
        yield
    finally:
        scan_task.cancel()
        trade_scan_task.cancel()
        weekly_ai_task.cancel()
        platform_maint_task.cancel()
        try:
            await scan_task
        except asyncio.CancelledError:
            pass
        try:
            await trade_scan_task
        except asyncio.CancelledError:
            pass
        try:
            await weekly_ai_task
        except asyncio.CancelledError:
            pass
        try:
            await platform_maint_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="P7 ERP API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(TenantRateLimitMiddleware)
mount_mcp(app)

app.include_router(files_router, prefix=settings.api_v1_prefix)
app.include_router(auth_router, prefix=settings.api_v1_prefix)
app.include_router(tenant_router, prefix=settings.api_v1_prefix)
app.include_router(users_router, prefix=settings.api_v1_prefix)
app.include_router(roles_router, prefix=settings.api_v1_prefix)
app.include_router(audit_router, prefix=settings.api_v1_prefix)
app.include_router(customers_router, prefix=settings.api_v1_prefix)
app.include_router(dashboard_router, prefix=settings.api_v1_prefix)
app.include_router(reports_router, prefix=settings.api_v1_prefix)
app.include_router(inquiries_router, prefix=settings.api_v1_prefix)
app.include_router(quotations_router, prefix=settings.api_v1_prefix)
app.include_router(orders_router, prefix=settings.api_v1_prefix)
app.include_router(commercial_change_requests_router, prefix=settings.api_v1_prefix)
app.include_router(costing_router, prefix=settings.api_v1_prefix)
app.include_router(currency_router, prefix=settings.api_v1_prefix)
app.include_router(merch_router, prefix=settings.api_v1_prefix)
app.include_router(inventory_router, prefix=settings.api_v1_prefix)
app.include_router(finance_router, prefix=settings.api_v1_prefix)
app.include_router(manufacturing_router, prefix=settings.api_v1_prefix)
app.include_router(production_router, prefix=settings.api_v1_prefix)
app.include_router(hr_router, prefix=settings.api_v1_prefix)
app.include_router(hr_attendance_router, prefix=settings.api_v1_prefix)
app.include_router(hr_leave_router, prefix=settings.api_v1_prefix)
app.include_router(hr_payroll_router, prefix=settings.api_v1_prefix)
app.include_router(hr_performance_router, prefix=settings.api_v1_prefix)
app.include_router(hr_recruitment_router, prefix=settings.api_v1_prefix)
app.include_router(hr_ess_router, prefix=settings.api_v1_prefix)
app.include_router(hr_reports_router, prefix=settings.api_v1_prefix)
app.include_router(settings_router, prefix=settings.api_v1_prefix)
app.include_router(commercial_router, prefix=settings.api_v1_prefix)
app.include_router(parties_router, prefix=settings.api_v1_prefix)
app.include_router(ai_tool_router, prefix=settings.api_v1_prefix)
app.include_router(ai_extract_router, prefix=settings.api_v1_prefix)
app.include_router(erp_ai_phases_router, prefix=settings.api_v1_prefix)
app.include_router(tna_unified_router, prefix=settings.api_v1_prefix)
app.include_router(trade_case_router, prefix=settings.api_v1_prefix)
app.include_router(logistics_router, prefix=settings.api_v1_prefix)
app.include_router(admin_router, prefix=settings.api_v1_prefix + "/admin")
app.include_router(announcements_router, prefix=settings.api_v1_prefix)
app.include_router(tenant_support_router, prefix=settings.api_v1_prefix)


@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "db": "ok"}

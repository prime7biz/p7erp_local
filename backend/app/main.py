from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
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
from app.modules.costing.router import router as costing_router
from app.modules.currency.router import router as currency_router
from app.modules.merch.router import router as merch_router
from app.modules.inventory.router import router as inventory_router
from app.modules.finance.router import router as finance_router
from app.modules.manufacturing.router import router as manufacturing_router
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

settings = get_settings()

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
if not origins:
    origins = [
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
        "http://localhost:5175", "http://127.0.0.1:5175",
        "http://localhost:5176", "http://127.0.0.1:5176",
        "http://localhost:5177", "http://127.0.0.1:5177",
    ]


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="P7 ERP API",
    version="0.1.0",
    lifespan=lifespan,
)

media_dir = Path(__file__).resolve().parents[1] / "media"
media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=media_dir), name="media")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
app.include_router(costing_router, prefix=settings.api_v1_prefix)
app.include_router(currency_router, prefix=settings.api_v1_prefix)
app.include_router(merch_router, prefix=settings.api_v1_prefix)
app.include_router(inventory_router, prefix=settings.api_v1_prefix)
app.include_router(finance_router, prefix=settings.api_v1_prefix)
app.include_router(manufacturing_router, prefix=settings.api_v1_prefix)
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


@app.get("/health")
def health():
    return {"status": "ok"}

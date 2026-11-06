"""All Bangladesh HR routers, mounted by ``app.main`` under ``hr.access``."""

from __future__ import annotations

from app.modules.hr.employee_files_router import router as employee_files_router
from app.modules.hr_attendance.manual_router import router as manual_attendance_router
from app.modules.hr_allowances.router import router as allowances_router
from app.modules.hr_discipline.router import router as cases_router
from app.modules.hr_gate.router import router as gate_router
from app.modules.hr_separation.router import router as separation_router
from app.modules.hr_payroll.register_router import router as payroll_register_router
from app.modules.hr_localization.enforcement_router import router as enforcement_router
from app.modules.hr_localization.preset_router import router as preset_router
from app.modules.hr_localization.rules_router import router as rules_router

BD_HR_ROUTERS = [
    preset_router,
    rules_router,
    enforcement_router,
    employee_files_router,
    gate_router,
    manual_attendance_router,
    payroll_register_router,
    cases_router,
    separation_router,
    allowances_router,
]

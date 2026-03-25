"""Aggregates platform admin (super admin) API routers."""

from fastapi import APIRouter

from app.modules.admin.ai_router import router as ai_router
from app.modules.admin.auth_router import router as auth_router
from app.modules.admin.backup_router import router as backup_router
from app.modules.admin.billing_router import router as billing_router
from app.modules.admin.dashboard_router import router as dashboard_router
from app.modules.admin.monitoring_router import router as monitoring_router
from app.modules.admin.security_router import router as security_router
from app.modules.admin.settings_router import router as settings_router
from app.modules.admin.support_router import router as support_router
from app.modules.admin.tenant_router import router as tenant_router
from app.modules.admin.user_router import router as user_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(dashboard_router)
router.include_router(settings_router)
router.include_router(tenant_router)
router.include_router(user_router)
router.include_router(monitoring_router)
router.include_router(backup_router)
router.include_router(ai_router)
router.include_router(billing_router)
router.include_router(support_router)
router.include_router(security_router)

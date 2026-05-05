"""Aggregate production module routers."""
from fastapi import APIRouter, Depends
from app.common.permissions import require_internal_permission

from app.modules.production.costing_router import router as costing_router
from app.modules.production.crew_router import router as crew_router
from app.modules.production.cutting_router import router as cutting_router
from app.modules.production.dashboard_router import router as dashboard_router
from app.modules.production.dept_router import router as dept_router
from app.modules.production.dyeing_router import router as dyeing_router
from app.modules.production.hourly_router import router as hourly_router
from app.modules.production.ie_router import router as ie_router
from app.modules.production.knitting_router import router as knitting_router
from app.modules.production.lines_router import router as lines_router
from app.modules.production.planning_router import router as planning_router
from app.modules.production.quality_router import router as quality_router
from app.modules.production.roster_router import router as roster_router
from app.modules.production.settings_router import router as settings_router
from app.modules.production.skills_router import router as skills_router

router = APIRouter()

_production_access_dependency = [Depends(require_internal_permission("production.access"))]

router.include_router(settings_router, dependencies=_production_access_dependency)
router.include_router(lines_router, dependencies=_production_access_dependency)
router.include_router(crew_router, dependencies=_production_access_dependency)
router.include_router(dashboard_router, dependencies=_production_access_dependency)
router.include_router(quality_router, dependencies=_production_access_dependency)
router.include_router(skills_router, dependencies=_production_access_dependency)
router.include_router(roster_router, dependencies=_production_access_dependency)
router.include_router(ie_router, dependencies=_production_access_dependency)
router.include_router(planning_router, dependencies=_production_access_dependency)
router.include_router(hourly_router, dependencies=_production_access_dependency)
router.include_router(cutting_router, dependencies=_production_access_dependency)
router.include_router(costing_router, dependencies=_production_access_dependency)
router.include_router(knitting_router, dependencies=_production_access_dependency)
router.include_router(dyeing_router, dependencies=_production_access_dependency)
router.include_router(dept_router, dependencies=_production_access_dependency)

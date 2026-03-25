"""Merchandising HTTP routers.

This package composes domain routers first, then includes the legacy router to
preserve all existing endpoints while migration happens incrementally.
"""

from fastapi import APIRouter

from app.modules.merch.router import router as legacy_router
from app.modules.merch.routers.alerts import router as alerts_router
from app.modules.merch.routers.boms import router as boms_router
from app.modules.merch.routers.consumption import router as consumption_router
from app.modules.merch.routers.exports import router as exports_router
from app.modules.merch.routers.pipeline import router as pipeline_router
from app.modules.merch.routers.styles import router as styles_router
from app.modules.merch.routers.tna import router as tna_router
from app.modules.merch.routers.wastage import router as wastage_router

router = APIRouter()
router.include_router(styles_router)
router.include_router(boms_router)
router.include_router(alerts_router)
router.include_router(tna_router)
router.include_router(consumption_router)
router.include_router(wastage_router)
router.include_router(pipeline_router)
router.include_router(exports_router)
router.include_router(legacy_router)

__all__ = ["router"]

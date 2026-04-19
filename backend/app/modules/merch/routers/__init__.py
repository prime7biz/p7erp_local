"""Merchandising HTTP routers (domain modules composed under /api/v1)."""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.merch.routers.alerts import router as alerts_router
from app.modules.merch.routers.boms import router as order_boms_router
from app.modules.merch.routers.classic_boms import router as classic_boms_router
from app.modules.merch.routers.consumption import router as consumption_router
from app.modules.merch.routers.consumption_recon import router as consumption_recon_router
from app.modules.merch.routers.exports import router as exports_router
from app.modules.merch.routers.followups import router as followups_router
from app.modules.merch.routers.merch_control_tower import router as merch_control_tower_router
from app.modules.merch.routers.pipeline import router as merch_pipeline_router
from app.modules.merch.routers.samples import router as samples_router
from app.modules.merch.routers.styles import router as styles_router
from app.modules.merch.routers.tna import router as tna_router
from app.modules.merch.routers.wastage import router as wastage_router

_MERCH = "/merch"

router = APIRouter()
router.include_router(styles_router, prefix=_MERCH)
router.include_router(samples_router, prefix=_MERCH)
router.include_router(order_boms_router)
router.include_router(classic_boms_router, prefix=_MERCH)
router.include_router(alerts_router, prefix=_MERCH)
router.include_router(followups_router, prefix=_MERCH)
router.include_router(tna_router, prefix=_MERCH)
router.include_router(consumption_router, prefix=_MERCH)
router.include_router(wastage_router, prefix=_MERCH)
router.include_router(merch_pipeline_router, prefix=_MERCH)
router.include_router(merch_control_tower_router)
router.include_router(consumption_recon_router, prefix=_MERCH)
router.include_router(exports_router, prefix=_MERCH)

__all__ = ["router"]

from fastapi import APIRouter

from app.modules.manufacturing.costing_hooks_router import router as costing_hooks_router
from app.modules.manufacturing.execution_router import router as execution_router
from app.modules.manufacturing.master_data_router import router as master_data_router
from app.modules.manufacturing.planning_router import router as planning_router
from app.modules.manufacturing.quality_router import router as quality_router
from app.modules.manufacturing.samples_router import router as samples_router
from app.modules.manufacturing.tna_router import router as tna_router

router = APIRouter()

router.include_router(master_data_router)
router.include_router(planning_router)
router.include_router(execution_router)
router.include_router(quality_router)
router.include_router(costing_hooks_router)
router.include_router(samples_router)
router.include_router(tna_router)

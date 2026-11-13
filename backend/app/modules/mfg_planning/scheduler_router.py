"""Phase 5 scheduler write route: convert the current proposal into a PROPOSED plan revision.

POST ``/api/v1/mfg-intelligence/scheduler/convert`` needs ``production.planning.read`` (router) and
``production.planning.write`` (route), the heavy rate limit, a user of the resolved tenant (403 "Tenant mismatch") and
the flags ``manufacturing_intelligence_v1`` + ``mfg_advanced_planning_v1`` + ``mfg_integrated_planning_v1`` (else 404).
201 = new revision, 200 = replay. Approve / reject stay on ``/plan-revisions/{id}/approve`` (four-eyes, lock_version,
frozen fence for scheduler revisions).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import require_internal_permission
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.ai_tool.guardrails import rate_limit_dependency
from app.modules.mfg_intelligence.advanced_planning_schemas import SchedulerConvertIn
from app.modules.mfg_intelligence.flags import require_scheduler_enabled
from app.modules.mfg_intelligence.router import _ensure_tenant_user
from app.modules.mfg_planning.planning_router import _revision_out
from app.modules.mfg_planning.scheduler_convert import convert

router = APIRouter(
    prefix="/mfg-intelligence",
    tags=["mfg-intelligence-scheduler"],
    dependencies=[Depends(require_internal_permission("production.planning.read"))],
)


@router.post(
    "/scheduler/convert",
    dependencies=[Depends(require_internal_permission("production.planning.write")), Depends(rate_limit_dependency("heavy"))],
)
async def scheduler_convert(
    body: SchedulerConvertIn,
    response: Response,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_scheduler_enabled(tenant)
    rev, created, info = await convert(db, tenant=tenant, user=user, body=body)
    if created:
        await db.commit()
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    out = await _revision_out(db, tenant, user, rev, with_items=True)
    out["scheduler"] = info
    return out

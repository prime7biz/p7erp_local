"""Governed finance AI API (PLAN Phase 5). Mounted inside the finance router (prefix /finance, finance.access).

  POST /finance/statements/commentary

Tenant flag `finance_ai_insights_v2` must be exactly true (otherwise 404), and so must the source report's own flag
(`finance_statements_v2`, `finance_budget_analytics_v2` or `finance_control_tower_v2`); soft `finance.mis_report.view`
(explicit false -> 403); fail-closed `ai.tools.finance.read` (missing key -> 403 for non admin / manager roles).
Rate limit: AI "chat" budget per user + tenant (`AI_RATE_LIMIT_CHAT_PER_WINDOW` per `AI_RATE_LIMIT_WINDOW_SECONDS`,
default 30 / 60 s, per API process) -> 429.
Read-only: it never posts, approves or edits anything. A provider failure never causes a 500; the response then
carries the deterministic commentary with `deterministic_fallback: true` and a `reason`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.ai_tool.guardrails import enforce_route_rate_limit
from app.modules.finance.ai_insights.schemas import CommentaryRequest, CommentaryResponse
from app.modules.finance.ai_insights.service import assert_commentary_allowed, build_commentary

router = APIRouter(tags=["finance-ai-insights"])


@router.post("/statements/commentary", response_model=CommentaryResponse)
async def statement_commentary(
    body: CommentaryRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await assert_commentary_allowed(db, tenant, user)
    # Per user + tenant (from the verified login, not request headers): AI "chat" budget, 429 when exceeded.
    await enforce_route_rate_limit(key=f"finance_commentary:{tenant.id}:{user.id}", category="chat")
    try:
        return await build_commentary(db, tenant, user, body)
    except LookupError:
        raise HTTPException(status_code=404, detail="Not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None

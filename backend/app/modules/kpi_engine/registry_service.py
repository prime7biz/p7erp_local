"""KPI definition listing and card assembly."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import MAX_PAGE_SIZE
from app.models import Role, Tenant, User
from app.models.kpi_engine import KpiDefinition
from app.modules.kpi_engine.compute.service import compute_kpi
from app.modules.kpi_engine.security import applicability_for_tenant, can_view_definition


async def list_definitions(
    db: AsyncSession,
    tenant: Tenant,
    *,
    user: User,
    role: Role | None,
    module: str | None = None,
    dashboard: str | None = None,
    limit: int = 200,
) -> list[KpiDefinition]:
    limit = max(1, min(limit, MAX_PAGE_SIZE))
    q = select(KpiDefinition).where(KpiDefinition.tenant_id == tenant.id, KpiDefinition.active.is_(True))
    if module:
        q = q.where(KpiDefinition.module == module)
    rows = list((await db.execute(q.order_by(KpiDefinition.code).limit(limit))).scalars().all())
    allowed_types = applicability_for_tenant(tenant)
    out: list[KpiDefinition] = []
    for row in rows:
        apps = set(row.applicability or [])
        if apps and not (apps & allowed_types):
            continue
        if dashboard and dashboard not in (row.dashboard_codes or []):
            continue
        if not can_view_definition(
            user=user,
            tenant=tenant,
            role=role,
            sensitivity=row.sensitivity,
            dashboard=dashboard,
        ):
            continue
        out.append(row)
    return out


def definition_to_dict(row: KpiDefinition) -> dict[str, Any]:
    return {
        "id": row.id,
        "code": row.code,
        "name": row.name,
        "purpose": row.purpose,
        "module": row.module,
        "metric_type": row.metric_type,
        "tier": row.tier,
        "unit": row.unit,
        "direction": row.direction,
        "sensitivity": row.sensitivity,
        "applicability": row.applicability,
        "dashboard_codes": row.dashboard_codes,
        "adapter_key": row.adapter_key,
        "blocked_reason": row.blocked_reason,
        "definition_version": row.definition_version,
        "active": row.active,
        "owner_role": row.owner_role,
        "refresh_frequency": row.refresh_frequency,
        "formula_expression": row.formula_expression,
        "numerator_definition": row.numerator_definition,
        "denominator_definition": row.denominator_definition,
    }


async def build_cards(
    db: AsyncSession,
    tenant: Tenant,
    *,
    user: User,
    role: Role | None,
    dashboard: str,
    as_of: date | None = None,
) -> list[dict[str, Any]]:
    defs = await list_definitions(
        db, tenant, user=user, role=role, dashboard=dashboard, limit=MAX_PAGE_SIZE
    )
    cards: list[dict[str, Any]] = []
    for d in defs:
        value = await compute_kpi(db, tenant.id, d, as_of=as_of)
        cards.append({"definition": definition_to_dict(d), "value": value.to_dict()})
    return cards


async def get_definition_by_code(db: AsyncSession, tenant_id: int, code: str) -> KpiDefinition | None:
    return (
        await db.execute(
            select(KpiDefinition).where(
                KpiDefinition.tenant_id == tenant_id,
                KpiDefinition.code == code,
                KpiDefinition.active.is_(True),
            )
        )
    ).scalar_one_or_none()

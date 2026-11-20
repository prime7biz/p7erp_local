"""Idempotent KPI definition seed for a tenant."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.kpi_engine import KpiDefinition
from app.modules.kpi_engine.catalog import SEED_DEFINITIONS
from app.modules.kpi_engine.compute_base import utcnow


async def seed_kpi_definitions(db: AsyncSession, tenant_id: int) -> dict[str, int]:
    """Insert missing Tier-1 definitions. Never updates existing rows in place (versioned later)."""
    existing = {
        r.code: r
        for r in (
            await db.execute(select(KpiDefinition).where(KpiDefinition.tenant_id == tenant_id))
        ).scalars().all()
    }
    created = 0
    skipped = 0
    now = utcnow()
    for row in SEED_DEFINITIONS:
        code = row["code"]
        if code in existing:
            skipped += 1
            continue
        db.add(
            KpiDefinition(
                tenant_id=tenant_id,
                code=code,
                name=row["name"],
                purpose=row.get("purpose"),
                module=row["module"],
                metric_type="KPI",
                tier="CORE",
                formula_expression=row.get("formula_expression"),
                unit=row.get("unit", "%"),
                direction=row.get("direction", "UP"),
                leading_lagging=row.get("leading_lagging"),
                default_grain=row.get("default_grain", "tenant-day"),
                refresh_frequency=row.get("refresh_frequency", "D"),
                owner_role=row.get("owner_role"),
                applicability=list(row.get("applicability") or ["F", "A", "B"]),
                sensitivity=row.get("sensitivity", "OPERATIONAL"),
                adapter_key=row.get("adapter_key"),
                dashboard_codes=list(row.get("dashboards") or []),
                active=True,
                definition_version=1,
                blocked_reason=row.get("blocked_reason"),
                created_at=now,
                updated_at=now,
            )
        )
        created += 1
    await db.flush()
    return {"created": created, "skipped": skipped, "total_seed": len(SEED_DEFINITIONS)}

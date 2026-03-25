"""
Seed demo sewing shifts, lines, factory calendar, and optional crew template rows.

Run from backend dir:
  python scripts/seed_production_demo.py
"""

from __future__ import annotations

import asyncio
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.models import (
    FactoryCalendarOverride,
    ProductionShift,
    SewingLine,
    Tenant,
    TenantProductionSettings,
)


async def _get_tenant(db: AsyncSession) -> Tenant:
    first = (await db.execute(select(Tenant).order_by(Tenant.id.asc()))).scalars().first()
    if not first:
        raise RuntimeError("No tenant found.")
    return first


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        tenant = await _get_tenant(db)
        tid = tenant.id

        # Settings: ensure weekend + CM threshold exist
        srow = (
            await db.execute(select(TenantProductionSettings).where(TenantProductionSettings.tenant_id == tid))
        ).scalar_one_or_none()
        if not srow:
            srow = TenantProductionSettings(
                tenant_id=tid,
                enabled_optional_units=[],
                weekend_days=["friday", "saturday"],
                cm_alert_threshold_pct=10,
            )
            db.add(srow)
        else:
            srow.weekend_days = list(srow.weekend_days or ["friday", "saturday"])
            srow.cm_alert_threshold_pct = float(srow.cm_alert_threshold_pct or 10)

        # Shifts
        async def _shift(code: str, name: str, st: str, et: str, brk: int) -> None:
            ex = (
                await db.execute(
                    select(ProductionShift).where(ProductionShift.tenant_id == tid, ProductionShift.shift_code == code)
                )
            ).scalar_one_or_none()
            if ex:
                return
            from datetime import datetime

            def _t(x: str):
                return datetime.strptime(x, "%H:%M").time()

            db.add(
                ProductionShift(
                    tenant_id=tid,
                    shift_code=code,
                    name=name,
                    start_time=_t(st),
                    end_time=_t(et),
                    break_minutes=brk,
                    is_active=True,
                )
            )

        await _shift("MORN", "Morning", "08:00", "17:00", 60)
        await _shift("EVE", "Evening", "17:00", "02:00", 60)

        # Lines L01–L04
        for code, name, ops, hlp in [
            ("L01", "Line 01", 48, 6),
            ("L02", "Line 02", 52, 6),
            ("L03", "Line 03", 45, 5),
            ("L04", "Line 04", 50, 7),
        ]:
            ex = (
                await db.execute(select(SewingLine).where(SewingLine.tenant_id == tid, SewingLine.line_code == code))
            ).scalar_one_or_none()
            if ex:
                continue
            db.add(
                SewingLine(
                    tenant_id=tid,
                    line_code=code,
                    name=name,
                    default_machine_count=60,
                    running_machine_count=60,
                    default_operator_count=ops,
                    default_helper_count=hlp,
                    is_active=True,
                )
            )

        # National holidays (next 12 months from today — idempotent by date)
        today = date.today()
        holidays = [
            (date(today.year, 12, 16), "Victory Day"),
            (date(today.year + 1, 3, 26), "Independence Day"),
        ]
        for od, label in holidays:
            ex = (
                await db.execute(
                    select(FactoryCalendarOverride).where(
                        FactoryCalendarOverride.tenant_id == tid, FactoryCalendarOverride.override_date == od
                    )
                )
            ).scalar_one_or_none()
            if ex:
                continue
            db.add(
                FactoryCalendarOverride(
                    tenant_id=tid,
                    override_date=od,
                    override_type="holiday",
                    name=label,
                    notes="Seeded demo holiday",
                )
            )

        await db.commit()
        print(f"Production demo seed OK for tenant_id={tid}")


if __name__ == "__main__":
    asyncio.run(seed())

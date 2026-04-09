"""Dated snapshots for lender packs."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.facility import Facility, FacilitySnapshot, FacilityUtilization


def scope_key(snapshot_type: str, snapshot_month: str, facility_id: int | None, utilization_id: int | None) -> str:
    return f"{snapshot_type}|{snapshot_month}|f{facility_id or 0}|u{utilization_id or 0}"


async def upsert_month_facility_snapshot(
    db: AsyncSession,
    *,
    tenant_id: int,
    snapshot_month: str,
    snapshot_date: date,
    facility_id: int | None,
    utilization_id: int | None,
    snapshot_type: str,
    data: dict,
    user_id: int | None,
) -> FacilitySnapshot:
    sk = scope_key(snapshot_type, snapshot_month, facility_id, utilization_id)
    r = await db.execute(
        select(FacilitySnapshot).where(
            FacilitySnapshot.tenant_id == tenant_id,
            FacilitySnapshot.snapshot_scope_key == sk,
        )
    )
    row = r.scalar_one_or_none()
    if row:
        row.data_json = data
        row.snapshot_date = snapshot_date
        row.generated_by_user_id = user_id
        await db.flush()
        return row
    row = FacilitySnapshot(
        tenant_id=tenant_id,
        facility_id=facility_id,
        facility_utilization_id=utilization_id,
        snapshot_type=snapshot_type,
        snapshot_date=snapshot_date,
        snapshot_month=snapshot_month,
        snapshot_scope_key=sk,
        data_json=data,
        generated_by_user_id=user_id,
    )
    db.add(row)
    await db.flush()
    return row


async def build_facility_snapshot_payload(
    db: AsyncSession, *, tenant_id: int, facility_id: int
) -> dict:
    fac = await db.get(Facility, facility_id)
    if not fac or fac.tenant_id != tenant_id:
        return {}
    utils = list(
        (
            await db.execute(
                select(FacilityUtilization).where(FacilityUtilization.facility_id == facility_id)
            )
        ).scalars().all()
    )
    return {
        "facility_code": fac.facility_code,
        "sanctioned": float(fac.sanctioned_amount or 0),
        "utilized": float(fac.utilized_amount or 0),
        "utilizations": [
            {
                "code": u.utilization_code,
                "outstanding": float(u.outstanding_principal or 0),
                "status": u.status,
            }
            for u in utils
        ],
    }

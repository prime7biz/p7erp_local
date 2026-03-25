"""Tenant production settings, shifts, factory calendar."""
from __future__ import annotations

from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    AttendanceHoliday,
    FactoryCalendarOverride,
    ProductionShift,
    Tenant,
    TenantProductionSettings,
    User,
)
from app.modules.production.holiday_import_service import (
    filter_holidays_by_dates,
    get_country_holidays_for_year,
)
from app.modules.production.schemas import (
    CountryHolidayPreviewItem,
    CountryHolidaysPreviewResponse,
    FactoryCalendarImportHolidaysRequest,
    FactoryCalendarImportHolidaysResponse,
    FactoryCalendarOverrideCreate,
    FactoryCalendarOverrideResponse,
    ProductionShiftCreate,
    ProductionShiftResponse,
    ProductionShiftUpdate,
    TenantProductionSettingsResponse,
    TenantProductionSettingsUpdate,
)

router = APIRouter(prefix="/production", tags=["production-settings"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _parse_t(s: str) -> time:
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(s.strip(), fmt).time()
        except ValueError:
            continue
    raise HTTPException(status_code=400, detail="Invalid time format")


def _t_str(t: time) -> str:
    return t.strftime("%H:%M:%S")


async def _get_or_create_settings(db: AsyncSession, tenant_id: int) -> TenantProductionSettings:
    r = await db.execute(select(TenantProductionSettings).where(TenantProductionSettings.tenant_id == tenant_id))
    row = r.scalar_one_or_none()
    if row:
        return row
    row = TenantProductionSettings(
        tenant_id=tenant_id,
        enabled_optional_units=[],
        weekend_days=["friday", "saturday"],
        cm_alert_threshold_pct=10,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


HR_FACTORY_SYNC_NOTE = "Synced from factory calendar"


async def _apply_hr_holiday_sync(
    db: AsyncSession,
    *,
    tenant_id: int,
    holiday_date: date,
    name: str | None,
    affects_hr: bool,
    prev_affects_hr: bool,
) -> None:
    """Upsert or remove HR attendance holiday when factory calendar requests sync."""
    if affects_hr:
        r = await db.execute(
            select(AttendanceHoliday).where(
                AttendanceHoliday.tenant_id == tenant_id,
                AttendanceHoliday.holiday_date == holiday_date,
            )
        )
        hr = r.scalar_one_or_none()
        display_name = (name or "Holiday").strip() or "Holiday"
        if hr:
            hr.name = display_name
            hr.note = HR_FACTORY_SYNC_NOTE
            hr.is_optional = False
        else:
            db.add(
                AttendanceHoliday(
                    tenant_id=tenant_id,
                    holiday_date=holiday_date,
                    name=display_name,
                    is_optional=False,
                    note=HR_FACTORY_SYNC_NOTE,
                )
            )
    elif prev_affects_hr:
        r = await db.execute(
            select(AttendanceHoliday).where(
                AttendanceHoliday.tenant_id == tenant_id,
                AttendanceHoliday.holiday_date == holiday_date,
            )
        )
        hr = r.scalar_one_or_none()
        if hr and "factory calendar" in (hr.note or "").lower():
            await db.delete(hr)


async def _remove_hr_if_factory_synced(
    db: AsyncSession,
    *,
    tenant_id: int,
    holiday_date: date,
    had_affects_hr: bool,
) -> None:
    if not had_affects_hr:
        return
    r = await db.execute(
        select(AttendanceHoliday).where(
            AttendanceHoliday.tenant_id == tenant_id,
            AttendanceHoliday.holiday_date == holiday_date,
        )
    )
    hr = r.scalar_one_or_none()
    if hr and "factory calendar" in (hr.note or "").lower():
        await db.delete(hr)


@router.get("/settings", response_model=TenantProductionSettingsResponse)
async def get_production_settings(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    s = await _get_or_create_settings(db, tenant.id)
    return TenantProductionSettingsResponse(
        tenant_id=tenant.id,
        enabled_optional_units=list(s.enabled_optional_units or []),
        weekend_days=list(s.weekend_days or []),
        cm_alert_threshold_pct=float(s.cm_alert_threshold_pct or 10),
        ai_provider_config=s.ai_provider_config if isinstance(s.ai_provider_config, dict) else None,
    )


@router.put("/settings", response_model=TenantProductionSettingsResponse)
async def update_production_settings(
    body: TenantProductionSettingsUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    s = await _get_or_create_settings(db, tenant.id)
    if body.enabled_optional_units is not None:
        s.enabled_optional_units = body.enabled_optional_units
    if body.weekend_days is not None:
        s.weekend_days = body.weekend_days
    if body.cm_alert_threshold_pct is not None:
        s.cm_alert_threshold_pct = body.cm_alert_threshold_pct
    if body.ai_provider_config is not None:
        s.ai_provider_config = body.ai_provider_config
    await db.commit()
    await db.refresh(s)
    return TenantProductionSettingsResponse(
        tenant_id=tenant.id,
        enabled_optional_units=list(s.enabled_optional_units or []),
        weekend_days=list(s.weekend_days or []),
        cm_alert_threshold_pct=float(s.cm_alert_threshold_pct or 10),
        ai_provider_config=s.ai_provider_config if isinstance(s.ai_provider_config, dict) else None,
    )


@router.get("/shifts", response_model=list[ProductionShiftResponse])
async def list_shifts(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    r = await db.execute(
        select(ProductionShift).where(ProductionShift.tenant_id == tenant.id).order_by(ProductionShift.shift_code)
    )
    rows = list(r.scalars().all())
    return [
        ProductionShiftResponse(
            id=x.id,
            tenant_id=x.tenant_id,
            shift_code=x.shift_code,
            name=x.name,
            start_time=_t_str(x.start_time),
            end_time=_t_str(x.end_time),
            break_minutes=x.break_minutes,
            is_active=x.is_active,
        )
        for x in rows
    ]


@router.post("/shifts", response_model=ProductionShiftResponse)
async def create_shift(
    body: ProductionShiftCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = ProductionShift(
        tenant_id=tenant.id,
        shift_code=body.shift_code,
        name=body.name,
        start_time=_parse_t(body.start_time),
        end_time=_parse_t(body.end_time),
        break_minutes=body.break_minutes,
        is_active=body.is_active,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ProductionShiftResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        shift_code=row.shift_code,
        name=row.name,
        start_time=_t_str(row.start_time),
        end_time=_t_str(row.end_time),
        break_minutes=row.break_minutes,
        is_active=row.is_active,
    )


@router.patch("/shifts/{shift_id}", response_model=ProductionShiftResponse)
async def update_shift(
    shift_id: int,
    body: ProductionShiftUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await db.get(ProductionShift, shift_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(404, "Shift not found")
    if body.shift_code is not None:
        row.shift_code = body.shift_code
    if body.name is not None:
        row.name = body.name
    if body.start_time is not None:
        row.start_time = _parse_t(body.start_time)
    if body.end_time is not None:
        row.end_time = _parse_t(body.end_time)
    if body.break_minutes is not None:
        row.break_minutes = body.break_minutes
    if body.is_active is not None:
        row.is_active = body.is_active
    await db.commit()
    await db.refresh(row)
    return ProductionShiftResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        shift_code=row.shift_code,
        name=row.name,
        start_time=_t_str(row.start_time),
        end_time=_t_str(row.end_time),
        break_minutes=row.break_minutes,
        is_active=row.is_active,
    )


@router.delete("/shifts/{shift_id}", status_code=204)
async def delete_shift(
    shift_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await db.get(ProductionShift, shift_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(404, "Shift not found")
    await db.delete(row)
    await db.commit()


@router.get("/calendar", response_model=list[FactoryCalendarOverrideResponse])
async def list_calendar(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
):
    _ensure(user, tenant)
    q = select(FactoryCalendarOverride).where(FactoryCalendarOverride.tenant_id == tenant.id)
    if from_date:
        q = q.where(FactoryCalendarOverride.override_date >= from_date)
    if to_date:
        q = q.where(FactoryCalendarOverride.override_date <= to_date)
    q = q.order_by(FactoryCalendarOverride.override_date)
    r = await db.execute(q)
    rows = list(r.scalars().all())
    return [
        FactoryCalendarOverrideResponse(
            id=x.id,
            override_date=x.override_date.isoformat(),
            override_type=x.override_type,
            name=x.name,
            notes=x.notes,
            category=x.category,
            source=x.source,
            is_paid=bool(x.is_paid),
            affects_hr=bool(x.affects_hr),
        )
        for x in rows
    ]


@router.get("/calendar/country-holidays", response_model=CountryHolidaysPreviewResponse)
async def preview_country_holidays(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    year: int = Query(..., ge=2000, le=2100),
):
    _ensure(user, tenant)
    t = await db.get(Tenant, tenant.id)
    cc = (t.country_code or "").strip().upper() if t else ""
    if not cc:
        raise HTTPException(status_code=400, detail="Set country code in Tenant Settings to import public holidays.")
    raw = get_country_holidays_for_year(cc, year)
    items = [
        CountryHolidayPreviewItem(
            date=x["date"],
            name=x["name"],
            category=x.get("category") or "government",
            garment_recommendation=x.get("garment_recommendation"),
        )
        for x in raw
    ]
    return CountryHolidaysPreviewResponse(country_code=cc, year=year, items=items)


@router.post("/calendar/import-holidays", response_model=FactoryCalendarImportHolidaysResponse)
async def import_country_holidays(
    body: FactoryCalendarImportHolidaysRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    t = await db.get(Tenant, tenant.id)
    cc = (t.country_code or "").strip().upper() if t else ""
    if not cc:
        raise HTTPException(status_code=400, detail="Set country code in Tenant Settings to import public holidays.")
    all_items = get_country_holidays_for_year(cc, body.year)
    to_import = filter_holidays_by_dates(all_items, body.selected_dates)
    if not to_import:
        to_import = all_items

    imported = 0
    skipped = 0
    for item in to_import:
        od = date.fromisoformat(item["date"])
        r = await db.execute(
            select(FactoryCalendarOverride).where(
                FactoryCalendarOverride.tenant_id == tenant.id,
                FactoryCalendarOverride.override_date == od,
            )
        )
        existing = r.scalar_one_or_none()
        if existing:
            skipped += 1
            continue
        row = FactoryCalendarOverride(
            tenant_id=tenant.id,
            override_date=od,
            override_type="holiday",
            name=item.get("name"),
            notes=None,
            category="government",
            source="auto_import",
            is_paid=True,
            affects_hr=False,
        )
        db.add(row)
        imported += 1
    await db.commit()
    return FactoryCalendarImportHolidaysResponse(imported_count=imported, skipped_count=skipped)


@router.post("/calendar", response_model=FactoryCalendarOverrideResponse)
async def upsert_calendar(
    body: FactoryCalendarOverrideCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    od = date.fromisoformat(body.override_date)
    r = await db.execute(
        select(FactoryCalendarOverride).where(
            FactoryCalendarOverride.tenant_id == tenant.id,
            FactoryCalendarOverride.override_date == od,
        )
    )
    row = r.scalar_one_or_none()
    prev_hr = bool(row.affects_hr) if row else False
    if row:
        row.override_type = body.override_type
        row.name = body.name
        row.notes = body.notes
        row.category = body.category
        row.source = body.source
        row.is_paid = body.is_paid
        row.affects_hr = body.affects_hr
    else:
        row = FactoryCalendarOverride(
            tenant_id=tenant.id,
            override_date=od,
            override_type=body.override_type,
            name=body.name,
            notes=body.notes,
            category=body.category,
            source=body.source or "manual",
            is_paid=body.is_paid,
            affects_hr=body.affects_hr,
        )
        db.add(row)
    await db.flush()
    await _apply_hr_holiday_sync(
        db,
        tenant_id=tenant.id,
        holiday_date=od,
        name=row.name,
        affects_hr=bool(row.affects_hr),
        prev_affects_hr=prev_hr,
    )
    await db.commit()
    await db.refresh(row)
    return FactoryCalendarOverrideResponse(
        id=row.id,
        override_date=row.override_date.isoformat(),
        override_type=row.override_type,
        name=row.name,
        notes=row.notes,
        category=row.category,
        source=row.source,
        is_paid=bool(row.is_paid),
        affects_hr=bool(row.affects_hr),
    )


@router.delete("/calendar/{override_id}", status_code=204)
async def delete_calendar(
    override_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await db.get(FactoryCalendarOverride, override_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(404, "Not found")
    od = row.override_date
    had_hr = bool(row.affects_hr)
    await db.delete(row)
    await _remove_hr_if_factory_synced(db, tenant_id=tenant.id, holiday_date=od, had_affects_hr=had_hr)
    await db.commit()

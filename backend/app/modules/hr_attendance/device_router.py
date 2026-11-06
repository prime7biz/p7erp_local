"""Attendance device endpoints.

``router`` (staff JWT, mounted with the HR module permission):
    GET    /hr/attendance/devices                         list devices (key prefix only)
    POST   /hr/attendance/devices                         create; returns the API key ONCE
    PATCH  /hr/attendance/devices/{id}                    edit / activate / deactivate
    POST   /hr/attendance/devices/{id}/rotate-key         new API key (old one stops working)
    POST   /hr/attendance/devices/{id}/punches/import     file upload (CSV / ZKTeco / JSON) or JSON body

``push_router`` (no staff login — the device sends its key in the ``X-Device-Key`` header):
    POST   /hr/attendance/device-push                     JSON punches, or ZKTeco ATTLOG text
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import business_timezone
from app.common.ownership import ensure_owned
from app.common.permissions import PERMISSION_HR_ATTENDANCE_MANAGE, assert_hr_manager_or_permission
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import AttendanceDevice, AttendanceShift, Tenant, User
from app.modules.audit.service import log_action
from app.modules.hr_attendance.device_adapters import (
    TooManyPunchesError,
    detect_format,
    parse_punches,
)
from app.modules.hr_attendance.device_schemas import (
    DEVICE_TYPES,
    AttendanceDeviceCreate,
    AttendanceDeviceOut,
    AttendanceDeviceUpdate,
    AttendanceDeviceWithKeyOut,
    PunchImportSummaryOut,
)
from app.modules.hr_attendance.device_service import (
    PUNCH_SOURCE_IMPORT,
    PUNCH_SOURCE_PUSH,
    authenticate_device,
    generate_api_key,
    process_punches,
)

router = APIRouter(prefix="/hr/attendance", tags=["hr-attendance-devices"])
push_router = APIRouter(prefix="/hr/attendance", tags=["hr-attendance-device-push"])

MAX_PAYLOAD_BYTES = 2 * 1024 * 1024


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _device_out(row: AttendanceDevice) -> AttendanceDeviceOut:
    return AttendanceDeviceOut(
        id=row.id,
        tenant_id=row.tenant_id,
        code=row.code,
        name=row.name,
        device_type=row.device_type,
        serial_number=row.serial_number,
        api_key_prefix=row.api_key_prefix,
        default_shift_id=row.default_shift_id,
        is_active=row.is_active,
        last_seen_at=row.last_seen_at.isoformat() if row.last_seen_at else None,
        created_by=row.created_by,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _with_key(row: AttendanceDevice, api_key: str) -> AttendanceDeviceWithKeyOut:
    return AttendanceDeviceWithKeyOut(**_device_out(row).model_dump(), api_key=api_key)


def _clean_device_type(value: str) -> str:
    device_type = value.strip().upper()
    if device_type not in DEVICE_TYPES:
        raise HTTPException(status_code=400, detail=f"device_type must be one of: {', '.join(DEVICE_TYPES)}")
    return device_type


async def _require_manage(db: AsyncSession, user: User, tenant: Tenant) -> None:
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_ATTENDANCE_MANAGE)


async def _device_or_404(db: AsyncSession, tenant_id: int, device_id: int) -> AttendanceDevice:
    row = await db.get(AttendanceDevice, device_id)
    if row is None or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Attendance device not found")
    return row


async def _read_body_capped(request: Request) -> bytes:
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_PAYLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Punch data is larger than 2 MB; split it and import again")
        chunks.append(chunk)
    return b"".join(chunks)


def _decode(raw: bytes) -> str:
    return raw.decode("utf-8-sig", errors="replace")


async def _read_punch_payload(request: Request, fmt: str | None) -> tuple[str, Any]:
    """(format, payload) from a multipart file upload, a JSON body or plain text."""
    content_type = (request.headers.get("content-type") or "").lower()
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        if upload is None or not hasattr(upload, "read"):
            raise HTTPException(status_code=400, detail="Attach the punch file in the 'file' field")
        raw = await upload.read(MAX_PAYLOAD_BYTES + 1)
        if len(raw) > MAX_PAYLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Punch file is larger than 2 MB; split it and import again")
        text = _decode(raw)
        form_format = form.get("format")
        chosen = fmt or (form_format if isinstance(form_format, str) and form_format.strip() else None)
        return chosen or detect_format(
            filename=getattr(upload, "filename", None), content_type=getattr(upload, "content_type", None), text=text
        ), text
    raw = await _read_body_capped(request)
    if "json" in content_type:
        try:
            data = json.loads(raw or b"null")
        except ValueError:
            raise HTTPException(status_code=400, detail="Body is not valid JSON") from None
        if isinstance(data, dict) and isinstance(data.get("text"), str):
            text = data["text"]
            chosen = fmt or (data.get("format") if isinstance(data.get("format"), str) else None)
            return chosen or detect_format(filename=None, content_type=None, text=text), text
        if isinstance(data, dict) and isinstance(data.get("format"), str) and not fmt:
            fmt = data["format"]
        return fmt or "json", data
    text = _decode(raw)
    return fmt or detect_format(filename=None, content_type=content_type, text=text), text


def _parse_or_400(fmt: str, payload: Any, tenant: Tenant | None):
    try:
        return parse_punches(fmt, payload, business_timezone(tenant))
    except TooManyPunchesError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


async def _process_and_commit(
    db: AsyncSession,
    *,
    tenant_id: int,
    device: AttendanceDevice,
    parsed,
    source: str,
    user_id: int | None,
) -> dict[str, Any]:
    try:
        summary = await process_punches(
            db, tenant_id=tenant_id, device=device, parsed=parsed, source=source, user_id=user_id
        )
        if source == PUNCH_SOURCE_IMPORT:
            await log_action(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                action="ATTENDANCE_PUNCHES_IMPORTED",
                resource="hr.attendance.device",
                details=(
                    f"device:{device.id} received:{summary.received} inserted:{summary.inserted} "
                    f"created:{summary.entries_created} updated:{summary.entries_updated}"
                ),
            )
        await db.commit()
    except SQLAlchemyError as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=500, detail="Saving punches failed; nothing was saved") from exc
    return summary.as_dict()


# --- Device setup (HR managers) -----------------------------------------------------------------


@router.get("/devices", response_model=list[AttendanceDeviceOut])
async def list_devices(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_manage(db, user, tenant)
    rows = (
        await db.execute(
            select(AttendanceDevice).where(AttendanceDevice.tenant_id == tenant.id).order_by(AttendanceDevice.code)
        )
    ).scalars().all()
    return [_device_out(r) for r in rows]


@router.post("/devices", response_model=AttendanceDeviceWithKeyOut, status_code=status.HTTP_201_CREATED)
async def create_device(
    body: AttendanceDeviceCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_manage(db, user, tenant)
    await ensure_owned(db, AttendanceShift, body.default_shift_id, tenant.id, "Shift")
    api_key, prefix, key_hash = generate_api_key()
    row = AttendanceDevice(
        tenant_id=tenant.id,
        code=body.code.strip(),
        name=body.name.strip(),
        device_type=_clean_device_type(body.device_type),
        serial_number=(body.serial_number or "").strip() or None,
        api_key_hash=key_hash,
        api_key_prefix=prefix,
        default_shift_id=body.default_shift_id,
        is_active=True,
        created_by=user.id,
    )
    db.add(row)
    try:
        await db.flush()
        await log_action(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            action="ATTENDANCE_DEVICE_CREATED",
            resource="hr.attendance.device",
            details=f"device:{row.id} code:{row.code}",
        )
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Device code already exists") from None
    await db.refresh(row)
    return _with_key(row, api_key)


@router.patch("/devices/{device_id}", response_model=AttendanceDeviceOut)
async def update_device(
    device_id: int,
    body: AttendanceDeviceUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_manage(db, user, tenant)
    row = await _device_or_404(db, tenant.id, device_id)
    payload = body.model_dump(exclude_unset=True)
    for required_field in ("code", "name", "device_type", "is_active"):
        if required_field in payload and payload[required_field] is None:
            payload.pop(required_field)
    if "default_shift_id" in payload:
        await ensure_owned(db, AttendanceShift, payload["default_shift_id"], tenant.id, "Shift")
    if payload.get("device_type") is not None:
        payload["device_type"] = _clean_device_type(payload["device_type"])
    for key in ("code", "name"):
        if payload.get(key) is not None:
            payload[key] = payload[key].strip()
    if "serial_number" in payload:
        payload["serial_number"] = (payload["serial_number"] or "").strip() or None
    changes = {k: (getattr(row, k), v) for k, v in payload.items() if getattr(row, k) != v}
    for key, (_old, value) in changes.items():
        setattr(row, key, value)
    try:
        if changes:
            await log_action(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                action="ATTENDANCE_DEVICE_UPDATED",
                resource="hr.attendance.device",
                details=f"device:{row.id} " + "; ".join(f"{k}: {a} -> {b}" for k, (a, b) in changes.items()),
            )
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Device code already exists") from None
    await db.refresh(row)
    return _device_out(row)


@router.post("/devices/{device_id}/rotate-key", response_model=AttendanceDeviceWithKeyOut)
async def rotate_device_key(
    device_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_manage(db, user, tenant)
    row = await _device_or_404(db, tenant.id, device_id)
    api_key, prefix, key_hash = generate_api_key()
    row.api_key_prefix = prefix
    row.api_key_hash = key_hash
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="ATTENDANCE_DEVICE_KEY_ROTATED",
        resource="hr.attendance.device",
        details=f"device:{row.id} code:{row.code}",
    )
    await db.commit()
    await db.refresh(row)
    return _with_key(row, api_key)


@router.post("/devices/{device_id}/punches/import", response_model=PunchImportSummaryOut)
async def import_device_punches(
    device_id: int,
    request: Request,
    format: str | None = Query(default=None, description="csv | json | zkteco (guessed when empty)"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a device file (multipart field ``file``) or send JSON ``{"punches": [...]}`` / ``{"text": "..."}``."""
    await _require_manage(db, user, tenant)
    device = await _device_or_404(db, tenant.id, device_id)
    fmt, payload = await _read_punch_payload(request, format)
    parsed = _parse_or_400(fmt, payload, tenant)
    return await _process_and_commit(
        db, tenant_id=tenant.id, device=device, parsed=parsed, source=PUNCH_SOURCE_IMPORT, user_id=user.id
    )


# --- Device push (API key, no staff login) ------------------------------------------------------


@push_router.post("/device-push", response_model=PunchImportSummaryOut)
async def device_push(
    request: Request,
    format: str | None = Query(default=None, description="csv | json | zkteco (guessed when empty)"),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_db),
):
    """A device (or a small bridge program next to it) sends punches with its own API key.

    The company comes from the device record, never from the request, so a key can only add
    punches for its own company's employees.
    """
    device = await authenticate_device(db, x_device_key)
    tenant = await db.get(Tenant, device.tenant_id) if device is not None else None
    if device is None or tenant is None or not tenant.is_active or tenant.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or inactive device key")
    fmt, payload = await _read_punch_payload(request, format)
    parsed = _parse_or_400(fmt, payload, tenant)
    return await _process_and_commit(
        db, tenant_id=tenant.id, device=device, parsed=parsed, source=PUNCH_SOURCE_PUSH, user_id=None
    )

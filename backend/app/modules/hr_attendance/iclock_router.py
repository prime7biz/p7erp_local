"""ZKTeco "cloud push" (ADMS / iclock protocol) endpoints for attendance machines.

ZKTeco machines with a "Cloud Server" / ADMS setting call fixed paths on the server and cannot
send an API key header, so they are recognised by their serial number (``?SN=``) **plus** the IP
address they connect from (the device's "Allowed IPs" list in P7):

    GET  /iclock/cdata?SN=...&options=all     handshake -> push options (text)
    POST /iclock/cdata?SN=...&table=ATTLOG    punches: "PIN<TAB>YYYY-MM-DD HH:MM:SS<TAB>status..."
    POST /iclock/cdata?SN=...&table=OPERLOG   other tables are accepted and ignored ("OK")
    GET  /iclock/getrequest?SN=...            command poll / heartbeat -> "OK" (no commands)
    POST /iclock/devicecmd?SN=...             command results -> "OK"
(``.aspx`` variants of the same paths are accepted too.)

A device takes part only when it is active and has BOTH a serial number and allowed IPs; every
other request gets 401. Its company comes from the device row, never from the request. Punches
go through the same code as the X-Device-Key push (``device_service.process_punches``), so the
device PIN maps to ``attendance_device_pin`` first, then to the employee code.

Limits: ``ATTENDANCE_ICLOCK_RATE_LIMIT_PER_IP_PER_MINUTE`` and ``..._PER_DEVICE_PER_MINUTE``
(Redis, falls back to a per-process counter). ``ATTENDANCE_ICLOCK_ENABLED=false`` turns it all off.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.client_ip import client_ip_from_request
from app.common.redis_client import get_redis
from app.common.rls import bind_session_bypass
from app.config import get_settings
from app.database import get_db, rls_request_scope, safe_async_session_rollback
from app.models import AttendanceDevice, Tenant
from app.modules.hr_attendance.device_router import (
    _decode,
    _parse_or_400,
    _process_and_commit,
    _read_body_capped,
    pin_device_tenant,
)
from app.modules.hr_attendance.device_service import PUNCH_SOURCE_PUSH, ip_is_allowed, normalize_serial

log = logging.getLogger(__name__)

router = APIRouter(prefix="/iclock", tags=["hr-attendance-iclock"])

_STAMP_RE = re.compile(r"^[0-9A-Za-z_.-]{1,32}$")
_MEMORY_HITS: dict[str, tuple[int, int]] = {}
_MEMORY_MAX_KEYS = 10_000


def _ok(body: str = "OK") -> PlainTextResponse:
    return PlainTextResponse(body)


async def _over_limit(key: str, limit: int) -> bool:
    """Fixed one-minute window counter: Redis when available, otherwise this process only."""
    if limit <= 0:
        return False
    window = int(time.time()) // 60
    redis = get_redis()
    if redis is not None:
        try:
            redis_key = f"rl:iclock:{key}:{window}"
            hits = await redis.incr(redis_key)
            if hits == 1:
                await redis.expire(redis_key, 120)
            return hits > limit
        except Exception:
            pass
    seen_window, hits = _MEMORY_HITS.get(key, (window, 0))
    hits = hits + 1 if seen_window == window else 1
    if len(_MEMORY_HITS) >= _MEMORY_MAX_KEYS:
        for stale in [k for k, (w, _n) in _MEMORY_HITS.items() if w != window]:
            _MEMORY_HITS.pop(stale, None)
        if len(_MEMORY_HITS) >= _MEMORY_MAX_KEYS:
            _MEMORY_HITS.clear()
    _MEMORY_HITS[key] = (window, hits)
    return hits > limit


async def _authenticate(db: AsyncSession, request: Request, sn: str | None) -> tuple[AttendanceDevice, Tenant]:
    settings = get_settings()
    if not settings.attendance_iclock_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    client_ip = client_ip_from_request(request)
    serial = normalize_serial(sn)
    if await _over_limit(f"ip:{client_ip}", int(settings.attendance_iclock_rate_limit_per_ip_per_minute or 0)):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")
    if serial is None or len(serial) > 64:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown device")
    if await _over_limit(f"sn:{serial}", int(settings.attendance_iclock_rate_limit_per_device_per_minute or 0)):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")

    # No company is known yet: look the serial up across companies (RLS bypass), then pin.
    await bind_session_bypass(db)
    candidates = (
        await db.execute(
            select(AttendanceDevice).where(
                AttendanceDevice.serial_number == serial,
                AttendanceDevice.is_active.is_(True),
                AttendanceDevice.push_allowed_ips.isnot(None),
            )
        )
    ).scalars().all()
    matches = [d for d in candidates if ip_is_allowed(d.push_allowed_ips, client_ip)]
    if len(matches) != 1:
        if candidates:
            log.warning(
                "iclock_device_rejected serial=%s ip=%s candidates=%s matches=%s",
                serial,
                client_ip,
                len(candidates),
                len(matches),
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown device")
    device = matches[0]
    tenant = await pin_device_tenant(db, device)
    return device, tenant


def _handshake_text(serial: str, device: AttendanceDevice) -> str:
    lines = [
        f"GET OPTION FROM: {serial}",
        f"ATTLOGStamp={device.iclock_attlog_stamp or 'None'}",
        # 9999 = "already have them": the machine skips operation logs and photos.
        "OPERLOGStamp=9999",
        "ATTPHOTOStamp=9999",
        "ErrorDelay=60",
        "Delay=30",
        "TransTimes=00:00;14:05",
        "TransInterval=1",
        "TransFlag=TransData AttLog",
        "Realtime=1",
        "Encrypt=None",
    ]
    return "\n".join(lines) + "\n"


async def _touch(db: AsyncSession, device: AttendanceDevice) -> None:
    """Record that the machine checked in (best effort; a failure must not fail the reply)."""
    device.last_seen_at = datetime.utcnow()
    try:
        await db.commit()
    except SQLAlchemyError:
        await safe_async_session_rollback(db)


@router.get("/cdata", response_class=PlainTextResponse)
@router.get("/cdata.aspx", response_class=PlainTextResponse, include_in_schema=False)
async def iclock_handshake(
    request: Request,
    sn: str | None = Query(default=None, alias="SN"),
    db: AsyncSession = Depends(get_db),
    _rls_scope: None = Depends(rls_request_scope),
):
    device, _tenant = await _authenticate(db, request, sn)
    text = _handshake_text(device.serial_number or "", device)
    await _touch(db, device)
    return _ok(text)


@router.post("/cdata", response_class=PlainTextResponse)
@router.post("/cdata.aspx", response_class=PlainTextResponse, include_in_schema=False)
async def iclock_upload(
    request: Request,
    sn: str | None = Query(default=None, alias="SN"),
    table: str | None = Query(default=None),
    stamp: str | None = Query(default=None, alias="Stamp"),
    db: AsyncSession = Depends(get_db),
    _rls_scope: None = Depends(rls_request_scope),
):
    device, tenant = await _authenticate(db, request, sn)
    raw = await _read_body_capped(request)
    if (table or "").strip().upper() != "ATTLOG":
        await _touch(db, device)
        return _ok()
    parsed = _parse_or_400("zkteco", _decode(raw), tenant)
    clean_stamp = (stamp or "").strip()
    if _STAMP_RE.match(clean_stamp):
        device.iclock_attlog_stamp = clean_stamp
    summary = await _process_and_commit(
        db, tenant_id=tenant.id, device=device, parsed=parsed, source=PUNCH_SOURCE_PUSH, user_id=None
    )
    return _ok(f"OK: {summary['received']}")


@router.get("/getrequest", response_class=PlainTextResponse)
@router.get("/getrequest.aspx", response_class=PlainTextResponse, include_in_schema=False)
async def iclock_poll(
    request: Request,
    sn: str | None = Query(default=None, alias="SN"),
    db: AsyncSession = Depends(get_db),
    _rls_scope: None = Depends(rls_request_scope),
):
    device, _tenant = await _authenticate(db, request, sn)
    await _touch(db, device)
    return _ok()


@router.post("/devicecmd", response_class=PlainTextResponse)
@router.post("/devicecmd.aspx", response_class=PlainTextResponse, include_in_schema=False)
async def iclock_command_result(
    request: Request,
    sn: str | None = Query(default=None, alias="SN"),
    db: AsyncSession = Depends(get_db),
    _rls_scope: None = Depends(rls_request_scope),
):
    await _authenticate(db, request, sn)
    await _read_body_capped(request)
    return _ok()

"""Signature blocks for printed documents (who prepared / approved / posted, with signature image).

Each block is a plain dict so print endpoints can add it to their JSON response:
    {
        "role_label": "Approved By",
        "user_id": 7 | None,
        "name": "Rahim Uddin" | None,
        "designation": "Finance Manager" | None,
        "signed_at": "2026-11-05T10:15:00" | None,
        "signature_image_data_uri": "data:image/png;base64,..." | None,
    }

A block with user_id None is an unsigned stage; the print sheet shows a blank line for it.
Images are embedded as data URIs because the files API needs a bearer token, which a
printed <img> tag cannot send.
"""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.storage import FileStorageService
from app.config import get_settings
from app.models.user import User

logger = logging.getLogger(__name__)

SIGNATURE_MODULE = "user_signatures"

_EXT_TO_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


@dataclass(frozen=True)
class SignatoryEntry:
    role_label: str
    user_id: int | None
    signed_at: datetime | str | None = None


def signature_image_url(filename: str | None) -> str | None:
    if not filename:
        return None
    api_prefix = get_settings().api_v1_prefix.rstrip("/")
    return f"{api_prefix}/files/{SIGNATURE_MODULE}/{filename}"


def user_display_name(user: User) -> str:
    full = " ".join(p for p in (user.first_name or "", user.last_name or "") if p).strip()
    return full or user.username or user.email


def _iso(value: datetime | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def signature_image_data_uri(tenant_id: int, filename: str | None) -> str | None:
    """Read a stored signature image and return it as a data URI (None if missing/unreadable)."""
    if not filename:
        return None
    try:
        path = FileStorageService.resolve_path(tenant_id, SIGNATURE_MODULE, filename)
        if path is None:
            return None
        mime = _EXT_TO_MIME.get(path.suffix.lower())
        if not mime:
            return None
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    except Exception:
        logger.exception("signature_image_read_failed tenant=%s file=%s", tenant_id, filename)
        return None
    return f"data:{mime};base64,{encoded}"


async def build_signatories(
    db: AsyncSession,
    tenant_id: int,
    entries: list[SignatoryEntry],
) -> list[dict[str, Any]]:
    """Resolve each entry's user to name / designation / signature image (tenant-scoped)."""
    user_ids = {e.user_id for e in entries if e.user_id is not None}
    users_by_id: dict[int, User] = {}
    if user_ids:
        rows = (
            await db.execute(select(User).where(User.tenant_id == tenant_id, User.id.in_(user_ids)))
        ).scalars().all()
        users_by_id = {u.id: u for u in rows}

    image_cache: dict[int, str | None] = {}
    out: list[dict[str, Any]] = []
    for entry in entries:
        signer = users_by_id.get(entry.user_id) if entry.user_id is not None else None
        if signer is None:
            out.append(
                {
                    "role_label": entry.role_label,
                    "user_id": None,
                    "name": None,
                    "designation": None,
                    "signed_at": None,
                    "signature_image_data_uri": None,
                }
            )
            continue
        if signer.id not in image_cache:
            image_cache[signer.id] = signature_image_data_uri(tenant_id, signer.signature_image_name)
        out.append(
            {
                "role_label": entry.role_label,
                "user_id": signer.id,
                "name": user_display_name(signer),
                "designation": signer.designation,
                "signed_at": _iso(entry.signed_at),
                "signature_image_data_uri": image_cache[signer.id],
            }
        )
    return out

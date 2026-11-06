"""Self-service "My Signature": designation + signature image printed on approved documents."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.signatories import SIGNATURE_MODULE, signature_image_url, user_display_name
from app.common.storage import FileStorageService
from app.database import get_db, safe_async_session_rollback
from app.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/me", tags=["profile"])


class MySignatureOut(BaseModel):
    user_id: int
    display_name: str
    designation: str | None = None
    signature_image_url: str | None = None


class MySignatureUpdate(BaseModel):
    designation: str | None = Field(default=None, max_length=128)


def _to_out(user: User) -> MySignatureOut:
    return MySignatureOut(
        user_id=user.id,
        display_name=user_display_name(user),
        designation=user.designation,
        signature_image_url=signature_image_url(user.signature_image_name),
    )


def _delete_signature_file(tenant_id: int, name: str) -> None:
    """Best-effort file removal: a storage error must not hide the real response."""
    try:
        FileStorageService.delete_file(tenant_id, SIGNATURE_MODULE, name)
    except Exception:  # noqa: BLE001
        logger.warning("my_signature_file_delete_failed tenant=%s name=%s", tenant_id, name)


async def _load_self(db: AsyncSession, user: User) -> User:
    row = await db.get(User, user.id)
    if row is None or row.tenant_id != user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return row


@router.get("/signature", response_model=MySignatureOut)
async def get_my_signature(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return _to_out(await _load_self(db, user))


@router.put("/signature", response_model=MySignatureOut)
async def update_my_signature(
    body: MySignatureUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_self(db, user)
    # Plain values: after a rollback the ORM objects are expired and reading them would hit the DB.
    user_id = row.id
    row.designation = (body.designation or "").strip() or None
    try:
        await db.commit()
    except Exception:
        await safe_async_session_rollback(db)
        logger.exception("my_signature_update_failed user=%s", user_id)
        raise HTTPException(status_code=500, detail="Could not save designation")
    await db.refresh(row)
    return _to_out(row)


@router.post("/signature/image", response_model=MySignatureOut)
async def upload_my_signature_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_self(db, user)
    # Plain values: after a rollback the ORM objects are expired and reading them would hit the DB.
    user_id, tenant_id = row.id, row.tenant_id
    safe_name, _url, _path = await FileStorageService.save_file(file, tenant_id, SIGNATURE_MODULE)
    old_name = row.signature_image_name
    row.signature_image_name = safe_name
    try:
        await db.commit()
    except Exception:
        await safe_async_session_rollback(db)
        logger.exception("my_signature_image_save_failed user=%s", user_id)
        _delete_signature_file(tenant_id, safe_name)
        raise HTTPException(status_code=500, detail="Could not save signature image")
    if old_name and old_name != safe_name:
        _delete_signature_file(tenant_id, old_name)
    await db.refresh(row)
    return _to_out(row)


@router.delete("/signature/image", response_model=MySignatureOut)
async def delete_my_signature_image(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await _load_self(db, user)
    user_id, tenant_id = row.id, row.tenant_id
    old_name = row.signature_image_name
    if old_name:
        row.signature_image_name = None
        try:
            await db.commit()
        except Exception:
            await safe_async_session_rollback(db)
            logger.exception("my_signature_image_delete_failed user=%s", user_id)
            raise HTTPException(status_code=500, detail="Could not remove signature image")
        _delete_signature_file(tenant_id, old_name)
        await db.refresh(row)
    return _to_out(row)

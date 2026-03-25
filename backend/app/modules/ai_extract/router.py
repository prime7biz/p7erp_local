"""Temporary extraction endpoints — files are processed in memory only."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.ai_tool.guardrails import rate_limit_dependency
from app.modules.ai_extract.schemas import CustomerExtractionResponse, InquiryExtractionResponse
from app.modules.ai_extract.service import extract_customer_form, extract_inquiry_form

router = APIRouter(prefix="/ai-extract", tags=["ai-extract"])

heavy_limit = Depends(rate_limit_dependency("heavy"))

MAX_BYTES = 10 * 1024 * 1024
ALLOWED_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "application/pdf": "pdf",
}


def _ensure_user_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _validate_upload(content_type: str | None, data: bytes) -> None:
    ct = (content_type or "").lower().split(";")[0].strip()
    if ct not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Use PNG, JPEG, WebP, or PDF.",
        )
    if len(data) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file.")
    if len(data) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large (max {MAX_BYTES // (1024 * 1024)} MB).",
        )
    if ct == "application/pdf" and not data.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid PDF file.",
        )


@router.post("/customer-form", response_model=CustomerExtractionResponse)
async def extract_customer(
    *,
    file: UploadFile = File(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    _ensure_user_tenant(user, tenant)
    data = await file.read()
    _validate_upload(file.content_type, data)
    return await extract_customer_form(db, tenant.id, data, file.content_type or "")


@router.post("/inquiry-form", response_model=InquiryExtractionResponse)
async def extract_inquiry(
    *,
    file: UploadFile = File(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    _ensure_user_tenant(user, tenant)
    data = await file.read()
    _validate_upload(file.content_type, data)
    return await extract_inquiry_form(db, tenant.id, data, file.content_type or "")

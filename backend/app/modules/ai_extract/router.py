"""Temporary extraction endpoints — files are processed in memory only."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import (
    PERMISSION_AI_HR_EXTRACT,
    PERMISSION_AI_LC_EXTRACT,
    PERMISSION_AI_SHIPPING_EXTRACT,
    PERMISSION_HR_OCR_USE,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    is_ocr_cv_extraction_enabled,
    is_ocr_id_extraction_enabled,
    is_ocr_medical_extraction_enabled,
)
from app.database import get_db
from app.models import Tenant, User
from app.modules.ai_tool.guardrails import rate_limit_dependency
from app.modules.ai_extract.schemas import (
    CustomerExtractionResponse,
    HrDocExtractionResponse,
    InquiryExtractionResponse,
    LcExtractionResponse,
    ShippingDocExtractionResponse,
)
from app.modules.ai_extract.service import (
    extract_customer_form,
    extract_hr_birth_certificate_form,
    extract_hr_cv_form,
    extract_hr_medical_form,
    extract_hr_national_id_form,
    extract_inquiry_form,
    extract_lc_form,
    extract_shipping_doc_form,
)
router = APIRouter(prefix="/ai-extract", tags=["ai-extract"])

heavy_limit = Depends(rate_limit_dependency("heavy"))

MAX_BYTES = 10 * 1024 * 1024
_READ_CHUNK_BYTES = 1024 * 1024
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


def _too_large() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        detail=f"File too large (max {MAX_BYTES // (1024 * 1024)} MB).",
    )


async def _read_upload_limited(file: UploadFile) -> bytes:
    """Read the upload in chunks and stop with 413 as soon as it exceeds MAX_BYTES."""
    declared_size = getattr(file, "size", None)
    if declared_size is not None and declared_size > MAX_BYTES:
        raise _too_large()
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(_READ_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_BYTES:
            raise _too_large()
        chunks.append(chunk)
    return b"".join(chunks)


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
        raise _too_large()
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
    data = await _read_upload_limited(file)
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
    data = await _read_upload_limited(file)
    _validate_upload(file.content_type, data)
    return await extract_inquiry_form(db, tenant.id, data, file.content_type or "")


@router.post("/lc", response_model=LcExtractionResponse)
async def extract_lc(
    *,
    file: UploadFile = File(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    """Extract Letter of Credit / master contract fields from an uploaded document (no persistence)."""
    _ensure_user_tenant(user, tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_AI_LC_EXTRACT
    )
    data = await _read_upload_limited(file)
    _validate_upload(file.content_type, data)
    return await extract_lc_form(db, tenant.id, data, file.content_type or "")


@router.post("/shipping-doc", response_model=ShippingDocExtractionResponse)
async def extract_shipping_doc(
    *,
    file: UploadFile = File(...),
    type: str | None = Query(
        default=None,
        description="Optional document type hint: bl | awb | packing_list",
    ),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    """Extract BL/AWB/packing-list fields from an uploaded shipping document (no persistence)."""
    _ensure_user_tenant(user, tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_AI_SHIPPING_EXTRACT
    )
    data = await _read_upload_limited(file)
    _validate_upload(file.content_type, data)
    return await extract_shipping_doc_form(
        db, tenant.id, data, file.content_type or "", doc_type=type
    )


async def _hr_ocr_gate(db: AsyncSession, user: User, tenant: Tenant, flag_ok: bool) -> None:
    if not flag_ok:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR OCR extraction is disabled for this tenant",
        )
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_OCR_USE)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_AI_HR_EXTRACT)


@router.post("/hr/cv", response_model=HrDocExtractionResponse)
async def extract_hr_cv(
    *,
    file: UploadFile = File(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    _ensure_user_tenant(user, tenant)
    await _hr_ocr_gate(db, user, tenant, is_ocr_cv_extraction_enabled(tenant.feature_flags))
    data = await _read_upload_limited(file)
    _validate_upload(file.content_type, data)
    return await extract_hr_cv_form(db, tenant.id, data, file.content_type or "")


@router.post("/hr/national-id", response_model=HrDocExtractionResponse)
async def extract_hr_national_id(
    *,
    file: UploadFile = File(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    _ensure_user_tenant(user, tenant)
    await _hr_ocr_gate(db, user, tenant, is_ocr_id_extraction_enabled(tenant.feature_flags))
    data = await _read_upload_limited(file)
    _validate_upload(file.content_type, data)
    return await extract_hr_national_id_form(db, tenant.id, data, file.content_type or "")


@router.post("/hr/medical-certificate", response_model=HrDocExtractionResponse)
async def extract_hr_medical(
    *,
    file: UploadFile = File(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    _ensure_user_tenant(user, tenant)
    await _hr_ocr_gate(db, user, tenant, is_ocr_medical_extraction_enabled(tenant.feature_flags))
    data = await _read_upload_limited(file)
    _validate_upload(file.content_type, data)
    return await extract_hr_medical_form(db, tenant.id, data, file.content_type or "")


@router.post("/hr/birth-certificate", response_model=HrDocExtractionResponse)
async def extract_hr_birth(
    *,
    file: UploadFile = File(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    _ensure_user_tenant(user, tenant)
    await _hr_ocr_gate(db, user, tenant, is_ocr_id_extraction_enabled(tenant.feature_flags))
    data = await _read_upload_limited(file)
    _validate_upload(file.content_type, data)
    return await extract_hr_birth_certificate_form(db, tenant.id, data, file.content_type or "")

"""Public (no login) QR verification endpoints.

Mounted under ``/api/v1/public/verify``. Responses only carry what is printed on the paper
(company, document number, date, status, amount / quantity) plus a genuine / changed result.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.login_lockout import enforce_ip_rate_limit
from app.common.rls import bind_session_bypass, bind_session_tenant
from app.database import get_db, rls_request_scope, safe_async_session_rollback
from app.models.commercial import ProformaInvoice
from app.models.tenant import Tenant
from app.modules.document_verify.schemas import PublicDocumentVerification, PublicProformaVerification
from app.modules.document_verify.service import verify_document_publicly

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public/verify", tags=["public"])

# Generous for a person scanning paper; blocks bulk guessing even without Redis.
PUBLIC_VERIFY_LIMIT_PER_MINUTE = 30
_NOT_FOUND = "Verification record not found"


async def _rate_limit(request: Request) -> None:
    await enforce_ip_rate_limit(
        request, scope="public_verify", limit=PUBLIC_VERIFY_LIMIT_PER_MINUTE, window_seconds=60
    )


# Static path first so "proforma" is never treated as a verification id.
@router.get("/proforma", response_model=PublicProformaVerification)
async def verify_proforma_public(
    request: Request,
    token: str = Query(..., min_length=1, max_length=255),
    db: AsyncSession = Depends(get_db),
    _rls_scope: None = Depends(rls_request_scope),
) -> PublicProformaVerification:
    await _rate_limit(request)
    try:
        await bind_session_bypass(db)
        pi = (
            await db.execute(select(ProformaInvoice).where(ProformaInvoice.verification_token == token.strip()))
        ).scalar_one_or_none()
        if pi is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid or expired token")
        await bind_session_tenant(db, pi.tenant_id)
        tenant = await db.get(Tenant, pi.tenant_id)
    except HTTPException:
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        logger.exception("public_proforma_verify_failed")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Verification is unavailable") from exc
    company = tenant.name if tenant else ""
    return PublicProformaVerification(
        valid=True,
        company_name=company or None,
        issued_by=company,
        reference=pi.reference,
        invoice_date=pi.invoice_date.isoformat() if pi.invoice_date else None,
        amount=float(pi.amount) if pi.amount is not None else None,
        currency=pi.currency,
    )


@router.get("/document/{verification_id}", response_model=PublicDocumentVerification)
async def verify_document_public(
    verification_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _rls_scope: None = Depends(rls_request_scope),
) -> PublicDocumentVerification:
    await _rate_limit(request)
    try:
        result = await verify_document_publicly(db, verification_id)
    except Exception as exc:
        await safe_async_session_rollback(db)
        logger.exception("public_document_verify_failed")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Verification is unavailable") from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return result

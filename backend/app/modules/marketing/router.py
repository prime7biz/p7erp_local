"""Public (no login) marketing endpoints: website lead capture."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.login_lockout import _client_ip, enforce_login_rate_limit
from app.config import get_settings
from app.database import get_db
from app.models.marketing import MarketingLead

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["public"])


class LeadCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    company: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=64)
    company_size: str | None = Field(default=None, max_length=64)
    message: str = Field(..., min_length=1, max_length=5000)
    source_page: str | None = Field(default=None, max_length=255)
    # Honeypot: hidden on the form; bots fill it, people never see it.
    website: str | None = Field(default=None, max_length=255)


class LeadAccepted(BaseModel):
    ok: bool = True


@router.post("/leads", response_model=LeadAccepted, status_code=202)
async def create_lead(body: LeadCreate, request: Request, db: AsyncSession = Depends(get_db)) -> LeadAccepted:
    await enforce_login_rate_limit(request, company_key="lead", scope="marketing_lead")
    if (body.website or "").strip():
        # Pretend success so bots get no signal.
        return LeadAccepted()
    lead = MarketingLead(
        name=body.name.strip(),
        email=str(body.email).strip().lower(),
        company=(body.company or "").strip() or None,
        phone=(body.phone or "").strip() or None,
        company_size=(body.company_size or "").strip() or None,
        message=body.message.strip(),
        source_page=(body.source_page or "").strip() or None,
        ip_address=_client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:512] or None,
    )
    db.add(lead)
    await db.commit()

    to_email = (get_settings().sales_notification_email or "").strip()
    if to_email:
        try:
            from app.common.email_service import send_new_lead_notification_email

            await send_new_lead_notification_email(
                to_email=to_email,
                lead={
                    "Name": lead.name,
                    "Email": lead.email,
                    "Company": lead.company,
                    "Phone": lead.phone,
                    "Company size": lead.company_size,
                    "Page": lead.source_page,
                    "Message": lead.message,
                },
            )
        except Exception:
            # The lead is already saved; a mail outage must not lose it or fail the visitor.
            logger.exception("lead notification email failed lead_id=%s", lead.id)
    return LeadAccepted()

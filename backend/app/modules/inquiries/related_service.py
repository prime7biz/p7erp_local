"""Cross-module related records for an Inquiry (Phase 3 workbench wiring)."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.money import format_money
from app.models import (
    Bom,
    Customer,
    CustomerIntermediary,
    GarmentStyle,
    Inquiry,
    InquiryEvent,
    Intermediary,
    Order,
    Quotation,
    Tenant,
    User,
)
from app.models.merch import MerchSampleRequest
from app.models.mfg_planning import MfgTentativeLineBooking
from app.modules.ai_tool.screen_context import can_access_module
from app.modules.inquiries.schemas import (
    InquiryRelatedCustomerOut,
    InquiryRelatedIntermediaryOut,
    InquiryRelatedOrderOut,
    InquiryRelatedQuotationOut,
    InquiryRelatedResponse,
    InquiryRelatedSampleOut,
    InquiryRelatedStyleOut,
    InquiryRelatedTentativeBookingOut,
    InquiryRelatedTimelineEventOut,
)
from app.modules.mfg_intelligence.flags import (
    is_manufacturing_intelligence_v1_enabled,
    is_mfg_integrated_planning_v1_enabled,
)

_RELATED_LIMIT = 50


async def get_inquiry_related(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    inquiry: Inquiry,
) -> InquiryRelatedResponse:
    tenant_id = tenant.id

    customer_out: InquiryRelatedCustomerOut | None = None
    cust = (
        await db.execute(
            select(Customer).where(Customer.id == inquiry.customer_id, Customer.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if cust:
        customer_out = InquiryRelatedCustomerOut(
            id=cust.id,
            name=cust.name,
            customer_code=cust.customer_code,
            status=cust.status,
        )

    intermediary_out: InquiryRelatedIntermediaryOut | None = None
    if inquiry.customer_intermediary_id is not None:
        link_row = (
            await db.execute(
                select(CustomerIntermediary, Intermediary)
                .join(Intermediary, Intermediary.id == CustomerIntermediary.intermediary_id)
                .where(
                    CustomerIntermediary.id == inquiry.customer_intermediary_id,
                    CustomerIntermediary.tenant_id == tenant_id,
                    Intermediary.tenant_id == tenant_id,
                )
            )
        ).first()
        if link_row:
            link, intermediary = link_row
            intermediary_out = InquiryRelatedIntermediaryOut(
                id=link.id,
                name=intermediary.name,
                label=intermediary.name,
            )

    style_out: InquiryRelatedStyleOut | None = None
    if inquiry.style_id is not None:
        style = (
            await db.execute(
                select(GarmentStyle).where(
                    GarmentStyle.id == inquiry.style_id,
                    GarmentStyle.tenant_id == tenant_id,
                )
            )
        ).scalar_one_or_none()
        if style:
            bom_count = int(
                (
                    await db.execute(
                        select(func.count())
                        .select_from(Bom)
                        .where(Bom.tenant_id == tenant_id, Bom.style_id == style.id)
                    )
                ).scalar_one()
                or 0
            )
            latest_bom = (
                await db.execute(
                    select(Bom)
                    .where(Bom.tenant_id == tenant_id, Bom.style_id == style.id)
                    .order_by(Bom.id.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()

            estimated_sah: str | None = None
            if inquiry.quantity is not None and style.standard_smv is not None:
                sah = (Decimal(inquiry.quantity) * Decimal(str(style.standard_smv))) / Decimal(60)
                estimated_sah = format_money(sah)

            style_out = InquiryRelatedStyleOut(
                id=style.id,
                style_code=style.style_code,
                name=style.name,
                style_image_url=style.style_image_url,
                standard_smv=format_money(style.standard_smv) if style.standard_smv is not None else None,
                standard_smv_confidence=style.standard_smv_confidence,
                bom_count=bom_count,
                latest_bom_id=latest_bom.id if latest_bom else None,
                latest_bom_status=latest_bom.status if latest_bom else None,
                estimated_sah=estimated_sah,
            )

    quotations = list(
        (
            await db.execute(
                select(Quotation)
                .where(Quotation.tenant_id == tenant_id, Quotation.inquiry_id == inquiry.id)
                .order_by(Quotation.id.desc())
                .limit(_RELATED_LIMIT)
            )
        ).scalars()
        .all()
    )
    quotation_outs = [
        InquiryRelatedQuotationOut(
            id=q.id,
            quotation_code=q.quotation_code,
            version_no=q.version_no,
            status=q.status,
            quoted_price=format_money(q.quoted_price) if q.quoted_price is not None else None,
            currency=q.currency,
        )
        for q in quotations
    ]

    quotation_ids = [q.id for q in quotations]
    order_outs: list[InquiryRelatedOrderOut] = []
    if quotation_ids:
        orders = list(
            (
                await db.execute(
                    select(Order)
                    .where(Order.tenant_id == tenant_id, Order.quotation_id.in_(quotation_ids))
                    .order_by(Order.id.desc())
                    .limit(_RELATED_LIMIT)
                )
            ).scalars()
            .all()
        )
        order_outs = [
            InquiryRelatedOrderOut(
                id=o.id,
                order_code=o.order_code,
                status=o.status,
                quantity=o.quantity,
                delivery_date=o.delivery_date.isoformat() if o.delivery_date else None,
                quotation_id=o.quotation_id,
            )
            for o in orders
        ]

    samples = list(
        (
            await db.execute(
                select(MerchSampleRequest)
                .where(
                    MerchSampleRequest.tenant_id == tenant_id,
                    MerchSampleRequest.inquiry_id == inquiry.id,
                )
                .order_by(MerchSampleRequest.id.desc())
                .limit(_RELATED_LIMIT)
            )
        ).scalars()
        .all()
    )
    sample_outs = [
        InquiryRelatedSampleOut(
            id=s.id,
            sample_code=s.sample_code,
            sample_type=s.sample_type,
            status=s.status,
            target_date=s.target_date.isoformat() if s.target_date else None,
        )
        for s in samples
    ]

    can_view = (
        is_manufacturing_intelligence_v1_enabled(tenant.feature_flags)
        and is_mfg_integrated_planning_v1_enabled(tenant.feature_flags)
        and await can_access_module(db, tenant, user, "production.planning.read")
    )
    booking_outs: list[InquiryRelatedTentativeBookingOut] = []
    if can_view:
        bookings = list(
            (
                await db.execute(
                    select(MfgTentativeLineBooking)
                    .where(
                        MfgTentativeLineBooking.tenant_id == tenant_id,
                        MfgTentativeLineBooking.inquiry_id == inquiry.id,
                    )
                    .order_by(MfgTentativeLineBooking.start_date, MfgTentativeLineBooking.id)
                    .limit(_RELATED_LIMIT)
                )
            ).scalars()
            .all()
        )
        booking_outs = [
            InquiryRelatedTentativeBookingOut(
                id=b.id,
                line_id=b.line_id,
                status=b.status,
                start_date=b.start_date.isoformat(),
                planned_end_date=b.planned_end_date.isoformat() if b.planned_end_date else None,
                planned_qty=format_money(b.planned_qty, quantize="0.001") or "0.000",
                confidence_pct=format_money(b.confidence_pct, quantize="0.01") or "0.00",
                expires_at=b.expires_at.isoformat() if b.expires_at else None,
            )
            for b in bookings
        ]

    events = list(
        (
            await db.execute(
                select(InquiryEvent)
                .where(InquiryEvent.tenant_id == tenant_id, InquiryEvent.inquiry_id == inquiry.id)
                .order_by(InquiryEvent.created_at.desc())
                .limit(_RELATED_LIMIT)
            )
        ).scalars()
        .all()
    )
    timeline = [
        InquiryRelatedTimelineEventOut(
            id=e.id,
            event_type=e.event_type,
            from_status=e.from_status,
            to_status=e.to_status,
            notes=e.notes,
            created_at=e.created_at.isoformat() if e.created_at else "",
        )
        for e in events
    ]

    return InquiryRelatedResponse(
        customer=customer_out,
        intermediary=intermediary_out,
        style=style_out,
        quotations=quotation_outs,
        orders=order_outs,
        samples=sample_outs,
        can_view_tentative_bookings=can_view,
        tentative_bookings=booking_outs,
        timeline=timeline,
    )

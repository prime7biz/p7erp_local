"""409 conflict guards before deleting tenant-scoped master records (go-live remediation Phase 6)."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import String

from app.models import (
    Bom,
    CrewRosterWeekly,
    CurrencyExchangeRate,
    CustomerIntermediary,
    DeliveryChallanOrder,
    ExternalCustomerAccess,
    GarmentStyle,
    GoodsReceiving,
    Inquiry,
    InquiryEvent,
    KnittingWorkOrder,
    LineCrewDaily,
    LineCrewSheetHeader,
    LineCrewTemplate,
    ManufacturingWorkOrder,
    MerchSampleRequest,
    Order,
    OrderAmendment,
    OrderFollowupAction,
    ProcessOrder,
    ProcessOrderCostLine,
    ProductionCrewRole,
    ProductionDefectCode,
    ProductionMaterialIssue,
    ProductionQcCheck,
    ProductionShift,
    ProformaInvoice,
    ProformaInvoiceOrder,
    PurchaseOrder,
    Quotation,
    SewingLine,
    StockMovement,
    TradeCase,
    UnitCrewDaily,
    UnitCrewTemplate,
    VendorBill,
)


async def count_where(db: AsyncSession, model, tenant_id: int, *filters) -> int:
    stmt = select(func.count()).select_from(model).where(model.tenant_id == tenant_id)
    for f in filters:
        stmt = stmt.where(f)
    return int((await db.execute(stmt)).scalar() or 0)


def raise_delete_conflict(entity_label: str, reasons: list[str]) -> None:
    if reasons:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete {entity_label}: referenced by " + ", ".join(reasons) + ".",
        )


async def _append_count(
    db: AsyncSession,
    tenant_id: int,
    reasons: list[str],
    label: str,
    model,
    *filters,
) -> None:
    n = await count_where(db, model, tenant_id, *filters)
    if n:
        reasons.append(f"{label} ({n})")


async def ensure_customer_deletable(db: AsyncSession, tenant_id: int, customer_id: int) -> None:
    reasons: list[str] = []
    await _append_count(db, tenant_id, reasons, "inquiries", Inquiry, Inquiry.customer_id == customer_id)
    await _append_count(db, tenant_id, reasons, "quotations", Quotation, Quotation.customer_id == customer_id)
    await _append_count(db, tenant_id, reasons, "orders", Order, Order.customer_id == customer_id)
    await _append_count(db, tenant_id, reasons, "trade cases", TradeCase, TradeCase.customer_id == customer_id)
    await _append_count(
        db, tenant_id, reasons, "process orders", ProcessOrder, ProcessOrder.customer_id == customer_id
    )
    await _append_count(
        db,
        tenant_id,
        reasons,
        "garment styles",
        GarmentStyle,
        GarmentStyle.buyer_customer_id == customer_id,
    )
    await _append_count(db, tenant_id, reasons, "BOMs", Bom, Bom.customer_id == customer_id)
    await _append_count(
        db,
        tenant_id,
        reasons,
        "customer intermediary links",
        CustomerIntermediary,
        CustomerIntermediary.customer_id == customer_id,
    )
    await _append_count(
        db,
        tenant_id,
        reasons,
        "external portal access",
        ExternalCustomerAccess,
        ExternalCustomerAccess.customer_id == customer_id,
    )
    await _append_count(
        db,
        tenant_id,
        reasons,
        "knitting work orders",
        KnittingWorkOrder,
        KnittingWorkOrder.customer_id == customer_id,
    )
    order_ids = select(Order.id).where(Order.tenant_id == tenant_id, Order.customer_id == customer_id)
    await _append_count(
        db,
        tenant_id,
        reasons,
        "delivery challan links",
        DeliveryChallanOrder,
        DeliveryChallanOrder.order_id.in_(order_ids),
    )
    raise_delete_conflict("customer", reasons)


async def ensure_order_deletable(db: AsyncSession, tenant_id: int, order_id: int) -> None:
    reasons: list[str] = []
    await _append_count(db, tenant_id, reasons, "trade cases", TradeCase, TradeCase.order_id == order_id)
    await _append_count(
        db, tenant_id, reasons, "proforma invoice links", ProformaInvoiceOrder, ProformaInvoiceOrder.order_id == order_id
    )
    await _append_count(
        db, tenant_id, reasons, "delivery challan links", DeliveryChallanOrder, DeliveryChallanOrder.order_id == order_id
    )
    await _append_count(db, tenant_id, reasons, "BOMs", Bom, Bom.order_id == order_id)
    await _append_count(
        db,
        tenant_id,
        reasons,
        "process orders",
        ProcessOrder,
        or_(ProcessOrder.linked_order_id == order_id, ProcessOrder.source_order_id == order_id),
    )
    await _append_count(
        db, tenant_id, reasons, "follow-up actions", OrderFollowupAction, OrderFollowupAction.order_id == order_id
    )
    await _append_count(db, tenant_id, reasons, "order amendments", OrderAmendment, OrderAmendment.order_id == order_id)
    await _append_count(
        db, tenant_id, reasons, "sample requests", MerchSampleRequest, MerchSampleRequest.order_id == order_id
    )
    await _append_count(
        db,
        tenant_id,
        reasons,
        "manufacturing work orders",
        ManufacturingWorkOrder,
        ManufacturingWorkOrder.order_id == order_id,
    )
    await _append_count(
        db,
        tenant_id,
        reasons,
        "production material issues",
        ProductionMaterialIssue,
        ProductionMaterialIssue.order_id == order_id,
    )
    await _append_count(db, tenant_id, reasons, "stock movements", StockMovement, StockMovement.order_id == order_id)
    raise_delete_conflict("order", reasons)


async def ensure_quotation_deletable(db: AsyncSession, tenant_id: int, quotation_id: int) -> None:
    reasons: list[str] = []
    await _append_count(db, tenant_id, reasons, "orders", Order, Order.quotation_id == quotation_id)
    await _append_count(db, tenant_id, reasons, "BOMs", Bom, Bom.quotation_id == quotation_id)
    raise_delete_conflict("quotation", reasons)


async def ensure_inquiry_deletable(db: AsyncSession, tenant_id: int, inquiry_id: int) -> None:
    reasons: list[str] = []
    await _append_count(db, tenant_id, reasons, "quotations", Quotation, Quotation.inquiry_id == inquiry_id)
    await _append_count(db, tenant_id, reasons, "inquiry events", InquiryEvent, InquiryEvent.inquiry_id == inquiry_id)
    await _append_count(
        db, tenant_id, reasons, "sample requests", MerchSampleRequest, MerchSampleRequest.inquiry_id == inquiry_id
    )
    raise_delete_conflict("inquiry", reasons)


async def ensure_vendor_deletable(db: AsyncSession, tenant_id: int, vendor_id: int) -> None:
    reasons: list[str] = []
    await _append_count(db, tenant_id, reasons, "purchase orders", PurchaseOrder, PurchaseOrder.vendor_id == vendor_id)
    await _append_count(db, tenant_id, reasons, "goods receiving notes", GoodsReceiving, GoodsReceiving.vendor_id == vendor_id)
    await _append_count(db, tenant_id, reasons, "vendor bills", VendorBill, VendorBill.vendor_id == vendor_id)
    await _append_count(db, tenant_id, reasons, "process orders", ProcessOrder, ProcessOrder.vendor_id == vendor_id)
    await _append_count(
        db,
        tenant_id,
        reasons,
        "process order cost lines",
        ProcessOrderCostLine,
        ProcessOrderCostLine.vendor_id == vendor_id,
    )
    await _append_count(db, tenant_id, reasons, "trade cases", TradeCase, TradeCase.vendor_id == vendor_id)
    await _append_count(
        db, tenant_id, reasons, "proforma invoices", ProformaInvoice, ProformaInvoice.vendor_id == vendor_id
    )
    await _append_count(
        db, tenant_id, reasons, "knitting work orders", KnittingWorkOrder, KnittingWorkOrder.vendor_id == vendor_id
    )
    raise_delete_conflict("vendor", reasons)


async def ensure_intermediary_deletable(db: AsyncSession, tenant_id: int, intermediary_id: int) -> None:
    reasons: list[str] = []
    await _append_count(
        db,
        tenant_id,
        reasons,
        "customer intermediary links",
        CustomerIntermediary,
        CustomerIntermediary.intermediary_id == intermediary_id,
    )
    raise_delete_conflict("intermediary", reasons)


async def ensure_customer_intermediary_deletable(db: AsyncSession, tenant_id: int, link_id: int) -> None:
    reasons: list[str] = []
    await _append_count(
        db, tenant_id, reasons, "inquiries", Inquiry, Inquiry.customer_intermediary_id == link_id
    )
    await _append_count(
        db, tenant_id, reasons, "quotations", Quotation, Quotation.customer_intermediary_id == link_id
    )
    await _append_count(db, tenant_id, reasons, "orders", Order, Order.customer_intermediary_id == link_id)
    raise_delete_conflict("customer intermediary link", reasons)


async def ensure_exchange_rate_deletable(db: AsyncSession, tenant_id: int, rate: CurrencyExchangeRate) -> None:
    if not rate.is_active:
        return
    other_active = await count_where(
        db,
        CurrencyExchangeRate,
        tenant_id,
        CurrencyExchangeRate.from_currency == rate.from_currency,
        CurrencyExchangeRate.to_currency == rate.to_currency,
        CurrencyExchangeRate.is_active.is_(True),
        CurrencyExchangeRate.id != rate.id,
    )
    if other_active == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot delete the only active exchange rate for "
                f"{rate.from_currency} → {rate.to_currency}. Deactivate it or add a replacement first."
            ),
        )


async def ensure_sewing_line_deletable(db: AsyncSession, tenant_id: int, line_id: int) -> None:
    reasons: list[str] = []
    await _append_count(
        db, tenant_id, reasons, "line crew templates", LineCrewTemplate, LineCrewTemplate.sewing_line_id == line_id
    )
    await _append_count(db, tenant_id, reasons, "line crew daily", LineCrewDaily, LineCrewDaily.sewing_line_id == line_id)
    await _append_count(
        db, tenant_id, reasons, "QC checks", ProductionQcCheck, ProductionQcCheck.sewing_line_id == line_id
    )
    await _append_count(
        db,
        tenant_id,
        reasons,
        "crew sheet headers",
        LineCrewSheetHeader,
        LineCrewSheetHeader.sewing_line_id == line_id,
    )
    await _append_count(
        db, tenant_id, reasons, "weekly crew roster", CrewRosterWeekly, CrewRosterWeekly.sewing_line_id == line_id
    )
    raise_delete_conflict("sewing line", reasons)


async def ensure_shift_deletable(db: AsyncSession, tenant_id: int, shift_id: int) -> None:
    reasons: list[str] = []
    await _append_count(db, tenant_id, reasons, "line crew daily", LineCrewDaily, LineCrewDaily.shift_id == shift_id)
    await _append_count(db, tenant_id, reasons, "unit crew daily", UnitCrewDaily, UnitCrewDaily.shift_id == shift_id)
    await _append_count(
        db, tenant_id, reasons, "QC checks", ProductionQcCheck, ProductionQcCheck.shift_id == shift_id
    )
    await _append_count(
        db,
        tenant_id,
        reasons,
        "crew sheet headers",
        LineCrewSheetHeader,
        LineCrewSheetHeader.shift_id == shift_id,
    )
    await _append_count(
        db, tenant_id, reasons, "weekly crew roster", CrewRosterWeekly, CrewRosterWeekly.shift_id == shift_id
    )
    raise_delete_conflict("shift", reasons)


async def ensure_crew_role_deletable(db: AsyncSession, tenant_id: int, crew_role_id: int) -> None:
    reasons: list[str] = []
    await _append_count(
        db, tenant_id, reasons, "line crew templates", LineCrewTemplate, LineCrewTemplate.crew_role_id == crew_role_id
    )
    await _append_count(
        db, tenant_id, reasons, "unit crew templates", UnitCrewTemplate, UnitCrewTemplate.crew_role_id == crew_role_id
    )
    await _append_count(
        db, tenant_id, reasons, "line crew daily", LineCrewDaily, LineCrewDaily.crew_role_id == crew_role_id
    )
    await _append_count(
        db, tenant_id, reasons, "unit crew daily", UnitCrewDaily, UnitCrewDaily.crew_role_id == crew_role_id
    )
    await _append_count(
        db, tenant_id, reasons, "weekly crew roster", CrewRosterWeekly, CrewRosterWeekly.crew_role_id == crew_role_id
    )
    raise_delete_conflict("crew role", reasons)


async def ensure_defect_code_deletable(db: AsyncSession, tenant_id: int, code_row: ProductionDefectCode) -> None:
    code = (code_row.code or "").strip()
    if not code:
        return
    n = await count_where(
        db,
        ProductionQcCheck,
        tenant_id,
        cast(ProductionQcCheck.defect_codes, String).like(f"%{code}%"),
    )
    if n:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete defect code: referenced by QC checks ({n}).",
        )

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class FinancierOrderBookRow(BaseModel):
    id: int
    order_code: str
    buyer_name: str | None
    status: str
    quantity: int | None
    planned_shipment: date | None
    expected_delivery: date | None
    execution_status: str | None = None
    pipeline_status: str | None = None
    sewing_pct: float | None = None
    outstanding_finance: float | None = None
    finance_currency: str | None = None


class FinancierOrderBookResponse(BaseModel):
    items: list[FinancierOrderBookRow]
    total: int


class FinancierPipelineSummary(BaseModel):
    inquiries_open: int
    inquiries_submitted: int
    quotations_open: int
    quotations_sent: int


class FinancierGoodsMovementSummary(BaseModel):
    movements_in_count: int
    movements_out_count: int
    movements_adjust_count: int
    last_30_days_total: int


class FinancierFinancialSummary(BaseModel):
    voucher_count_90d: int
    receivable_bills_open: int | None = None
    payables_open: int | None = None
    note: str | None = None


class FinancierProjectionMonth(BaseModel):
    month: str
    projected_units: int


class FinancierProjectionsResponse(BaseModel):
    items: list[FinancierProjectionMonth]
    meta: dict | None = None


class FinancierAlertItem(BaseModel):
    code: str
    severity: str
    title: str
    detail: str


class FinancierAlertsResponse(BaseModel):
    items: list[FinancierAlertItem]


class FinancierDashboardNextDue(BaseModel):
    """Next payable (EMI) or next BTB tranche / funding maturity in financier scope."""

    due_date: date
    amount: float | None = None
    currency: str | None = None
    reference: str | None = None


class FinancierDashboardRecoveryGlance(BaseModel):
    """Rollup recovery signals for credit-monitoring dashboard strip."""

    financed_orders_count: int = 0
    at_risk_orders_count: int = 0
    total_outstanding_principal: float | None = None
    outstanding_currency: str | None = None
    avg_coverage_ratio: float | None = None


class FinancierDashboardPartyInsights(BaseModel):
    """Populated when the principal has credit monitoring scope and a linked financier party."""

    next_emi: FinancierDashboardNextDue | None = None
    next_btb_funding: FinancierDashboardNextDue | None = None
    financed_orders_open: int | None = None
    sewing_planned_qty: float | None = None
    sewing_completed_qty: float | None = None
    sewing_progress_pct: float | None = None
    recovery_glance: FinancierDashboardRecoveryGlance | None = None
    note: str | None = None


class FinancierDashboardResponse(BaseModel):
    active_order_lines: int
    confirmed_style_orders: int
    pipeline: FinancierPipelineSummary
    goods: FinancierGoodsMovementSummary
    shipments_due_this_month: int
    alerts_count: int
    projection_next_90_units: int | None = None
    btb_maturities_upcoming_90d: int | None = None
    party_insights: FinancierDashboardPartyInsights | None = None


class FinancierOrderDetail(BaseModel):
    id: int
    order_code: str
    buyer_name: str | None
    status: str
    quantity: int | None
    order_date: date | None
    delivery_date: date | None
    updated_at: datetime
    pipeline: dict | None = None
    production: dict | None = None
    finance: dict | None = None
    raw_materials: list[dict] | None = None
    raw_material_summary: dict | None = None
    commercial: dict | None = None
    trade: dict | None = None
    recovery: dict | None = None
    production_detail: dict | None = None


class FinancierRecoveryOutlookRow(BaseModel):
    order_id: int
    order_code: str
    buyer_name: str | None = None
    outstanding_principal: float | None = None
    proceeds_proxy: float | None = None
    coverage_ratio: float | None = None
    recovery_score: float | None = None
    recovery_band: str | None = None
    drivers: list[str] = []
    finance_currency: str | None = None
    as_of: date | None = None


class FinancierContractWhatIfBody(BaseModel):
    etd_shift_days: int = 0
    rm_accel_pct: float = 0.0

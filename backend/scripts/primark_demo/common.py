"""Shared settings, fixed codes, and helpers for every stage of the Primark demo.

Every stage finds upstream records by the fixed codes below (never by hard-coded ids),
so stages can be re-run safely and in separate processes.
"""
from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any, AsyncIterator

BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.database import AsyncSessionLocal, engine  # noqa: E402
from app.models import Customer, Tenant  # noqa: E402

# ---------------------------------------------------------------------------
# Tenant + customer
# ---------------------------------------------------------------------------
COMPANY_CODE = "LAKH806201"
CUSTOMER_NAME = "Primark"
CUSTOMER_CODE = "CUST-003"

# ---------------------------------------------------------------------------
# Record codes shared by all stages (prefix PRM-)
# ---------------------------------------------------------------------------
STYLE_CODE = "PRM-STY-001"
INQUIRY_CODE = "PRM-INQ-001"
QUOTATION_CODE = "PRM-QUO-001"
ORDER_CODE = "PRM-ORD-001"
BUYER_PO_NUMBER = "PK-4500871236"
PI_REFERENCE = "PRM-PI-001"
SALES_CONTRACT_REF = "PRM-SC-001"

# Stage 3 – procurement & inventory
VENDOR_FABRIC_CODE = "PRM-VEND-FAB"
VENDOR_TRIM_CODE = "PRM-VEND-TRIM"
VENDOR_PACK_CODE = "PRM-VEND-PACK"
PO_FABRIC_CODE = "PRM-PO-FAB-001"
PO_TRIM_CODE = "PRM-PO-TRM-001"
PO_PACK_CODE = "PRM-PO-PCK-001"
BTB_LC_REF = "PRM-BTB-001"
GRN_FABRIC_CODE = "PRM-GRN-FAB-001"
GRN_TRIM_CODE = "PRM-GRN-TRM-001"
GRN_PACK_CODE = "PRM-GRN-PCK-001"
TRANSFER_CODE = "PRM-TRF-001"
MATERIAL_ISSUE_CODE = "PRM-MI-001"
WAREHOUSE_RM_NAME = "PRM Raw Material Store"
WAREHOUSE_CUTTING_NAME = "PRM Cutting Floor Store"
WAREHOUSE_FG_NAME = "PRM Finished Goods Store"

# Stage 4 – production & job work
VENDOR_JOBWORK_CODE = "PRM-VEND-JW"
JOBWORK_CODE = "PRM-JW-001"

# Stage 5 – export
DELIVERY_CHALLAN_CODE = "PRM-DC-001"
GATE_PASS_CODE = "PRM-GP-001"
COMMERCIAL_INVOICE_NO = "PRM-CI-001"
BL_NUMBER = "MAEU-PRM-260908"
EXP_NUMBER = "EXP-PRM-0001-2026"

# Stage 6 – accounting (voucher narrations always contain ORDER_CODE)
VOUCHER_PREFIX = "PRM-"

# ---------------------------------------------------------------------------
# Order facts
# ---------------------------------------------------------------------------
ORDER_QTY = 24_000
UNIT_PRICE_USD = Decimal("1.62")
ORDER_VALUE_USD = Decimal("38880.00")
CURRENCY = "USD"
USD_TO_BDT = Decimal("122.00")
SHIPPING_TERM = "FOB Chattogram"
PORT_OF_LOADING = "Chattogram, Bangladesh"
PORT_OF_DISCHARGE = "Felixstowe, United Kingdom"
FINAL_DESTINATION = "Primark DC, Thrapston, Northamptonshire, UK"
SEASON = "AW26"
HS_CODE = "6109.10.00"

COLORS = [("Black", "BLK"), ("White", "WHT"), ("Navy", "NVY")]
SIZE_RATIO = [("S", 15), ("M", 30), ("L", 30), ("XL", 15), ("XXL", 10)]
QTY_PER_COLOR = ORDER_QTY // len(COLORS)  # 8,000


def color_size_matrix() -> list[tuple[str, str, str, int]]:
    """(color_name, color_code, size, qty) cells; adds up to ORDER_QTY."""
    cells = []
    for color_name, color_code in COLORS:
        for size, pct in SIZE_RATIO:
            cells.append((color_name, color_code, size, QTY_PER_COLOR * pct // 100))
    return cells


# ---------------------------------------------------------------------------
# Materials (rows in the shared `items` master, created in stage 1)
# code, name, category_code, unit_code, unit_price_usd, consumption_per_piece, wastage_pct
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class MaterialSpec:
    code: str
    name: str
    category_code: str
    unit_code: str
    unit_price: Decimal
    consumption_per_pc: Decimal
    wastage_pct: Decimal
    vendor_code: str

    @property
    def required_qty(self) -> Decimal:
        gross = self.consumption_per_pc * ORDER_QTY * (1 + self.wastage_pct / 100)
        return gross.quantize(Decimal("1"))


MATERIALS: list[MaterialSpec] = [
    MaterialSpec("PRM-FAB-SJ180", "180 GSM organic cotton single jersey (open width)", "FABRIC", "KG",
                 Decimal("3.4000"), Decimal("0.1500"), Decimal("6"), VENDOR_FABRIC_CODE),
    MaterialSpec("PRM-FAB-RIB1X1", "1x1 organic cotton rib for neckband", "FABRIC", "KG",
                 Decimal("4.0000"), Decimal("0.0100"), Decimal("5"), VENDOR_FABRIC_CODE),
    MaterialSpec("PRM-TRM-THREAD", "Sewing thread 40/2 polyester spun, 5000 m cone", "TRIM", "Cone",
                 Decimal("1.1000"), Decimal("0.0250"), Decimal("3"), VENDOR_TRIM_CODE),
    MaterialSpec("PRM-TRM-MLABEL", "Primark woven main label", "TRIM", "Pcs",
                 Decimal("0.0120"), Decimal("1"), Decimal("2"), VENDOR_TRIM_CODE),
    MaterialSpec("PRM-TRM-CARELBL", "Care / composition label (printed satin)", "TRIM", "Pcs",
                 Decimal("0.0080"), Decimal("1"), Decimal("2"), VENDOR_TRIM_CODE),
    MaterialSpec("PRM-TRM-PRICETKT", "Primark price ticket with barcode", "TRIM", "Pcs",
                 Decimal("0.0150"), Decimal("1"), Decimal("2"), VENDOR_TRIM_CODE),
    MaterialSpec("PRM-PCK-POLYBAG", "Recycled LDPE polybag with suffocation warning", "PACK", "Pcs",
                 Decimal("0.0200"), Decimal("1"), Decimal("2"), VENDOR_PACK_CODE),
    MaterialSpec("PRM-PCK-CARTON", "5-ply export carton 60x40x30 cm (48 pcs)", "PACK", "Pcs",
                 Decimal("1.2000"), Decimal("0.020833"), Decimal("2"), VENDOR_PACK_CODE),
]
FINISHED_GOOD_CODE = "PRM-FG-MTEE01"
FINISHED_GOOD_NAME = "Men's organic cotton crew-neck T-shirt (finished)"
PCS_PER_CARTON = 48

# ---------------------------------------------------------------------------
# Fixed timeline (all in the past so the order shows as fully executed)
# ---------------------------------------------------------------------------
D = {
    "inquiry_received": date(2026, 6, 2),
    "quotation_sent": date(2026, 6, 5),
    "quotation_approved": date(2026, 6, 12),
    "order_confirmed": date(2026, 6, 15),
    "pi_issued": date(2026, 6, 16),
    "bom_approved": date(2026, 6, 18),
    "sales_contract": date(2026, 6, 20),
    "lab_dip_approved": date(2026, 6, 24),
    "po_issued": date(2026, 6, 22),
    "btb_lc_opened": date(2026, 6, 25),
    "fit_sample_approved": date(2026, 7, 2),
    "pp_sample_approved": date(2026, 7, 12),
    "grn_fabric": date(2026, 7, 15),
    "grn_trims": date(2026, 7, 18),
    "grn_packing": date(2026, 7, 20),
    "transfer_to_cutting": date(2026, 7, 21),
    "material_issue": date(2026, 7, 22),
    "cutting_start": date(2026, 7, 23),
    "cutting_end": date(2026, 7, 30),
    "jobwork_sent": date(2026, 7, 28),
    "jobwork_received": date(2026, 8, 5),
    "sewing_start": date(2026, 7, 30),
    "sewing_end": date(2026, 8, 25),
    "finishing_end": date(2026, 8, 30),
    "final_inspection": date(2026, 9, 2),
    "ex_factory": date(2026, 9, 5),
    "vessel_departure": date(2026, 9, 8),
    "docs_submitted": date(2026, 9, 10),
    "buyer_delivery": date(2026, 9, 10),
    "btb_maturity": date(2026, 10, 15),
    "payment_received": date(2026, 10, 23),
}


# ---------------------------------------------------------------------------
# Context + helpers
# ---------------------------------------------------------------------------
@dataclass
class DemoContext:
    tenant: Tenant
    customer: Customer
    notes: list[str] = field(default_factory=list)

    @property
    def tenant_id(self) -> int:
        return self.tenant.id

    def log(self, msg: str) -> None:
        self.notes.append(msg)
        print(f"  - {msg}")


async def load_context(db: AsyncSession) -> DemoContext:
    tenant = (
        await db.execute(select(Tenant).where(Tenant.company_code == COMPANY_CODE))
    ).scalar_one()
    customer = (
        await db.execute(
            select(Customer).where(
                Customer.tenant_id == tenant.id, Customer.customer_code == CUSTOMER_CODE
            )
        )
    ).scalar_one()
    if customer.name != CUSTOMER_NAME:
        raise RuntimeError(f"{CUSTOMER_CODE} is {customer.name!r}, expected {CUSTOMER_NAME!r}")
    return DemoContext(tenant=tenant, customer=customer)


async def find_one(db: AsyncSession, model: Any, **filters: Any) -> Any | None:
    """First row of `model` matching column == value filters (None when missing)."""
    stmt = select(model)
    for col, value in filters.items():
        stmt = stmt.where(getattr(model, col) == value)
    return (await db.execute(stmt.limit(1))).scalars().first()


async def require_one(db: AsyncSession, model: Any, **filters: Any) -> Any:
    row = await find_one(db, model, **filters)
    if row is None:
        raise RuntimeError(
            f"Prerequisite missing: {model.__name__} {filters}. Run the earlier stages first."
        )
    return row


@asynccontextmanager
async def demo_session(dry_run: bool) -> AsyncIterator[AsyncSession]:
    """Normal session, or a dry-run session whose commits become savepoints and are rolled back."""
    if not dry_run:
        async with AsyncSessionLocal() as session:
            yield session
        return
    async with engine.connect() as conn:
        outer = await conn.begin()
        session = AsyncSession(
            bind=conn,
            join_transaction_mode="create_savepoint",
            expire_on_commit=False,
            autoflush=False,
        )
        try:
            yield session
        finally:
            await session.close()
            await outer.rollback()

"""Shared seeds for the Manufacturing Intelligence Phase 3 tests (cost at completion, cash requirement).

Built inside the test transaction only; live data is never touched.
Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_cost_at_completion.py tests/test_mfg_cash_requirement.py tests/test_mfg_finance_gate.py -q"
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from app.models import Quotation, TenantProductionSettings
from app.models.finance import AccountGroup, AccountingPeriod, ChartOfAccount, Voucher, VoucherLine
from app.models.inventory import PurchaseOrder, PurchaseOrderItem
from tests.mfg_alloc_fixtures import add_item, add_vendor
from tests.mfg_intel_fixtures import add_order, new_tenant, seed_basic_factory

MI = "manufacturing_intelligence_v1"
COST = "mfg_cost_intelligence_v1"
CASH = "mfg_financial_readiness_v1"
P3_FLAGS = {MI: True, "planning_math_v2": True, COST: True, CASH: True}


async def p3_tenant(db, *, flags: dict | None = None, permissions: dict | None = None):
    tenant, user, role = await new_tenant(db, flags=P3_FLAGS if flags is None else flags, permissions=permissions)
    tenant.base_currency = "BDT"
    fx = await seed_basic_factory(db, tenant)
    return tenant, user, role, fx


async def add_quotation(
    db, tenant, customer, *, currency="USD", rate: str | None = "110", total="10000", material="6000", cm="2000",
    other="500", projected: int | None = 1000,
) -> Quotation:
    q = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"Q-{uuid.uuid4().hex[:8]}",
        currency=currency,
        exchange_rate=Decimal(rate) if rate is not None else None,
        total_amount=Decimal(total),
        material_cost=Decimal(material),
        manufacturing_cost=Decimal(cm),
        other_cost=Decimal(other),
        projected_quantity=projected,
        status="APPROVED",
    )
    db.add(q)
    await db.flush()
    return q


async def add_quoted_order(db, tenant, fx, quotation, *, qty=500, status="CONFIRMED", delivery: date | None = None, **kw):
    order = await add_order(db, tenant, fx.customer, fx.style, status=status, qty=qty, delivery=delivery)
    order.quotation_id = quotation.id if quotation is not None else None
    for k, v in kw.items():
        setattr(order, k, v)
    await db.flush()
    return order


async def set_planning_config(db, tenant, **cfg) -> None:
    from sqlalchemy import select

    row = (
        await db.execute(select(TenantProductionSettings).where(TenantProductionSettings.tenant_id == tenant.id))
    ).scalar_one()
    merged = dict(row.mfg_planning_config or {})
    merged.update(cfg)
    row.mfg_planning_config = merged
    await db.flush()


async def add_item_simple(db, tenant, code="FAB"):
    from app.models import ItemCategory, ItemUnit

    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{uuid.uuid4().hex[:6]}", name="Fabric")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{uuid.uuid4().hex[:6]}"[:8], name="Mtr")
    db.add_all([cat, unit])
    await db.flush()
    return await add_item(db, tenant, cat, unit, code)


async def add_priced_po(
    db, tenant, vendor, item, *, qty="100", price="10", status="APPROVED", currency="USD", rate: str | None = "110",
    order=None, line_order=None, expected: date | None = None, btb_lc_id: int | None = None,
):
    po = PurchaseOrder(
        tenant_id=tenant.id,
        po_code=f"PO-{uuid.uuid4().hex[:8]}",
        vendor_id=vendor.id,
        supplier_name=vendor.name,
        status=status,
        currency=currency,
        exchange_rate_to_base=Decimal(rate) if rate is not None else None,
        source_order_id=order.id if order is not None else None,
        expected_date=expected,
        btb_lc_id=btb_lc_id,
    )
    db.add(po)
    await db.flush()
    line = PurchaseOrderItem(
        tenant_id=tenant.id,
        purchase_order_id=po.id,
        item_id=item.id,
        quantity=Decimal(qty),
        unit_price=Decimal(price),
        source_order_id=line_order.id if line_order is not None else None,
    )
    db.add(line)
    await db.flush()
    return po, line


async def add_account(db, tenant, *, statement_class: str, nature="Expense", normal="debit", cost_nature=None, opening="0"):
    slug = uuid.uuid4().hex[:8]
    grp = AccountGroup(
        tenant_id=tenant.id, name=f"G-{slug}", code=f"G{slug}"[:12], nature=nature, default_normal_balance=normal,
        allow_posting=True, statement_class=statement_class,
    )
    db.add(grp)
    await db.flush()
    acct = ChartOfAccount(
        tenant_id=tenant.id, account_number=f"A-{slug}", name=f"Acct {slug}", group_id=grp.id, normal_balance=normal,
        balance=Decimal("0"), opening_balance=Decimal(opening), is_active=True, cost_nature=cost_nature,
    )
    db.add(acct)
    await db.flush()
    return acct


async def add_voucher(db, tenant, vdate: date, lines, *, order_id: int | None = None, status="POSTED") -> Voucher:
    """lines: (account, 'DEBIT'|'CREDIT', amount) in base currency."""
    v = Voucher(
        tenant_id=tenant.id, voucher_number=f"JV-{uuid.uuid4().hex[:8]}", voucher_type="JOURNAL", voucher_date=vdate,
        status=status, order_id=order_id,
    )
    db.add(v)
    await db.flush()
    for account, entry, amount in lines:
        db.add(
            VoucherLine(
                tenant_id=tenant.id, voucher_id=v.id, account_id=account.id, entry_type=entry, amount=Decimal(amount),
                base_amount=Decimal(amount), exchange_rate=Decimal("1"),
            )
        )
    await db.flush()
    return v


async def add_closed_periods(db, tenant, months: list[tuple[date, date]], *, closed=True) -> None:
    for start, end in months:
        db.add(AccountingPeriod(tenant_id=tenant.id, period_name=f"P{start:%Y%m}", start_date=start, end_date=end, is_closed=closed))
    await db.flush()


__all__ = [
    "CASH",
    "COST",
    "MI",
    "P3_FLAGS",
    "add_account",
    "add_closed_periods",
    "add_item_simple",
    "add_priced_po",
    "add_quotation",
    "add_quoted_order",
    "add_vendor",
    "add_voucher",
    "p3_tenant",
    "set_planning_config",
]

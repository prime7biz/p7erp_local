"""Seeds for the Finance Control Tower and GL profitability tests (docs/finance-modernization/PLAN.md Phase 3).

Every expected figure is worked out by hand in the test modules, never by the services under test.

`seed_profit_world` (all vouchers in 2027, so the older `seed_world` vouchers never mix in):
  customers  A (orders O1, O2)   B (O3)   C (O4)          style S1 = O1 + O2          master contract MC1 = O1 + O2
  cost centres  CC_LC (owned by MC1)   CC_DEPT (a department, owned by no contract)
  budget (quotation): O1 BDT 10000 / 4000 / 2000 / 500;  O2 USD at 110: 100 / 40 / 20 / 5 -> 11000 / 4400 / 2200 / 550
  actual:
    O1  sales 10000 (Jan 10) | purchases 4000, CM wages 1500, rent 300, bank charge 200 (Feb)
    O2  sales USD 50 = base 5500 | COGS 2000 whose line also carries CC_LC  (order owns it: counted once)
    LC only  700 on CC_LC with a CM override, no order
    unlinked  rent 900 (no links) + rent 100 on CC_DEPT
    O3  rent 600 reversed (the reversal voucher has NO order id, like POST /vouchers/{id}/reverse) + sales 3000
    O4  rent 100 only (zero revenue)
  never counted: draft, cancelled, memorandum, reversed-without-reversal, another tenant's voucher pointing at O1.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from app.models.commercial import MasterContract
from app.models.customer import Customer
from app.models.finance import CostCenter, Voucher, VoucherLine
from app.models.merch import GarmentStyle, Order, Quotation
from tests.finance_statement_fixtures import make_group, make_ledger, seed_world

D = Decimal
CONTROL_FLAG = {"finance_control_tower_v2": True}
YEAR_2027 = {"from_date": "2027-01-01", "to_date": "2027-12-31"}


def uid() -> str:
    return uuid.uuid4().hex[:8]


async def post_v(db, tenant_id: int, vdate: date, lines: list[dict], *, status: str = "POSTED", vtype: str = "JOURNAL", **flags) -> Voucher:
    """lines: dicts with account, entry, amount[, base, cc, nature]."""
    voucher = Voucher(
        tenant_id=tenant_id, voucher_number=f"T-{uid()}{uid()}", voucher_type=vtype, voucher_date=vdate, status=status, **flags
    )
    db.add(voucher)
    await db.flush()
    for ln in lines:
        amount = D(ln["amount"])
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=voucher.id,
                account_id=ln["account"].id,
                entry_type=ln["entry"],
                amount=amount,
                base_amount=D(ln["base"]) if "base" in ln else amount,
                cost_center_id=ln.get("cc"),
                cost_nature_override=ln.get("nature"),
            )
        )
    await db.flush()
    return voucher


def dr(account, amount, **kw) -> dict:
    return {"account": account, "entry": "DEBIT", "amount": amount, **kw}


def cr(account, amount, **kw) -> dict:
    return {"account": account, "entry": "CREDIT", "amount": amount, **kw}


async def make_customer(db, tenant_id: int, name: str) -> Customer:
    c = Customer(tenant_id=tenant_id, customer_code=f"C{uid()}", name=name)
    db.add(c)
    await db.flush()
    return c


async def make_order(db, tenant_id: int, customer, **kw) -> Order:
    o = Order(tenant_id=tenant_id, customer_id=customer.id, order_code=f"O-{uid()}", **kw)
    db.add(o)
    await db.flush()
    return o


async def make_quotation(db, tenant_id: int, customer, **kw) -> Quotation:
    q = Quotation(tenant_id=tenant_id, customer_id=customer.id, quotation_code=f"Q-{uid()}", **kw)
    db.add(q)
    await db.flush()
    return q


async def seed_profit_world(db, *, flags: dict | None = None, role_name: str = "admin", permissions: dict | None = None):
    tenant, user, w = await seed_world(db, flags={**CONTROL_FLAG, **(flags or {})}, role_name=role_name, permissions=permissions)
    t, g, L = tenant.id, w["groups"], w["ledgers"]
    purchase_g = await make_group(db, t, "Purchases", "Expense", "PURCHASE_ACCOUNTS")
    L["purchases"] = await make_ledger(db, t, purchase_g, "Fabric Purchases")
    L["cm_wages"] = await make_ledger(db, t, g["dexp"], "CM Wages")
    L["cm_wages"].cost_nature = "CM"
    L["direct_other"] = await make_ledger(db, t, g["dexp"], "Direct Other")
    L["bank_charge"] = await make_ledger(db, t, g["iexp"], "Bank Charges")
    L["bank_charge"].cost_nature = "NON_OPERATING"
    await db.flush()

    cust_a = await make_customer(db, t, "Buyer A")
    cust_b = await make_customer(db, t, "Buyer B")
    cust_c = await make_customer(db, t, "Buyer C")
    style = GarmentStyle(tenant_id=t, style_code=f"S-{uid()}", name="Polo")
    db.add(style)
    cc_lc = CostCenter(tenant_id=t, center_code=f"CCLC{uid()}", name="LC cost centre")
    cc_dept = CostCenter(tenant_id=t, center_code=f"CCD{uid()}", name="Sewing dept")
    db.add_all([cc_lc, cc_dept])
    await db.flush()
    mc = MasterContract(tenant_id=t, reference=f"MC-{uid()}", cost_center_id=cc_lc.id, buyer_name="Buyer A")
    db.add(mc)
    await db.flush()
    q1 = await make_quotation(
        db, t, cust_a, currency="BDT", total_amount=D("10000"), material_cost=D("4000"),
        manufacturing_cost=D("2000"), other_cost=D("500"),
    )
    q2 = await make_quotation(
        db, t, cust_a, currency="USD", exchange_rate=D("110"), total_amount=D("100"), material_cost=D("40"),
        manufacturing_cost=D("20"), other_cost=D("5"),
    )
    o1 = await make_order(db, t, cust_a, style_id=style.id, master_contract_id=mc.id, quotation_id=q1.id)
    o2 = await make_order(db, t, cust_a, style_id=style.id, master_contract_id=mc.id, quotation_id=q2.id)
    o3 = await make_order(db, t, cust_b)
    o4 = await make_order(db, t, cust_c)
    w.update(
        customers=dict(a=cust_a, b=cust_b, c=cust_c), style=style, mc=mc, cc_lc=cc_lc, cc_dept=cc_dept,
        orders=dict(o1=o1, o2=o2, o3=o3, o4=o4),
    )

    sales, ar, ap, cash, cogs, inv, rent = (L[k] for k in ("sales", "ar", "ap", "cash", "cogs", "inventory", "rent"))
    await post_v(db, t, date(2027, 1, 10), [dr(ar, "10000"), cr(sales, "10000")], order_id=o1.id)
    await post_v(db, t, date(2027, 2, 10), [dr(L["purchases"], "4000"), cr(ap, "4000")], order_id=o1.id)
    await post_v(db, t, date(2027, 2, 12), [dr(L["cm_wages"], "1500"), cr(cash, "1500")], order_id=o1.id)
    await post_v(db, t, date(2027, 2, 14), [dr(rent, "300"), cr(cash, "300")], order_id=o1.id)
    await post_v(db, t, date(2027, 2, 16), [dr(L["bank_charge"], "200"), cr(cash, "200")], order_id=o1.id)
    await post_v(db, t, date(2027, 3, 1), [dr(ar, "50", base="5500"), cr(sales, "50", base="5500")], order_id=o2.id)
    await post_v(db, t, date(2027, 3, 5), [dr(cogs, "2000", cc=cc_lc.id), cr(inv, "2000")], order_id=o2.id)
    await post_v(db, t, date(2027, 3, 6), [dr(L["direct_other"], "700", cc=cc_lc.id, nature="CM"), cr(cash, "700")])
    await post_v(db, t, date(2027, 3, 7), [dr(rent, "900"), dr(rent, "100", cc=cc_dept.id), cr(cash, "1000")])
    original = await post_v(db, t, date(2027, 3, 8), [dr(rent, "600"), cr(cash, "600")], status="REVERSED", order_id=o3.id)
    reversal = await post_v(
        db, t, date(2027, 3, 9), [dr(cash, "600"), cr(rent, "600")], reverses_voucher_id=original.id
    )  # no order_id on purpose
    original.reversed_by_voucher_id = reversal.id
    await post_v(db, t, date(2027, 3, 10), [dr(ar, "3000"), cr(sales, "3000")], order_id=o3.id)
    await post_v(db, t, date(2027, 3, 11), [dr(rent, "100"), cr(cash, "100")], order_id=o4.id)

    # Never counted.
    big = [dr(rent, "99999"), cr(cash, "99999")]
    await post_v(db, t, date(2027, 4, 1), big, status="DRAFT", order_id=o1.id)
    await post_v(db, t, date(2027, 4, 2), big, status="CANCELLED", order_id=o1.id)
    await post_v(db, t, date(2027, 4, 3), big, vtype="MEMORANDUM", is_memorandum=True, order_id=o1.id)
    await post_v(db, t, date(2027, 4, 4), big, status="REVERSED", order_id=o1.id)  # bare flip, no reversal voucher
    await post_v(db, t, date(2027, 4, 5), big, status="DRAFT")
    await db.flush()
    return tenant, user, w


async def seed_foreign_order_noise(db, victim_tenant_w: dict):
    """Another tenant with its own world, plus a voucher that points at the victim's order id (FK allows it)."""
    other, other_user, ow = await seed_world(db, flags=CONTROL_FLAG)
    o1 = victim_tenant_w["orders"]["o1"]
    rent, cash = ow["ledgers"]["rent"], ow["ledgers"]["cash"]
    await post_v(db, other.id, date(2027, 2, 20), [dr(rent, "77777"), cr(cash, "77777")], order_id=o1.id)
    return other, other_user, ow


async def add_bulk_orders(db, tenant_id: int, w: dict, n: int) -> None:
    """n more orders (own customer / style / quotation) each with a sale and a cost voucher in 2027."""
    L = w["ledgers"]
    cust = w["customers"]["a"]
    for i in range(n):
        o = await make_order(db, tenant_id, cust, style_id=w["style"].id, master_contract_id=w["mc"].id)
        await post_v(db, tenant_id, date(2027, 5, 1 + i % 20), [dr(L["ar"], "100"), cr(L["sales"], "100")], order_id=o.id)
        await post_v(db, tenant_id, date(2027, 5, 1 + i % 20), [dr(L["purchases"], "40"), cr(L["ap"], "40")], order_id=o.id)

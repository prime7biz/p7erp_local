"""
Massive RMG test dataset seed for P7 ERP.

Creates (per target tenant): 100 customers, 200+ chart-of-account ledgers, 2000 inventory items,
1000 inquiries, 1000 quotations with costing breakdowns, 1000 sales orders, 90 days of production
activity, and 2000 posted vouchers — using Faker for realistic buyer/fabric terminology.

CLI flags:
  --company-code / --tenant-id   Target tenant (one required).
  --seed                           Faker random seed (reproducible runs).
  --batch-size                     Rows per flush (default 400).
  --i-understand-this-is-dev-data  Required unless company_code contains demo/test (case-insensitive).
  --dry-run                        Only validate tenant and print planned counts (no DB writes).
  --force                          Allow re-run on tenant that already has MG-RMG-* seed rows.

Optional FKs (trade_case_id, btb_lc_id on vouchers): left NULL unless you extend this script with
Trade/Commercial stubs — use --strict-optional-fks is reserved for future use (no-op today).

Run from backend directory:
  python scripts/seed_massive_data.py --company-code YOURCODE --i-understand-this-is-dev-data

Docker (project root; `docker-compose.yml` service `backend` uses DATABASE_URL=...@postgres:5432/...):
  docker compose exec backend python scripts/seed_massive_data.py --company-code YOURCODE --i-understand-this-is-dev-data
  If Faker was added after the image was built: docker compose exec backend pip install -r requirements.txt
  or rebuild: docker compose build backend && docker compose up -d backend
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sys
from calendar import monthrange
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path

from faker import Faker
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

_scripts_dir = Path(__file__).resolve().parent
if str(_scripts_dir) not in sys.path:
    sys.path.insert(0, str(_scripts_dir))

from app.database import AsyncSessionLocal
from app.models import (
    AccountGroup,
    AccountingPeriod,
    ChartOfAccount,
    CoAConfig,
    CostCenter,
    Currency,
    CurrencyExchangeRate,
    Customer,
    CuttingBundle,
    CutTicket,
    DepartmentMachine,
    GarmentStyle,
    HourlyProductionEntry,
    Inquiry,
    InquiryItem,
    Item,
    ItemCategory,
    ItemSubcategory,
    ItemUnit,
    LayPlan,
    MarkerPlan,
    Order,
    ProductionShift,
    Quotation,
    QuotationCostSummary,
    QuotationManufacturing,
    QuotationMaterial,
    QuotationOtherCost,
    QuotationSizeRatio,
    SewingLine,
    SewingLineStyleConfig,
    StockGroup,
    Tenant,
    TenantProductionSettings,
    User,
    Voucher,
    VoucherLine,
    VoucherType,
    Warehouse,
)

from seed_massive_constants import (
    CODE_PREFIX,
    DEPARTMENTS,
    FABRIC_DESCRIPTORS,
    GARMENT_TYPES,
    ITEM_CATEGORY_SEEDS,
    ITEM_NAME_TEMPLATES,
    ITEM_SUBCATEGORY_SEEDS,
    SEASONS,
    SHIPPING_TERMS,
    STOCK_GROUP_CHILDREN,
    STOCK_GROUP_ROOTS,
    UNIT_SEEDS,
    WAREHOUSE_SEEDS,
)

P = f"{CODE_PREFIX}"


def _add_months(d: date, months: int) -> date:
    m0 = d.month - 1 + months
    y = d.year + m0 // 12
    m = m0 % 12 + 1
    last = monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


def _money(v: float | Decimal) -> str:
    return f"{float(v):.4f}"


async def _resolve_tenant(db: AsyncSession, company_code: str | None, tenant_id: int | None) -> Tenant:
    if tenant_id is not None:
        row = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
        if not row:
            raise SystemExit(f"Tenant id {tenant_id} not found.")
        return row
    if company_code:
        row = (
            await db.execute(select(Tenant).where(Tenant.company_code == company_code.strip()))
        ).scalar_one_or_none()
        if not row:
            raise SystemExit(f"Tenant company_code '{company_code}' not found.")
        return row
    raise SystemExit("Provide --company-code or --tenant-id.")


async def _first_user_id(db: AsyncSession, tenant_id: int) -> int | None:
    u = (
        await db.execute(
            select(User).where(User.tenant_id == tenant_id).order_by(User.id.asc()).limit(1)
        )
    ).scalar_one_or_none()
    return u.id if u else None


async def _already_seeded(db: AsyncSession, tenant_id: int) -> bool:
    n = (
        await db.execute(
            select(func.count(Customer.id)).where(
                Customer.tenant_id == tenant_id,
                Customer.customer_code.like(f"{P}-C-%"),
            )
        )
    ).scalar()
    return (n or 0) > 10


def _guard_ok(company_code: str | None, name: str | None, flag: bool) -> bool:
    if flag:
        return True
    blob = f"{company_code or ''} {name or ''}".lower()
    return "demo" in blob or "test" in blob


async def _ensure_voucher_types(db: AsyncSession, tenant_id: int) -> None:
    for code, name in [
        ("JOURNAL", "Journal"),
        ("PAYMENT", "Payment"),
        ("RECEIPT", "Receipt"),
        ("CONTRA", "Contra"),
    ]:
        code = code.upper()
        row = (
            await db.execute(
                select(VoucherType).where(VoucherType.tenant_id == tenant_id, VoucherType.code == code)
            )
        ).scalar_one_or_none()
        if row:
            row.name = name
            row.is_active = True
            continue
        db.add(VoucherType(tenant_id=tenant_id, code=code, name=name, is_active=True, is_system=True))
    await db.flush()


async def _ensure_currencies(db: AsyncSession, tenant_id: int) -> None:
    for code, name in [("BDT", "Bangladeshi Taka"), ("USD", "US Dollar"), ("EUR", "Euro")]:
        row = (await db.execute(select(Currency).where(Currency.code == code))).scalar_one_or_none()
        if not row:
            db.add(Currency(code=code, name=name, is_active=True))
    await db.flush()
    today = date.today()
    for pair in [("USD", "BDT", "118.50"), ("EUR", "BDT", "128.00"), ("BDT", "USD", "0.00847")]:
        fc, tc, rate = pair
        ex = (
            await db.execute(
                select(CurrencyExchangeRate).where(
                    CurrencyExchangeRate.tenant_id == tenant_id,
                    CurrencyExchangeRate.from_currency == fc,
                    CurrencyExchangeRate.to_currency == tc,
                    CurrencyExchangeRate.effective_date == today,
                )
            )
        ).scalar_one_or_none()
        if not ex:
            db.add(
                CurrencyExchangeRate(
                    tenant_id=tenant_id,
                    from_currency=fc,
                    to_currency=tc,
                    exchange_rate=rate,
                    effective_date=today,
                    source="seed_massive",
                    is_active=True,
                )
            )
    await db.flush()


def _build_account_groups(tenant_id: int, review: date) -> list[AccountGroup]:
    specs = [
        ("MG-A", "Assets", "Asset", "debit", 1, False, False),
        ("MG-L", "Liabilities", "Liability", "credit", 2, False, False),
        ("MG-Q", "Equity", "Equity", "credit", 3, False, False),
        ("MG-R", "Revenue", "Income", "credit", 4, False, False),
        ("MG-C", "Cost of Sales", "Expense", "debit", 5, True, False),
        ("MG-X", "Operating Expenses", "Expense", "debit", 6, False, False),
    ]
    out: list[AccountGroup] = []
    for code, name, nature, dnb, so, agp, ibg in specs:
        out.append(
            AccountGroup(
                tenant_id=tenant_id,
                code=f"{P}-{code}",
                name=name,
                nature=nature,
                parent_group_id=None,
                affects_gross_profit=agp,
                is_bank_group=ibg,
                sort_order=so,
                is_active=True,
                description=f"{P} seed: {name} group",
                reporting_code=f"RPT-{code}",
                default_normal_balance=dnb,
                allow_posting=True,
                is_summary_group=False,
                last_reviewed_at=review,
            )
        )
    return out


def _coa_specs() -> list[tuple[str, str, int, str, str]]:
    """name, account_number_suffix, group_index 0-5, normal_balance, kind hint."""
    rows: list[tuple[str, str, int, str, str]] = []
    # group 0 Assets ~45
    for i in range(45):
        rows.append((f"RMG Asset Ledger {i+1:03d}", f"{5000+i:04d}", 0, "debit", "asset"))
    # group 1 Liab ~35
    for i in range(35):
        rows.append((f"RMG Liability Ledger {i+1:03d}", f"{6000+i:04d}", 1, "credit", "liab"))
    # group 2 Equity ~15
    for i in range(15):
        rows.append((f"RMG Equity Ledger {i+1:03d}", f"{7000+i:04d}", 2, "credit", "eq"))
    # group 3 Revenue ~30
    for i in range(30):
        rows.append((f"RMG Revenue Ledger {i+1:03d}", f"{8000+i:04d}", 3, "credit", "rev"))
    # group 4 COGS ~35
    for i in range(35):
        rows.append((f"RMG COGS Ledger {i+1:03d}", f"{9000+i:04d}", 4, "debit", "cogs"))
    # group 5 Opex ~40
    for i in range(40):
        rows.append((f"RMG Opex Ledger {i+1:03d}", f"{10000+i:05d}", 5, "debit", "opex"))
    return rows[:200]


async def seed_coa(
    db: AsyncSession, tenant_id: int, review_date: date
) -> tuple[list[AccountGroup], list[ChartOfAccount]]:
    groups = _build_account_groups(tenant_id, review_date)
    for g in groups:
        db.add(g)
    await db.flush()
    glist = list(groups)
    specs = _coa_specs()
    coa_rows: list[ChartOfAccount] = []
    for name, num, gi, nb, _kind in specs:
        grp = glist[gi]
        acc = ChartOfAccount(
            tenant_id=tenant_id,
            account_number=f"{P}-AC-{num}",
            name=name,
            group_id=grp.id,
            normal_balance=nb,
            opening_balance="0",
            balance="0",
            account_currency="BDT",
            maintain_fc_balance=False,
            description=f"{P} synthetic COA line for load testing",
            is_active=True,
            is_bank_account=("Bank" in name or num.endswith("001")),
            account_type="posting",
            reporting_code=f"COA-{num}",
            display_order=len(coa_rows),
            statistical_unit="pcs",
            statistical_formula=None,
            parent_account_id=None,
            last_reviewed_at=review_date,
            enable_bill_wise=False,
        )
        db.add(acc)
        coa_rows.append(acc)
    await db.flush()

    stock_like = next((a for a in coa_rows if "Asset Ledger 001" in a.name), coa_rows[0])
    clear_like = next((a for a in coa_rows if "Asset Ledger 002" in a.name), coa_rows[1])
    cfg = (
        await db.execute(select(CoAConfig).where(CoAConfig.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if not cfg:
        cfg = CoAConfig(
            tenant_id=tenant_id,
            account_number_prefix=f"{P}-AC-",
            account_number_width=5,
            group_code_prefix=f"{P}-GRP-",
            group_code_width=4,
            allow_manual_account_number=True,
            max_group_depth=6,
            max_account_depth=4,
            validate_normal_balance=True,
            inventory_stock_account_id=stock_like.id,
            inventory_clearing_account_id=clear_like.id,
        )
        db.add(cfg)
    else:
        cfg.inventory_stock_account_id = stock_like.id
        cfg.inventory_clearing_account_id = clear_like.id
    await db.flush()
    return glist, coa_rows


async def seed_cost_centers(db: AsyncSession, tenant_id: int) -> list[CostCenter]:
    specs = [
        ("MG-CC-CUT", "Cutting", "Cutting"),
        ("MG-CC-SEW", "Sewing", "Sewing"),
        ("MG-CC-FIN", "Finishing", "Finishing"),
        ("MG-CC-QC", "Quality", "QC"),
        ("MG-CC-ADM", "Administration", "Admin"),
        ("MG-CC-MER", "Merchandising", "Merch"),
        ("MG-CC-STORE", "Stores", "Warehouse"),
        ("MG-CC-UTIL", "Utilities", "Maintenance"),
    ]
    out: list[CostCenter] = []
    for code, name, dept in specs:
        row = (
            await db.execute(
                select(CostCenter).where(CostCenter.tenant_id == tenant_id, CostCenter.center_code == code)
            )
        ).scalar_one_or_none()
        if row:
            out.append(row)
            continue
        row = CostCenter(tenant_id=tenant_id, center_code=code, name=name, department=dept, is_active=True)
        db.add(row)
        out.append(row)
    await db.flush()
    return out


async def seed_accounting_periods(db: AsyncSession, tenant_id: int, today: date) -> None:
    for off in range(-3, 4):
        start = _add_months(today.replace(day=1), off)
        y, m = start.year, start.month
        end = date(y, m, monthrange(y, m)[1])
        name = f"{P}-FY{y}-{m:02d}"
        row = (
            await db.execute(
                select(AccountingPeriod).where(
                    AccountingPeriod.tenant_id == tenant_id, AccountingPeriod.period_name == name
                )
            )
        ).scalar_one_or_none()
        if row:
            continue
        db.add(
            AccountingPeriod(
                tenant_id=tenant_id,
                period_name=name,
                start_date=start,
                end_date=end,
                is_closed=False,
            )
        )
    await db.flush()


def _fill_customer(tenant_id: int, seq: int, fk: Faker) -> Customer:
    city = fk.city()
    country = fk.country()
    return Customer(
        tenant_id=tenant_id,
        customer_code=f"{P}-C-{seq:04d}",
        name=fk.company()[:250],
        address=fk.address().replace("\n", ", ")[:500],
        country=country,
        email=fk.company_email()[:255],
        phone=fk.phone_number()[:64],
        website=f"https://www.{fk.domain_name()}"[:255],
        legal_entity_name=fk.company()[:255],
        trade_name=fk.catch_phrase()[:255],
        tax_id_vat_number=fk.bothify(text="??########"),
        customer_type=random.choice(["buyer", "buying_house", "retail_brand", "distributor"]),
        status="active",
        primary_contact_name=fk.name()[:255],
        designation=random.choice(["Merchandiser", "Buyer", "Sourcing Manager", "QA Manager"])[:128],
        contact_email=fk.email()[:255],
        contact_phone=fk.phone_number()[:64],
        phone_country_code="+1" if "United States" in country else "+44",
        subscribe_newsletter=False,
        company_logo_url=f"https://cdn.example.com/logos/{seq}.png"[:512],
        billing_address_line1=fk.street_address()[:255],
        billing_city=city[:128],
        billing_postal_code=fk.postcode()[:32],
        billing_country=country[:64],
        shipping_address_line1=fk.street_address()[:255],
        shipping_city=fk.city()[:128],
        shipping_postal_code=fk.postcode()[:32],
        shipping_country=fk.country()[:64],
        same_as_billing=False,
    )


def _fill_style(tenant_id: int, seq: int, buyer_id: int | None, fk: Faker) -> GarmentStyle:
    gtype = random.choice(GARMENT_TYPES)
    fab = random.choice(FABRIC_DESCRIPTORS)
    return GarmentStyle(
        tenant_id=tenant_id,
        style_code=f"{P}-ST-{seq:06d}",
        name=f"{gtype} — {fab}",
        buyer_customer_id=buyer_id,
        season=random.choice(SEASONS),
        department=random.choice(DEPARTMENTS),
        product_type=gtype,
        fabric_type=fab,
        gsm=str(random.randint(140, 320)),
        fit_type=random.choice(["Regular", "Slim", "Relaxed", "Athletic"]),
        wash_type=random.choice(["Garment dye", "Enzyme", "Bio polish", "Pigment", "Raw"]),
        brand=fk.company()[:100],
        buyer_style_ref=fk.bothify(text="BY-####-???").upper(),
        hs_code=f"{random.randint(61, 63)}{random.randint(10, 15)}{random.randint(10, 99)}",
        uom="pcs",
        target_fob=_money(random.uniform(3.5, 14.5)),
        currency=random.choice(["USD", "EUR", "GBP"]),
        sample_lead_days=random.randint(10, 25),
        production_lead_days=random.randint(45, 120),
        is_active_for_new_orders=True,
        lifecycle_stage=random.choice(["INQUIRY", "DEVELOPMENT", "BULK", "SAMPLING", "EOL"]),
        priority=random.choice(["A", "B", "C"]),
        risk_level=random.choice(["LOW", "MEDIUM", "HIGH"]),
        style_image_url=f"https://cdn.example.com/styles/{seq}.jpg"[:512],
        status="ACTIVE",
        notes=f"Development notes: {fk.sentence()}"[:2000],
    )


async def seed_customers_and_styles(
    db: AsyncSession, tenant_id: int, fk: Faker, n_cust: int, n_styles: int
) -> tuple[list[Customer], list[GarmentStyle]]:
    customers: list[Customer] = []
    for i in range(n_cust):
        customers.append(_fill_customer(tenant_id, i + 1, fk))
    for c in customers:
        db.add(c)
    await db.flush()
    styles: list[GarmentStyle] = []
    for i in range(n_styles):
        buyer = random.choice(customers)
        styles.append(_fill_style(tenant_id, i + 1, buyer.id, fk))
    for s in styles:
        db.add(s)
    await db.flush()
    return customers, styles


async def seed_inventory_base(
    db: AsyncSession, tenant_id: int, fk: Faker, coa_list: list[ChartOfAccount]
) -> tuple[dict[str, ItemCategory], dict[str, ItemSubcategory], dict[str, ItemUnit], dict[str, Warehouse], dict[str, StockGroup], list[Item]]:
    cat_map: dict[str, ItemCategory] = {}
    for code, name, desc in ITEM_CATEGORY_SEEDS:
        c = ItemCategory(
            tenant_id=tenant_id,
            category_code=f"{P}-{code}",
            name=name,
            description=desc,
            is_active=True,
        )
        db.add(c)
        await db.flush()
        cat_map[code] = c

    sub_map: dict[str, ItemSubcategory] = {}
    for cat_code, sub_code, sub_name in ITEM_SUBCATEGORY_SEEDS:
        cat = cat_map.get(cat_code)
        if not cat:
            continue
        s = ItemSubcategory(
            tenant_id=tenant_id,
            category_id=cat.id,
            subcategory_code=f"{P}-{sub_code}",
            name=sub_name,
            description=f"{P} {sub_name}",
            is_active=True,
        )
        db.add(s)
        await db.flush()
        sub_map[sub_code] = s

    unit_map: dict[str, ItemUnit] = {}
    for ucode, uname in UNIT_SEEDS:
        u = ItemUnit(tenant_id=tenant_id, unit_code=f"{P}-{ucode}", name=uname, description=f"{P} unit", is_active=True)
        db.add(u)
        await db.flush()
        unit_map[ucode] = u

    wh_map: dict[str, Warehouse] = {}
    for wcode, wname, addr in WAREHOUSE_SEEDS:
        w = Warehouse(tenant_id=tenant_id, warehouse_code=f"{P}-{wcode}", name=wname, address=addr, is_active=True)
        db.add(w)
        await db.flush()
        wh_map[wcode] = w

    inv_acc = coa_list[0].id
    wip_acc = coa_list[3].id if len(coa_list) > 3 else coa_list[0].id
    cogs_acc = coa_list[150].id if len(coa_list) > 150 else coa_list[0].id
    adj_acc = coa_list[151].id if len(coa_list) > 151 else coa_list[0].id
    grni_acc = coa_list[152].id if len(coa_list) > 152 else coa_list[0].id

    sg_roots: dict[str, StockGroup] = {}
    for code, name in STOCK_GROUP_ROOTS:
        g = StockGroup(
            tenant_id=tenant_id,
            group_code=f"{P}-{code}",
            name=name,
            parent_id=None,
            is_active=True,
            inventory_account_id=inv_acc,
            wip_account_id=wip_acc,
            cogs_account_id=cogs_acc,
            adjustment_account_id=adj_acc,
            grni_account_id=grni_acc,
        )
        db.add(g)
        await db.flush()
        sg_roots[code] = g

    sg_map: dict[str, StockGroup] = dict(sg_roots)
    for code, name, parent_code in STOCK_GROUP_CHILDREN:
        parent = sg_roots.get(parent_code)
        if not parent:
            continue
        g = StockGroup(
            tenant_id=tenant_id,
            group_code=f"{P}-{code}",
            name=name,
            parent_id=parent.id,
            is_active=True,
            inventory_account_id=inv_acc,
            wip_account_id=wip_acc,
            cogs_account_id=cogs_acc,
            adjustment_account_id=adj_acc,
            grni_account_id=grni_acc,
        )
        db.add(g)
        await db.flush()
        sg_map[code] = g

    items: list[Item] = []
    templates = ITEM_NAME_TEMPLATES
    for i in range(2000):
        tpl = templates[i % len(templates)]
        cat_code, sub_code, ucode, fmt = tpl
        cat = cat_map.get(cat_code) or next(iter(cat_map.values()))
        sub = sub_map.get(sub_code) if sub_code else None
        unit = unit_map.get(ucode) or next(iter(unit_map.values()))
        ctx = {
            "fabric": random.choice(FABRIC_DESCRIPTORS),
            "color": fk.color_name(),
            "lot": fk.bothify(text="L###??"),
            "size": random.choice(["3", "4", "5", "8", "10"]),
            "metal": random.choice(["nickel", "brass", "gunmetal"]),
            "buyer": fk.company()[:20],
            "season": random.choice(SEASONS),
            "width": random.choice([28, 32, 36, 40]),
            "height": random.choice([40, 45, 50]),
            "mu": random.choice([60, 80, 100]),
            "ply": random.choice([3, 5, 7]),
            "tex": random.choice([24, 40, 60, 80]),
            "cone": random.choice(["3000m", "5000m", "8000m"]),
            "shade": fk.bothify(text="D-###"),
            "class_": random.choice(["reactive", "disperse", "pigment"]),
            "batch": fk.bothify(text="B####"),
            "fiber": random.choice(["cotton", "polyester", "viscose"]),
            "ne": random.choice([20, 24, 30, 34]),
            "finish": random.choice(["matte", "gloss", "tumbled"]),
            "dia": random.choice([16, 18, 20, 22]),
            "weight": random.choice([80, 100, 120]),
        }
        try:
            name = fmt.format(**ctx)
        except Exception:
            name = f"{cat.name} item {i+1} — {fk.word()}"
        item_code = f"{P}-I-{i+1:05d}"
        wh = random.choice(list(wh_map.values()))
        sg = random.choice(list(sg_map.values()))
        cost = _money(random.uniform(0.05, 45.0))
        items.append(
            Item(
                tenant_id=tenant_id,
                item_code=item_code,
                name=name[:255],
                description=fk.sentence()[:500],
                category_id=cat.id,
                subcategory_id=sub.id if sub else None,
                unit_id=unit.id,
                default_warehouse_id=wh.id,
                stock_group_id=sg.id,
                default_cost=cost,
                is_active=True,
            )
        )
    for it in items:
        db.add(it)
    await db.flush()
    return cat_map, sub_map, unit_map, wh_map, sg_map, items


def _pick_inquiry_status(fk: Faker) -> str:
    r = random.random()
    acc = 0.0
    for st, w in [
        ("DRAFT", 0.12),
        ("LOST", 0.08),
        ("PENDING_REVIEW", 0.10),
        ("QUOTED", 0.25),
        ("WON", 0.35),
        ("CLOSED", 0.10),
    ]:
        acc += w
        if r <= acc:
            return st
    return "QUOTED"


async def seed_merch_pipeline(
    db: AsyncSession,
    tenant_id: int,
    fk: Faker,
    customers: list[Customer],
    styles: list[GarmentStyle],
    items: list[Item],
    categories: dict[str, ItemCategory],
) -> tuple[list[Inquiry], list[Quotation], list[Order]]:
    inquiries: list[Inquiry] = []
    for i in range(1000):
        cust = random.choice(customers)
        st = random.choice(styles)
        status = _pick_inquiry_status(fk)
        inq = Inquiry(
            tenant_id=tenant_id,
            customer_id=cust.id,
            inquiry_code=f"{P}-INQ-{i+1:05d}",
            style_ref=st.style_code,
            style_id=st.id,
            season=st.season,
            department=st.department,
            quantity=random.randint(500, 25000),
            target_price=_money(random.uniform(4.0, 18.0)),
            target_price_currency=st.currency or "USD",
            currency=st.currency or "USD",
            exchange_rate="1.0" if (st.currency or "USD") == "USD" else "1.15",
            expected_delivery_date=date.today() + timedelta(days=random.randint(30, 200)),
            shipping_term=random.choice(SHIPPING_TERMS),
            commission_mode=random.choice(["INCLUDE", "EXCLUDE"]),
            commission_type=random.choice(["pct", "flat"]),
            commission_value=Decimal(str(round(random.uniform(0.5, 5.0), 2))),
            status=status,
            notes=f"Inquiry notes: {fk.paragraph()}"[:5000],
        )
        inquiries.append(inq)
        db.add(inq)
    await db.flush()

    for idx, inq in enumerate(inquiries):
        n_lines = random.randint(1, 3)
        for ln in range(n_lines):
            db.add(
                InquiryItem(
                    tenant_id=tenant_id,
                    inquiry_id=inq.id,
                    item_name=f"Line {ln+1}: {random.choice(GARMENT_TYPES)}",
                    description=fk.text()[:800],
                    quantity=random.randint(100, 5000),
                    sort_order=ln + 1,
                )
            )
    await db.flush()

    quotations: list[Quotation] = []
    linked_inq_indices = list(range(850))
    random.shuffle(linked_inq_indices)
    for qn in range(1000):
        cust = random.choice(customers)
        st = random.choice(styles)
        if qn < 850:
            inq = inquiries[linked_inq_indices[qn]]
        else:
            inq = None
        q = Quotation(
            tenant_id=tenant_id,
            customer_id=cust.id,
            inquiry_id=inq.id if inq else None,
            quotation_code=f"{P}-QT-{qn+1:05d}",
            style_ref=st.style_code,
            style_id=st.id,
            department=st.department,
            projected_quantity=random.randint(800, 20000),
            projected_delivery_date=date.today() + timedelta(days=random.randint(20, 180)),
            quotation_date=date.today() - timedelta(days=random.randint(1, 60)),
            target_price=_money(random.uniform(4.5, 20)),
            target_price_currency=st.currency or "USD",
            exchange_rate="1",
            material_cost="0",
            manufacturing_cost="0",
            other_cost="0",
            total_cost="0",
            cost_per_piece="0",
            profit_percentage="0",
            quoted_price="0",
            shipping_term=random.choice(SHIPPING_TERMS),
            commission_mode=random.choice(["INCLUDE", "EXCLUDE"]),
            commission_type="pct",
            commission_value=Decimal(str(round(random.uniform(1.0, 6.0), 2))),
            currency=st.currency or "USD",
            total_amount="0",
            status=random.choice(["SENT", "ACCEPTED", "REVISED", "DRAFT"]),
            version_no=1,
            valid_until=date.today() + timedelta(days=random.randint(15, 90)),
            size_ratio_enabled=random.choice([True, False]),
            pack_ratio="1:2:2:1",
            pcs_per_carton=random.choice([24, 36, 48]),
            notes=f"Quotation notes: {fk.sentence()}"[:5000],
        )
        quotations.append(q)
        db.add(q)
    await db.flush()

    fab_cat = categories.get("MG-FAB") or next(iter(categories.values()))
    for q in quotations:
        mat_total = 0.0
        for sn, _ in enumerate(range(random.randint(2, 5)), start=1):
            it = random.choice(items)
            cons = round(random.uniform(1.0, 8.0), 2)
            price = round(random.uniform(0.2, 6.0), 2)
            amt = cons * price * 12
            mat_total += amt
            db.add(
                QuotationMaterial(
                    tenant_id=tenant_id,
                    quotation_id=q.id,
                    serial_no=sn,
                    category_id=fab_cat.id,
                    item_id=it.id,
                    description=f"{it.name[:120]}",
                    unit=random.choice(["kg", "yds", "m", "pcs"]),
                    consumption_per_dozen=_money(cons),
                    unit_price=_money(price),
                    amount_per_dozen=_money(amt),
                    total_amount=_money(amt * 5),
                    currency=q.currency or "USD",
                    exchange_rate="1",
                    base_amount=_money(amt * 5 * 1.1),
                    local_amount=_money(amt * 5 * 110),
                )
            )
        cm = round(random.uniform(1.5, 4.5), 2)
        db.add(
            QuotationManufacturing(
                tenant_id=tenant_id,
                quotation_id=q.id,
                serial_no=1,
                style_part="Sewing CM",
                machines_required=random.randint(20, 45),
                production_per_hour=_money(random.uniform(80, 220)),
                production_per_day=_money(random.uniform(800, 2200)),
                cost_per_machine=_money(random.uniform(0.8, 2.5)),
                total_line_cost=_money(cm * 5000),
                cost_per_dozen=_money(cm * 12),
                cm_per_piece=_money(cm / 12),
                total_order_cost=_money(cm * 5000),
                currency=q.currency or "USD",
                exchange_rate="1",
                base_amount=_money(cm * 5000 * 1.1),
                local_amount=_money(cm * 5000 * 110),
            )
        )
        db.add(
            QuotationOtherCost(
                tenant_id=tenant_id,
                quotation_id=q.id,
                serial_no=1,
                cost_head="Freight & forwarding",
                percentage="2.5",
                total_amount=_money(1200),
                cost_type="percent",
                value="2.5",
                based_on="subtotal",
                calculated_amount=_money(800),
                notes="Sea freight estimate",
                currency=q.currency or "USD",
                exchange_rate="1",
                base_amount=_money(900),
                local_amount=_money(99000),
            )
        )
        for sn, sz in enumerate(["XS", "S", "M", "L", "XL"], start=1):
            db.add(
                QuotationSizeRatio(
                    tenant_id=tenant_id,
                    quotation_id=q.id,
                    serial_no=sn,
                    size=sz,
                    ratio_percentage=_money(random.uniform(8, 28)),
                    fabric_factor="1.0",
                    quantity=random.randint(100, 4000),
                )
            )
        subtotal = mat_total + 5000
        for cat_name, pct in [("Materials", 0.55), ("CM & overhead", 0.28), ("Logistics", 0.12)]:
            db.add(
                QuotationCostSummary(
                    tenant_id=tenant_id,
                    quotation_id=q.id,
                    category_name=cat_name,
                    total_cost=_money(subtotal * pct),
                    percentage_of_total=_money(pct * 100),
                )
            )
        q.material_cost = _money(mat_total)
        q.manufacturing_cost = _money(cm * 5000)
        q.other_cost = _money(800)
        q.total_cost = _money(mat_total + cm * 5000 + 800)
        q.cost_per_piece = _money((mat_total + cm * 5000 + 800) / max(q.projected_quantity or 1, 1))
        q.profit_percentage = _money(random.uniform(8, 18))
        q.quoted_price = _money(float(q.cost_per_piece or "0") * 1.12)
        q.total_amount = _money(float(q.quoted_price or "0") * (q.projected_quantity or 1000))

    await db.flush()

    orders: list[Order] = []
    today = date.today()
    for on, q in enumerate(quotations):
        past = on % 2 == 0
        if past:
            od = today - timedelta(days=random.randint(5, 85))
            dd = today - timedelta(days=random.randint(1, 30))
        else:
            od = today - timedelta(days=random.randint(1, 30))
            dd = today + timedelta(days=random.randint(15, 90))
        o = Order(
            tenant_id=tenant_id,
            customer_id=q.customer_id,
            quotation_id=q.id,
            order_code=f"{P}-SO-{on+1:05d}",
            style_ref=q.style_ref,
            shipping_term=q.shipping_term,
            commission_mode=q.commission_mode,
            commission_type=q.commission_type,
            commission_value=q.commission_value,
            order_date=od,
            delivery_date=dd,
            quantity=q.projected_quantity,
            status=random.choice(["CONFIRMED", "IN_PRODUCTION", "SHIPPED", "PARTIALLY_SHIPPED"]),
            remarks=f"Order remarks: {fk.sentence()}"[:5000],
        )
        orders.append(o)
        db.add(o)
    await db.flush()
    return inquiries, quotations, orders


async def seed_production(
    db: AsyncSession,
    tenant_id: int,
    fk: Faker,
    user_id: int | None,
    orders: list[Order],
    styles: list[GarmentStyle],
    inv_items: list[Item],
    batch_size: int,
) -> tuple[int, int]:
    tps = (
        await db.execute(select(TenantProductionSettings).where(TenantProductionSettings.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if not tps:
        db.add(
            TenantProductionSettings(
                tenant_id=tenant_id,
                enabled_optional_units=[],
                weekend_days=[4, 5],
                cm_alert_threshold_pct=Decimal("10.0"),
            )
        )
        await db.flush()

    shifts: list[ProductionShift] = []
    for code, name, st, et, br in [
        ("MG-S1", "Morning", time(8, 0), time(12, 30), 30),
        ("MG-S2", "Afternoon", time(13, 0), time(17, 30), 30),
    ]:
        row = (
            await db.execute(
                select(ProductionShift).where(
                    ProductionShift.tenant_id == tenant_id, ProductionShift.shift_code == code
                )
            )
        ).scalar_one_or_none()
        if not row:
            row = ProductionShift(
                tenant_id=tenant_id,
                shift_code=code,
                name=name,
                start_time=st,
                end_time=et,
                break_minutes=br,
                is_active=True,
            )
            db.add(row)
            await db.flush()
        shifts.append(row)

    machines: list[DepartmentMachine] = []
    for dt, prefix in [("cutting", "CUT"), ("sewing", "SEW"), ("finishing", "FIN")]:
        for i in range(3):
            code = f"{P}-{prefix}-M{i+1:02d}"
            row = (
                await db.execute(
                    select(DepartmentMachine).where(
                        DepartmentMachine.tenant_id == tenant_id, DepartmentMachine.machine_code == code
                    )
                )
            ).scalar_one_or_none()
            if not row:
                row = DepartmentMachine(
                    tenant_id=tenant_id,
                    department_type=dt,
                    machine_code=code,
                    name=f"{dt.title()} machine {i+1}",
                    machine_type=random.choice(["auto", "semi-auto", "manual"]),
                    specs={"vendor": fk.company(), "year": random.randint(2018, 2025)},
                    status="active",
                    is_active=True,
                )
                db.add(row)
                await db.flush()
            machines.append(row)

    lines: list[SewingLine] = []
    for i in range(6):
        code = f"{P}-L{i+1:02d}"
        row = (
            await db.execute(
                select(SewingLine).where(SewingLine.tenant_id == tenant_id, SewingLine.line_code == code)
            )
        ).scalar_one_or_none()
        if not row:
            row = SewingLine(
                tenant_id=tenant_id,
                line_code=code,
                name=f"Sewing Line {i+1}",
                default_machine_count=random.randint(25, 45),
                running_machine_count=random.randint(20, 40),
                default_operator_count=random.randint(25, 40),
                default_helper_count=random.randint(4, 12),
                supervisor_user_id=user_id,
                is_active=True,
            )
            db.add(row)
            await db.flush()
        lines.append(row)

    style_by_code = {s.style_code: s for s in styles}
    n_cfg = 0
    for o in orders[:400]:
        st = style_by_code.get(o.style_ref or "")
        if not st:
            st = random.choice(styles)
        line = random.choice(lines)
        shift = shifts[0]
        cfg = SewingLineStyleConfig(
            tenant_id=tenant_id,
            line_id=line.id,
            order_id=o.id,
            style_id=st.id,
            ob_id=None,
            machine_count=line.default_machine_count,
            operator_count=line.default_operator_count,
            helper_count=line.default_helper_count,
            target_efficiency_pct=Decimal(str(round(random.uniform(62, 82), 2))),
            shift_id=shift.id,
            start_date=o.order_date or date.today(),
            planned_end_date=o.delivery_date,
            actual_end_date=None if random.random() > 0.3 else o.delivery_date,
            status=random.choice(["planned", "running", "completed"]),
            planned_qty=Decimal(str(o.quantity or 1000)),
            completed_qty=Decimal(str(int((o.quantity or 1000) * random.uniform(0.2, 0.95)))),
            sort_order=0,
        )
        db.add(cfg)
        n_cfg += 1
        if n_cfg % batch_size == 0:
            await db.flush()
    await db.flush()

    cut_m = [m for m in machines if m.department_type == "cutting"]
    sew_m = [m for m in machines if m.department_type == "sewing"]
    fin_m = [m for m in machines if m.department_type == "finishing"]

    hourly_count = 0
    today = date.today()
    for day_off in range(90):
        d = today - timedelta(days=day_off)
        day_orders = random.sample(orders, k=min(len(orders), random.randint(8, 18)))
        for o in day_orders:
            st = style_by_code.get(o.style_ref or "") or random.choice(styles)
            line = random.choice(lines)
            shift = random.choice(shifts)
            for dept, mlist, slot_base in [
                ("cutting", cut_m, 1),
                ("sewing", sew_m, 2),
                ("finishing", fin_m, 3),
            ]:
                mach = random.choice(mlist)
                target = random.uniform(80, 450)
                good = target * random.uniform(0.85, 0.98)
                db.add(
                    HourlyProductionEntry(
                        tenant_id=tenant_id,
                        department_type=dept,
                        line_id=line.id if dept == "sewing" else None,
                        machine_id=mach.id,
                        line_style_config_id=None,
                        order_id=o.id,
                        style_id=st.id,
                        shift_id=shift.id,
                        production_date=d,
                        hour_slot=slot_base + random.randint(0, 3),
                        target_qty=Decimal(str(round(target, 3))),
                        good_qty=Decimal(str(round(good, 3))),
                        reject_qty=Decimal(str(round(target - good, 3))),
                        rework_qty=Decimal(str(round(random.uniform(0, 15), 3))),
                        input_qty=Decimal(str(round(target * 1.02, 3))),
                        output_qty=Decimal(str(round(good, 3))),
                        uom="pcs",
                        remarks=f"{dept} output — {fk.sentence()}"[:500],
                        entered_by_user_id=user_id,
                    )
                )
                hourly_count += 1
                if hourly_count % batch_size == 0:
                    await db.flush()

    await db.flush()

    bundle_count = 0
    for day_off in range(0, 90, 3):
        d = today - timedelta(days=day_off)
        o = random.choice(orders)
        st = style_by_code.get(o.style_ref or "") or random.choice(styles)
        mp = MarkerPlan(
            tenant_id=tenant_id,
            order_id=o.id,
            style_id=st.id,
            marker_code=f"{P}-MK-{bundle_count:06d}",
            cad_reference=f"CAD-{fk.bothify(text='####')}",
            marker_length=Decimal(str(round(random.uniform(12, 42), 2))),
            marker_width=Decimal(str(round(random.uniform(1.4, 1.9), 2))),
            marker_efficiency_pct=Decimal(str(round(random.uniform(78, 92), 2))),
            fabric_consumption_per_pcs=Decimal(str(round(random.uniform(1.1, 2.8), 3))),
            sizes_included=["XS", "S", "M", "L", "XL"],
            size_ratio={"S": 0.2, "M": 0.35, "L": 0.25, "XL": 0.2},
            pcs_per_marker=random.randint(24, 96),
            status=random.choice(["approved", "cutting", "closed"]),
            notes=f"Marker plan {fk.sentence()}"[:2000],
        )
        db.add(mp)
        await db.flush()
        it = random.choice(inv_items)
        lp = LayPlan(
            tenant_id=tenant_id,
            marker_plan_id=mp.id,
            lay_code=f"{P}-LAY-{bundle_count:06d}",
            fabric_item_id=it.id,
            fabric_lot_no=fk.bothify(text="LOT-####-??"),
            num_plies=random.randint(20, 80),
            lay_length=Decimal(str(round(random.uniform(8, 28), 2))),
            total_fabric_used=Decimal(str(round(random.uniform(40, 220), 2))),
            planned_pcs=random.randint(200, 5000),
            status=random.choice(["planned", "cutting", "completed"]),
        )
        db.add(lp)
        await db.flush()
        ct = CutTicket(
            tenant_id=tenant_id,
            lay_plan_id=lp.id,
            ticket_code=f"{P}-CT-{bundle_count:06d}",
            cut_date=d,
            cutter_user_id=user_id,
            total_pcs_cut=random.randint(150, 4800),
            status=random.choice(["pending", "cut", "bundled"]),
        )
        db.add(ct)
        await db.flush()
        line = random.choice(lines)
        for bn in range(random.randint(2, 5)):
            sz = random.choice(["XS", "S", "M", "L", "XL"])
            col = fk.color_name()
            bundle_count += 1
            db.add(
                CuttingBundle(
                    tenant_id=tenant_id,
                    cut_ticket_id=ct.id,
                    order_id=o.id,
                    style_id=st.id,
                    bundle_no=f"{P}-BND-{bundle_count:06d}",
                    barcode=f"{P}-BC-{bundle_count:08d}",
                    size=sz,
                    color=col,
                    qty_in_bundle=random.randint(18, 48),
                    status=random.choice(["cut", "issued", "sewn"]),
                    issued_to_line_id=line.id,
                    issued_at=datetime.utcnow(),
                    completed_at=None,
                )
            )
        if bundle_count % max(1, batch_size // 4) == 0:
            await db.flush()

    await db.flush()
    return hourly_count, bundle_count


async def seed_vouchers(
    db: AsyncSession,
    tenant_id: int,
    fk: Faker,
    user_id: int | None,
    coa: list[ChartOfAccount],
    cost_centers: list[CostCenter],
    batch_size: int,
) -> int:
    t0 = date.today() - timedelta(days=89)
    debit_pool = [a for a in coa if a.normal_balance == "debit"]
    credit_pool = [a for a in coa if a.normal_balance == "credit"]
    if len(debit_pool) < 2 or len(credit_pool) < 2:
        debit_pool = coa[:100]
        credit_pool = coa[100:]
    types = ["JOURNAL", "PAYMENT", "RECEIPT", "CONTRA"]
    narrations = [
        "Fabric purchase GRNI accrual",
        "Thread and trim store issue",
        "Payroll allocation — sewing floor",
        "Utility bill — generator diesel",
        "Buyer payment receipt — TT ref",
        "Bank charges and LC commission",
        "Contra: cash deposit to bank",
        "VAT input adjustment",
    ]
    n = 0
    i = 0
    while n < 2000:
        i += 1
        vdt = t0 + timedelta(days=random.randint(0, 89))
        vtype = random.choice(types)
        if vtype == "CONTRA" and len(debit_pool) < 2:
            vtype = "JOURNAL"
        amt = _money(random.uniform(500, 75000))
        if vtype == "CONTRA":
            a_dr = random.choice(debit_pool)
            others = [x for x in debit_pool if x.id != a_dr.id]
            if not others:
                continue
            a_cr = random.choice(others)
        else:
            a_dr = random.choice(debit_pool)
            eligible = [x for x in credit_pool if x.id != a_dr.id]
            if not eligible:
                continue
            a_cr = random.choice(eligible)
        vn = f"{P}-V-{i:07d}"
        ex = datetime.utcnow() if random.random() > 0.7 else None
        cc = random.choice(cost_centers) if cost_centers and random.random() > 0.4 else None
        v = Voucher(
            tenant_id=tenant_id,
            voucher_number=vn,
            voucher_type=vtype,
            voucher_date=vdt,
            status="POSTED",
            description=f"{random.choice(narrations)} — {fk.sentence()}"[:2000],
            reference=fk.bothify(text="REF-####-????")[:64],
            currency="BDT",
            base_currency="BDT",
            exchange_rate="1",
            exchange_rate_source="system",
            exchange_rate_fetched_at=ex,
            verification_id=None,
            signature_hash=None,
            signed_at=None,
            signed_by_system=False,
            trade_case_id=None,
            btb_lc_id=None,
            mfg_work_order_id=None,
            created_by=user_id,
        )
        db.add(v)
        await db.flush()
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=v.id,
                account_id=a_dr.id,
                cost_center_id=cc.id if cc and random.random() > 0.5 else None,
                currency="BDT",
                exchange_rate="1",
                base_amount=amt,
                is_rate_overridden=False,
                rate_source="system",
                entry_type="DEBIT",
                amount=amt,
                notes=f"DR {a_dr.name}"[:500],
            )
        )
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=v.id,
                account_id=a_cr.id,
                cost_center_id=cc.id if cc and random.random() <= 0.5 else None,
                currency="BDT",
                exchange_rate="1",
                base_amount=amt,
                is_rate_overridden=False,
                rate_source="system",
                entry_type="CREDIT",
                amount=amt,
                notes=f"CR {a_cr.name}"[:500],
            )
        )
        n += 1
        if n % batch_size == 0:
            await db.flush()
    await db.flush()
    return n


async def run_seed(args: argparse.Namespace) -> None:
    fk = Faker()
    if args.seed is not None:
        Faker.seed(args.seed)
        random.seed(args.seed)

    async with AsyncSessionLocal() as db:
        tenant = await _resolve_tenant(db, args.company_code, args.tenant_id)
        if not _guard_ok(tenant.company_code, tenant.name, args.i_understand_this_is_dev_data):
            raise SystemExit(
                "Refused: add --i-understand-this-is-dev-data or use a tenant whose code/name contains demo/test."
            )

        if await _already_seeded(db, tenant.id) and not args.force:
            raise SystemExit(
                "This tenant already has MG-RMG seed customers. Use --force to run anyway (may duplicate rows)."
            )

        if args.dry_run:
            print("Dry run: would seed ~100 customers, ~200 COA, 2000 items, 1000 inquiries/quotations/orders,")
            print("production 90d, ~2000 vouchers. No database changes.")
            return

        user_id = await _first_user_id(db, tenant.id)
        review = date.today() - timedelta(days=7)
        today = date.today()

        await _ensure_voucher_types(db, tenant.id)
        await _ensure_currencies(db, tenant.id)
        await db.commit()

        groups, coa = await seed_coa(db, tenant.id, review)
        await db.commit()

        ccs = await seed_cost_centers(db, tenant.id)
        await seed_accounting_periods(db, tenant.id, today)
        await db.commit()

        customers, styles = await seed_customers_and_styles(db, tenant.id, fk, 100, 600)
        await db.commit()

        cat_map, _sub, _u, _wh, _sg, items = await seed_inventory_base(db, tenant.id, fk, coa)
        await db.commit()

        inquiries, quotations, orders = await seed_merch_pipeline(db, tenant.id, fk, customers, styles, items, cat_map)
        await db.commit()

        h_cnt, b_cnt = await seed_production(
            db, tenant.id, fk, user_id, orders, styles, items, args.batch_size
        )
        await db.commit()

        v_cnt = await seed_vouchers(db, tenant.id, fk, user_id, coa, ccs, args.batch_size)
        await db.commit()

        print(f"Done. Tenant {tenant.id} ({tenant.company_code or tenant.name})")
        print(f"  Account groups: {len(groups)}, COA accounts: {len(coa)}")
        print(f"  Customers: {len(customers)}, Styles: {len(styles)}, Items: {len(items)}")
        print(f"  Inquiries: {len(inquiries)}, Quotations: {len(quotations)}, Orders: {len(orders)}")
        print(f"  Hourly production rows: {h_cnt}, Cutting bundles (approx): {b_cnt}")
        print(f"  Vouchers: {v_cnt}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Massive RMG dataset seed for P7 ERP.")
    p.add_argument("--company-code", type=str, default=None, help="Tenant company_code")
    p.add_argument("--tenant-id", type=int, default=None, help="Tenant primary key")
    p.add_argument("--seed", type=int, default=None, help="Random seed for Faker")
    p.add_argument("--batch-size", type=int, default=400, help="Flush interval for large inserts")
    p.add_argument(
        "--i-understand-this-is-dev-data",
        action="store_true",
        help="Confirm intentional load of synthetic data",
    )
    p.add_argument("--dry-run", action="store_true", help="Validate tenant and print planned work only")
    p.add_argument("--force", action="store_true", help="Run even if MG-RMG seed markers exist")
    p.add_argument(
        "--strict-optional-fks",
        action="store_true",
        help="Reserved: optional FK stubs (trade_case, btb_lc). Currently no-op.",
    )
    return p


def main() -> None:
    args = build_parser().parse_args()
    if not args.company_code and args.tenant_id is None:
        raise SystemExit("Provide --company-code or --tenant-id.")
    asyncio.run(run_seed(args))


if __name__ == "__main__":
    main()

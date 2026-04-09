"""Idempotent financier portal demo data (facilities, PO/GRN, stock, snapshots).

Used by ``scripts/seed_financier_portal_demo.py`` and integration tests.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import hash_password
from app.database import AsyncSessionLocal
from app.external_access.constants import (
    FF_EXTERNAL_PORTAL_DOCUMENT_DOWNLOADS_ENABLED,
    FF_FINANCIER_FINANCIAL_SUMMARY_ENABLED,
    FF_FINANCIER_PORTAL_ENABLED,
    FF_FINANCIER_PROJECTION_ENABLED,
    PRINCIPAL_FINANCIER,
    ROLE_FINANCIER_ANALYST,
    ROLE_FINANCIER_VIEWER,
    SCOPE_FULL_FINANCIER_PORTAL,
)
from app.models import (
    BtbLc,
    ExternalFinancierAccess,
    ExternalPrincipal,
    ExternalPrincipalRole,
    ExternalRole,
    Item,
    Tenant,
    User,
    Vendor,
)
from app.models.facility import (
    Facility,
    FacilitySnapshot,
    FacilityUtilization,
    RepaymentScheduleLine,
)
from app.models.inventory import (
    GoodsReceiving,
    GoodsReceivingItem,
    PurchaseOrder,
    PurchaseOrderItem,
    StockMovement,
    Warehouse,
)

DEFAULT_DEMO_EMAIL = "financier.portal.demo@p7erp.local"
DEFAULT_DEMO_PASSWORD = "FinancierPortalDemo123"

WH_CODE = "WH-FP-COLLAT"
PO_CODE = "PO-FP-SEED-001"
GRN_CODE = "GRN-FP-SEED-001"
FAC_CODE = "FAC-FP-TRUST-01"
UTIL_CODE = "UTIL-FP-001"
SNAPSHOT_SCOPE_KEY = "fp-seed-monthly-pack-001"


def _merge_flags(tenant: Tenant, updates: dict[str, bool]) -> None:
    raw = tenant.feature_flags
    base: dict[str, Any] = dict(raw) if isinstance(raw, dict) else {}
    base.update(updates)
    tenant.feature_flags = base


async def _get_tenant(db: AsyncSession, company_code: str) -> Tenant:
    code = (company_code or "").strip().upper()
    if not code:
        raise ValueError("company_code is required")
    row = await db.execute(select(Tenant).where(Tenant.company_code == code))
    tenant = row.scalar_one_or_none()
    if not tenant:
        raise ValueError(f"Tenant not found for company_code={code!r}")
    return tenant


async def _first_item(db: AsyncSession, tenant_id: int) -> Item | None:
    r = await db.execute(select(Item).where(Item.tenant_id == tenant_id).order_by(Item.id.asc()))
    return r.scalars().first()


async def _first_vendor(db: AsyncSession, tenant_id: int) -> Vendor | None:
    r = await db.execute(select(Vendor).where(Vendor.tenant_id == tenant_id).order_by(Vendor.id.asc()))
    return r.scalars().first()


async def _pick_btb_lc(db: AsyncSession, tenant_id: int) -> BtbLc | None:
    r = await db.execute(
        select(BtbLc).where(BtbLc.tenant_id == tenant_id).order_by(BtbLc.reference.asc())
    )
    rows = list(r.scalars().all())
    for b in rows:
        if (b.reference or "").strip() == "LKH-BTB-LC-DEMO-01":
            return b
    for b in rows:
        if (b.reference or "").startswith("BTBWF"):
            return b
    return rows[0] if rows else None


async def _ensure_role_link(db: AsyncSession, principal_id: int, role_code: str) -> bool:
    role_r = await db.execute(select(ExternalRole).where(ExternalRole.code == role_code))
    role = role_r.scalar_one_or_none()
    if not role:
        return False
    existing = await db.execute(
        select(ExternalPrincipalRole).where(
            ExternalPrincipalRole.external_principal_id == principal_id,
            ExternalPrincipalRole.role_id == role.id,
        )
    )
    if existing.scalar_one_or_none():
        return False
    db.add(ExternalPrincipalRole(external_principal_id=principal_id, role_id=role.id))
    return True


async def run_financier_portal_demo_seed(
    db: AsyncSession,
    company_code: str,
    *,
    demo_email: str = DEFAULT_DEMO_EMAIL,
    demo_password: str = DEFAULT_DEMO_PASSWORD,
) -> dict[str, Any]:
    """Populate demo rows using an existing async session. Commits only on partial early-exit paths."""
    counts: dict[str, int] = {
        "tenant_flags_updated": 0,
        "principal_created": 0,
        "principal_roles_added": 0,
        "financier_access_upserted": 0,
        "warehouse_upserted": 0,
        "purchase_order_upserted": 0,
        "grn_upserted": 0,
        "stock_movements": 0,
        "facility_upserted": 0,
        "utilization_upserted": 0,
        "schedule_lines": 0,
        "snapshots": 0,
    }
    summary: dict[str, Any] = {}
    btb: BtbLc | None = None

    tenant = await _get_tenant(db, company_code)
    tid = tenant.id

    before = dict(tenant.feature_flags) if isinstance(tenant.feature_flags, dict) else {}
    _merge_flags(
        tenant,
        {
            FF_FINANCIER_PORTAL_ENABLED: True,
            FF_FINANCIER_FINANCIAL_SUMMARY_ENABLED: True,
            FF_FINANCIER_PROJECTION_ENABLED: True,
            FF_EXTERNAL_PORTAL_DOCUMENT_DOWNLOADS_ENABLED: True,
        },
    )
    after = tenant.feature_flags or {}
    if after != before:
        counts["tenant_flags_updated"] = 1

    email = demo_email.strip().lower()
    pr_row = await db.execute(
        select(ExternalPrincipal).where(
            ExternalPrincipal.tenant_id == tid,
            ExternalPrincipal.email == email,
            ExternalPrincipal.principal_type == PRINCIPAL_FINANCIER,
        )
    )
    principal = pr_row.scalar_one_or_none()
    if not principal:
        principal = ExternalPrincipal(
            tenant_id=tid,
            principal_type=PRINCIPAL_FINANCIER,
            email=email,
            password_hash=await hash_password(demo_password),
            full_name="Demo Financier Portal User",
            phone=None,
            is_active=True,
            accepted_at=datetime.utcnow(),
        )
        db.add(principal)
        await db.flush()
        counts["principal_created"] = 1
    summary["financier_login_email"] = email
    summary["financier_login_password_hint"] = (
        "(unchanged)" if counts["principal_created"] == 0 else demo_password
    )
    summary["principal_id"] = principal.id

    for rc in (ROLE_FINANCIER_VIEWER, ROLE_FINANCIER_ANALYST):
        if await _ensure_role_link(db, principal.id, rc):
            counts["principal_roles_added"] += 1

    acc_row = await db.execute(
        select(ExternalFinancierAccess).where(
            ExternalFinancierAccess.tenant_id == tid,
            ExternalFinancierAccess.external_principal_id == principal.id,
        )
    )
    access = acc_row.scalars().first()
    party_id = principal.id
    if not access:
        access = ExternalFinancierAccess(
            tenant_id=tid,
            external_principal_id=principal.id,
            financier_party_id=party_id,
            access_scope=SCOPE_FULL_FINANCIER_PORTAL,
        )
        db.add(access)
        counts["financier_access_upserted"] = 1
    else:
        changed = False
        if access.financier_party_id != party_id:
            access.financier_party_id = party_id
            changed = True
        if access.access_scope != SCOPE_FULL_FINANCIER_PORTAL:
            access.access_scope = SCOPE_FULL_FINANCIER_PORTAL
            changed = True
        if changed:
            counts["financier_access_upserted"] = 1

    item = await _first_item(db, tid)
    vendor = await _first_vendor(db, tid)
    btb = await _pick_btb_lc(db, tid)
    if not item or not vendor:
        await db.commit()
        summary["warning"] = "Missing Item or Vendor — run Lakhsma interconnected / inventory seed first."
        summary["counts"] = counts
        return summary
    if not btb:
        await db.commit()
        summary["warning"] = (
            "No BTB LC — run scripts/seed_trade_import_export_workflow_demo.py --tenant-code <CODE> first."
        )
        summary["counts"] = counts
        return summary

    wh_row = await db.execute(
        select(Warehouse).where(Warehouse.tenant_id == tid, Warehouse.warehouse_code == WH_CODE)
    )
    wh = wh_row.scalar_one_or_none()
    if not wh:
        wh = Warehouse(
            tenant_id=tid,
            warehouse_code=WH_CODE,
            name="Financier demo collateral warehouse",
            address="Seeded for portal traceability",
            is_active=True,
        )
        db.add(wh)
        await db.flush()
        counts["warehouse_upserted"] = 1

    user_id = (
        await db.execute(select(User.id).where(User.tenant_id == tid).order_by(User.id.asc()))
    ).scalar_one_or_none()

    po_row = await db.execute(
        select(PurchaseOrder).where(PurchaseOrder.tenant_id == tid, PurchaseOrder.po_code == PO_CODE)
    )
    po = po_row.scalar_one_or_none()
    if not po:
        po = PurchaseOrder(
            tenant_id=tid,
            po_code=PO_CODE,
            vendor_id=vendor.id,
            supplier_name=vendor.name,
            order_date=date.today() - timedelta(days=30),
            expected_date=date.today() + timedelta(days=14),
            status="CONFIRMED",
            currency=btb.currency or tenant.base_currency or "BDT",
            exchange_rate_to_base=1.0,
            base_total_amount=250000.0,
            btb_lc_id=btb.id,
            notes="Seeded PO for financier portal procurement + collateral views.",
        )
        db.add(po)
        await db.flush()
        counts["purchase_order_upserted"] = 1
        db.add(
            PurchaseOrderItem(
                tenant_id=tid,
                purchase_order_id=po.id,
                item_id=item.id,
                warehouse_id=wh.id,
                quantity="5000",
                unit_price="12.50",
            )
        )
    else:
        if po.btb_lc_id != btb.id:
            po.btb_lc_id = btb.id
        await db.flush()
        poi_chk = await db.execute(
            select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)
        )
        if not poi_chk.scalars().first():
            db.add(
                PurchaseOrderItem(
                    tenant_id=tid,
                    purchase_order_id=po.id,
                    item_id=item.id,
                    warehouse_id=wh.id,
                    quantity="5000",
                    unit_price="12.50",
                )
            )
            await db.flush()

    grn_row = await db.execute(
        select(GoodsReceiving).where(GoodsReceiving.tenant_id == tid, GoodsReceiving.grn_code == GRN_CODE)
    )
    grn = grn_row.scalar_one_or_none()
    if not grn:
        grn = GoodsReceiving(
            tenant_id=tid,
            grn_code=GRN_CODE,
            purchase_order_id=po.id,
            received_date=date.today() - timedelta(days=5),
            status="POSTED",
            notes="Seeded GRN for financier collateral / traceability.",
            created_by_user_id=user_id,
        )
        db.add(grn)
        await db.flush()
        counts["grn_upserted"] = 1
        db.add(
            GoodsReceivingItem(
                tenant_id=tid,
                goods_receiving_id=grn.id,
                item_id=item.id,
                warehouse_id=wh.id,
                quantity="3200",
                lot_number="FP-LOT-001",
            )
        )
    await db.flush()

    in_notes = "seed_financier_portal_demo:GRN_IN"
    sm_in = (
        await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tid,
                StockMovement.notes == in_notes,
            )
        )
    ).scalar_one_or_none()
    if not sm_in:
        db.add(
            StockMovement(
                tenant_id=tid,
                item_id=item.id,
                warehouse_id=wh.id,
                movement_type="IN",
                quantity="3200",
                reference_type="GRN",
                reference_id=grn.id,
                movement_date=date.today() - timedelta(days=5),
                notes=in_notes,
                created_by_user_id=user_id,
                unit_cost="12.50",
                movement_value="40000",
            )
        )
        counts["stock_movements"] += 1

    out_notes = "seed_financier_portal_demo:FACILITY_OUT"
    sm_out = (
        await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tid,
                StockMovement.notes == out_notes,
            )
        )
    ).scalar_one_or_none()
    if not sm_out:
        db.add(
            StockMovement(
                tenant_id=tid,
                item_id=item.id,
                warehouse_id=wh.id,
                movement_type="OUT",
                quantity="800",
                reference_type="SEED",
                reference_id=int(po.id),
                movement_date=date.today() - timedelta(days=2),
                notes=out_notes,
                created_by_user_id=user_id,
            )
        )
        counts["stock_movements"] += 1

    fac_row = await db.execute(
        select(Facility).where(Facility.tenant_id == tid, Facility.facility_code == FAC_CODE)
    )
    fac = fac_row.scalar_one_or_none()
    master_id = btb.master_contract_id
    if not fac:
        fac = Facility(
            tenant_id=tid,
            facility_code=FAC_CODE,
            facility_type="btb_lc_facility",
            financier_party_id=party_id,
            financier_name="Demo trust bank (seed)",
            linked_master_contract_id=master_id,
            linked_btb_lc_id=btb.id,
            sanctioned_amount=1_000_000.0,
            currency=btb.currency or tenant.base_currency or "BDT",
            utilized_amount=720_000.0,
            available_amount=280_000.0,
            sanction_date=date.today() - timedelta(days=400),
            expiry_date=date.today() + timedelta(days=500),
            interest_rate=9.5,
            interest_type="reducing_balance",
            status="active",
            notes="Seeded facility for financier credit-lines and alerts.",
        )
        db.add(fac)
        await db.flush()
        counts["facility_upserted"] = 1
    else:
        fac.financier_party_id = party_id
        fac.linked_btb_lc_id = btb.id
        if master_id:
            fac.linked_master_contract_id = master_id
        fac.sanctioned_amount = 1_000_000.0
        fac.utilized_amount = 720_000.0
        fac.status = "active"

    util_row = await db.execute(
        select(FacilityUtilization).where(
            FacilityUtilization.tenant_id == tid,
            FacilityUtilization.utilization_code == UTIL_CODE,
        )
    )
    util = util_row.scalar_one_or_none()
    if not util:
        util = FacilityUtilization(
            tenant_id=tid,
            facility_id=fac.id,
            utilization_code=UTIL_CODE,
            utilization_type="drawdown",
            principal_amount=480_000.0,
            currency=fac.currency,
            disbursement_date=date.today() - timedelta(days=120),
            first_repayment_date=date.today() - timedelta(days=60),
            maturity_date=date.today() + timedelta(days=600),
            interest_rate=9.5,
            interest_type="reducing_balance",
            repayment_policy="emi_reducing",
            installment_frequency="monthly",
            num_installments=6,
            emi_amount=42_500.0,
            outstanding_principal=380_000.0,
            status="active",
            linked_btb_lc_id=btb.id,
            linked_purchase_order_id=po.id,
            notes="Seeded utilization for loan portfolio + repayment schedule.",
        )
        db.add(util)
        await db.flush()
        counts["utilization_upserted"] = 1
    else:
        util.facility_id = fac.id
        util.linked_btb_lc_id = btb.id
        util.linked_purchase_order_id = po.id
        util.status = "active"

    await db.flush()

    sched_n = (
        await db.execute(
            select(func.count())
            .select_from(RepaymentScheduleLine)
            .where(
                RepaymentScheduleLine.tenant_id == tid,
                RepaymentScheduleLine.facility_utilization_id == util.id,
            )
        )
    ).scalar()
    if not sched_n:
        base_due = date.today() - timedelta(days=45)
        for i in range(1, 7):
            due = base_due + timedelta(days=30 * (i - 1))
            if i <= 2:
                st = "paid"
                paid_amt = 42500.0
                paid_dt = due
            elif i == 3:
                st = "overdue"
                paid_amt = None
                paid_dt = None
            else:
                st = "upcoming"
                paid_amt = None
                paid_dt = None
            db.add(
                RepaymentScheduleLine(
                    tenant_id=tid,
                    facility_utilization_id=util.id,
                    installment_number=i,
                    due_date=due,
                    principal_component=30000.0,
                    interest_component=12500.0,
                    emi_amount=42500.0,
                    outstanding_after_payment=max(0.0, 380000.0 - i * 30000.0),
                    status=st,
                    paid_amount=paid_amt,
                    paid_date=paid_dt,
                )
            )
            counts["schedule_lines"] += 1

    snap_row = await db.execute(
        select(FacilitySnapshot).where(
            FacilitySnapshot.tenant_id == tid,
            FacilitySnapshot.snapshot_scope_key == SNAPSHOT_SCOPE_KEY,
        )
    )
    snap = snap_row.scalar_one_or_none()
    snap_month = date.today().strftime("%Y-%m")
    if not snap:
        db.add(
            FacilitySnapshot(
                tenant_id=tid,
                facility_id=fac.id,
                facility_utilization_id=util.id,
                snapshot_type="monthly_lender_pack",
                snapshot_date=date.today(),
                snapshot_month=snap_month,
                snapshot_scope_key=SNAPSHOT_SCOPE_KEY,
                data_json={
                    "facility_code": FAC_CODE,
                    "utilization_code": UTIL_CODE,
                    "note": "Seeded snapshot for financier portal list/detail.",
                    "sanctioned": 1_000_000.0,
                    "utilized": 720_000.0,
                },
                generated_by_user_id=user_id,
            )
        )
        counts["snapshots"] = 1

    summary["counts"] = counts
    summary["linked_btb_lc_reference"] = btb.reference
    return summary


async def seed_financier_portal_demo(
    company_code: str,
    *,
    demo_email: str = DEFAULT_DEMO_EMAIL,
    demo_password: str = DEFAULT_DEMO_PASSWORD,
) -> dict[str, Any]:
    """CLI / Docker entry: opens a session, runs seed, commits once for the happy path."""
    async with AsyncSessionLocal() as db:
        summary = await run_financier_portal_demo_seed(
            db, company_code, demo_email=demo_email, demo_password=demo_password
        )
        if summary.get("warning"):
            return summary
        await db.commit()
    return summary

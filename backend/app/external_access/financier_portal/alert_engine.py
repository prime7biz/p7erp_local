"""Extra financier-scoped alerts (facility EMI overdue, utilization, order lifecycle / risk)."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import safe_async_session_rollback
from app.external_access.financier_portal import facility_selectors as fsel
from app.models import Order
from app.models.facility import Facility, FacilityUtilization, RepaymentScheduleLine
from app.models.inventory import GoodsReceiving, PurchaseOrder


async def facility_alerts_for_party(db: AsyncSession, *, tenant_id: int, party_id: int) -> list[dict]:
    r = await db.execute(select(Facility).where(Facility.tenant_id == tenant_id, Facility.financier_party_id == party_id))
    facs = list(r.scalars().all())
    out: list[dict] = []
    if facs:
        fac_ids = [f.id for f in facs]
        urows = await db.execute(
            select(FacilityUtilization.id).where(
                FacilityUtilization.tenant_id == tenant_id,
                FacilityUtilization.facility_id.in_(fac_ids),
                FacilityUtilization.status == "active",
            )
        )
        uids = [x[0] for x in urows.all()]
        if uids:
            srows = await db.execute(
                select(RepaymentScheduleLine).where(
                    RepaymentScheduleLine.tenant_id == tenant_id,
                    RepaymentScheduleLine.facility_utilization_id.in_(uids),
                    RepaymentScheduleLine.status == "overdue",
                )
            )
            lines = list(srows.scalars().all())
            for ln in lines[:20]:
                out.append(
                    {
                        "code": "FACILITY_EMI_OVERDUE",
                        "severity": "high",
                        "title": "Facility repayment overdue",
                        "detail": f"Installment #{ln.installment_number} due {ln.due_date} (utilization id {ln.facility_utilization_id}).",
                    }
                )
        for f in facs:
            san = float(f.sanctioned_amount or 0)
            used = float(f.utilized_amount or 0)
            if san > 0 and used / san > 0.60:
                out.append(
                    {
                        "code": "FACILITY_UTILIZATION_HIGH",
                        "severity": "medium",
                        "title": "Facility utilization above 60%",
                        "detail": f"Facility {f.facility_code} at {round(100 * used / san, 1)}% of sanctioned limit.",
                    }
                )

    out.extend(await order_lifecycle_alerts_for_party(db, tenant_id=tenant_id, party_id=party_id))
    out.extend(await recovery_alerts_for_party(db, tenant_id=tenant_id, party_id=party_id))
    out.extend(await contract_command_alerts_for_party(db, tenant_id=tenant_id, party_id=party_id))
    return out


async def contract_command_alerts_for_party(db: AsyncSession, *, tenant_id: int, party_id: int) -> list[dict]:
    try:
        from app.external_access.financier_portal.contract_command import service as cc_svc
    except Exception:
        return []
    try:
        rows = await cc_svc.list_contracts_summary(db, tenant_id=tenant_id, party_id=party_id)
    except Exception:
        await safe_async_session_rollback(db)
        return []
    out: list[dict] = []
    for row in rows[:30]:
        ref = row.get("reference") or str(row.get("id"))
        comp = float(row.get("composite_score") or 100)
        if comp < 55:
            out.append(
                {
                    "code": "CONTRACT_OTD_AT_RISK",
                    "severity": "high",
                    "title": "Contract composite risk elevated",
                    "detail": f"Contract {ref}: composite score {comp:.0f}. Review Contracts command center.",
                }
            )
        if float(row.get("maturity_safety_score") or 100) < 50:
            out.append(
                {
                    "code": "BTB_MATURITY_THREAT",
                    "severity": "medium",
                    "title": "BTB maturity pressure (contract rollup)",
                    "detail": f"Contract {ref}: maturity safety low vs inflow proxy.",
                }
            )
        if float(row.get("cashability_score") or 100) < 50:
            out.append(
                {
                    "code": "CM_WEEK_SHORTFALL",
                    "severity": "medium",
                    "title": "Manufacturing cashability stress",
                    "detail": f"Contract {ref}: cash ladder shows red weeks vs planned CM.",
                }
            )
    return out[:25]


async def recovery_alerts_for_party(db: AsyncSession, *, tenant_id: int, party_id: int) -> list[dict]:
    """Recovery coverage and stalled production signals."""
    from app.external_access.financier_portal.recovery_outlook_service import build_recovery_outlook_rows
    from app.external_access.financier_portal.visibility_service import build_production_row_for_order

    try:
        rows, _ = await build_recovery_outlook_rows(db, tenant_id=tenant_id, party_id=party_id)
    except Exception:
        await safe_async_session_rollback(db)
        return []
    out: list[dict] = []
    today = date.today()
    for r in rows[:40]:
        code = r.get("order_code") or str(r.get("order_id"))
        cov = r.get("coverage_ratio")
        band = r.get("recovery_band")
        oid = int(r.get("order_id") or 0)
        o = await db.get(Order, oid) if oid else None
        if cov is not None and cov < 1.0 and o and o.delivery_date:
            days = (o.delivery_date - today).days
            if days <= 45:
                out.append(
                    {
                        "code": "RECOVERY_COVERAGE_LOW",
                        "severity": "high" if cov < 0.7 else "medium",
                        "title": "Loan recovery coverage below principal",
                        "detail": f"Order {code}: coverage ratio {cov} with delivery in {max(days, 0)}d.",
                        "category": "Recovery",
                    }
                )
        if band == "at_risk":
            out.append(
                {
                    "code": "RECOVERY_AT_RISK",
                    "severity": "high",
                    "title": "Order flagged at-risk for recovery",
                    "detail": f"Order {code}: recovery score {r.get('recovery_score')}, drivers: {', '.join(r.get('drivers') or [])}.",
                    "category": "Recovery",
                }
            )
        if o and not o.shipped_at:
            prod = await build_production_row_for_order(db, tenant_id=tenant_id, order=o)
            sew_pct = float(prod.get("sewing_pct") or 0)
            if sew_pct > 0 and sew_pct < 30 and o.delivery_date and (o.delivery_date - today).days <= 30:
                out.append(
                    {
                        "code": "PRODUCTION_STALLED",
                        "severity": "medium",
                        "title": "Production progress lagging vs delivery",
                        "detail": f"Order {code}: sewing {sew_pct}% with delivery within 30 days.",
                        "category": "Recovery",
                    }
                )
    return out[:25]


def _pct_rm(o: Order) -> float:
    try:
        return float(o.rm_received_pct or 0)
    except (TypeError, ValueError):
        return 0.0


async def order_lifecycle_alerts_for_party(db: AsyncSession, *, tenant_id: int, party_id: int) -> list[dict]:
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    if not btb_rows:
        return []
    order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    btb_ids = [b.id for b in btb_rows]
    today = date.today()
    out: list[dict] = []

    def add(code: str, severity: str, title: str, detail: str, cap: int = 25) -> None:
        if sum(1 for x in out if x["code"] == code) >= cap:
            return
        out.append({"code": code, "severity": severity, "title": title, "detail": detail})

    for oid in sorted(order_btbs.keys()):
        o = await db.get(Order, oid)
        if not o or o.tenant_id != tenant_id:
            continue
        st = (o.status or "").upper()
        if st in ("DRAFT", "CANCELLED"):
            continue

        if o.delivery_date:
            window_end = today + timedelta(days=14)
            if o.delivery_date <= window_end and _pct_rm(o) < 99.5:
                add(
                    "DELAYED_MATERIAL_INHOUSE",
                    "medium",
                    "Material / RM not fully in-house",
                    f"Order {o.order_code}: delivery {o.delivery_date}, RM received ~{_pct_rm(o)}%.",
                )

        if o.rm_received_at and not o.production_started_at:
            rm_day = o.rm_received_at.date() if isinstance(o.rm_received_at, datetime) else o.rm_received_at
            if isinstance(rm_day, date) and (today - rm_day).days > 3:
                add(
                    "DELAYED_PRODUCTION",
                    "medium",
                    "Production not started after RM receipt",
                    f"Order {o.order_code}: RM received but production_started_at empty ({(today - rm_day).days}d).",
                )
        if not o.shipped_at and o.delivery_date:
            if o.delivery_date <= today + timedelta(days=30) and o.delivery_date >= today - timedelta(days=120):
                if o.production_started_at or o.rm_received_at:
                    add(
                        "DELAYED_SHIPMENT_WINDOW",
                        "medium",
                        "Shipment window approaching without ship",
                        f"Order {o.order_code}: delivery target {o.delivery_date}, not shipped yet.",
                    )

        if o.delivery_date and o.delivery_date < today and not o.shipped_at:
            add(
                "DELAYED_SHIPMENT",
                "high",
                "Shipment delayed vs delivery date",
                f"Order {o.order_code}: delivery date {o.delivery_date} passed, no shipment recorded.",
            )

        if o.shipped_at and not o.payment_received_at:
            sd = o.shipped_at.date() if isinstance(o.shipped_at, datetime) else None
            if isinstance(sd, date) and (today - sd).days > 90:
                add(
                    "DELAYED_COLLECTION",
                    "high",
                    "Export proceeds / collection outstanding",
                    f"Order {o.order_code}: shipped {sd}, no payment_received_at after 90+ days.",
                )

        if o.order_date and (today - o.order_date).days > 30:
            if o.pi_issued_at is None or o.lc_received_at is None:
                add(
                    "DELAYED_APPROVAL",
                    "low",
                    "Commercial approval milestones pending",
                    f"Order {o.order_code}: PI/LC milestones incomplete 30+ days after order date.",
                )

    cutoff = today - timedelta(days=90)
    grn_r = await db.execute(
        select(GoodsReceiving).where(
            GoodsReceiving.tenant_id == tenant_id,
            GoodsReceiving.btb_lc_id.in_(btb_ids),
            GoodsReceiving.received_date.isnot(None),
            GoodsReceiving.received_date <= cutoff,
        )
    )
    for grn in grn_r.scalars().all():
        oid = grn.source_order_id
        if not oid and grn.purchase_order_id:
            po = await db.get(PurchaseOrder, grn.purchase_order_id)
            oid = po.source_order_id if po else None
        if not oid:
            continue
        ord_row = await db.get(Order, oid)
        if not ord_row or ord_row.shipped_at:
            continue
        add(
            "FINANCED_STOCK_AGING",
            "medium",
            "Financed GRN stock aging",
            f"GRN {grn.grn_code} (order {ord_row.order_code}) received {grn.received_date}, order not shipped.",
            cap=20,
        )

    return out

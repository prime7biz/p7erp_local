"""Financier AI confidence dashboard: tenant-wide aggregates + party-scoped facilities (read-only)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.external_access.financier_portal import facility_selectors as fsel
from app.external_access.financier_portal import selectors as sel
from app.models import ExternalPrincipal, Tenant
from app.modules.finance.business_overview_service import build_business_overview
from app.modules.finance.health_score_service import build_health_score
from app.common.ai_governance import default_meta


def _fmt_money(n: float, ccy: str) -> str:
    cur = (ccy or "").strip() or ""
    s = f"{n:,.2f}"
    return f"{cur} {s}".strip() if cur else s


async def build_financier_ai_confidence_bundle(
    db: AsyncSession, *, principal: ExternalPrincipal
) -> dict[str, Any]:
    """Rich dashboard payload for /financier/ai/confidence-narrative (real tenant data)."""
    settings = get_settings()
    tenant_id = principal.tenant_id
    tenant = await db.get(Tenant, tenant_id)
    tenant_name = tenant.name if tenant else f"Tenant #{tenant_id}"
    base_ccy = tenant.base_currency if tenant else "BDT"

    ov = await build_business_overview(db, tenant_id=tenant_id)
    hs = await build_health_score(db, tenant_id=tenant_id)

    iq = await sel.count_inquiries_by_status(db, tenant_id)
    qt = await sel.count_quotations_by_status(db, tenant_id)
    inquiries_open = sum(v for k, v in iq.items() if k and k.upper() in ("DRAFT", "OPEN", "SUBMITTED"))
    quotations_active = sum(
        v for k, v in qt.items() if k and k.upper() in ("DRAFT", "OPEN", "SENT", "SUBMITTED")
    )

    movement = await sel.stock_movement_summary(db, tenant_id)
    alerts_raw = await sel.build_alerts(db, tenant_id)
    if settings.financier_advanced_portal_enabled:
        try:
            from app.external_access.financier_portal.alert_engine import facility_alerts_for_party

            party_for_alerts = await fsel.financier_party_id_for_principal(db, principal)
            if party_for_alerts:
                alerts_raw = list(alerts_raw) + await facility_alerts_for_party(
                    db, tenant_id=tenant_id, party_id=party_for_alerts
                )
        except Exception:
            pass

    sev_counts: dict[str, int] = {}
    for a in alerts_raw:
        s = (a.get("severity") or "info").lower()
        sev_counts[s] = sev_counts.get(s, 0) + 1

    party_id = await fsel.financier_party_id_for_principal(db, principal)
    facilities_payload: list[dict[str, Any]] = []
    total_sanctioned = 0.0
    total_utilized = 0.0
    btb_lc_count = 0

    if party_id:
        facs = await fsel.list_facilities_for_financier(db, tenant_id, party_id)
        btb_ids = await fsel.linked_btb_lc_ids_for_party(db, tenant_id, party_id)
        btb_lc_count = len(btb_ids)
        for f in facs:
            san = float(f.sanctioned_amount or 0)
            util = float(f.utilized_amount or 0)
            total_sanctioned += san
            total_utilized += util
            facilities_payload.append(
                {
                    "facility_code": f.facility_code,
                    "facility_type": f.facility_type,
                    "status": f.status,
                    "currency": f.currency,
                    "sanctioned_amount": round(san, 2),
                    "utilized_amount": round(util, 2),
                    "available_amount": round(max(san - util, 0), 2),
                }
            )

    score = float(hs.get("score") or 0)
    conf_01 = min(1.0, max(0.0, score / 100.0))

    liquid = float(ov.get("liquid_funds_bank_balances") or 0)
    rec = float(ov.get("receivables_open") or 0)
    pay = float(ov.get("payables_open") or 0)
    debt = float(ov.get("active_debt_principal") or 0)
    obc = int(ov.get("open_orders_count") or 0)
    dta = float(hs.get("debt_to_asset_ratio") or 0)
    inv_val = float(hs.get("total_inventory_value") or 0)
    cogs_90 = float(hs.get("cogs_outbound_90d") or 0)

    meta = default_meta(
        data_as_of=str(ov.get("data_as_of") or ""),
        source_modules=[
            "facility",
            "finance",
            "inventory",
            "inventory_movement",
            "orders",
            "pipeline",
            "external_portal",
        ],
    )
    meta.confidence_score = conf_01
    if settings.external_ai_requires_approval:
        meta.tenant_review_required = True
        meta.approved_for_external = False

    # Deterministic "report" sections (data-driven advisory; no LLM required).
    reports: list[dict[str, Any]] = []

    reports.append(
        {
            "id": "liquidity_wc",
            "title": "Liquidity & working capital",
            "accent": "sky",
            "bullets": [
                f"Cash and bank balances (liquid): {_fmt_money(liquid, base_ccy)}.",
                f"Open receivables: {_fmt_money(rec, base_ccy)} · payables: {_fmt_money(pay, base_ccy)}.",
                f"Working-capital proxy (AR − AP): {_fmt_money(rec - pay, base_ccy)}.",
            ],
        }
    )

    reports.append(
        {
            "id": "debt_coverage",
            "title": "Debt & coverage",
            "accent": "violet",
            "bullets": [
                f"Active facility debt (principal): {_fmt_money(debt, base_ccy)}.",
                f"Debt-to-asset proxy: {dta:.2%} (assets: AR + cash + FIFO inventory).",
                f"Composite health score: {score:.1f} / 100.",
            ],
        }
    )

    reports.append(
        {
            "id": "inventory_ops",
            "title": "Inventory & throughput",
            "accent": "emerald",
            "bullets": [
                f"FIFO inventory on hand: {_fmt_money(inv_val, base_ccy)}.",
                f"Outbound movement value (90d, proxy): {_fmt_money(cogs_90, base_ccy)}.",
                f"Stock movements (last 30d rows): {movement.get('last_30', 0)}.",
            ],
        }
    )

    reports.append(
        {
            "id": "pipeline",
            "title": "Pipeline & order book",
            "accent": "amber",
            "bullets": [
                f"Open / early inquiries: {inquiries_open}.",
                f"Active quotations: {quotations_active}.",
                f"Non-cancelled open orders: {obc}.",
            ],
        }
    )

    if party_id:
        util_pct = (100.0 * total_utilized / total_sanctioned) if total_sanctioned > 0 else None
        reports.append(
            {
                "id": "your_facilities",
                "title": "Your linked credit facilities",
                "accent": "indigo",
                "bullets": [
                    f"Facilities linked to this financier login: {len(facilities_payload)}.",
                    f"Aggregate sanctioned: {_fmt_money(total_sanctioned, base_ccy)} · utilized: {_fmt_money(total_utilized, base_ccy)}."
                    + (f" ({util_pct:.1f}%)" if util_pct is not None else ""),
                    f"BTB LCs in scope: {btb_lc_count}.",
                ],
            }
        )
    else:
        reports.append(
            {
                "id": "party_link",
                "title": "Financier linkage",
                "accent": "rose",
                "bullets": [
                    "Link financier_party_id on your external access to show facility-level detail.",
                    "Tenant-wide finance and health signals above still apply.",
                ],
            }
        )

    alert_lines = [
        f"Active signals: {len(alerts_raw)} · severity mix: {dict(sev_counts) if sev_counts else 'none'}.",
    ]
    if alerts_raw:
        alert_lines.append(f"Top signal: {alerts_raw[0].get('title', '—')}.")
    else:
        alert_lines.append("No automated alerts for this tenant snapshot.")
    reports.append(
        {
            "id": "alerts",
            "title": "Monitoring & alerts",
            "accent": "orange",
            "bullets": alert_lines,
        }
    )

    narrative_parts = [
        f"{tenant_name} — confidence snapshot as of {ov.get('data_as_of', '')}.",
        f"Composite score {score:.0f}/100 with debt-to-asset proxy {dta:.1%}.",
    ]
    if party_id:
        narrative_parts.append(
            f"Your linked facilities: {len(facilities_payload)}; BTB LCs in scope: {btb_lc_count}."
        )
    else:
        narrative_parts.append("Link financier_party_id to personalize facility-level context.")
    narrative_parts.append("Figures are indicative ERP aggregates; not audited statements.")

    narrative = " ".join(narrative_parts)

    if not settings.financier_confidence_ai_enabled:
        narrative = (
            "Structured confidence dashboard is enabled. "
            "Optional generative AI narrative is turned off in server settings. "
            + narrative
        )

    if settings.external_ai_requires_approval:
        narrative = "External AI distribution pending tenant approval. " + narrative

    widgets: dict[str, Any] = {
        "tenant_name": tenant_name,
        "base_currency": base_ccy,
        "health_score": round(score, 2),
        "debt_to_asset_ratio": round(dta, 4),
        "liquid_funds": round(liquid, 2),
        "receivables_open": round(rec, 2),
        "payables_open": round(pay, 2),
        "active_debt_principal": round(debt, 2),
        "open_orders_count": obc,
        "total_inventory_value": round(inv_val, 2),
        "cogs_outbound_90d": round(cogs_90, 2),
        "stock_movements_last_30": int(movement.get("last_30") or 0),
        "inquiries_open": inquiries_open,
        "quotations_active": quotations_active,
        "alerts_total": len(alerts_raw),
        "alerts_by_severity": sev_counts,
        "party_linked": bool(party_id),
        "facilities_count": len(facilities_payload),
        "total_sanctioned": round(total_sanctioned, 2),
        "total_utilized": round(total_utilized, 2),
        "btb_lc_count": btb_lc_count,
    }

    return {
        "narrative": narrative,
        "meta": meta.model_dump(),
        "reports": reports,
        "widgets": widgets,
        "facilities": facilities_payload,
        "ai_narrative_enabled": settings.financier_confidence_ai_enabled,
        "external_ai_requires_approval": settings.external_ai_requires_approval,
    }

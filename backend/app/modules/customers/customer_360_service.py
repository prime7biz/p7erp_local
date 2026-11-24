"""Customer 360 aggregation + timeline (Phase 4). Permission-gated; never leaks denied rows."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.pagination import MAX_PAGE_SIZE
from app.common.tenant_feature_keys import FISCAL_YEAR_START_MONTH, is_party_ledger_enabled
from app.models import (
    AuditLog,
    Bom,
    CommercialInvoice,
    CommissionEntry,
    CommissionRule,
    CommissionStatement,
    Customer,
    CustomerContact,
    CustomerIntermediary,
    DeliveryChallan,
    ExportCase,
    ExternalCustomerAccess,
    ExternalNote,
    ExternalPrincipal,
    GarmentStyle,
    Inquiry,
    JobWorkContract,
    KnittingWorkOrder,
    MasterContract,
    Order,
    OutstandingBill,
    PartyLedger,
    PartyLedgerBill,
    PrincipalMaterialClaim,
    ProcessOrder,
    ProformaInvoice,
    Quotation,
    Tenant,
    TradeCase,
    User,
)
from app.modules.customers import service as customer_service
from app.modules.customers.customer_360_authz import (
    Customer360Gates,
    denied_block,
    evaluate_customer_360_gates,
)
from app.modules.customers.schemas import (
    Customer360Response,
    CustomerTimelineEvent,
    CustomerTimelineResponse,
)
from app.modules.finance.fiscal_year import fiscal_year_bounds

VALID_360_SECTIONS = frozenset(
    {"summary", "merch", "commercial", "operations", "finance", "partners", "portal", "contacts"}
)
DEFAULT_360_SECTIONS = ("summary",)
DEFAULT_360_LIMIT = 25
DEFAULT_TIMELINE_LIMIT = 50
MAX_TIMELINE_OFFSET = 500


def _clamp_limit(limit: int) -> int:
    return max(1, min(int(limit or DEFAULT_360_LIMIT), min(100, MAX_PAGE_SIZE)))


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


async def _count(db: AsyncSession, model, *filters) -> int:
    stmt = select(func.count()).select_from(model)
    for f in filters:
        stmt = stmt.where(f)
    return int((await db.execute(stmt)).scalar() or 0)


async def _list_rows(
    db: AsyncSession,
    model,
    *filters,
    order_by=None,
    limit: int = 25,
    columns: tuple[str, ...] = ("id",),
) -> list[dict[str, Any]]:
    stmt = select(model).where(*filters)
    if order_by is not None:
        stmt = stmt.order_by(order_by)
    stmt = stmt.limit(limit)
    rows = list((await db.execute(stmt)).scalars().all())
    out: list[dict[str, Any]] = []
    for row in rows:
        item: dict[str, Any] = {}
        for col in columns:
            val = getattr(row, col, None)
            item[col] = _iso(val) if hasattr(val, "isoformat") else val
        out.append(item)
    return out


async def _build_summary(
    db: AsyncSession,
    *,
    tenant: Tenant,
    customer: Customer,
    gates: Customer360Gates,
) -> dict[str, Any]:
    tid = tenant.id
    cid = customer.id
    health = await customer_service.get_health(
        db,
        tenant_id=tid,
        customer_id=cid,
        include_receivables=gates.finance,
    )
    counts: dict[str, Any] = {
        "orders": await _count(db, Order, Order.tenant_id == tid, Order.customer_id == cid),
        "inquiries": await _count(db, Inquiry, Inquiry.tenant_id == tid, Inquiry.customer_id == cid),
        "quotations": await _count(
            db, Quotation, Quotation.tenant_id == tid, Quotation.customer_id == cid
        ),
        "styles": await _count(
            db, GarmentStyle, GarmentStyle.tenant_id == tid, GarmentStyle.buyer_customer_id == cid
        ),
    }
    allowed = {
        "merch": gates.merch,
        "commercial": gates.commercial,
        "operations": gates.inventory or gates.production,
        "finance": gates.finance,
        "partners": gates.partners,
        "portal": gates.portal,
        "contacts": gates.contacts,
        "trade": gates.trade,
    }
    return {
        "allowed": True,
        "customer": {
            "id": customer.id,
            "customer_code": customer.customer_code,
            "name": customer.name,
            "status": customer.status,
            "preferred_currency": customer.preferred_currency,
            "payment_terms": getattr(customer, "payment_terms", None),
            "default_incoterm": getattr(customer, "default_incoterm", None),
            "typical_lead_time_days": getattr(customer, "typical_lead_time_days", None),
            "credit_limit": (
                str(customer.credit_limit) if getattr(customer, "credit_limit", None) is not None else None
            ),
        },
        "counts": counts,
        "allowed_flags": allowed,
        "health": health.model_dump() if health else None,
    }


async def _build_merch(
    db: AsyncSession, *, tenant_id: int, customer_id: int, gates: Customer360Gates, limit: int
) -> dict[str, Any]:
    if not gates.merch:
        return denied_block()
    return {
        "allowed": True,
        "inquiries": await _list_rows(
            db,
            Inquiry,
            Inquiry.tenant_id == tenant_id,
            Inquiry.customer_id == customer_id,
            order_by=Inquiry.id.desc(),
            limit=limit,
            columns=("id", "inquiry_code", "status", "updated_at"),
        ),
        "quotations": await _list_rows(
            db,
            Quotation,
            Quotation.tenant_id == tenant_id,
            Quotation.customer_id == customer_id,
            order_by=Quotation.id.desc(),
            limit=limit,
            columns=("id", "quotation_code", "status", "updated_at"),
        ),
        "orders": await _list_rows(
            db,
            Order,
            Order.tenant_id == tenant_id,
            Order.customer_id == customer_id,
            order_by=Order.id.desc(),
            limit=limit,
            columns=("id", "order_code", "status", "updated_at"),
        ),
        "styles": await _list_rows(
            db,
            GarmentStyle,
            GarmentStyle.tenant_id == tenant_id,
            GarmentStyle.buyer_customer_id == customer_id,
            order_by=GarmentStyle.id.desc(),
            limit=limit,
            columns=("id", "style_code", "name", "updated_at"),
        ),
        "boms": await _list_rows(
            db,
            Bom,
            Bom.tenant_id == tenant_id,
            Bom.customer_id == customer_id,
            order_by=Bom.id.desc(),
            limit=limit,
            columns=("id", "bom_code", "status", "updated_at"),
        ),
    }


async def _build_commercial(
    db: AsyncSession, *, tenant_id: int, customer_id: int, gates: Customer360Gates, limit: int
) -> dict[str, Any]:
    if not gates.commercial:
        return denied_block()
    out: dict[str, Any] = {
        "allowed": True,
        "master_contracts": await _list_rows(
            db,
            MasterContract,
            MasterContract.tenant_id == tenant_id,
            MasterContract.customer_id == customer_id,
            order_by=MasterContract.id.desc(),
            limit=limit,
            columns=("id", "reference", "status", "buyer_name", "updated_at"),
        ),
        "proforma_invoices": await _list_rows(
            db,
            ProformaInvoice,
            ProformaInvoice.tenant_id == tenant_id,
            ProformaInvoice.customer_id == customer_id,
            order_by=ProformaInvoice.id.desc(),
            limit=limit,
            columns=("id", "reference", "status", "direction", "updated_at"),
        ),
        "commercial_invoices": await _list_rows(
            db,
            CommercialInvoice,
            CommercialInvoice.tenant_id == tenant_id,
            CommercialInvoice.customer_id == customer_id,
            order_by=CommercialInvoice.id.desc(),
            limit=limit,
            columns=("id", "invoice_code", "status", "updated_at"),
        ),
        "export_cases": await _list_rows(
            db,
            ExportCase,
            ExportCase.tenant_id == tenant_id,
            ExportCase.customer_id == customer_id,
            order_by=ExportCase.id.desc(),
            limit=limit,
            columns=("id", "reference", "status", "updated_at"),
        ),
        "commission_rules": await _list_rows(
            db,
            CommissionRule,
            CommissionRule.tenant_id == tenant_id,
            CommissionRule.customer_id == customer_id,
            order_by=CommissionRule.id.desc(),
            limit=limit,
            columns=("id", "direction", "scope", "is_active", "updated_at"),
        ),
        "commission_entries_count": await _count(
            db,
            CommissionEntry,
            CommissionEntry.tenant_id == tenant_id,
            CommissionEntry.counterparty_type == "CUSTOMER",
            CommissionEntry.counterparty_id == customer_id,
        ),
        "commission_statements_count": await _count(
            db,
            CommissionStatement,
            CommissionStatement.tenant_id == tenant_id,
            CommissionStatement.counterparty_type == "CUSTOMER",
            CommissionStatement.counterparty_id == customer_id,
        ),
    }
    if gates.trade:
        out["trade_cases"] = {
            "allowed": True,
            "rows": await _list_rows(
                db,
                TradeCase,
                TradeCase.tenant_id == tenant_id,
                TradeCase.customer_id == customer_id,
                order_by=TradeCase.id.desc(),
                limit=limit,
                columns=("id", "reference", "status", "updated_at"),
            ),
        }
    else:
        out["trade_cases"] = denied_block()
    return out


async def _build_operations(
    db: AsyncSession, *, tenant_id: int, customer_id: int, gates: Customer360Gates, limit: int
) -> dict[str, Any]:
    if not (gates.inventory or gates.production):
        return denied_block()
    out: dict[str, Any] = {"allowed": True}
    if gates.inventory:
        out["delivery_challans"] = await _list_rows(
            db,
            DeliveryChallan,
            DeliveryChallan.tenant_id == tenant_id,
            DeliveryChallan.customer_id == customer_id,
            order_by=DeliveryChallan.id.desc(),
            limit=limit,
            columns=("id", "challan_code", "status", "customer_name", "updated_at"),
        )
        out["process_orders"] = await _list_rows(
            db,
            ProcessOrder,
            ProcessOrder.tenant_id == tenant_id,
            ProcessOrder.customer_id == customer_id,
            order_by=ProcessOrder.id.desc(),
            limit=limit,
            columns=("id", "process_number", "status", "updated_at"),
        )
        out["principal_material_claims"] = await _list_rows(
            db,
            PrincipalMaterialClaim,
            PrincipalMaterialClaim.tenant_id == tenant_id,
            PrincipalMaterialClaim.customer_id == customer_id,
            order_by=PrincipalMaterialClaim.id.desc(),
            limit=limit,
            columns=("id", "claim_no", "status", "updated_at"),
        )
    else:
        out["delivery_challans"] = denied_block()
        out["process_orders"] = denied_block()
        out["principal_material_claims"] = denied_block()

    if gates.production:
        out["knitting_work_orders"] = await _list_rows(
            db,
            KnittingWorkOrder,
            KnittingWorkOrder.tenant_id == tenant_id,
            KnittingWorkOrder.customer_id == customer_id,
            order_by=KnittingWorkOrder.id.desc(),
            limit=limit,
            columns=("id", "wo_number", "status", "updated_at"),
        )
    else:
        out["knitting_work_orders"] = denied_block()

    if gates.job_work:
        out["job_work_contracts"] = await _list_rows(
            db,
            JobWorkContract,
            JobWorkContract.tenant_id == tenant_id,
            or_(
                JobWorkContract.customer_id == customer_id,
                JobWorkContract.final_customer_id == customer_id,
            ),
            order_by=JobWorkContract.id.desc(),
            limit=limit,
            columns=("id", "contract_no", "status", "updated_at"),
        )
    else:
        out["job_work_contracts"] = denied_block()

    out["planning_read_allowed"] = gates.planning_read
    return out


async def _build_finance(
    db: AsyncSession,
    *,
    tenant: Tenant,
    customer: Customer,
    gates: Customer360Gates,
    limit: int,
) -> dict[str, Any]:
    if not gates.finance:
        return denied_block()
    tid = tenant.id
    cid = customer.id
    party_names = [
        n.strip()
        for n in (customer.name, customer.legal_entity_name, customer.trade_name)
        if n and str(n).strip()
    ]
    name_conds = [func.lower(OutstandingBill.party_name) == nm.lower() for nm in party_names]
    match = OutstandingBill.customer_id == cid
    if name_conds:
        match = or_(match, and_(OutstandingBill.customer_id.is_(None), or_(*name_conds)))

    bills = list(
        (
            await db.execute(
                select(OutstandingBill)
                .where(
                    OutstandingBill.tenant_id == tid,
                    OutstandingBill.bill_type == "RECEIVABLE",
                    match,
                )
                .order_by(OutstandingBill.id.desc())
                .limit(limit)
            )
        ).scalars().all()
    )
    ar_rows = [
        {
            "id": b.id,
            "bill_no": b.bill_no,
            "party_name": b.party_name,
            "status": b.status,
            "amount": str(b.amount),
            "paid_amount": str(b.paid_amount),
            "due_date": _iso(b.due_date),
        }
        for b in bills
    ]

    party_ledger = None
    if is_party_ledger_enabled(tenant.feature_flags):
        pl = (
            await db.execute(
                select(PartyLedger).where(
                    PartyLedger.tenant_id == tid,
                    PartyLedger.customer_id == cid,
                )
            )
        ).scalar_one_or_none()
        if pl:
            open_bills = await _count(
                db,
                PartyLedgerBill,
                PartyLedgerBill.tenant_id == tid,
                PartyLedgerBill.party_ledger_id == pl.id,
                PartyLedgerBill.status.in_(("PENDING", "PARTIAL", "OVERDUE")),
            )
            party_ledger = {
                "id": pl.id,
                "current_balance": str(pl.current_balance),
                "current_balance_type": pl.current_balance_type,
                "open_bills_count": open_bills,
            }

    profitability = denied_block()
    if gates.profitability:
        flags = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
        start_month = int(flags.get(FISCAL_YEAR_START_MONTH) or 1)
        today = today_local(tenant)
        fy_start, fy_end = fiscal_year_bounds(today, start_month)
        window_start = max(fy_start, today - timedelta(days=365))
        try:
            from app.modules.finance.control.profitability_service import build_entity_profit

            profit = await build_entity_profit(
                db,
                tenant,
                kind="buyer",
                entity_id=cid,
                from_date=window_start,
                to_date=today,
            )
            profitability = {
                "allowed": True,
                "from_date": window_start.isoformat(),
                "to_date": today.isoformat(),
                "fiscal_year_end": fy_end.isoformat(),
                "summary": profit.model_dump() if hasattr(profit, "model_dump") else profit,
            }
        except Exception:
            from app.database import safe_async_session_rollback

            await safe_async_session_rollback(db)
            profitability = {"allowed": True, "error": "unavailable"}

    return {
        "allowed": True,
        "ar_aging_rows": ar_rows,
        "party_ledger": party_ledger,
        "profitability": profitability,
    }


async def _build_partners(
    db: AsyncSession, *, tenant_id: int, customer_id: int, gates: Customer360Gates, limit: int
) -> dict[str, Any]:
    if not gates.partners:
        return denied_block()
    return {
        "allowed": True,
        "intermediaries": await _list_rows(
            db,
            CustomerIntermediary,
            CustomerIntermediary.tenant_id == tenant_id,
            CustomerIntermediary.customer_id == customer_id,
            order_by=CustomerIntermediary.id.desc(),
            limit=limit,
            columns=("id", "intermediary_id", "is_primary", "updated_at"),
        ),
    }


async def _build_portal(
    db: AsyncSession, *, tenant_id: int, customer_id: int, gates: Customer360Gates, limit: int
) -> dict[str, Any]:
    if not gates.portal:
        return denied_block()
    access_rows = list(
        (
            await db.execute(
                select(ExternalCustomerAccess, ExternalPrincipal)
                .join(
                    ExternalPrincipal,
                    ExternalPrincipal.id == ExternalCustomerAccess.external_principal_id,
                )
                .where(
                    ExternalCustomerAccess.tenant_id == tenant_id,
                    ExternalCustomerAccess.customer_id == customer_id,
                    ExternalPrincipal.tenant_id == tenant_id,
                )
                .limit(limit)
            )
        ).all()
    )
    accounts = []
    for access, principal in access_rows:
        accounts.append(
            {
                "access_id": access.id,
                "is_primary": access.is_primary,
                "email": principal.email,
                "full_name": principal.full_name,
                "is_active": principal.is_active,
                "last_login_at": _iso(principal.last_login_at),
                # Never expose tokens / password hashes.
            }
        )
    notes_count = await _count(
        db,
        ExternalNote,
        ExternalNote.tenant_id == tenant_id,
        ExternalNote.entity_type == "customer",
        ExternalNote.entity_id == customer_id,
    )
    return {"allowed": True, "accounts": accounts, "notes_count": notes_count}


async def _build_contacts(
    db: AsyncSession, *, tenant_id: int, customer_id: int, gates: Customer360Gates, limit: int
) -> dict[str, Any]:
    if not gates.contacts:
        return denied_block()
    rows = await customer_service.list_contacts(db, tenant_id=tenant_id, customer_id=customer_id)
    return {"allowed": True, "contacts": [r.model_dump() for r in rows[:limit]]}


async def get_customer_360(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    customer_id: int,
    sections: list[str] | None,
    limit: int = DEFAULT_360_LIMIT,
) -> Customer360Response | None:
    customer = (
        await db.execute(
            select(Customer).where(Customer.id == customer_id, Customer.tenant_id == tenant.id)
        )
    ).scalar_one_or_none()
    if customer is None:
        return None

    wanted = [s.strip().lower() for s in (sections or list(DEFAULT_360_SECTIONS)) if s and s.strip()]
    if not wanted:
        wanted = list(DEFAULT_360_SECTIONS)
    wanted = [s for s in wanted if s in VALID_360_SECTIONS]
    if not wanted:
        wanted = list(DEFAULT_360_SECTIONS)

    lim = _clamp_limit(limit)
    gates = await evaluate_customer_360_gates(db, user=user, tenant=tenant)
    built: dict[str, Any] = {}
    for section in wanted:
        if section == "summary":
            built[section] = await _build_summary(db, tenant=tenant, customer=customer, gates=gates)
        elif section == "merch":
            built[section] = await _build_merch(
                db, tenant_id=tenant.id, customer_id=customer_id, gates=gates, limit=lim
            )
        elif section == "commercial":
            built[section] = await _build_commercial(
                db, tenant_id=tenant.id, customer_id=customer_id, gates=gates, limit=lim
            )
        elif section == "operations":
            built[section] = await _build_operations(
                db, tenant_id=tenant.id, customer_id=customer_id, gates=gates, limit=lim
            )
        elif section == "finance":
            built[section] = await _build_finance(
                db, tenant=tenant, customer=customer, gates=gates, limit=lim
            )
        elif section == "partners":
            built[section] = await _build_partners(
                db, tenant_id=tenant.id, customer_id=customer_id, gates=gates, limit=lim
            )
        elif section == "portal":
            built[section] = await _build_portal(
                db, tenant_id=tenant.id, customer_id=customer_id, gates=gates, limit=lim
            )
        elif section == "contacts":
            built[section] = await _build_contacts(
                db, tenant_id=tenant.id, customer_id=customer_id, gates=gates, limit=lim
            )
    return Customer360Response(customer_id=customer_id, sections=built)


async def get_customer_timeline(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    customer_id: int,
    limit: int = DEFAULT_TIMELINE_LIMIT,
    offset: int = 0,
) -> CustomerTimelineResponse | None:
    exists = (
        await db.execute(
            select(Customer.id).where(Customer.id == customer_id, Customer.tenant_id == tenant.id)
        )
    ).scalar_one_or_none()
    if exists is None:
        return None

    lim = max(1, min(int(limit or DEFAULT_TIMELINE_LIMIT), 100))
    off = max(0, min(int(offset or 0), MAX_TIMELINE_OFFSET))
    gates = await evaluate_customer_360_gates(db, user=user, tenant=tenant)
    tid = tenant.id

    resources: list[str] = [f"customer:{customer_id}"]
    order_ids = [
        int(r[0])
        for r in (
            await db.execute(
                select(Order.id)
                .where(Order.tenant_id == tid, Order.customer_id == customer_id)
                .order_by(Order.id.desc())
                .limit(100)
            )
        ).all()
    ]
    for oid in order_ids:
        resources.append(f"order:{oid}")

    if gates.inventory:
        challan_ids = [
            int(r[0])
            for r in (
                await db.execute(
                    select(DeliveryChallan.id)
                    .where(
                        DeliveryChallan.tenant_id == tid,
                        DeliveryChallan.customer_id == customer_id,
                    )
                    .order_by(DeliveryChallan.id.desc())
                    .limit(50)
                )
            ).all()
        ]
        for cid in challan_ids:
            resources.append(f"delivery_challan:{cid}")

    if gates.job_work:
        jw_ids = [
            int(r[0])
            for r in (
                await db.execute(
                    select(JobWorkContract.id)
                    .where(
                        JobWorkContract.tenant_id == tid,
                        or_(
                            JobWorkContract.customer_id == customer_id,
                            JobWorkContract.final_customer_id == customer_id,
                        ),
                    )
                    .order_by(JobWorkContract.id.desc())
                    .limit(50)
                )
            ).all()
        ]
        for jid in jw_ids:
            resources.append(f"job_work_contract:{jid}")

    # Cap resource list size for IN(...)
    resources = resources[:220]

    filters = [
        AuditLog.tenant_id == tid,
        AuditLog.resource.in_(resources),
    ]
    if not gates.ai_audit:
        filters.append(~AuditLog.action.like("CUSTOMER_AI_%"))
    else:
        # AI audit rows bounded to last 90 days / scan cap handled via overall limit.
        since = datetime.utcnow() - timedelta(days=90)
        filters = [
            AuditLog.tenant_id == tid,
            or_(
                AuditLog.resource.in_(resources),
                and_(
                    AuditLog.action.like("CUSTOMER_AI_%"),
                    AuditLog.resource == f"customer:{customer_id}",
                    AuditLog.created_at >= since,
                ),
            ),
        ]

    total = int(
        (await db.execute(select(func.count()).select_from(AuditLog).where(*filters))).scalar() or 0
    )
    rows = list(
        (
            await db.execute(
                select(AuditLog)
                .where(*filters)
                .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
                .offset(off)
                .limit(lim)
            )
        ).scalars().all()
    )
    # Extra AI scan cap: at most 50 CUSTOMER_AI_* in the returned page window.
    ai_seen = 0
    events: list[CustomerTimelineEvent] = []
    for row in rows:
        action = row.action or ""
        if action.startswith("CUSTOMER_AI_"):
            if not gates.ai_audit:
                continue
            ai_seen += 1
            if ai_seen > 50:
                continue
            source = "ai"
        elif row.resource and row.resource.startswith("delivery_challan:"):
            if not gates.inventory:
                continue
            source = "inventory"
        elif row.resource and row.resource.startswith("job_work_contract:"):
            if not gates.job_work:
                continue
            source = "job_work"
        else:
            source = "customer"
        events.append(
            CustomerTimelineEvent(
                at=_iso(row.created_at) or "",
                action=action,
                resource=row.resource,
                details=row.details,
                source=source,
            )
        )

    return CustomerTimelineResponse(
        customer_id=customer_id,
        total=total,
        limit=lim,
        offset=off,
        events=events,
    )

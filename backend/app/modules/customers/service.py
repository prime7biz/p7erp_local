"""Customer domain logic (tenant-scoped)."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import Float, and_, case, cast, exists, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.common.codegen import next_tenant_code
from app.common.pagination import MAX_PAGE_SIZE
from app.models import Customer, Tenant, User
from app.models.finance import OutstandingBill
from app.models.merch import Inquiry, Order, Quotation
from app.modules.customers.schemas import (
    CustomerCreate,
    CustomerFacetsResponse,
    CustomerHealthResponse,
    CustomerListPageResponse,
    CustomerRelatedRecordItem,
    CustomerRelatedResponse,
    CustomerResponse,
    CustomerUpdate,
)


def ensure_user_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def customer_to_response(customer: Customer) -> CustomerResponse:
    return CustomerResponse(
        id=customer.id,
        tenant_id=customer.tenant_id,
        customer_code=customer.customer_code,
        name=customer.name,
        address=customer.address,
        country=customer.country,
        email=customer.email,
        phone=customer.phone,
        website=customer.website,
        legal_entity_name=customer.legal_entity_name,
        trade_name=customer.trade_name,
        tax_id_vat_number=customer.tax_id_vat_number,
        customer_type=customer.customer_type,
        status=customer.status,
        primary_contact_name=customer.primary_contact_name,
        designation=customer.designation,
        contact_email=customer.contact_email,
        contact_phone=customer.contact_phone,
        phone_country_code=customer.phone_country_code,
        subscribe_newsletter=customer.subscribe_newsletter,
        company_logo_url=customer.company_logo_url,
        billing_address_line1=customer.billing_address_line1,
        billing_city=customer.billing_city,
        billing_postal_code=customer.billing_postal_code,
        billing_country=customer.billing_country,
        shipping_address_line1=customer.shipping_address_line1,
        shipping_city=customer.shipping_city,
        shipping_postal_code=customer.shipping_postal_code,
        shipping_country=customer.shipping_country,
        same_as_billing=customer.same_as_billing,
        preferred_currency=customer.preferred_currency,
        created_at=customer.created_at.isoformat(),
        updated_at=customer.updated_at.isoformat(),
    )


def apply_customer_filters(
    stmt,
    *,
    tenant_id: int,
    q: str | None,
    status_filter: str | None,
    country: str | None,
    customer_type: str | None,
):
    stmt = stmt.where(Customer.tenant_id == tenant_id)
    if q:
        pattern = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Customer.customer_code).like(pattern),
                func.lower(Customer.name).like(pattern),
                func.lower(Customer.legal_entity_name).like(pattern),
                func.lower(Customer.trade_name).like(pattern),
                func.lower(Customer.contact_email).like(pattern),
                func.lower(Customer.email).like(pattern),
                func.lower(Customer.contact_phone).like(pattern),
                func.lower(Customer.phone).like(pattern),
            )
        )
    if status_filter:
        stmt = stmt.where(func.lower(Customer.status) == status_filter.strip().lower())
    if country:
        country_val = country.strip().lower()
        stmt = stmt.where(
            or_(
                func.lower(Customer.billing_country) == country_val,
                func.lower(Customer.country) == country_val,
            )
        )
    if customer_type:
        stmt = stmt.where(func.lower(Customer.customer_type) == customer_type.strip().lower())
    return stmt


def _has_text(col):
    return func.length(func.trim(func.coalesce(col, ""))) > 0


def apply_customer_ai_list_filters(
    stmt,
    *,
    tenant_id: int,
    stale_only: bool = False,
    incomplete_only: bool = False,
    high_duplicate_risk_only: bool = False,
    stale_days: int = 90,
):
    """Optional list narrowing for AI-oriented views (applied in SQL before pagination)."""
    if not (stale_only or incomplete_only or high_duplicate_risk_only):
        return stmt

    if incomplete_only:
        t_legal = case((or_(_has_text(Customer.legal_entity_name), _has_text(Customer.name)), 1), else_=0)
        t_trade = case((_has_text(Customer.trade_name), 1), else_=0)
        t_tax = case((_has_text(Customer.tax_id_vat_number), 1), else_=0)
        t_em = case((_has_text(func.coalesce(Customer.contact_email, Customer.email)), 1), else_=0)
        t_ph = case((_has_text(func.coalesce(Customer.contact_phone, Customer.phone)), 1), else_=0)
        t_web = case((_has_text(Customer.website), 1), else_=0)
        t_b1 = case((_has_text(Customer.billing_address_line1), 1), else_=0)
        t_bc = case((_has_text(Customer.billing_city), 1), else_=0)
        t_bct = case((_has_text(Customer.billing_country), 1), else_=0)
        t_ship = case(
            (
                or_(
                    _has_text(Customer.shipping_address_line1),
                    and_(Customer.same_as_billing.is_(True), _has_text(Customer.billing_address_line1)),
                ),
                1,
            ),
            else_=0,
        )
        t_pname = case((_has_text(Customer.primary_contact_name), 1), else_=0)
        t_des = case((_has_text(Customer.designation), 1), else_=0)
        t_logo = case((_has_text(Customer.company_logo_url), 1), else_=0)
        filled_sum = (
            t_legal
            + t_trade
            + t_tax
            + t_em
            + t_ph
            + t_web
            + t_b1
            + t_bc
            + t_bct
            + t_ship
            + t_pname
            + t_des
            + t_logo
        )
        completeness_pct = cast(filled_sum, Float) * literal(100.0) / literal(12.0)
        stmt = stmt.where(completeness_pct < literal(70.0))

    if stale_only:
        threshold = datetime.utcnow() - timedelta(days=stale_days)
        lo = (
            select(func.max(Order.updated_at))
            .where(Order.tenant_id == tenant_id, Order.customer_id == Customer.id)
            .scalar_subquery()
        )
        li = (
            select(func.max(Inquiry.updated_at))
            .where(Inquiry.tenant_id == tenant_id, Inquiry.customer_id == Customer.id)
            .scalar_subquery()
        )
        lq = (
            select(func.max(Quotation.updated_at))
            .where(Quotation.tenant_id == tenant_id, Quotation.customer_id == Customer.id)
            .scalar_subquery()
        )
        last_act = func.greatest(lo, li, lq)
        stmt = stmt.where(or_(last_act.is_(None), last_act < threshold))

    if high_duplicate_risk_only:
        c_email = aliased(Customer)
        c_phone = aliased(Customer)
        em1 = func.lower(func.trim(func.coalesce(Customer.contact_email, Customer.email, "")))
        em2 = func.lower(func.trim(func.coalesce(c_email.contact_email, c_email.email, "")))
        dup_email = exists(
            select(literal(1))
            .select_from(c_email)
            .where(
                c_email.tenant_id == tenant_id,
                c_email.id != Customer.id,
                em1 == em2,
                func.length(em1) > 0,
            )
        )
        ph1 = func.trim(func.coalesce(Customer.contact_phone, Customer.phone, ""))
        ph2 = func.trim(func.coalesce(c_phone.contact_phone, c_phone.phone, ""))
        dup_phone = exists(
            select(literal(1))
            .select_from(c_phone)
            .where(
                c_phone.tenant_id == tenant_id,
                c_phone.id != Customer.id,
                ph1 == ph2,
                func.length(ph1) >= 6,
            )
        )
        stmt = stmt.where(or_(dup_email, dup_phone))

    return stmt


def profile_completeness_score(c: Customer) -> int:
    """0–100 based on key commercial, contact, address, and identity fields."""

    def filled(v: str | None) -> bool:
        return bool(v and str(v).strip())

    keys = [
        filled(c.legal_entity_name or c.name),
        filled(c.trade_name),
        filled(c.tax_id_vat_number),
        filled(c.contact_email or c.email),
        filled(c.contact_phone or c.phone),
        filled(c.website),
        filled(c.billing_address_line1),
        filled(c.billing_city),
        filled(c.billing_country),
        filled(c.shipping_address_line1 or (c.same_as_billing and c.billing_address_line1)),
        filled(c.primary_contact_name),
        filled(c.designation),
        filled(c.company_logo_url),
    ]
    return int(round(100 * sum(1 for x in keys if x) / len(keys)))


async def list_customers_paginated(
    db: AsyncSession,
    *,
    tenant_id: int,
    q: str | None,
    status_filter: str | None,
    country: str | None,
    customer_type: str | None,
    page: int,
    page_size: int,
    include_ai_fields: bool = False,
    stale_only: bool = False,
    incomplete_only: bool = False,
    high_duplicate_risk_only: bool = False,
    stale_days: int = 90,
) -> CustomerListPageResponse:
    filtered_stmt = apply_customer_filters(
        select(Customer),
        tenant_id=tenant_id,
        q=q,
        status_filter=status_filter,
        country=country,
        customer_type=customer_type,
    )
    filtered_stmt = apply_customer_ai_list_filters(
        filtered_stmt,
        tenant_id=tenant_id,
        stale_only=stale_only,
        incomplete_only=incomplete_only,
        high_duplicate_risk_only=high_duplicate_risk_only,
        stale_days=stale_days,
    )

    total_result = await db.execute(select(func.count()).select_from(filtered_stmt.subquery()))
    total = int(total_result.scalar() or 0)
    total_pages = max((total + page_size - 1) // page_size, 1)
    safe_page = min(page, total_pages)
    offset = (safe_page - 1) * page_size

    rows_result = await db.execute(
        filtered_stmt.order_by(Customer.created_at.desc(), Customer.id.desc()).limit(page_size).offset(offset)
    )
    rows = rows_result.scalars().all()

    # Single aggregate query for KPI counts (same base filters, no status_filter)
    recent_threshold = datetime.utcnow() - timedelta(days=30)
    base_for_kpi_stmt = apply_customer_filters(
        select(Customer.id, Customer.status, Customer.created_at),
        tenant_id=tenant_id,
        q=q,
        status_filter=None,
        country=country,
        customer_type=customer_type,
    )
    base_for_kpi_stmt = apply_customer_ai_list_filters(
        base_for_kpi_stmt,
        tenant_id=tenant_id,
        stale_only=stale_only,
        incomplete_only=incomplete_only,
        high_duplicate_risk_only=high_duplicate_risk_only,
        stale_days=stale_days,
    )
    base_for_kpi = base_for_kpi_stmt.subquery()
    kpi_row = (
        await db.execute(
            select(
                func.count().label("total_kpi"),
                func.coalesce(
                    func.sum(case((func.lower(base_for_kpi.c.status) == literal("active"), 1), else_=0)),
                    0,
                ).label("active_count"),
                func.coalesce(
                    func.sum(case((func.lower(base_for_kpi.c.status) == literal("inactive"), 1), else_=0)),
                    0,
                ).label("inactive_count"),
                func.coalesce(
                    func.sum(case((base_for_kpi.c.created_at >= recent_threshold, 1), else_=0)),
                    0,
                ).label("recent_count"),
            )
        )
    ).one()
    active_count = int(kpi_row.active_count or 0)
    inactive_count = int(kpi_row.inactive_count or 0)
    recent_count = int(kpi_row.recent_count or 0)

    last_by_id: dict[int, str | None] = {}
    dup_by_id: dict[int, float] = {}
    if include_ai_fields and rows:
        ids = [r.id for r in rows]
        last_by_id = await _batch_last_activity_at(db, tenant_id, ids)
        dup_by_id = await _batch_duplicate_risk_on_page(db, tenant_id, rows)

    items: list[CustomerResponse] = []
    for row in rows:
        resp = customer_to_response(row)
        if include_ai_fields:
            la = last_by_id.get(row.id)
            resp = resp.model_copy(
                update={
                    "profile_completeness": profile_completeness_score(row),
                    "last_activity_at": la,
                    "duplicate_risk_score": dup_by_id.get(row.id, 0.0),
                    "days_since_activity": _days_since(la),
                }
            )
        items.append(resp)

    return CustomerListPageResponse(
        items=items,
        total=total,
        page=safe_page,
        page_size=page_size,
        total_pages=total_pages,
        active_count=active_count,
        inactive_count=inactive_count,
        recent_count=recent_count,
    )


async def _batch_last_activity_at(db: AsyncSession, tenant_id: int, customer_ids: list[int]) -> dict[int, str | None]:
    if not customer_ids:
        return {}
    merged: dict[int, datetime | None] = {cid: None for cid in customer_ids}
    for model in (Order, Inquiry, Quotation):
        r = await db.execute(
            select(model.customer_id, func.max(model.updated_at)).where(
                model.tenant_id == tenant_id,
                model.customer_id.in_(customer_ids),
            ).group_by(model.customer_id)
        )
        for cid, mx in r.all():
            if mx is not None and (merged[cid] is None or mx > merged[cid]):
                merged[cid] = mx
    return {k: (v.isoformat() if v else None) for k, v in merged.items()}


async def _last_activity_at(db: AsyncSession, tenant_id: int, customer_id: int) -> str | None:
    dates: list[datetime] = []
    for model in (Order, Inquiry, Quotation):
        r = await db.execute(
            select(func.max(model.updated_at)).where(
                model.tenant_id == tenant_id,
                model.customer_id == customer_id,
            )
        )
        m = r.scalar()
        if m:
            dates.append(m)
    if not dates:
        return None
    return max(dates).isoformat()


async def _batch_duplicate_risk_on_page(
    db: AsyncSession, tenant_id: int, page_rows: list[Customer]
) -> dict[int, float]:
    """Risk from duplicate emails/phones among customers on this page + DB cross-check for same email."""
    scores = {c.id: 0.0 for c in page_rows}
    by_email: dict[str, list[int]] = {}
    by_phone: dict[str, list[int]] = {}
    for c in page_rows:
        em = (c.contact_email or c.email or "").strip().lower()
        if em:
            by_email.setdefault(em, []).append(c.id)
        ph = (c.contact_phone or c.phone or "").strip()
        if len(ph) >= 6:
            by_phone.setdefault(ph, []).append(c.id)
    for ids in by_email.values():
        if len(ids) > 1:
            for i in ids:
                scores[i] = max(scores[i], 0.88)
    for ids in by_phone.values():
        if len(ids) > 1:
            for i in ids:
                scores[i] = max(scores[i], 0.72)
    emails_set = {
        (c.contact_email or c.email or "").strip().lower()
        for c in page_rows
        if (c.contact_email or c.email or "").strip()
    }
    if emails_set:
        em_col = func.lower(func.coalesce(Customer.contact_email, Customer.email, ""))
        r = await db.execute(
            select(em_col, func.count())
            .where(Customer.tenant_id == tenant_id, em_col.in_(list(emails_set)))
            .group_by(em_col)
            .having(func.count() > 1)
        )
        tenant_dup_emails = {row[0] for row in r.all() if row[0]}
        for c in page_rows:
            em = (c.contact_email or c.email or "").strip().lower()
            if em in tenant_dup_emails:
                scores[c.id] = max(scores[c.id], 0.85)
    return {k: round(min(1.0, v), 2) for k, v in scores.items()}


def _days_since(iso: str | None) -> int | None:
    if not iso:
        return None
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if d.tzinfo:
            d = d.replace(tzinfo=None)
        delta = datetime.utcnow() - d
        return max(0, int(delta.total_seconds() // 86400))
    except Exception:
        return None


async def _duplicate_risk_score(db: AsyncSession, tenant_id: int, c: Customer) -> float:
    """Lightweight 0–1 risk from same-tenant name/email/phone overlaps (excludes self)."""
    score = 0.0
    if c.contact_email or c.email:
        em = (c.contact_email or c.email or "").strip().lower()
        if em:
            r = await db.execute(
                select(func.count())
                .select_from(Customer)
                .where(
                    Customer.tenant_id == tenant_id,
                    Customer.id != c.id,
                    or_(
                        func.lower(func.coalesce(Customer.contact_email, "")) == em,
                        func.lower(func.coalesce(Customer.email, "")) == em,
                    ),
                )
            )
            if int(r.scalar() or 0) > 0:
                score = max(score, 0.85)
    phone = (c.contact_phone or c.phone or "").strip()
    if len(phone) >= 6:
        r = await db.execute(
            select(func.count())
            .select_from(Customer)
            .where(
                Customer.tenant_id == tenant_id,
                Customer.id != c.id,
                or_(
                    Customer.contact_phone == phone,
                    Customer.phone == phone,
                ),
            )
        )
        if int(r.scalar() or 0) > 0:
            score = max(score, 0.75)
    name = (c.legal_entity_name or c.name or "").strip()
    if len(name) >= 4:
        pattern = f"%{name.lower()}%"
        r = await db.execute(
            select(func.count())
            .select_from(Customer)
            .where(
                Customer.tenant_id == tenant_id,
                Customer.id != c.id,
                or_(
                    func.lower(Customer.name).like(pattern),
                    func.lower(func.coalesce(Customer.legal_entity_name, "")).like(pattern),
                    func.lower(func.coalesce(Customer.trade_name, "")).like(pattern),
                ),
            )
        )
        n = int(r.scalar() or 0)
        if n > 0:
            score = max(score, min(0.9, 0.35 + 0.15 * n))
    return round(min(1.0, score), 2)


async def get_facets(db: AsyncSession, tenant_id: int) -> CustomerFacetsResponse:
    countries_b = await db.execute(
        select(Customer.billing_country)
        .where(Customer.tenant_id == tenant_id, Customer.billing_country.isnot(None))
        .distinct()
    )
    countries_c = await db.execute(
        select(Customer.country)
        .where(Customer.tenant_id == tenant_id, Customer.country.isnot(None))
        .distinct()
    )
    country_set = {r[0].strip() for r in countries_b.all() if r[0]}
    country_set.update(r[0].strip() for r in countries_c.all() if r[0])
    types = await db.execute(
        select(Customer.customer_type)
        .where(Customer.tenant_id == tenant_id, Customer.customer_type.isnot(None))
        .distinct()
    )
    type_list = sorted({r[0].strip() for r in types.all() if r[0]})
    statuses = await db.execute(
        select(Customer.status).where(Customer.tenant_id == tenant_id).distinct()
    )
    status_list = sorted({r[0].strip() for r in statuses.all() if r[0]})
    return CustomerFacetsResponse(
        countries=sorted(country_set),
        customer_types=type_list,
        statuses=status_list,
    )


async def get_related(
    db: AsyncSession,
    *,
    tenant_id: int,
    customer_id: int,
    limit: int = 50,
) -> CustomerRelatedResponse:
    async def fetch_rows(model, code_col, status_col) -> list[CustomerRelatedRecordItem]:
        r = await db.execute(
            select(model.id, code_col, status_col, model.updated_at)
            .where(model.tenant_id == tenant_id, model.customer_id == customer_id)
            .order_by(model.updated_at.desc())
            .limit(limit)
        )
        out: list[CustomerRelatedRecordItem] = []
        for row in r.all():
            out.append(
                CustomerRelatedRecordItem(
                    id=row.id,
                    code=row[1],
                    status=str(row[2]) if row[2] is not None else "",
                    updated_at=row[3].isoformat() if row[3] else "",
                )
            )
        return out

    orders = await fetch_rows(Order, Order.order_code, Order.status)
    inquiries = await fetch_rows(Inquiry, Inquiry.inquiry_code, Inquiry.status)
    quotations = await fetch_rows(Quotation, Quotation.quotation_code, Quotation.status)
    return CustomerRelatedResponse(orders=orders, inquiries=inquiries, quotations=quotations)


async def get_health(
    db: AsyncSession,
    *,
    tenant_id: int,
    customer_id: int,
) -> CustomerHealthResponse | None:
    r = await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.tenant_id == tenant_id)
    )
    c = r.scalar_one_or_none()
    if not c:
        return None

    o_cnt = int(
        (
            await db.execute(
                select(func.count()).select_from(Order).where(
                    Order.tenant_id == tenant_id,
                    Order.customer_id == customer_id,
                )
            )
        ).scalar()
        or 0
    )
    i_cnt = int(
        (
            await db.execute(
                select(func.count()).select_from(Inquiry).where(
                    Inquiry.tenant_id == tenant_id,
                    Inquiry.customer_id == customer_id,
                )
            )
        ).scalar()
        or 0
    )
    q_cnt = int(
        (
            await db.execute(
                select(func.count()).select_from(Quotation).where(
                    Quotation.tenant_id == tenant_id,
                    Quotation.customer_id == customer_id,
                )
            )
        ).scalar()
        or 0
    )

    last_at = await _last_activity_at(db, tenant_id, customer_id)

    party_names = [
        n.strip()
        for n in (c.name, c.legal_entity_name, c.trade_name)
        if n and str(n).strip()
    ]
    recv_cnt = 0
    if party_names:
        conds = [func.lower(OutstandingBill.party_name) == nm.lower() for nm in party_names]
        recv_cnt = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(OutstandingBill)
                    .where(
                        OutstandingBill.tenant_id == tenant_id,
                        OutstandingBill.bill_type == "RECEIVABLE",
                        OutstandingBill.status == "OPEN",
                        or_(*conds),
                    )
                )
            ).scalar()
            or 0
        )

    is_active = (c.status or "active").lower() == "active"
    dup_risk = await _duplicate_risk_score(db, tenant_id, c)
    completeness = profile_completeness_score(c)

    return CustomerHealthResponse(
        customer_id=c.id,
        profile_completeness=completeness,
        is_active=is_active,
        orders_count=o_cnt,
        inquiries_count=i_cnt,
        quotations_count=q_cnt,
        outstanding_receivable_count=recv_cnt,
        last_activity_at=last_at,
        duplicate_risk_score=dup_risk,
    )


async def next_customer_code(db: AsyncSession, tenant_id: int) -> str:
    return await next_tenant_code(
        db,
        model=Customer,
        tenant_id=tenant_id,
        prefix="CUST-",
        width=3,
    )


async def create_customer(db: AsyncSession, tenant: Tenant, body: CustomerCreate) -> CustomerResponse:
    code = await next_customer_code(db, tenant.id)
    name = body.name.strip()
    billing_address_line1 = clean_optional(body.billing_address_line1)
    billing_city = clean_optional(body.billing_city)
    billing_postal_code = clean_optional(body.billing_postal_code)
    billing_country = clean_optional(body.billing_country)
    same_as_billing = body.same_as_billing

    shipping_address_line1 = clean_optional(body.shipping_address_line1)
    shipping_city = clean_optional(body.shipping_city)
    shipping_postal_code = clean_optional(body.shipping_postal_code)
    shipping_country = clean_optional(body.shipping_country)
    if same_as_billing:
        shipping_address_line1 = billing_address_line1
        shipping_city = billing_city
        shipping_postal_code = billing_postal_code
        shipping_country = billing_country

    customer = Customer(
        tenant_id=tenant.id,
        customer_code=code,
        name=name,
        address=clean_optional(body.address),
        country=clean_optional(body.country) or billing_country,
        email=clean_optional(body.email),
        phone=clean_optional(body.phone),
        website=clean_optional(body.website),
        legal_entity_name=clean_optional(body.legal_entity_name) or name,
        trade_name=clean_optional(body.trade_name),
        tax_id_vat_number=clean_optional(body.tax_id_vat_number),
        customer_type=clean_optional(body.customer_type),
        status=clean_optional(body.status) or "active",
        primary_contact_name=clean_optional(body.primary_contact_name),
        designation=clean_optional(body.designation),
        contact_email=clean_optional(body.contact_email) or clean_optional(body.email),
        contact_phone=clean_optional(body.contact_phone) or clean_optional(body.phone),
        phone_country_code=clean_optional(body.phone_country_code),
        subscribe_newsletter=body.subscribe_newsletter,
        company_logo_url=clean_optional(body.company_logo_url),
        billing_address_line1=billing_address_line1,
        billing_city=billing_city,
        billing_postal_code=billing_postal_code,
        billing_country=billing_country,
        shipping_address_line1=shipping_address_line1,
        shipping_city=shipping_city,
        shipping_postal_code=shipping_postal_code,
        shipping_country=shipping_country,
        same_as_billing=same_as_billing,
        preferred_currency=clean_optional(body.preferred_currency),
    )
    db.add(customer)
    await db.flush()
    await db.refresh(customer)
    return customer_to_response(customer)


async def update_customer(
    db: AsyncSession,
    tenant: Tenant,
    customer_id: int,
    body: CustomerUpdate,
) -> CustomerResponse | None:
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.tenant_id == tenant.id,
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        return None

    if body.name is not None:
        customer.name = body.name.strip()
    if body.address is not None:
        customer.address = clean_optional(body.address)
    if body.country is not None:
        customer.country = clean_optional(body.country)
    if body.email is not None:
        customer.email = clean_optional(body.email)
    if body.phone is not None:
        customer.phone = clean_optional(body.phone)
    if body.website is not None:
        customer.website = clean_optional(body.website)
    if body.legal_entity_name is not None:
        customer.legal_entity_name = clean_optional(body.legal_entity_name)
    if body.trade_name is not None:
        customer.trade_name = clean_optional(body.trade_name)
    if body.tax_id_vat_number is not None:
        customer.tax_id_vat_number = clean_optional(body.tax_id_vat_number)
    if body.customer_type is not None:
        customer.customer_type = clean_optional(body.customer_type)
    if body.status is not None:
        customer.status = clean_optional(body.status) or "active"
    if body.primary_contact_name is not None:
        customer.primary_contact_name = clean_optional(body.primary_contact_name)
    if body.designation is not None:
        customer.designation = clean_optional(body.designation)
    if body.contact_email is not None:
        customer.contact_email = clean_optional(body.contact_email)
    if body.contact_phone is not None:
        customer.contact_phone = clean_optional(body.contact_phone)
    if body.phone_country_code is not None:
        customer.phone_country_code = clean_optional(body.phone_country_code)
    if body.subscribe_newsletter is not None:
        customer.subscribe_newsletter = body.subscribe_newsletter
    if body.company_logo_url is not None:
        customer.company_logo_url = clean_optional(body.company_logo_url)
    if body.billing_address_line1 is not None:
        customer.billing_address_line1 = clean_optional(body.billing_address_line1)
    if body.billing_city is not None:
        customer.billing_city = clean_optional(body.billing_city)
    if body.billing_postal_code is not None:
        customer.billing_postal_code = clean_optional(body.billing_postal_code)
    if body.billing_country is not None:
        customer.billing_country = clean_optional(body.billing_country)
    if body.shipping_address_line1 is not None:
        customer.shipping_address_line1 = clean_optional(body.shipping_address_line1)
    if body.shipping_city is not None:
        customer.shipping_city = clean_optional(body.shipping_city)
    if body.shipping_postal_code is not None:
        customer.shipping_postal_code = clean_optional(body.shipping_postal_code)
    if body.shipping_country is not None:
        customer.shipping_country = clean_optional(body.shipping_country)
    if body.same_as_billing is not None:
        customer.same_as_billing = body.same_as_billing
        if body.same_as_billing:
            customer.shipping_address_line1 = customer.billing_address_line1
            customer.shipping_city = customer.billing_city
            customer.shipping_postal_code = customer.billing_postal_code
            customer.shipping_country = customer.billing_country
    if body.preferred_currency is not None:
        customer.preferred_currency = clean_optional(body.preferred_currency)

    if customer.legal_entity_name is None and customer.name:
        customer.legal_entity_name = customer.name
    if customer.country is None:
        customer.country = customer.billing_country
    if customer.contact_email is None:
        customer.contact_email = customer.email
    if customer.contact_phone is None:
        customer.contact_phone = customer.phone

    await db.flush()
    await db.refresh(customer)
    return customer_to_response(customer)


async def delete_customer(db: AsyncSession, tenant: Tenant, customer_id: int) -> bool:
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.tenant_id == tenant.id,
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        return False
    await db.delete(customer)
    await db.flush()
    return True


def max_page_size() -> int:
    return MAX_PAGE_SIZE

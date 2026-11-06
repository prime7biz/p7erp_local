"""Merch alerts list + wastage reports: SQL rewrite returns the same JSON as the old per-row code.

The `_old_*` functions are copies of the pre-rewrite algorithms (reference only).
Two pre-existing crashes are covered as well: /critical-alerts with consumption data (it passed FastAPI
`Query(...)` defaults into the wastage query) and /management-summary once wastage transactions exist.

Run: docker compose exec backend pytest tests/test_perf_merch_equivalence.py -q
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import event, func, or_, select

from app.models import (
    AlertDefinition,
    AlertInstance,
    AlertRelatedEntity,
    Bom,
    BomItem,
    Customer,
    Followup,
    GarmentStyle,
    Item,
    ItemCategory,
    Order,
    Quotation,
    StockMovement,
    WastageThresholdRule,
    WastageTransaction,
)
from app.models.costing import ItemUnit
from app.modules.merch.bom_utils import GOVERNED_BOM_STATUSES
from app.modules.merch.deps import to_float_safe
from app.modules.merch.material_helpers import material_group_from_item
from app.modules.merch.routers.alerts import _alert_priority_score, _alert_sla_bucket
from app.modules.merch.routers.wastage import _resolve_wastage_threshold_pct

from tests.benchmark_fixtures import api_client, seed_tenant_admin


@contextmanager
def count_queries(db):
    """Count SQL statements sent to PostgreSQL while the block runs."""
    counter = {"n": 0}
    engine = db.bind.sync_engine

    def _on_execute(*_args, **_kwargs):
        counter["n"] += 1

    event.listen(engine, "before_cursor_execute", _on_execute)
    try:
        yield counter
    finally:
        event.remove(engine, "before_cursor_execute", _on_execute)


# ---------- Old (pre-rewrite) reference: alerts list ----------


async def _old_list_alerts(
    db,
    tenant_id: int,
    *,
    severity=None,
    status_filter=None,
    alert_type=None,
    entity_type=None,
    entity_id=None,
    order_id=None,
    assigned_to_id=None,
    min_priority_score=None,
    sla_bucket=None,
    page=1,
    page_size=20,
    sort="-created_at",
):
    stmt = select(AlertInstance).where(AlertInstance.tenant_id == tenant_id)
    if entity_type:
        stmt = stmt.join(AlertDefinition, AlertInstance.definition_id == AlertDefinition.id).where(
            AlertDefinition.tenant_id == tenant_id,
            AlertDefinition.entity_type == entity_type.strip().lower(),
        )
    if entity_id is not None:
        rel_sub = select(AlertRelatedEntity.alert_id).where(
            AlertRelatedEntity.tenant_id == tenant_id,
            AlertRelatedEntity.entity_id == entity_id,
        )
        if entity_type:
            rel_sub = rel_sub.where(AlertRelatedEntity.entity_type == entity_type.strip().lower())
        stmt = stmt.where(AlertInstance.id.in_(rel_sub))
    if severity:
        stmt = stmt.where(AlertInstance.severity == severity.lower())
    if status_filter:
        stmt = stmt.where(AlertInstance.status == status_filter.lower())
    if alert_type:
        stmt = stmt.where(AlertInstance.alert_type == alert_type)
    if assigned_to_id is not None:
        stmt = stmt.where(AlertInstance.assigned_to_id == assigned_to_id)
    if order_id is not None:
        sub = select(AlertRelatedEntity.alert_id).where(
            AlertRelatedEntity.tenant_id == tenant_id,
            AlertRelatedEntity.entity_type == "order",
            AlertRelatedEntity.entity_id == order_id,
        )
        stmt = stmt.where(AlertInstance.id.in_(sub))
    now = datetime.now(timezone.utc)
    stmt = stmt.where(or_(AlertInstance.snoozed_until.is_(None), AlertInstance.snoozed_until <= now))
    needs_python_pagination = (
        min_priority_score is not None
        or (sla_bucket is not None and sla_bucket.strip() != "")
        or sort.lstrip("-") == "priority_score"
    )
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    sort_col = AlertInstance.created_at
    if sort.lstrip("-") == "updated_at":
        sort_col = AlertInstance.updated_at
    elif sort.lstrip("-") == "severity":
        sort_col = AlertInstance.severity
    stmt = stmt.order_by(sort_col.desc() if sort.startswith("-") else sort_col.asc())
    if not needs_python_pagination:
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()
    items = []
    normalized_sla_bucket = (sla_bucket or "").strip().lower() or None
    for r in rows:
        primary_rel = (
            await db.execute(
                select(AlertRelatedEntity).where(
                    AlertRelatedEntity.alert_id == r.id,
                    AlertRelatedEntity.role == "primary",
                ).limit(1)
            )
        ).scalar_one_or_none()
        order_code = None
        link_order_id = None
        link_entity_type = primary_rel.entity_type if primary_rel else None
        link_entity_id = primary_rel.entity_id if primary_rel else None
        if primary_rel and primary_rel.entity_type == "order":
            link_order_id = primary_rel.entity_id
            order_row = await db.get(Order, primary_rel.entity_id)
            if order_row and order_row.tenant_id == tenant_id:
                order_code = order_row.order_code
        priority_score = _alert_priority_score(r, now)
        item_sla_bucket = _alert_sla_bucket(r, now)
        item = {
            "id": r.id,
            "natural_key": r.natural_key,
            "title": r.title,
            "description": r.description,
            "severity": r.severity,
            "status": r.status,
            "alert_type": r.alert_type,
            "assigned_to_id": r.assigned_to_id,
            "entity_type": link_entity_type,
            "entity_id": link_entity_id,
            "order_id": link_order_id,
            "order_code": order_code,
            "reason_text": r.reason_text,
            "recommended_action": r.recommended_action,
            "evidence_json": r.evidence_json,
            "priority_score": priority_score,
            "sla_bucket": item_sla_bucket,
            "snoozed_until": r.snoozed_until.isoformat() if r.snoozed_until else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        if min_priority_score is not None and priority_score < min_priority_score:
            continue
        if normalized_sla_bucket and normalized_sla_bucket != item_sla_bucket:
            continue
        items.append(item)
    if sort.lstrip("-") == "priority_score":
        items.sort(key=lambda x: x["priority_score"], reverse=sort.startswith("-"))
    if needs_python_pagination:
        total = len(items)
        start = (page - 1) * page_size
        items = items[start : start + page_size]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ---------- Old (pre-rewrite) reference: wastage report rows ----------


async def _old_wastage_rows(db, tenant_id, *, order_id=None, style_id=None, buyer_id=None, date_from=None,
                            date_to=None, threshold_pct=None, above_threshold_only=False) -> list[dict]:
    threshold_rules = list(
        (await db.execute(select(WastageThresholdRule).where(WastageThresholdRule.tenant_id == tenant_id))).scalars().all()
    )
    oids = [
        x
        for x in (
            await db.execute(
                select(StockMovement.reference_id).where(
                    StockMovement.tenant_id == tenant_id,
                    StockMovement.reference_type == "CONSUMPTION_ISSUE",
                    StockMovement.reference_id.isnot(None),
                ).distinct()
            )
        ).scalars().all()
        if x is not None
    ]
    if not oids:
        return []
    stmt = select(Order).where(Order.tenant_id == tenant_id, Order.id.in_(oids))
    if order_id is not None:
        stmt = stmt.where(Order.id == order_id)
    if buyer_id is not None:
        stmt = stmt.where(Order.customer_id == buyer_id)
    if date_from is not None:
        stmt = stmt.where(Order.order_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Order.order_date <= date_to)
    orders = sorted((await db.execute(stmt)).scalars().all(), key=lambda o: o.id)
    if not orders:
        return []
    out: list[dict] = []
    qids = {o.quotation_id for o in orders if o.quotation_id}
    quotations = {q.id: q for q in (await db.execute(select(Quotation).where(Quotation.id.in_(qids)))).scalars().all()} if qids else {}
    style_ids = {q.style_id for q in quotations.values() if q.style_id}
    styles_map = (
        {s.id: s for s in (await db.execute(select(GarmentStyle).where(GarmentStyle.id.in_(style_ids)))).scalars().all()}
        if style_ids
        else {}
    )
    cids = {o.customer_id for o in orders if o.customer_id}
    customers = {c.id: c for c in (await db.execute(select(Customer).where(Customer.id.in_(cids)))).scalars().all()} if cids else {}
    bom_by_style: dict[int, Bom] = {}
    if style_ids:
        for b in (
            await db.execute(
                select(Bom).where(Bom.tenant_id == tenant_id, Bom.style_id.in_(style_ids), Bom.status.in_(GOVERNED_BOM_STATUSES))
            )
        ).scalars().all():
            cur = bom_by_style.get(b.style_id)
            if cur is None or (b.version_no or 0) > (cur.version_no or 0):
                bom_by_style[b.style_id] = b
    bom_ids = [b.id for b in bom_by_style.values()]
    bom_lines_by_bom: dict[int, list[BomItem]] = defaultdict(list)
    if bom_ids:
        for bi in (
            await db.execute(
                select(BomItem).where(BomItem.tenant_id == tenant_id, BomItem.bom_id.in_(bom_ids), BomItem.item_id.isnot(None))
            )
        ).scalars().all():
            bom_lines_by_bom[bi.bom_id].append(bi)
    all_item_ids = {bi.item_id for lines in bom_lines_by_bom.values() for bi in lines if bi.item_id}
    items_map = (
        {i.id: i for i in (await db.execute(select(Item).where(Item.tenant_id == tenant_id, Item.id.in_(all_item_ids)))).scalars().all()}
        if all_item_ids
        else {}
    )
    cat_ids = {it.category_id for it in items_map.values() if it.category_id}
    categories = (
        {c.id: c for c in (await db.execute(select(ItemCategory).where(ItemCategory.id.in_(cat_ids)))).scalars().all()}
        if cat_ids
        else {}
    )
    mov_map: dict[tuple[int, int], list[StockMovement]] = defaultdict(list)
    for m in (
        await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.reference_type == "CONSUMPTION_ISSUE",
                StockMovement.reference_id.in_([o.id for o in orders]),
            )
        )
    ).scalars().all():
        if m.reference_id is not None and m.item_id is not None:
            mov_map[(m.reference_id, m.item_id)].append(m)
    for order in orders:
        allowed_pct = _resolve_wastage_threshold_pct(threshold_rules, order.customer_id)
        if not order.quotation_id:
            continue
        quotation = quotations.get(order.quotation_id)
        if not quotation or quotation.tenant_id != tenant_id or not quotation.style_id:
            continue
        sid = quotation.style_id
        if style_id is not None and sid != style_id:
            continue
        style = styles_map.get(sid)
        customer = customers.get(order.customer_id) if order.customer_id else None
        order_qty = to_float_safe(str(order.quantity)) if order.quantity is not None else 0.0
        if order_qty <= 0:
            continue
        bom = bom_by_style.get(sid)
        if not bom:
            continue
        for line in bom_lines_by_bom.get(bom.id, []):
            item = items_map.get(line.item_id)
            if not item or item.tenant_id != tenant_id:
                continue
            cat = categories.get(item.category_id) if item.category_id else None
            expected = order_qty * to_float_safe(line.base_consumption) * (1.0 + to_float_safe(line.wastage_pct) / 100.0)
            actual = sum(
                to_float_safe(m.quantity)
                for m in mov_map.get((order.id, line.item_id), [])
                if (m.movement_type or "").upper() == "OUT"
            )
            wastage_pct = 0.0 if expected <= 0 else round((actual - expected) / expected * 100.0, 2)
            use_threshold = threshold_pct if threshold_pct is not None else (allowed_pct if above_threshold_only else None)
            if use_threshold is not None and wastage_pct < use_threshold:
                continue
            unit_cost = to_float_safe(item.default_cost)
            out.append(
                {
                    "order_id": order.id,
                    "order_code": order.order_code,
                    "order_date": order.order_date.isoformat() if order.order_date else None,
                    "delivery_date": order.delivery_date.isoformat() if order.delivery_date else None,
                    "buyer_id": order.customer_id,
                    "buyer_name": customer.name if customer else f"Customer #{order.customer_id}",
                    "style_id": sid,
                    "style_code": style.style_code if style else str(sid),
                    "item_id": line.item_id,
                    "item_code": item.item_code,
                    "item_name": item.name or item.description or "",
                    "category": material_group_from_item(item, cat),
                    "expected_qty": round(expected, 4),
                    "actual_qty": round(actual, 4),
                    "wastage_pct_vs_bom": wastage_pct,
                    "wastage_value": round(max(0.0, actual - expected) * unit_cost, 2),
                    "allowed_threshold_pct": allowed_pct,
                    "threshold_breach": wastage_pct > allowed_pct,
                }
            )
    return out


def _by_key(rows: list[dict]) -> list[dict]:
    return sorted(rows, key=lambda r: (r["order_id"], r["item_id"], r["expected_qty"]))


# ---------- Seeds ----------


async def _seed_alerts(db, tenant, *, n: int = 10, other_tenant_order: Order | None = None):
    slug = uuid.uuid4().hex[:6]
    defn = AlertDefinition(tenant_id=tenant.id, rule_key=f"perf_{slug}", name="Perf rule", severity_default="high", entity_type="order")
    defn_style = AlertDefinition(tenant_id=tenant.id, rule_key=f"perfs_{slug}", name="Perf style", severity_default="low", entity_type="style")
    db.add_all([defn, defn_style])
    cust = Customer(tenant_id=tenant.id, customer_code=f"AC{slug}", name="Alert buyer", status="active")
    db.add(cust)
    await db.flush()
    orders = [Order(tenant_id=tenant.id, customer_id=cust.id, order_code=f"AO{k}-{slug}", status="NEW") for k in range(3)]
    db.add_all(orders)
    await db.flush()
    now = datetime.now(timezone.utc)
    severities = ["critical", "High", "medium", "low", "informational", "weird", "high", "critical", "low", "medium"]
    statuses = ["open", "open", "resolved", "acknowledged", "Closed", "open", "escalated", "open", "open", "in_progress"]
    ages = [1, 30, 50, 80, 130, 200, 300, 26, 121, 73]
    alerts = []
    for k in range(n):
        a = AlertInstance(
            tenant_id=tenant.id,
            definition_id=(defn if k % 4 else defn_style).id,
            natural_key=f"perf:{slug}:{k}",
            title=f"Alert {k}",
            severity=severities[k % 10],
            status=statuses[k % 10],
            alert_type="late_tna" if k % 2 else "wastage",
            escalation_level=[None, 1, 2][k % 3],
            created_at=now - timedelta(hours=ages[k % 10] + 24 * (k // 10), minutes=30),
            updated_at=now - timedelta(minutes=k),
            evidence_json={"k": k} if k % 3 == 0 else None,
            snoozed_until=(now + timedelta(days=1)) if k == 5 else ((now - timedelta(hours=1)) if k == 6 else None),
        )
        db.add(a)
        alerts.append(a)
    await db.flush()
    rels = []
    for k, a in enumerate(alerts):
        if k % 5 == 0:
            continue  # no related entity
        if k % 5 == 1:
            rels.append(AlertRelatedEntity(tenant_id=tenant.id, alert_id=a.id, entity_type="order", entity_id=orders[k % 3].id, role="primary"))
        elif k % 5 == 2:
            rels.append(AlertRelatedEntity(tenant_id=tenant.id, alert_id=a.id, entity_type="style", entity_id=999000 + k, role="primary"))
            rels.append(AlertRelatedEntity(tenant_id=tenant.id, alert_id=a.id, entity_type="order", entity_id=orders[0].id, role="secondary"))
        elif k % 5 == 3 and other_tenant_order is not None:
            rels.append(AlertRelatedEntity(tenant_id=tenant.id, alert_id=a.id, entity_type="order", entity_id=other_tenant_order.id, role="primary"))
        else:
            rels.append(AlertRelatedEntity(tenant_id=tenant.id, alert_id=a.id, entity_type="order", entity_id=orders[1].id, role=None))
    db.add_all(rels)
    await db.flush()
    return orders, alerts


ALERT_PARAM_CASES = [
    {},
    {"sort": "-priority_score"},
    {"sort": "priority_score", "page_size": 3, "page": 2},
    {"min_priority_score": 100},
    {"min_priority_score": 100, "sort": "severity"},
    {"sla_bucket": "breach"},
    {"sla_bucket": " MET ", "page_size": 1, "page": 2},
    {"sla_bucket": "at_risk", "sort": "-priority_score", "page_size": 2},
    {"sort": "-updated_at", "page_size": 4},
    {"sort": "created_at", "page": 2, "page_size": 3},
    {"entity_type": "order", "sort": "-priority_score"},
    {"status": "open", "min_priority_score": 50},
    {"severity": "critical"},
    {"alert_type": "late_tna", "sla_bucket": "at_risk"},
    {"page": 9},
]


def _params_to_old(params: dict) -> dict:
    out = dict(params)
    if "status" in out:
        out["status_filter"] = out.pop("status")
    return out


@pytest.mark.asyncio
async def test_alert_list_matches_old_algorithm(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    other, other_user = await seed_tenant_admin(db)
    other_cust = Customer(tenant_id=other.id, customer_code="OTHER", name="Other buyer", status="active")
    db.add(other_cust)
    await db.flush()
    other_order = Order(tenant_id=other.id, customer_id=other_cust.id, order_code="OTHER-ORDER", status="NEW")
    db.add(other_order)
    await db.flush()
    orders, _ = await _seed_alerts(db, tenant, n=10, other_tenant_order=other_order)
    await _seed_alerts(db, other, n=10)
    await db.commit()

    async with api_client(db, tenant, user) as ac:
        for params in ALERT_PARAM_CASES + [{"order_id": orders[1].id}, {"entity_id": orders[0].id, "entity_type": "order"}]:
            r = await ac.get("/api/v1/merch/alerts", params=params)
            assert r.status_code == 200, (params, r.text)
            assert r.json() == await _old_list_alerts(db, tenant.id, **_params_to_old(params)), params

        body = (await ac.get("/api/v1/merch/alerts", params={"page_size": 50})).json()
        assert body["total"] == 9  # snoozed-until-tomorrow alert is hidden
        assert all(i["title"].startswith("Alert ") for i in body["items"])
        by_title = {i["title"]: i for i in body["items"]}
        assert by_title["Alert 1"]["order_code"] == orders[1].order_code
        assert by_title["Alert 3"]["order_id"] == other_order.id and by_title["Alert 3"]["order_code"] is None
        assert by_title["Alert 2"]["entity_type"] == "style" and by_title["Alert 2"]["order_id"] is None
        assert by_title["Alert 4"]["entity_type"] is None
        assert by_title["Alert 0"]["priority_score"] == 100 + 1 + 0
        assert by_title["Alert 6"]["priority_score"] == 70 + 240 + 0
        assert by_title["Alert 2"]["sla_bucket"] == "met"
        assert by_title["Alert 1"]["sla_bucket"] == "at_risk"

        scores = [i["priority_score"] for i in (await ac.get("/api/v1/merch/alerts", params={"sort": "-priority_score", "page_size": 50})).json()["items"]]
        assert scores == sorted(scores, reverse=True)

    async with api_client(db, other, other_user) as ac:
        r = await ac.get("/api/v1/merch/alerts", params={"page_size": 50})
        assert r.json()["total"] == 9
        assert r.json() == await _old_list_alerts(db, other.id, page_size=50)


@pytest.mark.asyncio
async def test_alert_list_query_count(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    await _seed_alerts(db, tenant, n=10)
    await db.commit()
    counts = {}
    async with api_client(db, tenant, user) as ac:
        for label, params in (("default", {}), ("priority_sort", {"sort": "-priority_score"})):
            db.expunge_all()
            with count_queries(db) as c:
                r = await ac.get("/api/v1/merch/alerts", params=params)
            assert r.status_code == 200
            counts[label] = c["n"]
    print("merch alerts list query counts for 10 alerts:", counts)
    # tenant lookup (router dependency) + count + page + primary related entities + order codes
    assert counts["default"] <= 5 and counts["priority_sort"] <= 5, counts


async def _seed_wastage(db, tenant):
    """Two buyers / styles, governed BOM versions, consumption movements, and noise that must be ignored."""
    slug = uuid.uuid4().hex[:6]
    today = date(2026, 10, 15)
    b1 = Customer(tenant_id=tenant.id, customer_code=f"B1{slug}", name="Buyer A", status="active")
    b2 = Customer(tenant_id=tenant.id, customer_code=f"B2{slug}", name="Buyer B", status="active")
    db.add_all([b1, b2])
    await db.flush()
    db.add_all(
        [
            WastageThresholdRule(tenant_id=tenant.id, scope_type="tenant", scope_id=None, allowed_pct=10, critical_pct=20),
            WastageThresholdRule(tenant_id=tenant.id, scope_type="buyer", scope_id=b2.id, allowed_pct=5, critical_pct=8),
        ]
    )
    s1 = GarmentStyle(tenant_id=tenant.id, style_code=f"S1{slug}", name="Polo", status="ACTIVE")
    s2 = GarmentStyle(tenant_id=tenant.id, style_code=f"S2{slug}", name="Tee", status="ACTIVE")
    db.add_all([s1, s2])
    await db.flush()
    fab = ItemCategory(tenant_id=tenant.id, category_code=f"FAB{slug}", name="Fabric")
    trim = ItemCategory(tenant_id=tenant.id, category_code=f"TRIM{slug}", name="Trims")
    misc = ItemCategory(tenant_id=tenant.id, category_code=f"MSC{slug}", name="Misc")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}", name="Pcs")
    db.add_all([fab, trim, misc, unit])
    await db.flush()
    i_fab = Item(tenant_id=tenant.id, item_code=f"FAB-{slug}", name="Jersey", category_id=fab.id, unit_id=unit.id, default_cost=Decimal("2.5"))
    i_trim = Item(tenant_id=tenant.id, item_code=f"TRM-{slug}", name="", description="Button desc", category_id=trim.id, unit_id=unit.id, default_cost=Decimal("0.25"))
    i_misc = Item(tenant_id=tenant.id, item_code=f"MSC-{slug}", name="Label", category_id=misc.id, unit_id=unit.id, default_cost=Decimal("1"))
    db.add_all([i_fab, i_trim, i_misc])
    await db.flush()

    def _q(cust, style):
        return Quotation(tenant_id=tenant.id, customer_id=cust.id, quotation_code=f"Q{uuid.uuid4().hex[:8]}", style_id=style.id, status="NEW", currency="USD")

    q1, q2, q3, q5, q6 = _q(b1, s1), _q(b2, s2), _q(b1, s1), _q(b1, s1), _q(b2, s2)
    db.add_all([q1, q2, q3, q5, q6])
    await db.flush()

    def _o(code, cust, q, qty, d):
        return Order(tenant_id=tenant.id, customer_id=cust.id, quotation_id=q.id if q else None,
                     order_code=f"{code}-{slug}", status="CONFIRMED", quantity=qty, order_date=d,
                     delivery_date=d + timedelta(days=60) if d else None)

    o1 = _o("W1", b1, q1, 100, today)
    o2 = _o("W2", b2, q2, 50, today - timedelta(days=3))
    o3 = _o("W3", b1, q3, 0, today)
    o4 = _o("W4", b1, None, 100, today)
    o5 = _o("W5", b1, q5, 40, today - timedelta(days=8))  # previous period for management summary
    o6 = _o("W6", b2, q6, 10, None)
    db.add_all([o1, o2, o3, o4, o5, o6])
    await db.flush()

    def _bom(style, status, version):
        return Bom(tenant_id=tenant.id, style_id=style.id, status=status, is_legacy=True, is_active=True,
                   bom_code=f"BOM-{uuid.uuid4().hex[:8]}", version_no=version)

    bom1_v1, bom1_v2, bom1_draft, bom2 = _bom(s1, "APPROVED", 1), _bom(s1, "FROZEN", 2), _bom(s1, "DRAFT", 3), _bom(s2, "APPROVED", 1)
    db.add_all([bom1_v1, bom1_v2, bom1_draft, bom2])
    await db.flush()

    def _bi(bom, item, base, wpct, cat="fabric"):
        return BomItem(tenant_id=tenant.id, bom_id=bom.id, item_id=item.id if item else None, category=cat,
                       base_consumption=Decimal(base), wastage_pct=Decimal(wpct) if wpct is not None else None)

    db.add_all(
        [
            _bi(bom1_v1, i_fab, "9", "0"),
            _bi(bom1_v2, i_fab, "1.5", "4"),
            _bi(bom1_v2, i_trim, "2", None, "trim"),
            _bi(bom1_v2, None, "1", "1"),
            _bi(bom1_draft, i_misc, "1", "1"),
            _bi(bom2, i_misc, "0", "0"),
            _bi(bom2, i_trim, "1", "10", "trim"),
        ]
    )

    def _mv(order, item, qty, mtype="OUT", ref="CONSUMPTION_ISSUE", tenant_id=tenant.id):
        return StockMovement(tenant_id=tenant_id, item_id=item.id, movement_type=mtype, quantity=Decimal(qty),
                             reference_type=ref, reference_id=order.id if order else None)

    db.add_all(
        [
            _mv(o1, i_fab, "100.5"),
            _mv(o1, i_fab, "80.25"),
            _mv(o1, i_fab, "10", mtype="IN"),
            _mv(o1, i_fab, "5", mtype="out"),
            _mv(o1, i_fab, "50", ref="GRN"),
            _mv(o1, i_trim, "150"),
            _mv(o2, i_trim, "52.5"),
            _mv(o3, i_fab, "5"),
            _mv(o4, i_fab, "5"),
            _mv(o5, i_fab, "70"),
            _mv(o6, i_trim, "11"),
            _mv(None, i_fab, "1"),
        ]
    )
    await db.flush()
    return {"orders": [o1, o2, o3, o4, o5, o6], "styles": [s1, s2], "buyers": [b1, b2], "items": [i_fab, i_trim, i_misc]}


WASTAGE_PARAM_CASES = [
    {},
    {"threshold_pct": 10},
    {"above_threshold_only": "true"},
    {"buyer_id": "B2"},
    {"style_id": "S1"},
    {"order_id": "O1"},
    {"date_from": "2026-10-13", "date_to": "2026-10-15"},
]


@pytest.mark.asyncio
async def test_wastage_reports_match_old_algorithm(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    other, _ = await seed_tenant_admin(db)
    s = await _seed_wastage(db, tenant)
    o_other = await _seed_wastage(db, other)
    # Other tenant's consumption pointing at this tenant's order id must be ignored.
    db.add(StockMovement(tenant_id=other.id, item_id=o_other["items"][0].id, movement_type="OUT", quantity=Decimal("999"),
                         reference_type="CONSUMPTION_ISSUE", reference_id=s["orders"][0].id))
    await db.commit()
    o1, o2, o3, o4, o5, o6 = s["orders"]
    names = {"B2": s["buyers"][1].id, "S1": s["styles"][0].id, "O1": o1.id}

    async with api_client(db, tenant, user) as ac:
        for params in WASTAGE_PARAM_CASES:
            http_params = {k: names.get(v, v) for k, v in params.items()}
            r = await ac.get("/api/v1/merch/reports/wastage", params=http_params)
            assert r.status_code == 200, (params, r.text)
            old_kwargs = {k: (v == "true" if k == "above_threshold_only" else
                              date.fromisoformat(v) if k.startswith("date_") else
                              float(v) if k == "threshold_pct" else v) for k, v in http_params.items()}
            assert _by_key(r.json()) == _by_key(await _old_wastage_rows(db, tenant.id, **old_kwargs)), params

        rows = {(x["order_code"], x["item_code"]): x for x in (await ac.get("/api/v1/merch/reports/wastage")).json()}
        fab, trm, msc = (i.item_code for i in s["items"])
        assert set(rows) == {
            (o1.order_code, fab), (o1.order_code, trm),
            (o2.order_code, msc), (o2.order_code, trm),
            (o5.order_code, fab), (o5.order_code, trm),
            (o6.order_code, msc), (o6.order_code, trm),
        }
        assert rows[(o2.order_code, msc)]["wastage_pct_vs_bom"] == 0.0
        assert rows[(o1.order_code, fab)]["expected_qty"] == 156.0  # 100 × 1.5 × 1.04 (FROZEN v2 BOM)
        assert rows[(o1.order_code, fab)]["actual_qty"] == 185.75  # 100.5 + 80.25 + 5 ("out")
        assert rows[(o1.order_code, fab)]["wastage_value"] == 74.38
        assert rows[(o1.order_code, trm)]["item_name"] == "Button desc"
        assert rows[(o2.order_code, trm)]["allowed_threshold_pct"] == 5.0
        assert rows[(o2.order_code, trm)]["threshold_breach"] is False

        summary = (await ac.get("/api/v1/merch/reports/wastage/summary")).json()
        old_all = await _old_wastage_rows(db, tenant.id)
        assert summary["total_rows"] == len(old_all) == 8
        assert summary["total_wastage_value"] == round(sum(r["wastage_value"] for r in old_all), 2)

        params = {"date_from": "2026-10-10", "date_to": "2026-10-15"}
        mgmt = (await ac.get("/api/v1/merch/reports/wastage/management-summary", params=params)).json()
        cur = await _old_wastage_rows(db, tenant.id, date_from=date(2026, 10, 10), date_to=date(2026, 10, 15))
        prev = await _old_wastage_rows(db, tenant.id, date_from=date(2026, 10, 4), date_to=date(2026, 10, 9))
        assert prev, "seed must have previous-period rows"
        assert mgmt["mom_change"] == {
            "current_total": round(sum(r["wastage_value"] for r in cur), 2),
            "previous_total": round(sum(r["wastage_value"] for r in prev), 2),
            "current_above_threshold": len({r["order_id"] for r in cur if r["threshold_breach"]}),
            "previous_above_threshold": len({r["order_id"] for r in prev if r["threshold_breach"]}),
        }
        order_totals: dict[int, float] = defaultdict(float)
        for r in cur:
            order_totals[r["order_id"]] += r["wastage_value"]
        assert [x["order_id"] for x in mgmt["top_orders"]] == [k for k, _ in sorted(order_totals.items(), key=lambda kv: -kv[1])]

        db.add(WastageTransaction(tenant_id=tenant.id, order_id=o1.id, process_stage="cutting",
                                  quantity=Decimal("2"), unit_cost=Decimal("3"), value=Decimal("6")))
        await db.commit()
        mgmt = (await ac.get("/api/v1/merch/reports/wastage/management-summary", params=params)).json()
        assert mgmt["top_reasons"] == [{"reason_code": "reason_0", "reason_name": "Unknown", "value": 6.0, "count": 1}]

        reversed_range = (await ac.get("/api/v1/merch/reports/wastage/management-summary",
                                       params={"date_from": "2026-10-15", "date_to": "2026-10-10"})).json()
        assert reversed_range["mom_change"] == {"current_total": 0.0, "previous_total": 0.0,
                                                "current_above_threshold": 0, "previous_above_threshold": 0}

        trends = (await ac.get("/api/v1/merch/reports/wastage/trends", params={"group_by": "buyer"})).json()
        assert {b["buyer_id"] for b in trends["by_buyer"]} == {s["buyers"][0].id, s["buyers"][1].id}

        r = await ac.post("/api/v1/merch/reports/wastage/refresh-summary")
        assert r.status_code == 200, r.text
        assert r.json() == {"updated_orders": len({x["order_id"] for x in old_all})}

        db.add(Followup(tenant_id=tenant.id, order_id=o1.id, title="Overdue", status="OPEN", due_date=date.today() - timedelta(days=9)))
        await db.commit()
        crit = await ac.get("/api/v1/merch/critical-alerts", params={"wastage_threshold_pct": 15})
        assert crit.status_code == 200, crit.text
        wastage_alerts = [a for a in crit.json()["alerts"] if a["category"] == "High Wastage"]
        expected = [r for r in old_all if r["wastage_pct_vs_bom"] >= 15]
        assert sorted(a["id"] for a in wastage_alerts) == sorted(f"wastage-{r['order_id']}-{r['item_id']}" for r in expected)
        assert crit.json()["summary"]["critical"] == 1

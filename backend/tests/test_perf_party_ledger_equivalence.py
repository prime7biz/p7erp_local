"""Party ledger list + aging: SQL-aggregated output must match the old per-row algorithm.

The ``_reference_*`` functions below are verbatim copies of the original (N+1) implementations.
Each test calls the real HTTP endpoint and compares the JSON with the reference output, plus a
pure-Python expectation computed straight from the seeded bill specs.

Run:
    docker compose exec backend pytest tests/test_perf_party_ledger_equivalence.py -q
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi.encoders import jsonable_encoder
from sqlalchemy import event, select

from app.common.tenant_feature_keys import PARTY_LEDGER_ENABLED
from app.models import Customer, Vendor
from app.models.finance import AccountGroup, ChartOfAccount, Voucher
from app.models.party_ledger import PartyLedger, PartyLedgerBill, PartyLedgerBillAllocation
from tests.benchmark_fixtures import api_client, seed_tenant_admin
from tests.query_counting import is_rls_housekeeping

AS_OF = date(2026, 6, 30)
ZERO = Decimal("0")

# (days past due on AS_OF — None means "no due date, bill dated 40 days ago", status, original, pending)
BILL_SPECS: list[tuple[int | None, str, str, str]] = [
    (-10, "PENDING", "100.00", "100.00"),
    (0, "PENDING", "50.25", "50.25"),
    (1, "OVERDUE", "80.00", "80.00"),
    (30, "PARTIAL", "120.00", "70.50"),
    (31, "OVERDUE", "60.00", "60.00"),
    (60, "PARTIAL", "90.00", "45.00"),
    (61, "OVERDUE", "33.33", "33.33"),
    (90, "OVERDUE", "10.00", "10.00"),
    (91, "OVERDUE", "500.00", "500.00"),
    (200, "PARTIAL", "75.00", "25.00"),
    (45, "SETTLED", "40.00", "0.00"),
    (15, "CANCELLED", "20.00", "20.00"),
    (20, "OVERDUE", "15.00", "0.00"),
    (None, "PENDING", "12.00", "12.00"),
]


# ---------------------------------------------------------------------------
# Reference (old) algorithms — do not "optimize" these.
# ---------------------------------------------------------------------------


def _d(value: Any) -> Decimal:
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value).replace(",", "") or "0")


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


async def _reference_party_name(db, pl: PartyLedger) -> str:
    if pl.party_type == "CUSTOMER" and pl.customer_id:
        c = await db.get(Customer, pl.customer_id)
        return c.name if c else f"Customer #{pl.customer_id}"
    if pl.vendor_id:
        v = await db.get(Vendor, pl.vendor_id)
        return v.name if v else f"Vendor #{pl.vendor_id}"
    return f"PartyLedger #{pl.id}"


async def _reference_bill_summary_counts(db, party_ledger_id: int) -> dict[str, int]:
    statuses = (
        await db.execute(
            select(PartyLedgerBill.status).where(PartyLedgerBill.party_ledger_id == party_ledger_id)
        )
    ).scalars().all()
    counts = {"PENDING": 0, "PARTIAL": 0, "SETTLED": 0, "OVERDUE": 0, "CANCELLED": 0}
    for st in statuses:
        key = (st or "PENDING").upper()
        if key in counts:
            counts[key] += 1
    return counts


async def _reference_party_ledger_out(db, pl: PartyLedger) -> dict[str, Any]:
    acct = await db.get(ChartOfAccount, pl.ledger_account_id)
    overdue_amt = (
        await db.execute(
            select(PartyLedgerBill).where(
                PartyLedgerBill.party_ledger_id == pl.id,
                PartyLedgerBill.status == "OVERDUE",
                PartyLedgerBill.pending_amount > 0,
            )
        )
    ).scalars().all()
    overdue_total = _money(sum((_d(b.pending_amount) for b in overdue_amt), Decimal("0")))
    credit_limit = _d(pl.credit_limit) if pl.credit_limit is not None else None
    bal = _d(pl.current_balance)
    available = None
    if credit_limit is not None:
        used = bal if (pl.current_balance_type or "DR") == "DR" else Decimal("0")
        available = _money(credit_limit - used)

    return {
        "id": pl.id,
        "party_type": pl.party_type,
        "customer_id": pl.customer_id,
        "vendor_id": pl.vendor_id,
        "party_name": await _reference_party_name(db, pl),
        "ledger_account_id": pl.ledger_account_id,
        "ledger_account_name": acct.name if acct else None,
        "ledger_account_number": acct.account_number if acct else None,
        "credit_limit": str(credit_limit) if credit_limit is not None else None,
        "credit_days": pl.credit_days,
        "interest_rate_monthly": str(pl.interest_rate_monthly)
        if pl.interest_rate_monthly is not None
        else None,
        "opening_balance": str(_money(_d(pl.opening_balance))),
        "opening_balance_type": pl.opening_balance_type,
        "opening_balance_date": pl.opening_balance_date.isoformat() if pl.opening_balance_date else None,
        "current_balance": str(_money(bal)),
        "current_balance_type": pl.current_balance_type,
        "total_dr_amount": str(_money(_d(pl.total_dr_amount))),
        "total_cr_amount": str(_money(_d(pl.total_cr_amount))),
        "available_credit": str(available) if available is not None else None,
        "overdue_amount": str(overdue_total),
        "bill_wise_tracking": pl.bill_wise_tracking,
        "tds_section_id": getattr(pl, "tds_section_id", None),
        "is_active": pl.is_active,
        "bill_summary": await _reference_bill_summary_counts(db, pl.id),
        "created_at": pl.created_at.isoformat() if pl.created_at else None,
        "updated_at": pl.updated_at.isoformat() if pl.updated_at else None,
    }


async def _reference_aging(
    db,
    tenant_id: int,
    party_ledger_id: int | None = None,
    as_of_date: date | None = None,
    party_type: str | None = None,
) -> dict[str, Any]:
    as_of = as_of_date or date.today()
    filters = [PartyLedger.tenant_id == tenant_id, PartyLedger.is_active.is_(True)]
    if party_ledger_id:
        filters.append(PartyLedger.id == party_ledger_id)
    if party_type:
        filters.append(PartyLedger.party_type == party_type.strip().upper())

    ledgers = (await db.execute(select(PartyLedger).where(*filters).order_by(PartyLedger.id))).scalars().all()

    parties: list[dict[str, Any]] = []
    grand = {
        "not_due": ZERO,
        "days_1_30": ZERO,
        "days_31_60": ZERO,
        "days_61_90": ZERO,
        "days_91_plus": ZERO,
        "total_overdue": ZERO,
    }
    open_statuses = ("PENDING", "PARTIAL", "OVERDUE")
    for pl in ledgers:
        bills = (
            await db.execute(
                select(PartyLedgerBill).where(
                    PartyLedgerBill.party_ledger_id == pl.id,
                    PartyLedgerBill.tenant_id == tenant_id,
                    PartyLedgerBill.status.in_(open_statuses),
                    PartyLedgerBill.pending_amount > 0,
                )
            )
        ).scalars().all()
        buckets = {"not_due": ZERO, "days_1_30": ZERO, "days_31_60": ZERO, "days_61_90": ZERO, "days_91_plus": ZERO}
        for bill in bills:
            amt = _d(bill.pending_amount)
            due = bill.due_date or bill.bill_date
            days = (as_of - due).days
            if days <= 0:
                buckets["not_due"] += amt
            elif days <= 30:
                buckets["days_1_30"] += amt
            elif days <= 60:
                buckets["days_31_60"] += amt
            elif days <= 90:
                buckets["days_61_90"] += amt
            else:
                buckets["days_91_plus"] += amt
        overdue = buckets["days_1_30"] + buckets["days_31_60"] + buckets["days_61_90"] + buckets["days_91_plus"]
        for k in grand:
            grand[k] += overdue if k == "total_overdue" else buckets[k]
        parties.append(
            {
                "party_ledger_id": pl.id,
                "party_name": await _reference_party_name(db, pl),
                "party_type": pl.party_type,
                "current_balance": str(_money(_d(pl.current_balance))),
                "balance_type": pl.current_balance_type,
                "not_due": str(_money(buckets["not_due"])),
                "days_1_30": str(_money(buckets["days_1_30"])),
                "days_31_60": str(_money(buckets["days_31_60"])),
                "days_61_90": str(_money(buckets["days_61_90"])),
                "days_91_plus": str(_money(buckets["days_91_plus"])),
                "total_overdue": str(_money(overdue)),
            }
        )
    return {
        "as_of_date": as_of.isoformat(),
        "parties": parties,
        "grand_total": {k: str(_money(v)) for k, v in grand.items()},
    }


# ---------------------------------------------------------------------------
# Seeds
# ---------------------------------------------------------------------------


async def _seed_party_world(db, *, n_customers: int = 4, n_vendors: int = 3, label: str = "A") -> dict[str, Any]:
    """Tenant with party ledgers, bills in every aging bucket and partial allocations.

    Ledger k gets every BILL_SPECS row where (row_index + k) % 3 != 0, amounts scaled by (k + 1);
    ledger 0 gets no bills at all. The last customer ledger is inactive.
    """
    tenant, user = await seed_tenant_admin(db)
    tenant.feature_flags = {PARTY_LEDGER_ENABLED: True}
    slug = uuid.uuid4().hex[:8]

    group = AccountGroup(tenant_id=tenant.id, name="Debtors", code=f"G{slug}", nature="Asset")
    db.add(group)
    await db.flush()

    receipt = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"RV-{slug}",
        voucher_type="RECEIPT",
        voucher_date=AS_OF,
        status="POSTED",
    )
    db.add(receipt)
    await db.flush()

    parties: list[tuple[str, Any]] = []
    for i in range(n_customers):
        c = Customer(tenant_id=tenant.id, customer_code=f"C{i}{slug}", name=f"Alpha Buyer {label}{i} {slug}")
        db.add(c)
        parties.append(("CUSTOMER", c))
    for i in range(n_vendors):
        v = Vendor(tenant_id=tenant.id, vendor_code=f"V{i}{slug}", name=f"Beta Supplier {label}{i} {slug}")
        db.add(v)
        parties.append(("VENDOR", v))
    await db.flush()

    ledgers: list[PartyLedger] = []
    bill_specs_by_ledger: dict[int, list[tuple[date, str, Decimal]]] = {}
    bill_seq = 0
    for k, (ptype, party) in enumerate(parties):
        acct = ChartOfAccount(
            tenant_id=tenant.id,
            account_number=f"PL-{k}-{slug}",
            name=f"{party.name} ledger",
            group_id=group.id,
            normal_balance="debit" if ptype == "CUSTOMER" else "credit",
        )
        db.add(acct)
        await db.flush()
        credit_limit = [None, Decimal("5000.00"), Decimal("250.50")][k % 3]
        pl = PartyLedger(
            tenant_id=tenant.id,
            party_type=ptype,
            customer_id=party.id if ptype == "CUSTOMER" else None,
            vendor_id=party.id if ptype == "VENDOR" else None,
            ledger_account_id=acct.id,
            credit_limit=credit_limit,
            credit_days=30 + k,
            interest_rate_monthly=Decimal("1.50") if k % 2 else None,
            opening_balance=Decimal("10.00") * k,
            opening_balance_type="DR" if k % 2 == 0 else "CR",
            opening_balance_date=AS_OF - timedelta(days=365) if k % 2 == 0 else None,
            current_balance=Decimal("123.45") * (k + 1),
            current_balance_type="DR" if k % 3 != 1 else "CR",
            total_dr_amount=Decimal("1000.10") * k,
            total_cr_amount=Decimal("200.20") * k,
            bill_wise_tracking=k % 4 != 3,
            is_active=not (ptype == "CUSTOMER" and k == n_customers - 1),
        )
        db.add(pl)
        await db.flush()
        ledgers.append(pl)

        specs: list[tuple[date, str, Decimal]] = []
        if k > 0:
            scale = Decimal(k + 1)
            for idx, (days_past, status, original, pending) in enumerate(BILL_SPECS):
                if (idx + k) % 3 == 0:
                    continue
                bill_seq += 1
                if days_past is None:
                    due = None
                    bill_date = AS_OF - timedelta(days=40)
                else:
                    due = AS_OF - timedelta(days=days_past)
                    bill_date = due - timedelta(days=30)
                orig = Decimal(original) * scale
                pend = Decimal(pending) * scale
                bill = PartyLedgerBill(
                    tenant_id=tenant.id,
                    party_ledger_id=pl.id,
                    bill_number=f"B{bill_seq}-{slug}",
                    bill_date=bill_date,
                    bill_type="SALE" if ptype == "CUSTOMER" else "PURCHASE",
                    original_amount=orig,
                    amount_type="DR" if ptype == "CUSTOMER" else "CR",
                    pending_amount=pend,
                    settled_amount=orig - pend,
                    status=status,
                    due_date=due,
                )
                db.add(bill)
                await db.flush()
                if status == "PARTIAL":
                    db.add(
                        PartyLedgerBillAllocation(
                            tenant_id=tenant.id,
                            bill_id=bill.id,
                            voucher_id=receipt.id,
                            allocated_amount=orig - pend,
                            allocated_date=AS_OF - timedelta(days=3),
                            bill_balance_after=pend,
                        )
                    )
                specs.append((due or bill_date, status, pend))
        bill_specs_by_ledger[pl.id] = specs
    await db.flush()
    return {
        "tenant": tenant,
        "user": user,
        "ledgers": ledgers,
        "bill_specs_by_ledger": bill_specs_by_ledger,
        "slug": slug,
    }


def _expected_buckets_from_specs(specs: list[tuple[date, str, Decimal]], as_of: date) -> dict[str, str]:
    buckets = {"not_due": ZERO, "days_1_30": ZERO, "days_31_60": ZERO, "days_61_90": ZERO, "days_91_plus": ZERO}
    for due, status, pending in specs:
        if status not in ("PENDING", "PARTIAL", "OVERDUE") or pending <= 0:
            continue
        days = (as_of - due).days
        if days <= 0:
            buckets["not_due"] += pending
        elif days <= 30:
            buckets["days_1_30"] += pending
        elif days <= 60:
            buckets["days_31_60"] += pending
        elif days <= 90:
            buckets["days_61_90"] += pending
        else:
            buckets["days_91_plus"] += pending
    overdue = sum((v for k, v in buckets.items() if k != "not_due"), ZERO)
    out = {k: str(_money(v)) for k, v in buckets.items()}
    out["total_overdue"] = str(_money(overdue))
    return out


@contextmanager
def _count_queries(db):
    counter = {"n": 0}

    def _on_execute(conn, cursor, statement, parameters, context, executemany):
        if not is_rls_housekeeping(statement):
            counter["n"] += 1

    engine = db.bind.sync_engine
    event.listen(engine, "before_cursor_execute", _on_execute)
    try:
        yield counter
    finally:
        event.remove(engine, "before_cursor_execute", _on_execute)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_party_ledger_list_matches_reference(db_session_integration):
    db = db_session_integration
    world_a = await _seed_party_world(db, label="A")
    world_b = await _seed_party_world(db, label="B")

    for world in (world_a, world_b):
        tenant, user = world["tenant"], world["user"]
        tenant_ledger_ids = {pl.id for pl in world["ledgers"]}
        param_sets: list[dict[str, Any]] = [
            {},
            {"party_type": "CUSTOMER"},
            {"party_type": "vendor"},
            {"is_active": "false"},
            {"search": "Alpha"},
            {"search": world["slug"]},
            {"balance_type": "CR"},
            {"overdue_only": "true"},
            {"page": 2, "page_size": 3},
        ]
        async with api_client(db, tenant, user) as ac:
            for params in param_sets:
                r = await ac.get("/api/v1/finance/party-ledgers", params=params)
                assert r.status_code == 200, (params, r.text)
                body = r.json()
                assert set(body.keys()) == {"items", "total", "page", "page_size"}
                assert {it["id"] for it in body["items"]} <= tenant_ledger_ids, params
                expected = [
                    await _reference_party_ledger_out(db, await db.get(PartyLedger, it["id"]))
                    for it in body["items"]
                ]
                assert body["items"] == expected, params

            # Default list: active ledgers only, newest first.
            r = await ac.get("/api/v1/finance/party-ledgers")
            body = r.json()
            active_ids = sorted((pl.id for pl in world["ledgers"] if pl.is_active), reverse=True)
            assert [it["id"] for it in body["items"]] == active_ids
            assert body["total"] == len(active_ids)

            # Spot-check one fully loaded row against the seed directly.
            richest = world["ledgers"][1]
            row = next(it for it in body["items"] if it["id"] == richest.id)
            specs = world["bill_specs_by_ledger"][richest.id]
            overdue = sum((p for _d_, st, p in specs if st == "OVERDUE" and p > 0), ZERO)
            assert row["overdue_amount"] == str(_money(overdue))
            counts = {"PENDING": 0, "PARTIAL": 0, "SETTLED": 0, "OVERDUE": 0, "CANCELLED": 0}
            for _due, st, _p in specs:
                counts[st] += 1
            assert row["bill_summary"] == counts
            assert row["party_name"].startswith("Alpha Buyer")

            # overdue_only filter: only ledgers with an OVERDUE bill that still has pending > 0.
            r = await ac.get("/api/v1/finance/party-ledgers", params={"overdue_only": "true"})
            got = {it["id"] for it in r.json()["items"]}
            want = {
                pl.id
                for pl in world["ledgers"]
                if pl.is_active
                and any(st == "OVERDUE" and p > 0 for _d_, st, p in world["bill_specs_by_ledger"][pl.id])
            }
            assert got == want


@pytest.mark.asyncio
async def test_party_ledger_single_record_endpoints_match_reference(db_session_integration):
    db = db_session_integration
    world = await _seed_party_world(db)
    tenant, user = world["tenant"], world["user"]
    other = await _seed_party_world(db, label="B")

    async with api_client(db, tenant, user) as ac:
        for pl in world["ledgers"]:
            r = await ac.get(f"/api/v1/finance/party-ledgers/{pl.id}")
            assert r.status_code == 200, r.text
            assert r.json() == await _reference_party_ledger_out(db, pl)

            ptype = pl.party_type
            pid = pl.customer_id if ptype == "CUSTOMER" else pl.vendor_id
            r = await ac.get(f"/api/v1/finance/party-ledgers/by-party/{ptype}/{pid}")
            assert r.status_code == 200, r.text
            assert r.json() == await _reference_party_ledger_out(db, pl)

        r = await ac.get(f"/api/v1/finance/party-ledgers/{other['ledgers'][0].id}")
        assert r.status_code == 404

        # PATCH response uses the same serializer.
        target = world["ledgers"][2]
        r = await ac.patch(f"/api/v1/finance/party-ledgers/{target.id}", json={"credit_days": 77})
        assert r.status_code == 200, r.text
        assert r.json()["credit_days"] == 77
        assert r.json() == await _reference_party_ledger_out(db, await db.get(PartyLedger, target.id))

        # Hard delete of a ledger without bills still works (unit of work loads `bills` itself).
        empty = world["ledgers"][0]
        r = await ac.delete(f"/api/v1/finance/party-ledgers/{empty.id}")
        assert r.status_code == 200, r.text
        assert r.json() == {"id": empty.id, "deleted": True}


@pytest.mark.asyncio
async def test_party_aging_report_matches_reference(db_session_integration):
    db = db_session_integration
    world_a = await _seed_party_world(db, label="A")
    world_b = await _seed_party_world(db, label="B")

    for world, other in ((world_a, world_b), (world_b, world_a)):
        tenant, user = world["tenant"], world["user"]
        tenant_ledger_ids = {pl.id for pl in world["ledgers"]}
        some_vendor = next(pl for pl in world["ledgers"] if pl.party_type == "VENDOR")
        scenarios: list[dict[str, Any]] = [
            {"as_of_date": AS_OF.isoformat()},
            {"as_of_date": (AS_OF + timedelta(days=45)).isoformat()},
            {"as_of_date": (AS_OF - timedelta(days=100)).isoformat()},
            {"as_of_date": AS_OF.isoformat(), "party_type": "CUSTOMER"},
            {"as_of_date": AS_OF.isoformat(), "party_type": " vendor "},
            {"as_of_date": AS_OF.isoformat(), "party_ledger_id": some_vendor.id},
            {"as_of_date": AS_OF.isoformat(), "party_ledger_id": other["ledgers"][1].id},
        ]
        async with api_client(db, tenant, user) as ac:
            for params in scenarios:
                r = await ac.get("/api/v1/finance/party-ledgers/aging-report", params=params)
                assert r.status_code == 200, (params, r.text)
                body = r.json()
                ref = await _reference_aging(
                    db,
                    tenant.id,
                    party_ledger_id=params.get("party_ledger_id"),
                    as_of_date=date.fromisoformat(params["as_of_date"]),
                    party_type=params.get("party_type"),
                )
                assert body == ref, params
                assert {p["party_ledger_id"] for p in body["parties"]} <= tenant_ledger_ids

                as_of = date.fromisoformat(params["as_of_date"])
                for p in body["parties"]:
                    expected = _expected_buckets_from_specs(world["bill_specs_by_ledger"][p["party_ledger_id"]], as_of)
                    assert {k: p[k] for k in expected} == expected, (params, p["party_ledger_id"])

            r = await ac.get(
                "/api/v1/finance/party-ledgers/aging-report",
                params={"as_of_date": AS_OF.isoformat(), "party_ledger_id": other["ledgers"][1].id},
            )
            assert r.json()["parties"] == []
            assert set(r.json()["grand_total"].values()) == {"0.00"}

            # Inactive ledger is excluded; ledger 0 (no bills) appears with zeros.
            r = await ac.get("/api/v1/finance/party-ledgers/aging-report", params={"as_of_date": AS_OF.isoformat()})
            ids = [p["party_ledger_id"] for p in r.json()["parties"]]
            assert ids == sorted(pl.id for pl in world["ledgers"] if pl.is_active)
            first = r.json()["parties"][0]
            assert first["party_ledger_id"] == world["ledgers"][0].id
            assert first["total_overdue"] == "0.00" and first["not_due"] == "0.00"


async def _measure(db, world, url: str, params: dict[str, Any]) -> int:
    tenant_id, user_id = world["tenant"].id, world["user"].id
    db.expunge_all()
    from app.models import Tenant, User

    tenant = await db.get(Tenant, tenant_id)
    user = await db.get(User, user_id)
    async with api_client(db, tenant, user) as ac:
        with _count_queries(db) as counter:
            r = await ac.get(url, params=params)
    assert r.status_code == 200, r.text
    return counter["n"]


@pytest.mark.asyncio
async def test_party_ledger_query_count_does_not_grow_with_rows(db_session_integration):
    db = db_session_integration
    small = await _seed_party_world(db, n_customers=2, n_vendors=1, label="S")
    large = await _seed_party_world(db, n_customers=6, n_vendors=5, label="L")
    small_active = sum(1 for pl in small["ledgers"] if pl.is_active)
    large_active = sum(1 for pl in large["ledgers"] if pl.is_active)
    assert (small_active, large_active) == (2, 10)

    list_small = await _measure(db, small, "/api/v1/finance/party-ledgers", {})
    list_large = await _measure(db, large, "/api/v1/finance/party-ledgers", {})
    aging_params = {"as_of_date": AS_OF.isoformat()}
    aging_small = await _measure(db, small, "/api/v1/finance/party-ledgers/aging-report", aging_params)
    aging_large = await _measure(db, large, "/api/v1/finance/party-ledgers/aging-report", aging_params)
    print(
        f"\n[party-ledger query counts] list: {small_active} rows={list_small}, "
        f"{large_active} rows={list_large}; aging: {small_active} rows={aging_small}, "
        f"{large_active} rows={aging_large}"
    )
    assert list_small > 0 and aging_small > 0
    assert list_large == list_small
    assert aging_large == aging_small
    assert list_large <= 10
    assert aging_large <= 8


async def _reference_allocations(db, ledger_id: int) -> list[dict[str, Any]]:
    """Old ``GET /{ledger_id}/allocations``: two db.get calls per allocation."""
    from app.modules.finance.party_ledger_bill_service import allocation_out

    bill_ids = (
        await db.execute(select(PartyLedgerBill.id).where(PartyLedgerBill.party_ledger_id == ledger_id))
    ).scalars().all()
    if not bill_ids:
        return []
    allocs = (
        await db.execute(
            select(PartyLedgerBillAllocation)
            .where(PartyLedgerBillAllocation.bill_id.in_(list(bill_ids)))
            .order_by(PartyLedgerBillAllocation.allocated_date.desc())
        )
    ).scalars().all()
    out = []
    for a in allocs:
        row = allocation_out(a)
        bill = await db.get(PartyLedgerBill, a.bill_id)
        row["bill_number"] = bill.bill_number if bill else None
        voucher = await db.get(Voucher, a.voucher_id)
        row["voucher_number"] = voucher.voucher_number if voucher else None
        out.append(row)
    return out


@pytest.mark.asyncio
async def test_party_ledger_allocations_match_reference(db_session_integration):
    db = db_session_integration
    world = await _seed_party_world(db)
    tenant, user = world["tenant"], world["user"]
    async with api_client(db, tenant, user) as ac:
        for pl in world["ledgers"]:
            expected = jsonable_encoder(await _reference_allocations(db, pl.id))
            with _count_queries(db) as counter:
                r = await ac.get(f"/api/v1/finance/party-ledgers/{pl.id}/allocations")
            assert r.status_code == 200, r.text
            assert r.json() == expected, pl.id
            if len(expected) > 1:
                print(f"\n[party-ledger allocations] {len(expected)} rows -> {counter['n']} queries")

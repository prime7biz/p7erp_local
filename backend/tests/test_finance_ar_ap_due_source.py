"""Tenant setting `finance_ar_ap_due_source` (PLAN open question 8): Ratio Analysis "due till today" + Control Tower
overdue cards from one chosen bill-wise source.

as_of_date 2027-06-30. Hand-worked figures per source (base currency BDT):
  outstanding_bills  AR 1000-200 due 05-01 (due 800) | AR 900 due 07-30 (open only) | AR USD 40 due 05-02 (foreign, left out)
                     | AR 300 dated 07-05 (after as-of, left out) | AP 500 due 04-01 | AP 300 due 06-30 (due today) | AP PAID 700
                     -> debtors due 800 / open 1700, creditors due 800 / open 800
  party_ledger       customer DR 600 due 05-01 | DR 400 no due date, bill 06-01 | DR 250 due 08-01 PARTIAL (open only)
                     | CR 999 advance (not a debtor bill) | SETTLED 1000 | vendor CR 700 due 06-15 OVERDUE | CR 300 due 06-30
                     -> debtors due 1000 / open 1250, creditors due 1000 / open 1000
                        Control Tower (due BEFORE as-of): receivables 2 / 1000, payables 1 / 700
  bill_references    RECEIVABLE 300 due 05-01 | 150 PARTIALLY_SETTLED no due date, bill 06-10 | advance -500 | SETTLED 0
                     | 50 due 09-01 (open only) | PAYABLE 900 due 06-29
                     -> debtors due 450 / open 500, creditors due 900 / open 900
                        Control Tower: receivables 2 / 450, payables 1 / 900
Unset: the standard source is chosen automatically (`source_automatic` true): party_ledger when the tenant flag
party_ledger_enabled is strictly true, else outstanding_bills (Control Tower: AR 800 + USD in the count -> 2 / 800,
exactly as before). An explicit setting always wins.

Run: docker compose exec -T backend pytest tests/test_finance_ar_ap_due_source.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.common.tenant_feature_keys import (
    FINANCE_AR_AP_DUE_SOURCE,
    PARTY_LEDGER_ENABLED,
    get_finance_ar_ap_due_source,
    normalize_feature_flag_value,
    resolve_finance_ar_ap_due_source,
)
from app.models.finance import BillReference, OutstandingBill
from app.models.inventory import Vendor
from app.models.party_ledger import PartyLedger, PartyLedgerBill
from tests.benchmark_fixtures import api_client
from tests.finance_control_fixtures import CONTROL_FLAG, make_customer, uid
from tests.finance_statement_fixtures import seed_world

D = Decimal
AS_OF = "2027-06-30"
RATIO = "/api/v1/finance/statements/ratio-analysis"
TOWER = "/api/v1/finance/control-tower"


async def _seed_sources(db, tenant_id: int, w: dict, scale: int = 1) -> None:
    ar, ap = w["ledgers"]["ar"], w["ledgers"]["ap"]
    m = D(scale)
    for no, btype, bill_date, due, amount, paid, status, ccy in (
        ("AR-1", "RECEIVABLE", date(2027, 3, 1), date(2027, 5, 1), "1000", "200", "OPEN", "BDT"),
        ("AR-2", "RECEIVABLE", date(2027, 3, 1), date(2027, 7, 30), "900", "0", "OPEN", "BDT"),
        ("AR-3", "RECEIVABLE", date(2027, 3, 1), date(2027, 5, 2), "40", "0", "OPEN", "USD"),
        ("AR-4", "RECEIVABLE", date(2027, 7, 5), date(2027, 8, 1), "300", "0", "OPEN", "BDT"),
        ("AP-1", "PAYABLE", date(2027, 3, 1), date(2027, 4, 1), "500", "0", "OPEN", "BDT"),
        ("AP-2", "PAYABLE", date(2027, 3, 1), date(2027, 6, 30), "300", "0", "OPEN", "BDT"),
        ("AP-3", "PAYABLE", date(2027, 3, 1), date(2027, 4, 2), "700", "0", "PAID", "BDT"),
    ):
        db.add(
            OutstandingBill(
                tenant_id=tenant_id, bill_no=f"{no}-{uid()}", party_name="Party", bill_type=btype, bill_date=bill_date,
                due_date=due, amount=D(amount) * m, paid_amount=D(paid) * m, status=status, currency=ccy,
            )
        )

    customer = await make_customer(db, tenant_id, "Buyer")
    vendor = Vendor(tenant_id=tenant_id, vendor_code=f"V{uid()}", name="Mill")
    db.add(vendor)
    await db.flush()
    pl_c = PartyLedger(tenant_id=tenant_id, party_type="CUSTOMER", customer_id=customer.id, ledger_account_id=ar.id)
    pl_v = PartyLedger(tenant_id=tenant_id, party_type="VENDOR", vendor_id=vendor.id, ledger_account_id=ap.id)
    db.add_all([pl_c, pl_v])
    await db.flush()
    for pl, kind, pending, bill_date, due, status in (
        (pl_c, "DR", "600", date(2027, 3, 1), date(2027, 5, 1), "PENDING"),
        (pl_c, "DR", "400", date(2027, 6, 1), None, "PENDING"),
        (pl_c, "DR", "250", date(2027, 6, 1), date(2027, 8, 1), "PARTIAL"),
        (pl_c, "CR", "999", date(2027, 3, 1), date(2027, 4, 1), "PENDING"),
        (pl_c, "DR", "0", date(2027, 3, 1), date(2027, 4, 1), "SETTLED"),
        (pl_v, "CR", "700", date(2027, 5, 1), date(2027, 6, 15), "OVERDUE"),
        (pl_v, "CR", "300", date(2027, 5, 1), date(2027, 6, 30), "PENDING"),
    ):
        db.add(
            PartyLedgerBill(
                tenant_id=tenant_id, party_ledger_id=pl.id, bill_number=f"PL-{uid()}", bill_date=bill_date, bill_type="SALE",
                original_amount=D(pending) * m or D("1000"), amount_type=kind, pending_amount=D(pending) * m, status=status,
                due_date=due,
            )
        )

    for btype, pending, bill_date, due, status, account in (
        ("RECEIVABLE", "300", date(2027, 3, 1), date(2027, 5, 1), "OPEN", ar),
        ("RECEIVABLE", "150", date(2027, 6, 10), None, "PARTIALLY_SETTLED", ar),
        ("RECEIVABLE", "-500", date(2027, 3, 1), None, "OPEN", ar),
        ("RECEIVABLE", "0", date(2027, 3, 1), date(2027, 4, 1), "SETTLED", ar),
        ("RECEIVABLE", "50", date(2027, 3, 1), date(2027, 9, 1), "OPEN", ar),
        ("PAYABLE", "900", date(2027, 3, 1), date(2027, 6, 29), "OPEN", ap),
    ):
        db.add(
            BillReference(
                tenant_id=tenant_id, bill_number=f"BR-{uid()}", bill_date=bill_date, due_date=due, bill_type=btype,
                party_name="Party", account_id=account.id, original_amount=D(pending) * m, pending_amount=D(pending) * m,
                status=status,
            )
        )
    await db.flush()


async def _world(db, source: str | None = None, *, extra_flags: dict | None = None):
    flags = {**CONTROL_FLAG, **(extra_flags or {})}
    if source is not None:
        flags[FINANCE_AR_AP_DUE_SOURCE] = source
    tenant, user, w = await seed_world(db, flags=flags, permissions={"*": True})
    await _seed_sources(db, tenant.id, w)
    # Another tenant with ten times every bill: never visible to the first tenant.
    other, _ou, ow = await seed_world(db, flags=flags)
    await _seed_sources(db, other.id, ow, scale=10)
    return tenant, user, w


async def _set_source(db, tenant, source: str | None) -> None:
    flags = dict(tenant.feature_flags or {})
    if source is None:
        flags.pop(FINANCE_AR_AP_DUE_SOURCE, None)
    else:
        flags[FINANCE_AR_AP_DUE_SOURCE] = source
    tenant.feature_flags = flags
    await db.flush()


async def _due_groups(ac) -> dict:
    r = await ac.get(RATIO, params={"as_of_date": AS_OF})
    assert r.status_code == 200, r.text
    return {g["code"]: g for g in r.json()["principal_groups"] if g["code"].endswith("_DUE")}


async def _overdue_cards(ac) -> dict:
    r = await ac.get(TOWER, params={"as_of_date": AS_OF})
    assert r.status_code == 200, r.text
    return {c["code"]: c for c in r.json()["cards"] if c["code"].startswith("OVERDUE_")}


EXPECTED_RATIO = {  # source -> (debtors due, debtors open, creditors due, creditors open)
    "outstanding_bills": ("800.0000", "1700.0000", "800.0000", "800.0000"),
    "party_ledger": ("1000.0000", "1250.0000", "1000.0000", "1000.0000"),
    "bill_references": ("450.0000", "500.0000", "900.0000", "900.0000"),
}
EXPECTED_TOWER = {  # source -> ((receivables count, amount), (payables count, amount))
    "outstanding_bills": ((2, "800.0000"), (1, "500.0000")),
    "party_ledger": ((2, "1000.0000"), (1, "700.0000")),
    "bill_references": ((2, "450.0000"), (1, "900.0000")),
}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "party_ledger_flag, expected_source",
    [(None, "outstanding_bills"), (False, "outstanding_bills"), ("true", "outstanding_bills"), (True, "party_ledger")],
)
async def test_unset_uses_the_standard_source_automatically(db_session_integration, party_ledger_flag, expected_source):
    db = db_session_integration
    extra = {} if party_ledger_flag is None else {PARTY_LEDGER_ENABLED: party_ledger_flag}
    tenant, user, _w = await _world(db, extra_flags=extra)
    async with api_client(db, tenant, user) as ac:
        groups = await _due_groups(ac)
        cards = await _overdue_cards(ac)
        drill = (await ac.get(f"{TOWER}/exceptions/OVERDUE_RECEIVABLES", params={"as_of_date": AS_OF, "limit": 50})).json()
    debtors, creditors = groups["SUNDRY_DEBTORS_DUE"], groups["SUNDRY_CREDITORS_DUE"]
    assert (debtors["amount"], debtors["total_open"], creditors["amount"], creditors["total_open"]) == EXPECTED_RATIO[expected_source]
    for g in (debtors, creditors):
        assert g["source"] == expected_source and g["source_automatic"] is True and g["reason"] is None
        assert g["note"].startswith("Chosen automatically")
    (rc, ra), (pc, pa) = EXPECTED_TOWER[expected_source]
    for code, (count, amount) in (("OVERDUE_RECEIVABLES", (rc, ra)), ("OVERDUE_PAYABLES", (pc, pa))):
        card = cards[code]
        assert (card["count"], card["amount"]) == (count, amount)
        assert card["source"] == expected_source and card["source_automatic"] is True
        assert card["note"].startswith("Chosen automatically")
    assert (drill["total"], drill["amount"], drill["source_automatic"]) == (rc, ra, True)
    if expected_source == "outstanding_bills":  # unchanged Control Tower behaviour: USD bill counted, not summed
        assert "1 foreign-currency bill(s) are in the count" in cards["OVERDUE_RECEIVABLES"]["note"]


@pytest.mark.asyncio
@pytest.mark.parametrize("source", ["outstanding_bills", "party_ledger", "bill_references"])
async def test_each_source_drives_ratio_and_control_tower(db_session_integration, source):
    db = db_session_integration
    tenant, user, _w = await _world(db, source)
    async with api_client(db, tenant, user) as ac:
        groups = await _due_groups(ac)
        cards = await _overdue_cards(ac)
        drill = (await ac.get(f"{TOWER}/exceptions/OVERDUE_RECEIVABLES", params={"as_of_date": AS_OF, "limit": 50})).json()

    debtors, creditors = groups["SUNDRY_DEBTORS_DUE"], groups["SUNDRY_CREDITORS_DUE"]
    assert (debtors["amount"], debtors["total_open"], creditors["amount"], creditors["total_open"]) == EXPECTED_RATIO[source]
    assert debtors["dr_cr"] == "Dr" and creditors["dr_cr"] == "Cr"
    assert debtors["source"] == creditors["source"] == source and debtors["reason"] is None
    assert debtors["source_automatic"] is False and "Chosen automatically" not in debtors["note"]
    assert cards["OVERDUE_RECEIVABLES"]["source_automatic"] is False
    assert "no history" in debtors["note"]
    if source == "outstanding_bills":
        assert "1 open foreign-currency bill" in debtors["note"]
    else:
        assert "no currency column" in debtors["note"]

    (rc, ra), (pc, pa) = EXPECTED_TOWER[source]
    assert (cards["OVERDUE_RECEIVABLES"]["count"], cards["OVERDUE_RECEIVABLES"]["amount"]) == (rc, ra)
    assert (cards["OVERDUE_PAYABLES"]["count"], cards["OVERDUE_PAYABLES"]["amount"]) == (pc, pa)
    assert cards["OVERDUE_RECEIVABLES"]["source"] == source
    # card and drill-down agree (same selectable)
    assert (drill["total"], drill["amount"]) == (rc, ra) and len(drill["rows"]) == rc


@pytest.mark.asyncio
async def test_switching_source_changes_figures_in_place(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await _world(db, "party_ledger")
    async with api_client(db, tenant, user) as ac:
        assert (await _due_groups(ac))["SUNDRY_DEBTORS_DUE"]["amount"] == "1000.0000"
        await _set_source(db, tenant, "bill_references")
        assert (await _due_groups(ac))["SUNDRY_DEBTORS_DUE"]["amount"] == "450.0000"
        await _set_source(db, tenant, None)  # back to automatic: party ledger is off here -> outstanding_bills
        unset = (await _due_groups(ac))["SUNDRY_DEBTORS_DUE"]
        assert (unset["amount"], unset["source"], unset["source_automatic"]) == ("800.0000", "outstanding_bills", True)


@pytest.mark.asyncio
async def test_explicit_setting_wins_over_party_ledger_default(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await _world(db, "bill_references", extra_flags={PARTY_LEDGER_ENABLED: True})
    async with api_client(db, tenant, user) as ac:
        debtors = (await _due_groups(ac))["SUNDRY_DEBTORS_DUE"]
    assert (debtors["amount"], debtors["source"], debtors["source_automatic"]) == ("450.0000", "bill_references", False)


def test_resolver_defaults():
    assert resolve_finance_ar_ap_due_source(None) == ("outstanding_bills", True)
    assert resolve_finance_ar_ap_due_source({}) == ("outstanding_bills", True)
    assert resolve_finance_ar_ap_due_source({PARTY_LEDGER_ENABLED: "true"}) == ("outstanding_bills", True)
    assert resolve_finance_ar_ap_due_source({PARTY_LEDGER_ENABLED: True}) == ("party_ledger", True)
    assert resolve_finance_ar_ap_due_source({FINANCE_AR_AP_DUE_SOURCE: "gl", PARTY_LEDGER_ENABLED: True}) == ("party_ledger", True)
    assert resolve_finance_ar_ap_due_source(
        {FINANCE_AR_AP_DUE_SOURCE: "outstanding_bills", PARTY_LEDGER_ENABLED: True}
    ) == ("outstanding_bills", False)


def test_getter_and_write_validation():
    assert get_finance_ar_ap_due_source({}) is None
    assert get_finance_ar_ap_due_source(None) is None
    assert get_finance_ar_ap_due_source({FINANCE_AR_AP_DUE_SOURCE: " Party_Ledger "}) == "party_ledger"
    assert get_finance_ar_ap_due_source({FINANCE_AR_AP_DUE_SOURCE: "gl"}) is None
    assert normalize_feature_flag_value(FINANCE_AR_AP_DUE_SOURCE, " Bill_References ") == "bill_references"
    assert normalize_feature_flag_value(FINANCE_AR_AP_DUE_SOURCE, None) is None
    for bad in ("gl", "", 3):
        with pytest.raises(ValueError):
            normalize_feature_flag_value(FINANCE_AR_AP_DUE_SOURCE, bad)


@pytest.mark.asyncio
async def test_settings_put_rejects_unknown_source_and_saves_canonical(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_world(db, permissions={"*": True})
    body = {"company_name": tenant.name, "tenant_type": "both"}
    async with api_client(db, tenant, user) as ac:
        bad = await ac.put("/api/v1/settings/config", json={**body, "feature_flags": {FINANCE_AR_AP_DUE_SOURCE: "gl"}})
        assert bad.status_code == 400, bad.text
        assert FINANCE_AR_AP_DUE_SOURCE in bad.json()["detail"]
        ok = await ac.put(
            "/api/v1/settings/config",
            json={**body, "feature_flags": {**(tenant.feature_flags or {}), FINANCE_AR_AP_DUE_SOURCE: " Party_Ledger "}},
        )
        assert ok.status_code == 200, ok.text
    await db.refresh(tenant)
    assert tenant.feature_flags[FINANCE_AR_AP_DUE_SOURCE] == "party_ledger"

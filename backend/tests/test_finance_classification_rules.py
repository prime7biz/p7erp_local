"""Statement classification rules: group proposals (scripts/finance_classify_groups.py) and the ledger-level cash /
bank rule (statements/classification_service.resolve_ledger_class).

Group world (one tenant, all Unclassified unless noted):
  AST  Asset top-level           -> CURRENT_ASSETS (legacy code)     child "Petty" Asset -> inherits (skipped)
  SC_CASH_AND_BANK system group  -> BANK_ACCOUNTS (system_code)      SC_SERVICE_REVENUE_GROUP -> SALES_ACCOUNTS
  "Factory Cost" Expense, affects gross profit -> DIRECT_EXPENSES    "Misc Income" Income -> INDIRECT_INCOMES
  "Owners" Equity -> CAPITAL_ACCOUNT                                 "Odd Asset" Asset -> review (no rule)
  "Classified" already FIXED_ASSETS -> not listed
  CONTROL_ACCOUNTS memorandum: ledgers +100 / -100 -> CURRENT_ASSETS; +100 only -> review (net not zero)

Ledger world (cash pool, opening balances only):
  "Cash and Bank" BANK_ACCOUNTS group: system cash ledger 1,000 -> CASH_IN_HAND; flagged bank 5,000 -> BANK_ACCOUNTS
  "Current Assets" CURRENT_ASSETS group: bank linked from bank_accounts 2,000 -> BANK_ACCOUNTS; ledger mapped to
      CASH_IN_HAND 400 -> CASH_IN_HAND; plain "Petty" 300 -> stays CURRENT_ASSETS (also linked from ANOTHER tenant's
      bank account and mapping, which must be ignored)
  "Bank OD" BANK_OD group: flagged bank ledger, 700 credit -> stays BANK_OD
  -> pool: cash 1,400, bank 7,000, OD -700, total 7,700 (Petty not in the pool)

Run: docker compose exec -T backend pytest tests/test_finance_classification_rules.py -q
"""

from __future__ import annotations

import json
from datetime import date

import pytest
from sqlalchemy import func, select

from app.models.audit import AuditLog
from app.models.finance import AccountGroup, AccountingSystemMapping, BankAccount
from app.modules.finance.statements import classification_rules as rules
from app.modules.finance.statements.cash_flow_service import build_cash_flow
from app.modules.finance.statements.classification_service import resolve_ledger_class
from app.modules.finance.statements.ledger_aggregate_service import build_ledger_calcs
from tests.benchmark_fixtures import seed_tenant_admin
from tests.finance_statement_fixtures import D, STATEMENTS_FLAG, make_group, make_ledger, post

AUDIT = "finance.account_group.statement_class.update"


async def _group(db, tenant_id: int, name: str, nature: str, *, code: str | None = None, system_code: str | None = None,
                 parent: AccountGroup | None = None, agp: bool = False, cls: str | None = None) -> AccountGroup:
    g = await make_group(db, tenant_id, name, nature, cls, parent)
    if code:
        g.code = code
    g.system_code = system_code
    g.affects_gross_profit = agp
    await db.flush()
    return g


async def _group_world(db):
    tenant, user = await seed_tenant_admin(db)
    t = tenant.id
    ast = await _group(db, t, "Current Assets", "Asset", code="AST")
    petty = await _group(db, t, "Petty", "Asset", parent=ast)
    cab = await _group(db, t, "Cash and Bank", "Asset", system_code="CASH_AND_BANK")
    svc = await _group(db, t, "Service Revenue", "Income", system_code="SERVICE_REVENUE_GROUP")
    factory = await _group(db, t, "Factory Cost", "Expense", agp=True)
    misc_inc = await _group(db, t, "Misc Income", "Income")
    owners = await _group(db, t, "Owners", "Equity")
    odd = await _group(db, t, "Odd Asset", "Asset")
    classified = await _group(db, t, "Classified", "Asset", cls="FIXED_ASSETS")
    return tenant, user, dict(ast=ast, petty=petty, cab=cab, svc=svc, factory=factory, misc_inc=misc_inc,
                              owners=owners, odd=odd, classified=classified)


async def _audit_count(db, tenant_id: int) -> int:
    return int((await db.execute(
        select(func.count()).select_from(AuditLog).where(AuditLog.tenant_id == tenant_id, AuditLog.action == AUDIT)
    )).scalar_one())


EXPECTED = {
    "ast": ("set", "CURRENT_ASSETS"),
    "petty": ("inherits", None),
    "cab": ("set", "BANK_ACCOUNTS"),
    "svc": ("set", "SALES_ACCOUNTS"),
    "factory": ("set", "DIRECT_EXPENSES"),
    "misc_inc": ("set", "INDIRECT_INCOMES"),
    "owners": ("set", "CAPITAL_ACCOUNT"),
    "odd": ("review", None),
}


# ---- group proposals -----------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_dry_run_proposes_standard_classes_and_writes_nothing(db_session_integration):
    db = db_session_integration
    tenant, _user, g = await _group_world(db)
    proposals = {p.group_id: p for p in await rules.propose_group_classes(db, tenant.id)}
    assert g["classified"].id not in proposals  # already classified: never listed
    for key, (action, cls) in EXPECTED.items():
        p = proposals[g[key].id]
        assert (p.action, p.proposed_class) == (action, cls), (key, p)
    assert "inherits CURRENT_ASSETS" in proposals[g["petty"].id].reason
    assert "needs review" in proposals[g["odd"].id].reason
    # nothing written
    for key in EXPECTED:
        await db.refresh(g[key])
        assert g[key].statement_class is None, key
    assert await _audit_count(db, tenant.id) == 0


@pytest.mark.asyncio
async def test_apply_writes_audits_and_is_idempotent_and_tenant_scoped(db_session_integration):
    db = db_session_integration
    other, _ou, og = await _group_world(db)  # same shapes in another tenant: must stay untouched
    tenant, _user, g = await _group_world(db)
    applied = await rules.apply_group_classes(db, tenant.id)
    assert {p.group_id for p in applied} == {g[k].id for k, (a, _c) in EXPECTED.items() if a == "set"}
    for key, (action, cls) in EXPECTED.items():
        await db.refresh(g[key])
        assert g[key].statement_class == (cls if action == "set" else None), key
    assert await _audit_count(db, tenant.id) == len(applied)
    row = (await db.execute(select(AuditLog).where(
        AuditLog.tenant_id == tenant.id, AuditLog.action == AUDIT, AuditLog.resource == f"account_group:{g['cab'].id}"
    ))).scalar_one()
    details = json.loads(row.details)
    assert details["from"] is None and details["to"] == "BANK_ACCOUNTS" and details["source"] == rules.AUDIT_SOURCE
    assert row.user_id is None
    # second run: nothing left to set, no new audit rows; the child still inherits
    assert await rules.apply_group_classes(db, tenant.id) == []
    assert await _audit_count(db, tenant.id) == len(applied)
    # the other tenant: untouched, no audit rows
    for key in EXPECTED:
        await db.refresh(og[key])
        assert og[key].statement_class is None, key
    assert await _audit_count(db, other.id) == 0


@pytest.mark.asyncio
async def test_apply_never_overwrites_a_class_set_meanwhile(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, _user, g = await _group_world(db)
    stale = await rules.propose_group_classes(db, tenant.id)  # proposals made before the admin's change
    g["owners"].statement_class = "LONG_TERM_LOANS"
    await db.flush()

    async def _stale(_db, _tid):
        return stale

    monkeypatch.setattr(rules, "propose_group_classes", _stale)
    applied = await rules.apply_group_classes(db, tenant.id)
    await db.refresh(g["owners"])
    assert g["owners"].statement_class == "LONG_TERM_LOANS"
    assert g["owners"].id not in {p.group_id for p in applied}


@pytest.mark.asyncio
@pytest.mark.parametrize("balanced, expected", [(True, ("set", "CURRENT_ASSETS")), (False, ("review", None))])
async def test_memorandum_control_accounts_zero_vs_non_zero(db_session_integration, balanced, expected):
    db = db_session_integration
    tenant, _user = await seed_tenant_admin(db)
    control = await _group(db, tenant.id, "Control / Memorandum Accounts", "Asset", system_code="CONTROL_ACCOUNTS")
    other_g = await make_group(db, tenant.id, "Elsewhere", "Asset", "CURRENT_ASSETS")
    await make_ledger(db, tenant.id, control, "Utilisation control", "100")
    b = await make_ledger(db, tenant.id, control, "In transit control", "0")
    elsewhere = await make_ledger(db, tenant.id, other_g, "Elsewhere")
    if balanced:  # +100 opening, -100 posted: the group nets to exactly zero
        await post(db, tenant.id, date(2026, 3, 1), [(elsewhere, "DEBIT", "100"), (b, "CREDIT", "100")])
    p = next(x for x in await rules.propose_group_classes(db, tenant.id) if x.group_id == control.id)
    assert (p.action, p.proposed_class) == expected
    if not balanced:
        assert "memorandum control accounts: review" in p.reason and "100" in p.reason


def test_new_tenant_template_rules_cover_the_remaining_system_groups():
    from app.modules.finance.system_coa_templates import SYSTEM_ACCOUNT_GROUPS, system_group_class

    by_code = {g["system_code"]: g.get("statement_class") for g in SYSTEM_ACCOUNT_GROUPS}
    assert by_code["CASH_AND_BANK"] == "BANK_ACCOUNTS" == system_group_class("CASH_AND_BANK")
    assert by_code["TRADE_FINANCE_LIABILITIES"] == by_code["DEFERRED_LIABILITIES"] == "CURRENT_LIABILITIES"
    assert by_code["SERVICE_REVENUE_GROUP"] == "SALES_ACCOUNTS"
    assert by_code["CONTROL_ACCOUNTS"] is None
    assert rules.SYSTEM_CODE_RULES["CASH_AND_BANK"] == "BANK_ACCOUNTS"


# ---- ledger-level cash / bank rule ---------------------------------------------------------------------
def test_resolve_ledger_class_pure_rules():
    assert resolve_ledger_class("CURRENT_ASSETS", is_bank=True, is_cash=False) == "BANK_ACCOUNTS"
    assert resolve_ledger_class("CASH_IN_HAND", is_bank=True, is_cash=False) == "BANK_ACCOUNTS"
    assert resolve_ledger_class("BANK_ACCOUNTS", is_bank=False, is_cash=True) == "CASH_IN_HAND"
    assert resolve_ledger_class("CURRENT_ASSETS", is_bank=False, is_cash=True) == "CASH_IN_HAND"
    for untouched in ("BANK_OD", "SHORT_TERM_BORROWINGS", "LONG_TERM_LOANS", "SUNDRY_DEBTORS", "FIXED_ASSETS"):
        assert resolve_ledger_class(untouched, is_bank=True, is_cash=True) == untouched
    assert resolve_ledger_class(None, is_bank=True, is_cash=True) is None
    assert resolve_ledger_class("CURRENT_ASSETS", is_bank=False, is_cash=False) == "CURRENT_ASSETS"


async def _ledger_world(db):
    tenant, _user = await seed_tenant_admin(db)
    tenant.feature_flags = dict(STATEMENTS_FLAG)
    await db.flush()
    t = tenant.id
    mixed = await make_group(db, t, "Cash and Bank", "Asset", "BANK_ACCOUNTS")
    ca = await make_group(db, t, "Current Assets", "Asset", "CURRENT_ASSETS")
    od_g = await make_group(db, t, "Bank OD", "Liability", "BANK_OD")
    sys_cash = await make_ledger(db, t, mixed, "Cash in Hand", "1000")
    sys_cash.system_code = "CASH_IN_HAND"
    flagged_bank = await make_ledger(db, t, mixed, "Flagged Bank", "5000")
    flagged_bank.is_bank_account = True
    linked_bank = await make_ledger(db, t, ca, "Bank - Main", "2000")
    mapped_cash = await make_ledger(db, t, ca, "Cash In Hand (mapped)", "400")
    petty = await make_ledger(db, t, ca, "Petty", "300")
    od = await make_ledger(db, t, od_g, "Overdraft", "700")
    od.is_bank_account = True
    db.add(BankAccount(tenant_id=t, account_name="Main", bank_name="B", account_number="1", gl_account_id=linked_bank.id))
    db.add(AccountingSystemMapping(tenant_id=t, mapping_key="CASH_IN_HAND", ledger_id=mapped_cash.id))
    # Another tenant's rows pointing at this tenant's Petty ledger must never count.
    other, _ou = await seed_tenant_admin(db)
    db.add(BankAccount(tenant_id=other.id, account_name="X", bank_name="X", account_number="9", gl_account_id=petty.id))
    db.add(AccountingSystemMapping(tenant_id=other.id, mapping_key="CASH_IN_HAND", ledger_id=petty.id))
    await db.flush()
    return tenant, dict(sys_cash=sys_cash, flagged_bank=flagged_bank, linked_bank=linked_bank,
                        mapped_cash=mapped_cash, petty=petty, od=od)


@pytest.mark.asyncio
async def test_ledger_rule_in_statements_and_cash_pool(db_session_integration):
    db = db_session_integration
    tenant, led = await _ledger_world(db)
    start = date(2026, 1, 1)
    calcs, _groups = await build_ledger_calcs(db, tenant.id, from_date=start, to_date=date(2026, 12, 31), fy_start=start)
    cls = {c.account_id: c.effective_class for c in calcs}
    assert cls[led["sys_cash"].id] == "CASH_IN_HAND"  # mixed cash + bank group
    assert cls[led["flagged_bank"].id] == "BANK_ACCOUNTS"
    assert cls[led["linked_bank"].id] == "BANK_ACCOUNTS"  # bank ledger in a Current Assets group
    assert cls[led["mapped_cash"].id] == "CASH_IN_HAND"
    assert cls[led["petty"].id] == "CURRENT_ASSETS"  # other tenant's bank account / mapping ignored
    assert cls[led["od"].id] == "BANK_OD"  # OD untouched even though flagged as a bank

    cf = (await build_cash_flow(db, tenant, fiscal_year=2026, today=date(2026, 6, 1))).model_dump(mode="json")
    assert cf["closing_pool"] == {
        "cash_in_hand": "1400.0000", "bank_accounts": "7000.0000", "bank_od": "-700.0000", "cash_without_od": "8400.0000",
    }
    assert cf["opening_cash"] == "7700.0000" and cf["gl_closing_cash"] == "7700.0000"
    assert cf["reconciliation"]["balanced"] is True


@pytest.mark.asyncio
async def test_ledger_rule_moves_bank_movement_into_cash_flow(db_session_integration):
    db = db_session_integration
    tenant, led = await _ledger_world(db)
    sales_g = await make_group(db, tenant.id, "Sales", "Income", "SALES_ACCOUNTS")
    sales = await make_ledger(db, tenant.id, sales_g, "Sales")
    await post(db, tenant.id, date(2026, 3, 5), [(led["linked_bank"], "DEBIT", "250"), (sales, "CREDIT", "250")])
    await post(db, tenant.id, date(2026, 3, 6), [(led["petty"], "DEBIT", "90"), (sales, "CREDIT", "90")])  # not cash
    cf = await build_cash_flow(db, tenant, fiscal_year=2026, today=date(2026, 6, 1))
    march = next(m for m in cf.months if m.month == "2026-03")
    assert (march.inflow, march.outflow) == (D("250"), D("0"))
    assert cf.grand_total.closing_cash == cf.gl_closing_cash == D("7950")

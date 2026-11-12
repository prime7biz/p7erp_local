"""Governed read-only finance AI: statement commentary (PLAN Phase 5, acceptance 5.1-5.8).

The provider is never called for real: `generate_text_for_tenant` is replaced with monkeypatch in every test that
asks for AI. Valid AI answers are built from the facts the deterministic commentary returned, so the test checks the
validator (copy of a fact = accepted, anything else = deterministic fallback) without guessing statement figures.

World: `seed_world` (calendar fiscal year, vouchers in 2025 / 2026) plus the AI flag; the noise tenant has a
5,000,000 sale that must never reach the first tenant's facts or prompt.

Run: docker compose exec -T backend pytest tests/test_finance_ai_insights.py -q
"""

from __future__ import annotations

import asyncio
import json
import logging
from decimal import ROUND_HALF_UP, Decimal

import pytest
from sqlalchemy import func, select

from app.models.finance import Voucher
from app.modules.finance.ai_insights import service as ai_service
from app.modules.finance.ai_insights.constants import MAX_PROMPT_CHARS, MAX_QUESTION_CHARS, REPORTS
from app.modules.finance.ai_insights.facts import FactRow
from app.modules.finance.ai_insights.router import router as ai_router
from app.modules.finance.ai_insights.validation import ValidationFailure, validate_answer
from tests.benchmark_fixtures import api_client
from tests.finance_statement_fixtures import seed_noise_tenant, seed_world

D = Decimal
URL = "/api/v1/finance/statements/commentary"
AI_FLAG = {"finance_ai_insights_v2": True}
ENFORCE = {"rbac_enforcement": "enforce"}
PL_2026 = {"report": "profit_loss", "from_date": "2026-01-01", "to_date": "2026-12-31"}


async def _seed(db, *, flags: dict | None = None, role_name: str = "admin", permissions: dict | None = None):
    tenant, user, w = await seed_world(db, flags={**AI_FLAG, **(flags or {})}, role_name=role_name, permissions=permissions)
    await db.commit()  # the app may roll back after a provider error; the seed must survive that
    return tenant, user, w


async def _post(db, tenant, user, body: dict, expected: int = 200) -> dict:
    await db.refresh(tenant)
    await db.refresh(user)
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(URL, json=body)
    assert r.status_code == expected, (body, r.status_code, r.text)
    return r.json()


def _provider(monkeypatch, fn):
    """Replace the tenant text provider; `fn(prompt) -> str | None` (sync or async). Returns the captured prompts."""
    prompts: list[str] = []

    async def fake(db, tenant_id, user_id, feature, prompt, **_kw):
        prompts.append(prompt)
        out = fn(prompt)
        if asyncio.iscoroutine(out):
            out = await out
        return out

    monkeypatch.setattr("app.common.gemini_client.generate_text_for_tenant", fake)
    return prompts


def _facts_in_prompt(prompt: str) -> list[dict]:
    line = next(ln for ln in prompt.splitlines() if ln.startswith("FACTS: "))
    return json.loads(line[len("FACTS: "):])


async def _deterministic(db, tenant, user, body: dict | None = None) -> dict:
    return await _post(db, tenant, user, {**(body or PL_2026), "use_ai": False})


def _pick_fact(data: dict, unit: str = "currency") -> dict:
    return next(f for f in data["facts"] if f["unit"] == unit and D(f["value"]) != 0)


def _fmt_money(value: str) -> str:
    return f"{abs(D(value)).quantize(D('0.01'), rounding=ROUND_HALF_UP):,.2f}"


# ---- flag, permission, tenant (5.1) ------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_flag_off_or_not_strict_true_is_404(db_session_integration):
    db = db_session_integration
    for flags in ({"finance_ai_insights_v2": False}, {"finance_ai_insights_v2": "true"}, {}):
        tenant, user, _w = await seed_world(db, flags=flags)
        await db.commit()
        await _post(db, tenant, user, {**PL_2026, "use_ai": False}, expected=404)


@pytest.mark.asyncio
async def test_permissions_are_fail_closed(db_session_integration, monkeypatch):
    db = db_session_integration
    prompts = _provider(monkeypatch, lambda _p: None)
    flags = {**ENFORCE}
    cases = (
        ("clerk", {"finance.access": True}, 403),  # ai.tools.finance.read missing -> deny (fail closed)
        ("clerk", {"finance.access": True, "ai.read": True, "ai.chat": True}, 403),  # general AI keys never imply it
        ("clerk", {"finance.access": True, "ai.tools.finance.read": False}, 403),
        ("clerk", {"finance.access": True, "ai.tools.finance.read": True, "finance.mis_report.view": False}, 403),
        ("viewer", {"ai.tools.finance.read": True}, 403),  # no finance.access
        ("clerk", {"finance.access": True, "ai.tools.finance.read": True}, 200),
        ("clerk", {"finance.access": True, "ai.tools.finance.*": True}, 200),
    )
    for role, perms, expected in cases:
        tenant, user, _w = await _seed(db, flags=flags, role_name=role, permissions=perms)
        await _post(db, tenant, user, PL_2026, expected=expected)
    assert len(prompts) == 2  # denied requests never reach the provider


@pytest.mark.asyncio
async def test_user_of_another_tenant_is_rejected(db_session_integration):
    db = db_session_integration
    tenant_a, _user_a, _ = await _seed(db)
    _tenant_b, user_b, _ = await _seed(db)
    await _post(db, tenant_a, user_b, {**PL_2026, "use_ai": False}, expected=403)


# ---- validation of the request -----------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_request_validation_422(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await _seed(db)
    for body in (
        {**PL_2026, "question": "x" * (MAX_QUESTION_CHARS + 1)},
        {**PL_2026, "report": "general_ledger"},
        {**PL_2026, "comparison": "last_decade"},
        {**PL_2026, "posting": True},  # unknown fields are refused
        {**PL_2026, "fiscal_year": 2026},  # fiscal_year together with dates
        {"report": "profit_loss", "from_date": "2026-12-31", "to_date": "2026-01-01"},
        {"report": "profit_loss", "from_date": "2026-13-01"},
    ):
        await _post(db, tenant, user, {**body, "use_ai": False}, expected=422)


# ---- every report type (5.8: same report services as the normal APIs) --------------------------------------------------
@pytest.mark.asyncio
async def test_every_report_type_returns_deterministic_commentary(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await _seed(db)
    for report in REPORTS:
        for comparison in ("none", "previous_period"):
            data = await _post(
                db, tenant, user,
                {"report": report, "from_date": "2026-01-01", "to_date": "2026-12-31", "comparison": comparison, "use_ai": False},
            )
            assert data["report"] == report and data["source"] == "deterministic" and data["deterministic_fallback"] is False
            assert data["summary"] and data["data_as_of"] and data["base_currency"] == "BDT"
            ids = {f["id"] for f in data["facts"]}
            for finding in data["findings"]:
                assert set(finding["fact_ids"]) <= ids, (report, finding)
            for fact in data["facts"]:
                if fact["unit"] != "count":
                    assert fact["value"] == format(D(fact["value"]).quantize(D("0.0001")), "f"), fact  # 4-dp string


@pytest.mark.asyncio
async def test_profit_loss_facts_match_the_statement_api(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await _seed(db, flags={"finance_statements_v2": True})
    data = await _deterministic(db, tenant, user)
    await db.refresh(tenant)
    await db.refresh(user)
    async with api_client(db, tenant, user) as ac:
        pl = (await ac.get("/api/v1/finance/statements/profit-loss", params={"from_date": "2026-01-01", "to_date": "2026-12-31"})).json()
    facts = {f["id"]: D(f["value"]) for f in data["facts"]}
    revenue = sum(D(r["outer_amount"]) for r in pl["trading"]["credit_rows"] if r["row_type"] != "result" and r["outer_amount"] is not None)
    nett = D(pl["profit_and_loss"]["nett_result"]["amount"])
    if pl["profit_and_loss"]["nett_result"]["kind"] != "profit":
        nett = -nett
    assert facts["pl_revenue_current"] == revenue
    assert facts["pl_nett_result_current"] == nett


# ---- provider failures fall back (5.2, 5.3) ------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_provider_failures_return_deterministic_commentary(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, _w = await _seed(db)
    det = await _deterministic(db, tenant, user)
    fact = _pick_fact(det)

    def boom(_p):
        raise RuntimeError("provider down")

    async def slow(_p):
        await asyncio.sleep(2)
        return "{}"

    monkeypatch.setattr(ai_service, "AI_TIMEOUT_SECONDS", 0.2)
    cases = (
        (boom, "provider_error"),
        (slow, "provider_timeout"),
        (lambda _p: None, "provider_unavailable_or_budget_exhausted"),
        (lambda _p: "   ", "provider_unavailable_or_budget_exhausted"),
        (lambda _p: "Sure! Margins fell because costs rose.", "validation_failed:not_json"),
        (lambda _p: json.dumps({"summary": "ok", "findings": []}), "validation_failed:bad_findings"),
        (
            lambda _p: json.dumps({"summary": "Revenue moved.", "findings": [{"text": "Revenue moved.", "fact_ids": ["made_up_fact"]}]}),
            "validation_failed:unknown_fact",
        ),
        (  # cites a real fact but invents a figure
            lambda _p: json.dumps(
                {"summary": "Costs rose.", "findings": [{"text": "Costs rose by 98,765.43.", "fact_ids": [fact["id"]]}]}
            ),
            "validation_failed:number_not_in_facts",
        ),
        (  # the number exists, but in a fact the finding does not cite
            lambda _p: json.dumps(
                {"summary": "Costs rose.", "findings": [{"text": f"Costs were {_fmt_money(fact['value'])}.", "fact_ids": []}]}
            ),
            "validation_failed:number_not_in_facts",
        ),
        (  # an invented number in the summary
            lambda _p: json.dumps(
                {"summary": "Margin fell 31%.", "findings": [{"text": f"Value {_fmt_money(fact['value'])}.", "fact_ids": [fact["id"]]}]}
            ),
            "validation_failed:number_not_in_facts",
        ),
    )
    for fn, reason in cases:
        _provider(monkeypatch, fn)
        data = await _post(db, tenant, user, PL_2026)
        assert data["source"] == "deterministic" and data["deterministic_fallback"] is True, reason
        assert data["reason"] == reason
        assert data["summary"] == det["summary"] and data["findings"] == det["findings"]
        assert data["facts"] == det["facts"]


@pytest.mark.asyncio
async def test_budget_exhausted_uses_the_real_provider_wrapper_and_falls_back(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, _w = await _seed(db)

    async def no_budget(*_a, **_kw):
        return False

    def never(*_a, **_kw):
        raise AssertionError("the provider must not be called when the budget is exhausted")

    monkeypatch.setattr("app.common.gemini_client.allow_openrouter_tenant_text", no_budget)
    monkeypatch.setattr("app.common.gemini_client.allow_gemini_for_tenant", no_budget)
    monkeypatch.setattr("app.common.gemini_client._raw_generate_text_sync", never)
    monkeypatch.setattr("app.modules.ai_tool.llm_provider.openrouter_client.openrouter_generate_text", never)
    data = await _post(db, tenant, user, PL_2026)
    assert data["source"] == "deterministic" and data["deterministic_fallback"] is True
    assert data["reason"] == "provider_unavailable_or_budget_exhausted"


@pytest.mark.asyncio
async def test_tenant_ai_disabled_falls_back_without_calling_the_provider(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, _w = await _seed(db, flags={"ai_enabled": False})
    prompts = _provider(monkeypatch, lambda _p: "{}")
    data = await _post(db, tenant, user, PL_2026)
    assert data["deterministic_fallback"] is True and data["reason"] == "ai_policy_denied"
    assert prompts == []


# ---- valid AI answer -------------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_valid_ai_answer_citing_facts_is_returned(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, _w = await _seed(db)
    det = await _deterministic(db, tenant, user, {**PL_2026, "comparison": "previous_year"})
    money = _pick_fact(det)
    rounded = f"{abs(D(money['value'])).quantize(D('1'), rounding=ROUND_HALF_UP):,}"
    answer = {
        "summary": f"For 2026 the main figure was {_fmt_money(money['value'])}.",
        "findings": [
            {"text": f"{money['label']}: BDT {_fmt_money(money['value'])}.", "fact_ids": [money["id"]]},
            {"text": f"Rounded, that is about {rounded} for 2026-01-01 to 2026-12-31.", "fact_ids": [money["id"]]},
        ],
    }
    prompts = _provider(monkeypatch, lambda _p: "```json\n" + json.dumps(answer) + "\n```")
    data = await _post(db, tenant, user, {**PL_2026, "comparison": "previous_year", "question": "Why did gross margin fall?"})
    assert len(prompts) == 1
    assert data["source"] == "ai" and data["deterministic_fallback"] is False and data["reason"] is None, (data["reason"], answer)
    assert data["summary"] == answer["summary"]
    assert data["findings"] == answer["findings"]
    # 5.6: the computed figures are identical whether the commentary text came from AI or not
    assert data["facts"] == det["facts"]
    assert data["period"]["comparison"] == "previous_year" and data["period"]["previous_from_date"] == "2025-01-01"


# ---- payload bounded and tenant-scoped (5.4, 5.7) -----------------------------------------------------------------------
@pytest.mark.asyncio
async def test_prompt_holds_only_bounded_facts_of_this_tenant(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, _w = await _seed(db)
    await seed_noise_tenant(db)
    await db.commit()
    prompts = _provider(monkeypatch, lambda _p: None)
    question = "Why did margin fall? mail me at someone@example.com or 01712345678"
    for report in ("profit_loss", "trial_balance", "balance_sheet"):
        data = await _post(db, tenant, user, {**PL_2026, "report": report, "comparison": "previous_year", "question": question})
        prompt = prompts[-1]
        assert len(prompt) <= MAX_PROMPT_CHARS
        sent = _facts_in_prompt(prompt)
        assert all(set(f) == {"id", "label", "value", "unit"} for f in sent)
        returned = {f["id"]: f for f in data["facts"]}
        for f in sent:  # every fact sent is a fact of this tenant's computed report, value for value
            assert returned[f["id"]]["value"] == f["value"] and returned[f["id"]]["label"] == f["label"]
        assert "5000000" not in prompt and "5,000,000" not in prompt  # the noise tenant's sale
        assert "someone@example.com" not in prompt and "01712345678" not in prompt  # question is redacted
        assert "Bench " not in prompt  # no company / tenant name
        for marker in ("voucher_number", "T-", "account_number", "tenant_id"):
            assert marker not in prompt


@pytest.mark.asyncio
async def test_logs_hold_metadata_only(db_session_integration, monkeypatch, caplog):
    db = db_session_integration
    tenant, user, _w = await _seed(db)
    det = await _deterministic(db, tenant, user)
    fact = _pick_fact(det)
    answer = {"summary": "SUMMARY-MARKER-QX", "findings": [{"text": f"FINDING-MARKER-QX {_fmt_money(fact['value'])}", "fact_ids": [fact["id"]]}]}
    _provider(monkeypatch, lambda _p: json.dumps(answer))
    caplog.set_level(logging.INFO)
    data = await _post(db, tenant, user, {**PL_2026, "question": "QUESTION-MARKER-QX please"})
    assert data["source"] == "ai"
    _provider(monkeypatch, lambda _p: "not json RAW-MARKER-QX")
    await _post(db, tenant, user, {**PL_2026, "question": "QUESTION-MARKER-QX please"})
    text = caplog.text
    assert "finance_commentary" in text  # the metadata line is there
    for marker in ("QUESTION-MARKER-QX", "SUMMARY-MARKER-QX", "FINDING-MARKER-QX", "RAW-MARKER-QX", "FACTS:", fact["label"]):
        assert marker not in text, marker


# ---- read-only (5.5) -----------------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_commentary_is_read_only(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, _w = await _seed(db)
    tid = tenant.id
    before = await db.scalar(select(func.count()).select_from(Voucher).where(Voucher.tenant_id == tid))
    _provider(monkeypatch, lambda _p: json.dumps({"summary": "Post a voucher now.", "findings": [{"text": "Approve it.", "fact_ids": []}]}))
    await _post(db, tenant, user, PL_2026)
    after = await db.scalar(select(func.count()).select_from(Voucher).where(Voucher.tenant_id == tid))
    assert before == after
    assert [(sorted(r.methods), r.path) for r in ai_router.routes] == [(["POST"], "/statements/commentary")]


@pytest.mark.asyncio
async def test_statement_api_identical_with_ai_flag_on_or_off(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await _seed(db, flags={"finance_statements_v2": True})

    async def statements() -> list[dict]:
        await db.refresh(tenant)
        await db.refresh(user)
        out = []
        async with api_client(db, tenant, user) as ac:
            for path in ("trial-balance", "profit-loss", "balance-sheet"):
                body = (await ac.get(f"/api/v1/finance/statements/{path}", params={"from_date": "2026-01-01", "to_date": "2026-12-31"})).json()
                body.pop("data_as_of", None)
                out.append(body)
        return out

    with_ai = await statements()
    tenant.feature_flags = {**tenant.feature_flags, "finance_ai_insights_v2": False}
    await db.commit()
    without_ai = await statements()
    assert with_ai == without_ai


# ---- validator unit checks -----------------------------------------------------------------------------------------------
def _facts() -> list[FactRow]:
    return [
        FactRow("pl_revenue_current", "Sales and direct income - current", D("1234567.8900"), "currency"),
        FactRow("gross_margin_current", "Gross margin - current", D("12.3456"), "percent"),
        FactRow("cash_negative_months_current", "Months ending with negative cash", D("2"), "count"),
    ]


def _answer(text: str, ids: list[str], summary: str = "Summary.") -> str:
    return json.dumps({"summary": summary, "findings": [{"text": text, "fact_ids": ids}]})


def test_validator_accepts_rounded_grouped_and_lakh_forms():
    ctx = ["2026-01-01 to 2026-12-31 (fiscal year 2026)"]
    for text in (
        "Revenue was BDT 1,234,567.89 in 2026.",
        "Revenue was 12,34,567.89.",  # South Asian grouping
        "Revenue was about 1234568.",
        "Revenue was 12.35 lakh for 2026-01-01 to 2026-12-31.",
    ):
        validate_answer(_answer(text, ["pl_revenue_current"]), _facts(), ctx)
    validate_answer(_answer("Gross margin was 12.35% (12.3%).", ["gross_margin_current"]), _facts(), ctx)
    validate_answer(_answer("Two months ended negative: 2.", ["cash_negative_months_current"]), _facts(), ctx)


def test_validator_rejects_invented_numbers_and_unknown_facts():
    ctx = ["2026-01-01 to 2026-12-31 (fiscal year 2026)"]
    for raw, code in (
        (_answer("Revenue was 1,234,999.", ["pl_revenue_current"]), "number_not_in_facts"),
        (_answer("Margin fell to 31%.", ["gross_margin_current"]), "number_not_in_facts"),  # 31 only exists inside a date
        (_answer("Margin fell to 7%.", ["gross_margin_current"]), "number_not_in_facts"),
        (_answer("Revenue was 1,234,567.89.", ["gross_margin_current"]), "number_not_in_facts"),  # wrong citation
        (_answer("Revenue rose.", ["nope"]), "unknown_fact"),
        (_answer("Revenue rose.", ["pl_revenue_current"], summary="It was 42."), "number_not_in_facts"),
        ("[1, 2]", "not_json"),
        ("no json here", "not_json"),
    ):
        with pytest.raises(ValidationFailure) as exc:
            validate_answer(raw, _facts(), ctx)
        assert exc.value.code == code, (raw, exc.value.code)

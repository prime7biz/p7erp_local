"""Light tests for budget enforcement + WIP feature-flag helpers.

Run:
    docker compose exec backend pytest tests/test_budget_enforcement_wip_flags.py -q
"""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest

from app.common.permissions import (
    PERMISSION_FINANCE_BUDGET_OVERRIDE,
    MATERIAL_CONTROL_GOVERNANCE_KEYS,
)
from app.common.tenant_feature_keys import (
    AUTO_POST_WIP_JOURNAL,
    BUDGET_ENFORCEMENT_MODE,
    BUDGET_ENFORCEMENT_V2,
    get_budget_enforcement_mode,
    is_auto_post_wip_journal_enabled,
    normalize_feature_flag_value,
    normalize_feature_flags,
)
from app.modules.finance.budget_enforcement_service import BudgetCheckResult, evaluate_voucher_budget


class TestBudgetEnforcementFlag:
    def test_default_is_off(self):
        assert get_budget_enforcement_mode(None) == "off"
        assert get_budget_enforcement_mode({}) == "off"
        assert get_budget_enforcement_mode({"budget_enforcement_mode": "unknown"}) == "off"

    def test_modes_normalized(self):
        assert get_budget_enforcement_mode({"budget_enforcement_mode": "WARN"}) == "warn"
        assert get_budget_enforcement_mode({"budget_enforcement_mode": " Block "}) == "block"

    def test_write_time_canonicalizes(self):
        assert normalize_feature_flag_value(BUDGET_ENFORCEMENT_MODE, "Block") == "block"
        with pytest.raises(ValueError):
            normalize_feature_flag_value(BUDGET_ENFORCEMENT_MODE, "strict")
        out = normalize_feature_flags({"budget_enforcement_mode": "WARN", "knitting_enabled": True})
        assert out == {"budget_enforcement_mode": "warn", "knitting_enabled": True}


class TestAutoPostWipFlag:
    def test_default_on_when_missing(self):
        assert is_auto_post_wip_journal_enabled(None) is True
        assert is_auto_post_wip_journal_enabled({}) is True
        assert is_auto_post_wip_journal_enabled({"other": True}) is True

    def test_explicit_false_disables(self):
        assert is_auto_post_wip_journal_enabled({AUTO_POST_WIP_JOURNAL: False}) is False

    def test_explicit_true_enables(self):
        assert is_auto_post_wip_journal_enabled({AUTO_POST_WIP_JOURNAL: True}) is True


class TestBudgetOverridePermissionRegistered:
    def test_governance_key_present(self):
        keys = {row["key"] for row in MATERIAL_CONTROL_GOVERNANCE_KEYS}
        assert PERMISSION_FINANCE_BUDGET_OVERRIDE in keys


@pytest.mark.asyncio
async def test_evaluate_voucher_budget_off_short_circuits():
    """Mode off → ok without touching the DB for budget rows."""

    class _FakeDb:
        async def execute(self, *_a, **_k):
            raise AssertionError("DB should not be queried when mode is off")

    voucher = SimpleNamespace(id=1, voucher_date=date(2026, 7, 15))
    lines = [SimpleNamespace(cost_center_id=1, account_id=10, amount="100", entry_type="DEBIT")]
    result = await evaluate_voucher_budget(
        _FakeDb(),  # type: ignore[arg-type]
        tenant_id=1,
        feature_flags={BUDGET_ENFORCEMENT_MODE: "off"},
        voucher=voucher,  # type: ignore[arg-type]
        lines=lines,  # type: ignore[arg-type]
    )
    assert isinstance(result, BudgetCheckResult)
    assert result.ok is True
    assert result.mode == "off"
    assert result.over_budget is False
    assert result.can_post is True
    assert result.status == "within_budget"


class _SeqResult:
    def __init__(self, value):
        self._value = value

    def scalars(self):
        return self

    def all(self):
        if isinstance(self._value, list):
            return self._value
        return [self._value] if self._value is not None else []


class _SeqDb:
    """Returns canned results in order for evaluate_voucher_budget queries."""

    def __init__(self, sequence: list):
        self._sequence = list(sequence)
        self.calls = 0

    async def execute(self, *_a, **_k):
        self.calls += 1
        if not self._sequence:
            return _SeqResult([])
        return _SeqResult(self._sequence.pop(0))


@pytest.mark.asyncio
async def test_evaluate_voucher_budget_warn_exceeded_allows_post():
    budget = SimpleNamespace(id=1)
    budget_line = SimpleNamespace(
        cost_center_id=7,
        account_id=10,
        amount="100",
        period_month="2026-07",
    )
    voucher = SimpleNamespace(id=99, voucher_date=date(2026, 7, 15))
    lines = [SimpleNamespace(cost_center_id=7, account_id=10, amount="150", entry_type="DEBIT")]
    db = _SeqDb(
        [
            [budget],  # FINAL budgets
            [budget_line],  # budget lines
            [],  # posted rows
            [],  # pending rows
        ]
    )
    result = await evaluate_voucher_budget(
        db,  # type: ignore[arg-type]
        tenant_id=1,
        feature_flags={BUDGET_ENFORCEMENT_MODE: "warn", BUDGET_ENFORCEMENT_V2: False},
        voucher=voucher,  # type: ignore[arg-type]
        lines=lines,  # type: ignore[arg-type]
    )
    assert result.over_budget is True
    assert result.status == "exceeded"
    assert result.can_post is True
    assert result.ok is True
    assert result.mode == "warn"
    assert result.has_budget is True
    assert result.warnings


@pytest.mark.asyncio
async def test_evaluate_voucher_budget_block_exceeded_denies_post():
    budget = SimpleNamespace(id=1)
    budget_line = SimpleNamespace(
        cost_center_id=7,
        account_id=10,
        amount="100",
        period_month="2026-07",
    )
    voucher = SimpleNamespace(id=99, voucher_date=date(2026, 7, 15))
    lines = [SimpleNamespace(cost_center_id=7, account_id=10, amount="150", entry_type="DEBIT")]
    db = _SeqDb(
        [
            [budget],
            [budget_line],
            [],
            [],
        ]
    )
    result = await evaluate_voucher_budget(
        db,  # type: ignore[arg-type]
        tenant_id=1,
        feature_flags={BUDGET_ENFORCEMENT_MODE: "block", BUDGET_ENFORCEMENT_V2: False},
        voucher=voucher,  # type: ignore[arg-type]
        lines=lines,  # type: ignore[arg-type]
    )
    assert result.over_budget is True
    assert result.status == "exceeded"
    assert result.can_post is False
    assert result.ok is False
    assert result.mode == "block"


@pytest.mark.asyncio
async def test_evaluate_voucher_budget_near_limit():
    budget = SimpleNamespace(id=1)
    budget_line = SimpleNamespace(
        cost_center_id=7,
        account_id=10,
        amount="100",
        period_month="2026-07",
    )
    voucher = SimpleNamespace(id=99, voucher_date=date(2026, 7, 15))
    lines = [SimpleNamespace(cost_center_id=7, account_id=10, amount="95", entry_type="DEBIT")]
    db = _SeqDb(
        [
            [budget],
            [budget_line],
            [],
            [],
        ]
    )
    result = await evaluate_voucher_budget(
        db,  # type: ignore[arg-type]
        tenant_id=1,
        feature_flags={BUDGET_ENFORCEMENT_MODE: "warn", BUDGET_ENFORCEMENT_V2: False},
        voucher=voucher,  # type: ignore[arg-type]
        lines=lines,  # type: ignore[arg-type]
    )
    assert result.status == "near_limit"
    assert result.over_budget is False
    assert result.can_post is True
    assert result.warnings

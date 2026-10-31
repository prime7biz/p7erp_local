"""Sprint 5: TDS + payroll statutory (PF/ESI/PT).

Run:
    docker compose exec backend pytest tests/test_tds_statutory.py -q
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.common.tenant_feature_keys import (
    STATUTORY_PAYROLL_ENABLED,
    TDS_SYSTEM_ENABLED,
    is_statutory_payroll_enabled,
    is_tds_system_enabled,
)
from app.models.payroll_statutory import PayrollStatutoryConfig
from app.models.tds import TdsSection
from app.modules.finance.tds_service import calculate_tds_amount, quarter_date_range
from app.modules.hr_payroll.statutory_calculation_service import (
    calculate_esi,
    calculate_gratuity,
    calculate_pf,
    calculate_pt,
)


def test_feature_flags_default_off():
    assert is_tds_system_enabled(None) is False
    assert is_statutory_payroll_enabled({}) is False
    assert is_tds_system_enabled({TDS_SYSTEM_ENABLED: True}) is True
    assert is_statutory_payroll_enabled({STATUTORY_PAYROLL_ENABLED: True}) is True


def test_pf_capped_at_15000():
    low = calculate_pf(Decimal("10000"))
    assert low["employee_pf"] == Decimal("1200.00")
    high = calculate_pf(Decimal("30000"))
    assert high["pf_wage"] == Decimal("15000.00")
    assert high["employee_pf"] == Decimal("1800.00")
    assert high["employer_pf"] == Decimal("1800.00")


def test_esi_zero_above_ceiling():
    under = calculate_esi(Decimal("20000"))
    assert under["employee_esi"] == Decimal("150.00")  # 0.75%
    assert under["employer_esi"] == Decimal("650.00")  # 3.25%
    over = calculate_esi(Decimal("25000"))
    assert over["employee_esi"] == Decimal("0.00")
    assert over["employer_esi"] == Decimal("0.00")


def test_pt_maharashtra_slabs():
    assert calculate_pt(Decimal("5000")) == Decimal("0.00")
    assert calculate_pt(Decimal("8000")) == Decimal("175.00")
    assert calculate_pt(Decimal("15000")) == Decimal("200.00")


def test_gratuity_formula():
    g = calculate_gratuity(Decimal("10000"), Decimal("5"))
    assert g == (Decimal("10000") * Decimal("15") * Decimal("5") / Decimal("26")).quantize(Decimal("0.01"))


def test_tds_threshold():
    section = TdsSection(
        tenant_id=1,
        section_code="194C",
        threshold_amount=Decimal("30000"),
        tds_rate=Decimal("2"),
        is_active=True,
    )
    below = calculate_tds_amount(Decimal("20000"), section)
    assert below["tds_amount"] == Decimal("0.00")
    assert below["applicable"] == Decimal("0")
    above = calculate_tds_amount(Decimal("50000"), section)
    assert above["tds_amount"] == Decimal("1000.00")
    assert above["net_payment"] == Decimal("49000.00")


def test_quarter_range():
    s, e = quarter_date_range(2026, 1)
    assert s.isoformat() == "2026-01-01"
    assert e.isoformat() == "2026-03-31"
    s2, e2 = quarter_date_range(2026, 4)
    assert s2.isoformat() == "2026-10-01"
    assert e2.isoformat() == "2026-12-31"


@pytest.mark.asyncio
async def test_tds_section_persist(db_session_integration):
    db = db_session_integration
    from app.models.tenant import Tenant, TenantType

    code = f"TDS{uuid.uuid4().hex[:8].upper()}"
    t = Tenant(
        name=f"TDS {code}",
        company_code=code[:18],
        tenant_type=TenantType.manufacturer,
        is_active=True,
        feature_flags={TDS_SYSTEM_ENABLED: True, STATUTORY_PAYROLL_ENABLED: True},
    )
    db.add(t)
    await db.flush()
    sec = TdsSection(
        tenant_id=t.id,
        section_code="194J",
        description="Fees",
        threshold_amount=Decimal("30000"),
        tds_rate=Decimal("10"),
        is_active=True,
    )
    db.add(sec)
    cfg = PayrollStatutoryConfig(tenant_id=t.id, pt_state="Maharashtra")
    db.add(cfg)
    await db.flush()
    assert sec.id > 0
    assert cfg.id > 0

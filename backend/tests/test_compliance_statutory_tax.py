"""Unit tests for Bangladesh statutory tax calculations."""

from decimal import Decimal

from app.modules.compliance.statutory_tax_service import compute_line_tax, compute_payroll_statutory, format_money


def test_compute_line_tax_vat_15_percent():
    tax = compute_line_tax(Decimal("100"), Decimal("15"))
    assert format_money(tax) == "15.0000"


def test_compute_payroll_statutory_ait_and_pf():
    result = compute_payroll_statutory(
        gross_pay=Decimal("50000"),
        ait_rate_pct=Decimal("5"),
        pf_employee_rate_pct=Decimal("7"),
        pf_employer_rate_pct=Decimal("7"),
    )
    assert result["ait_total"] == "2500.0000"
    assert result["pf_employee_total"] == "3500.0000"
    assert result["net_payable"] == "44000.0000"

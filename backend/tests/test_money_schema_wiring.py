"""Phase 3A: Pydantic money validators on inquiry/quotation schemas."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.modules.inquiries.schemas import InquiryCreate, InquiryUpdate
from app.modules.quotations.schemas import QuotationFullUpdate, QuotationMaterialLine


def test_inquiry_create_normalizes_commas():
    row = InquiryCreate(
        customer_id=1,
        style_id=1,
        target_price="1,234.5",
        exchange_rate=" 110.25 ",
        items=[],
    )
    assert row.target_price == "1234.5000"
    assert row.exchange_rate == "110.250000"


def test_inquiry_create_rejects_bad_money():
    with pytest.raises(ValidationError):
        InquiryCreate(customer_id=1, style_id=1, target_price="n/a", items=[])


def test_inquiry_update_empty_money_ok():
    u = InquiryUpdate(target_price=None, exchange_rate="")
    assert u.target_price is None
    assert u.exchange_rate is None


def test_quotation_line_coerces_commas():
    line = QuotationMaterialLine(unit_price="2,500.5", exchange_rate="1")
    assert line.unit_price == "2500.5000"
    assert line.exchange_rate == "1.000000"


def test_quotation_full_update_optional_headers():
    body = QuotationFullUpdate(target_price="10", exchange_rate="1", profit_percentage="12.5")
    assert body.target_price == "10.0000"
    assert body.exchange_rate == "1.000000"
    assert body.profit_percentage == "12.5000"

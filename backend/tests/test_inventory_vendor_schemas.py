"""Vendor Pydantic contracts accept legacy-only and extended supplier payloads."""

from __future__ import annotations

from app.modules.inventory.router import VendorCreate, VendorUpdate


def test_vendor_create_legacy_only() -> None:
    row = VendorCreate(vendor_code="V-1", name="Acme")
    assert row.vendor_code == "V-1"
    assert row.name == "Acme"
    assert row.legal_name is None


def test_vendor_create_with_supplier_extensions() -> None:
    row = VendorCreate(
        vendor_code="V-2",
        name="Acme",
        legal_name="Acme Ltd",
        website="https://example.com",
        incoterms="FOB",
        remarks="Preferred shipper",
    )
    assert row.legal_name == "Acme Ltd"
    assert row.incoterms == "FOB"


def test_vendor_update_partial_extended_fields() -> None:
    patch = VendorUpdate(iban="GB12TEST", onboarding_status="pending_review")
    assert patch.iban == "GB12TEST"
    assert patch.vendor_code is None

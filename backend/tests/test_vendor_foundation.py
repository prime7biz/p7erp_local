"""Foundation checks: Vendor ORM supplier columns + Alembic 131 chain (no DB required)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

from app.models.inventory import Vendor


def test_vendor_orm_includes_supplier_extension_columns() -> None:
    names = {c.key for c in Vendor.__table__.columns}
    expected = {
        "legal_name",
        "trade_name",
        "website",
        "mobile",
        "designation",
        "address_line1",
        "state_or_region",
        "postal_code",
        "registration_number",
        "bank_account_title",
        "iban",
        "payment_terms",
        "incoterms",
        "shipping_terms",
        "lead_time_notes",
        "compliance_status",
        "compliance_reference_numbers",
        "certifications_summary",
        "onboarding_status",
        "remarks",
        "internal_notes",
    }
    assert expected <= names


def test_alembic_131_revision_chains_from_130() -> None:
    root = Path(__file__).resolve().parents[1]
    path = root / "alembic" / "versions" / "131_vendor_supplier_master_fields.py"
    assert path.is_file(), f"Missing migration file: {path}"
    spec = importlib.util.spec_from_file_location("alembic_rev_131", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert getattr(mod, "revision", None) == "131"
    assert getattr(mod, "down_revision", None) == "130"


def test_alembic_132_revision_chains_from_131() -> None:
    root = Path(__file__).resolve().parents[1]
    path = root / "alembic" / "versions" / "132_vendor_ai_suggestion_batches.py"
    assert path.is_file(), f"Missing migration file: {path}"
    spec = importlib.util.spec_from_file_location("alembic_rev_132", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert getattr(mod, "revision", None) == "132"
    assert getattr(mod, "down_revision", None) == "131"

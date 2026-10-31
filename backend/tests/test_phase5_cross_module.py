"""Phase 5 cross-module polish — related counts + export case dates.

    docker compose exec backend pytest tests/test_phase5_cross_module.py -q
"""

from __future__ import annotations

from datetime import date

import pytest
from fastapi import HTTPException

from app.common.permissions import (
    MATERIAL_CONTROL_GOVERNANCE_KEYS,
    PERMISSION_COMMERCIAL_EXPORT_CASE_CREATE,
    PERMISSION_COMMERCIAL_EXPORT_CASE_EDIT,
)
from app.modules.commercial.router import _validate_export_case_dates
from app.modules.orders.related_counts_service import build_order_related_counts


@pytest.mark.asyncio
async def test_related_counts_fail_closed_shape(db_session_integration):
    db = db_session_integration
    from tests.merch_fixtures import create_merch_tenant_with_user

    tenant, _user, _role = await create_merch_tenant_with_user(db)
    counts = await build_order_related_counts(db, tenant_id=tenant.id, order_id=999999)
    assert counts["bom_exists"] is False
    assert counts["po_count"] == 0
    assert counts["invoice_count"] == 0
    assert "tna_actions_count" in counts
    assert "export_case_id" in counts


def test_export_case_date_validation():
    _validate_export_case_dates(
        expected=date(2026, 8, 1),
        actual=date(2026, 8, 2),
        order_delivery=date(2026, 8, 10),
    )
    with pytest.raises(HTTPException):
        _validate_export_case_dates(
            expected=date(2026, 8, 15),
            actual=None,
            order_delivery=date(2026, 8, 10),
        )
    with pytest.raises(HTTPException):
        _validate_export_case_dates(
            expected=date(2026, 8, 10),
            actual=date(2026, 8, 1),
            order_delivery=date(2026, 8, 20),
        )


def test_export_case_rbac_keys_registered():
    keys = {row["key"] for row in MATERIAL_CONTROL_GOVERNANCE_KEYS}
    assert PERMISSION_COMMERCIAL_EXPORT_CASE_CREATE in keys
    assert PERMISSION_COMMERCIAL_EXPORT_CASE_EDIT in keys

from __future__ import annotations

from app.modules.merch.routers.consumption_recon import _actual_issue_movements_stmt


def test_actual_issue_movements_stmt_filters_order_and_bom_lines():
    stmt = _actual_issue_movements_stmt(tenant_id=7, order_id=42, bom_line_ids=[11, 12])
    compiled = stmt.compile()
    params = compiled.params
    # Ensure the query shape aligns with inventory variance basis:
    # tenant + order scoped OUT movements mapped by BOM line IDs.
    assert any(v == 7 for v in params.values())
    assert any(v == 42 for v in params.values())
    assert any(isinstance(v, (list, tuple)) and 11 in v and 12 in v for v in params.values())

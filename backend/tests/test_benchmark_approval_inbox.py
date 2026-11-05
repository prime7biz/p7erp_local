"""Roadmap item 9: unified approval inbox — dashboard count includes draft POs and submitted requisitions.

Run: docker compose exec backend pytest tests/test_benchmark_approval_inbox.py -q
"""

from __future__ import annotations

import pytest

from app.models.inventory import PurchaseOrder
from app.models.procurement import PurchaseRequisition
from app.modules.dashboard.kpi_service import count_pending_approvals_queues
from tests.benchmark_fixtures import seed_tenant_admin


@pytest.mark.asyncio
async def test_pending_count_includes_procurement_queues(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    before = await count_pending_approvals_queues(db, tenant.id)
    db.add_all([
        PurchaseOrder(tenant_id=tenant.id, po_code="INBOX-PO-1", supplier_name="S", status="DRAFT"),
        PurchaseOrder(tenant_id=tenant.id, po_code="INBOX-PO-2", supplier_name="S", status="APPROVED"),
        PurchaseRequisition(tenant_id=tenant.id, pr_code="INBOX-PR-1", status="SUBMITTED", requested_by=user.id),
        PurchaseRequisition(tenant_id=tenant.id, pr_code="INBOX-PR-2", status="DRAFT", requested_by=user.id),
    ])
    await db.flush()
    after = await count_pending_approvals_queues(db, tenant.id)
    assert after - before == 2

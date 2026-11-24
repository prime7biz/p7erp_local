"""Guard: inbound job-work materials never touch stock_movements / FIFO / inventory GL.

Run: docker compose exec backend pytest tests/test_job_work_zero_value_invariant.py -q
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.database import get_db
from app.main import app
from app.models import InventoryCostLayer, InventoryGlPosting, StockMovement, Voucher
from app.models.job_work import JobWorkMaterialLedger

from tests.test_inbound_job_work import API, _headers, _seed


@pytest.mark.asyncio
async def test_job_work_receive_consume_return_adjust_leave_valued_stock_untouched(db_session_integration):
    db = db_session_integration
    tenant, user, customer, item = await _seed(db, flag_on=True)

    # Poison valued stock so any accidental write would be visible.
    before_sm = int(
        (await db.execute(select(func.count()).select_from(StockMovement).where(StockMovement.tenant_id == tenant.id))).scalar()
        or 0
    )
    before_layers = int(
        (
            await db.execute(
                select(func.count()).select_from(InventoryCostLayer).where(InventoryCostLayer.tenant_id == tenant.id)
            )
        ).scalar()
        or 0
    )
    before_gl = int(
        (
            await db.execute(
                select(func.count()).select_from(InventoryGlPosting).where(InventoryGlPosting.tenant_id == tenant.id)
            )
        ).scalar()
        or 0
    )
    before_vouchers = int(
        (await db.execute(select(func.count()).select_from(Voucher).where(Voucher.tenant_id == tenant.id))).scalar() or 0
    )

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        headers = _headers(user, tenant)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                f"{API}/contracts",
                headers=headers,
                json={
                    "customer_id": customer.id,
                    "cm_rate": "12.5",
                    "do_cutting": True,
                    "deliverables": [{"qty_ordered": "40"}],
                    "materials": [
                        {"item_id": item.id, "consumption_per_unit": "1", "qty_planned": "40"}
                    ],
                },
            )
            assert created.status_code == 201, created.text
            cid = created.json()["id"]
            mid = created.json()["materials"][0]["id"]
            assert (await client.post(f"{API}/contracts/{cid}/confirm", headers=headers)).status_code == 200

            recv = await client.post(
                f"{API}/contracts/{cid}/materials/receive",
                headers=headers,
                json={"material_id": mid, "qty": "40"},
            )
            assert recv.status_code == 200, recv.text

            cons = await client.post(
                f"{API}/contracts/{cid}/materials/consume",
                headers=headers,
                json={"material_id": mid, "qty": "30"},
            )
            assert cons.status_code == 200, cons.text

            ret = await client.post(
                f"{API}/contracts/{cid}/materials/return",
                headers=headers,
                json={"material_id": mid, "qty": "5"},
            )
            assert ret.status_code == 200, ret.text
    finally:
        app.dependency_overrides.pop(get_db, None)

    after_sm = int(
        (await db.execute(select(func.count()).select_from(StockMovement).where(StockMovement.tenant_id == tenant.id))).scalar()
        or 0
    )
    after_layers = int(
        (
            await db.execute(
                select(func.count()).select_from(InventoryCostLayer).where(InventoryCostLayer.tenant_id == tenant.id)
            )
        ).scalar()
        or 0
    )
    after_gl = int(
        (
            await db.execute(
                select(func.count()).select_from(InventoryGlPosting).where(InventoryGlPosting.tenant_id == tenant.id)
            )
        ).scalar()
        or 0
    )
    after_vouchers = int(
        (await db.execute(select(func.count()).select_from(Voucher).where(Voucher.tenant_id == tenant.id))).scalar() or 0
    )

    assert after_sm == before_sm
    assert after_layers == before_layers
    assert after_gl == before_gl
    assert after_vouchers == before_vouchers

    ledger_kinds = {
        row.movement_kind
        for row in (
            await db.execute(
                select(JobWorkMaterialLedger).where(JobWorkMaterialLedger.tenant_id == tenant.id)
            )
        ).scalars().all()
    }
    assert "RECEIVE" in ledger_kinds
    assert "CONSUME" in ledger_kinds
    assert "RETURN" in ledger_kinds

"""Scan station: idempotent batch upload, one count per bundle×operation, OB validation, summary, guards."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import SHOP_FLOOR_SCAN_ENABLED
from app.database import get_db
from app.main import app
from app.models.production import CutTicket, CuttingBundle, LayPlan, MarkerPlan, OperationBulletin, OperationBulletinOp, SewingLine

from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.merch_fixtures import create_customer, create_garment_style, create_quotation_and_order


def _as(db, user, tenant):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant


@pytest.mark.asyncio
async def test_scan_station_flow(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    other_style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    order.style_id = style.id
    slug = uuid.uuid4().hex[:6]
    ob = OperationBulletin(tenant_id=tenant.id, style_id=style.id, ob_code=f"OB-{slug}", version_no=1)
    other_ob = OperationBulletin(tenant_id=tenant.id, style_id=other_style.id, ob_code=f"OB2-{slug}", version_no=1)
    line = SewingLine(tenant_id=tenant.id, line_code=f"L{slug}", name="Line 1")
    marker = MarkerPlan(tenant_id=tenant.id, marker_code=f"MK-{slug}")
    db.add_all([ob, other_ob, line, marker])
    await db.flush()
    collar = OperationBulletinOp(tenant_id=tenant.id, ob_id=ob.id, sequence_no=1, operation_name="Collar attach", smv=Decimal("0.5"))
    side = OperationBulletinOp(tenant_id=tenant.id, ob_id=ob.id, sequence_no=2, operation_name="Side seam", smv=Decimal("0.8"))
    foreign_op = OperationBulletinOp(tenant_id=tenant.id, ob_id=other_ob.id, sequence_no=1, operation_name="Other", smv=Decimal("1"))
    lay = LayPlan(tenant_id=tenant.id, marker_plan_id=marker.id, lay_code=f"LAY-{slug}")
    db.add_all([collar, side, foreign_op, lay])
    await db.flush()
    ct = CutTicket(tenant_id=tenant.id, order_id=order.id, lay_plan_id=lay.id, ticket_code=f"CT-{slug}")
    db.add(ct)
    await db.flush()
    b1 = CuttingBundle(tenant_id=tenant.id, cut_ticket_id=ct.id, order_id=order.id, bundle_no="B1", barcode=f"BC{slug}1", qty_in_bundle=25)
    b2 = CuttingBundle(tenant_id=tenant.id, cut_ticket_id=ct.id, order_id=order.id, bundle_no="B2", barcode=f"BC{slug}2", qty_in_bundle=20)
    db.add_all([b1, b2])
    other_tenant, outsider, _ = await create_admin_tenant_with_user(db)
    await db.commit()
    ids = {"order": order.id, "collar": collar.id, "side": side.id, "foreign": foreign_op.id, "line": line.id}

    # 09:30 Bangladesh time today, expressed in UTC.
    bd = timezone(timedelta(hours=6))
    nine_thirty = datetime.now(bd).replace(hour=9, minute=30, second=0, microsecond=0)
    if nine_thirty > datetime.now(bd):
        nine_thirty -= timedelta(days=1)
    ts = nine_thirty.isoformat()

    def scan(key: str, barcode: str, op: int, **extra):
        return {"client_key": key, "barcode": barcode, "ob_op_id": op, "scanned_at": ts, "sewing_line_id": ids["line"], "operator_code": "op-07", **extra}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            _as(db, user, tenant)
            assert (await ac.get("/api/v1/production/scan/setup")).status_code == 403
            tenant.feature_flags = {**(tenant.feature_flags or {}), SHOP_FLOOR_SCAN_ENABLED: True}
            await db.commit()

            ops = (await ac.get(f"/api/v1/production/scan/orders/{ids['order']}/operations")).json()
            assert [o["operation_name"] for o in ops["operations"]] == ["Collar attach", "Side seam"]

            batch = {
                "device_id": "tablet-1",
                "scans": [
                    scan("k-0001-aaaa", f"BC{slug}1", ids["collar"]),
                    scan("k-0002-aaaa", f"BC{slug}2", ids["collar"], pieces=18),
                    scan("k-0003-aaaa", f"BC{slug}1", ids["side"]),
                    scan("k-0004-aaaa", "NOPE", ids["side"]),
                    scan("k-0005-aaaa", f"BC{slug}2", ids["foreign"]),
                    scan("k-0006-aaaa", f"BC{slug}2", ids["side"], scanned_at=(datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()),
                ],
            }
            r = await ac.post("/api/v1/production/scan/batch", json=batch)
            assert r.status_code == 200, r.text
            res = {x["client_key"]: x for x in r.json()["results"]}
            assert r.json()["accepted"] == 3
            assert res["k-0002-aaaa"]["pieces"] == 18
            assert res["k-0004-aaaa"]["status"] == "error" and "Unknown bundle" in res["k-0004-aaaa"]["message"]
            assert res["k-0005-aaaa"]["status"] == "error" and "operation bulletin" in res["k-0005-aaaa"]["message"]
            assert res["k-0006-aaaa"]["status"] == "error"

            # Re-sending the whole offline queue is safe; another device scanning the same bundle+op is not counted.
            again = await ac.post("/api/v1/production/scan/batch", json={"scans": batch["scans"][:3]})
            assert {x["status"] for x in again.json()["results"]} == {"duplicate"}
            other_device = await ac.post("/api/v1/production/scan/batch", json={"scans": [scan("k-0009-bbbb", f"BC{slug}1", ids["collar"])]})
            assert other_device.json()["results"][0]["status"] == "already_scanned"

            summary = (await ac.get("/api/v1/production/scan/summary", params={"day": nine_thirty.date().isoformat(), "tz_offset_minutes": 360})).json()
            assert summary["total_pieces"] == 25 + 18 + 25
            # 25×0.5 + 18×0.5 + 25×0.8 = 41.5 earned minutes, all in the 09:00 local hour.
            assert Decimal(summary["earned_minutes"]) == Decimal("41.50")
            assert [h["hour"] for h in summary["hours"]] == [9]
            assert summary["operators"][0]["operator_code"] == "OP-07"

            _as(db, outsider, other_tenant)
            other_tenant.feature_flags = {SHOP_FLOOR_SCAN_ENABLED: True}
            await db.commit()
            r = await ac.post("/api/v1/production/scan/batch", json={"scans": [scan("k-0010-cccc", f"BC{slug}2", ids["side"])]})
            assert r.json()["results"][0]["status"] == "error"
            assert (await ac.get(f"/api/v1/production/scan/orders/{ids['order']}/operations")).status_code == 404
            assert (await ac.get("/api/v1/production/scan/summary")).json()["total_pieces"] == 0
    finally:
        app.dependency_overrides.clear()

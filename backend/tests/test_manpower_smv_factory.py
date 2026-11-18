"""Phase 5: SMV comparison + ratios.

Run: docker compose exec backend pytest tests/test_manpower_smv_factory.py tests/test_manpower_ratios.py -q
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models.merch import GarmentStyle
from app.models.production import OperationBulletin, SewingLine
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

MP = "/api/v1/hr/manpower"


async def _setup(db, *, smv: bool = True):
    tenant, user, _ = await create_merch_tenant_with_user(
        db,
        permissions={"hr.access": True, "hr.manpower.read": True},
    )
    tenant.feature_flags = {
        **(tenant.feature_flags or {}),
        "manpower_control_v1": True,
        "manpower_smv_panel_v1": smv,
        "manpower_floor_suggested_v1": True,
    }
    await db.commit()
    return tenant, user


@pytest.mark.asyncio
async def test_smv_flag_off_404(db_session_integration):
    db = db_session_integration
    tenant, user = await _setup(db, smv=False)
    async with api_client(db, tenant, user) as c:
        r = await c.get(f"{MP}/smv-comparison")
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_smv_industry_from_standard_and_ob(db_session_integration):
    db = db_session_integration
    tenant, user = await _setup(db)
    slug = uuid.uuid4().hex[:6]
    s1 = GarmentStyle(
        tenant_id=tenant.id,
        style_code=f"S1{slug}",
        name="Polo",
        status="ACTIVE",
        standard_smv=Decimal("12.5"),
    )
    s2 = GarmentStyle(
        tenant_id=tenant.id,
        style_code=f"S2{slug}",
        name="Tee",
        status="ACTIVE",
    )
    db.add_all([s1, s2])
    await db.flush()
    db.add(
        OperationBulletin(
            tenant_id=tenant.id,
            style_id=s2.id,
            ob_code=f"OB{slug}",
            version_no=1,
            total_smv=Decimal("9.25"),
            status="draft",
        )
    )
    db.add(
        SewingLine(
            tenant_id=tenant.id,
            line_code=f"L{slug[:4]}",
            name="Line 1",
            default_operator_count=10,
            is_active=True,
        )
    )
    await db.commit()

    async with api_client(db, tenant, user) as c:
        r = await c.get(f"{MP}/smv-comparison")
        assert r.status_code == 200, r.text
        by_code = {x["style_code"]: x for x in r.json()["rows"]}
        assert by_code[s1.style_code]["industry_source"] == "STYLE_STANDARD"
        assert by_code[s1.style_code]["industry_smv"] is not None
        assert by_code[s2.style_code]["industry_source"] == "OB_TOTAL"
        # No good pieces → factory UNKNOWN
        assert by_code[s1.style_code]["factory_smv"] is None
        assert by_code[s1.style_code]["factory_reason"]

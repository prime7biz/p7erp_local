"""Phase 3: floor suggested headcount + machine ratio.

Run: docker compose exec backend pytest tests/test_production_manpower_suggested.py -q
"""

from __future__ import annotations

import uuid
from datetime import datetime

import pytest

from app.models.hr_manpower import HrManpowerSettings
from app.models.merch import GarmentStyle
from app.models.production import (
    LineBalanceRun,
    LineCrewTemplate,
    OperationBulletin,
    ProductionCrewRole,
    SewingLine,
)
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

MP = "/api/v1/production/manpower"


async def _setup(db, *, floor: bool = True):
    flags = {
        "manpower_control_v1": True,
        "manpower_floor_suggested_v1": floor,
    }
    tenant, user, _role = await create_merch_tenant_with_user(
        db,
        permissions={
            "hr.access": True,
            "hr.manpower.read": True,
            "production.planning.read": True,
        },
    )
    tenant.feature_flags = {**(tenant.feature_flags or {}), **flags}
    await db.commit()
    return tenant, user


async def _seed_roles(db, tenant_id: int) -> dict[str, ProductionCrewRole]:
    roles = {}
    for i, (key, name) in enumerate(
        [
            ("line_incharge", "Line In-Charge"),
            ("sewing_operator", "Operator"),
            ("sewing_helper", "Helper"),
        ]
    ):
        r = ProductionCrewRole(
            tenant_id=tenant_id,
            department_type="sewing",
            role_key=key,
            role_name=name,
            sort_order=i,
            is_active=True,
        )
        db.add(r)
        roles[key] = r
    await db.flush()
    return roles


@pytest.mark.asyncio
async def test_flag_off_returns_404(db_session_integration):
    db = db_session_integration
    tenant, user = await _setup(db, floor=False)
    async with api_client(db, tenant, user) as c:
        r = await c.get(f"{MP}/floor-suggested")
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_line_default_and_template_override(db_session_integration):
    db = db_session_integration
    tenant, user = await _setup(db)
    roles = await _seed_roles(db, tenant.id)

    line_a = SewingLine(
        tenant_id=tenant.id,
        line_code=f"A{uuid.uuid4().hex[:4]}",
        name="Line A",
        default_operator_count=20,
        default_helper_count=5,
        running_machine_count=18,
        is_active=True,
    )
    line_c = SewingLine(
        tenant_id=tenant.id,
        line_code=f"C{uuid.uuid4().hex[:4]}",
        name="Line C",
        default_operator_count=99,
        default_helper_count=99,
        running_machine_count=12,
        is_active=True,
    )
    db.add_all([line_a, line_c])
    await db.flush()

    db.add(
        LineCrewTemplate(
            tenant_id=tenant.id,
            sewing_line_id=line_c.id,
            crew_role_id=roles["sewing_operator"].id,
            default_count=8,
        )
    )
    db.add(
        LineCrewTemplate(
            tenant_id=tenant.id,
            sewing_line_id=line_c.id,
            crew_role_id=roles["sewing_helper"].id,
            default_count=2,
        )
    )
    await db.commit()

    async with api_client(db, tenant, user) as c:
        r = await c.get(f"{MP}/floor-suggested", params={"department_type": "sewing"})
        assert r.status_code == 200, r.text
        items = {x["line_code"]: x for x in r.json()["items"]}
        assert line_a.line_code in items
        a_ops = next(
            role for role in items[line_a.line_code]["roles"] if role["role_key"] == "sewing_operator"
        )
        assert a_ops["suggested_count"] == 20
        assert a_ops["source"] == "LINE_DEFAULT"

        assert line_c.line_code in items
        c_ops = next(
            role for role in items[line_c.line_code]["roles"] if role["role_key"] == "sewing_operator"
        )
        assert c_ops["suggested_count"] == 8
        assert c_ops["source"] == "TEMPLATE"
        c_help = next(
            role for role in items[line_c.line_code]["roles"] if role["role_key"] == "sewing_helper"
        )
        assert c_help["suggested_count"] == 2


@pytest.mark.asyncio
async def test_ie_advisory_and_helper_ratio_and_machine_ratio(db_session_integration):
    db = db_session_integration
    tenant, user = await _setup(db)
    await _seed_roles(db, tenant.id)

    line = SewingLine(
        tenant_id=tenant.id,
        line_code=f"IE{uuid.uuid4().hex[:4]}",
        name="IE Line",
        default_operator_count=0,
        default_helper_count=0,
        running_machine_count=12,
        is_active=True,
    )
    db.add(line)
    await db.flush()

    slug = uuid.uuid4().hex[:6]
    style = GarmentStyle(
        tenant_id=tenant.id,
        style_code=f"ST{slug}",
        name="Tee",
        status="ACTIVE",
    )
    db.add(style)
    await db.flush()
    ob = OperationBulletin(
        tenant_id=tenant.id,
        style_id=style.id,
        ob_code=f"OB{slug}",
        version_no=1,
        status="draft",
    )
    db.add(ob)
    await db.flush()
    db.add(
        LineBalanceRun(
            tenant_id=tenant.id,
            ob_id=ob.id,
            line_id=line.id,
            num_workstations=16,
            status="draft",
            created_at=datetime.utcnow(),
        )
    )
    db.add(
        HrManpowerSettings(
            tenant_id=tenant.id,
            targets={"operator_to_helper": "4:1", "running_machines_per_operator": "1"},
            allow_unmapped_hire=False,
        )
    )
    await db.commit()

    async with api_client(db, tenant, user) as c:
        r = await c.get(f"{MP}/floor-suggested", params={"department_type": "sewing"})
        assert r.status_code == 200, r.text
        item = next(x for x in r.json()["items"] if x["sewing_line_id"] == line.id)
        ops = next(role for role in item["roles"] if role["role_key"] == "sewing_operator")
        assert ops["suggested_count"] == 16
        assert ops["source"] == "IE_ADVISORY"
        assert ops["advisory_label"]
        helpers = next(role for role in item["roles"] if role["role_key"] == "sewing_helper")
        assert helpers["suggested_count"] == 4
        assert helpers["source"] == "RATIO_TARGET"

        mr = await c.get(f"{MP}/machine-ratio")
        assert mr.status_code == 200, mr.text
        row = next(x for x in mr.json()["items"] if x["sewing_line_id"] == line.id)
        assert row["suggested_operators"] == 16
        assert row["running_machine_count"] == 12
        assert row["status"] in ("OK", "UNDER", "OVER")


@pytest.mark.asyncio
async def test_cross_tenant_lines_hidden(db_session_integration):
    db = db_session_integration
    tenant_a, user_a = await _setup(db)
    tenant_b, _user_b = await _setup(db)
    await _seed_roles(db, tenant_a.id)
    line_b = SewingLine(
        tenant_id=tenant_b.id,
        line_code=f"X{uuid.uuid4().hex[:4]}",
        name="Other tenant",
        default_operator_count=50,
        is_active=True,
    )
    db.add(line_b)
    await db.commit()

    async with api_client(db, tenant_a, user_a) as c:
        r = await c.get(f"{MP}/floor-suggested")
        assert r.status_code == 200
        ids = [x.get("sewing_line_id") for x in r.json()["items"]]
        assert line_b.id not in ids

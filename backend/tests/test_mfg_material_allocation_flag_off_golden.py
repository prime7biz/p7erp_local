"""F-T1: flag OFF golden. Captured from the UNCHANGED readers (before any Phase 2 reader change).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_material_allocation_flag_off_golden.py -q"
"""

from __future__ import annotations

import copy
import json

import pytest
from sqlalchemy import delete

from app.models.inventory import PlannedOrder, ReorderSuggestion
from app.modules.inventory.mrp_engine_service import calculate_projected_balance, run_mrp
from app.modules.inventory.reorder_service import check_reorder_points
from app.modules.inventory.stock_availability_service import compute_item_availability, compute_items_availability
from app.modules.orders.planning_grounding_service import compute_planning_grounding_snapshot
from app.modules.orders.promise_checks import run_order_promise_check
from app.modules.production.readiness_service import get_order_chain_readiness
from tests.mfg_alloc_fixtures import ALLOC_FLAG, add_reservation, seed_golden, set_flags
from tests.mfg_intel_fixtures import API, MONDAY, client_for


_VOLATILE = {"order_id", "order_code", "item_id"}


def _strip(value):
    """Drop run-specific ids so the snapshot can be compared with the inline golden values."""
    if isinstance(value, dict):
        return {k: _strip(v) for k, v in value.items() if k not in _VOLATILE}
    if isinstance(value, list):
        return [_strip(v) for v in value]
    return value


def _av(slot) -> list[float]:
    return [slot.on_hand, slot.in_transit, slot.reserved, slot.available]


async def snapshot(db, ds) -> dict:
    """Every reader that Phase 2 touches, reduced to id-free values (ids differ between runs)."""
    t = ds.tenant
    names = {ds.fab.id: "FAB", ds.trm.id: "TRM"}
    out: dict = {}

    batch = await compute_items_availability(db, t.id, [ds.fab.id, ds.trm.id])
    out["items_availability"] = {names[i]: _av(s) for i, s in batch.items()}
    scoped = await compute_items_availability(db, t.id, [ds.fab.id, ds.trm.id], warehouse_id=ds.store.id)
    out["items_availability_store"] = {names[i]: _av(s) for i, s in scoped.items()}
    raw = await compute_items_availability(
        db, t.id, [ds.fab.id], include_in_transit_po=False, exclude_reserved=False
    )
    out["items_availability_raw"] = {names[i]: _av(s) for i, s in raw.items()}
    one = await compute_item_availability(db, t.id, ds.fab.id)
    out["item_availability_single"] = _av(one)

    async with client_for(db, t, ds.user) as c:
        r = await c.get(f"/api/v1/inventory/items/{ds.fab.id}/availability")
        assert r.status_code == 200, r.text
        body = r.json()
        out["endpoint_item_availability"] = [body[k] for k in ("on_hand", "in_transit", "reserved", "available")]

        r = await c.get(f"{API}/orders/{ds.order_a.id}/readiness")
        assert r.status_code == 200, r.text
        body = r.json()
        mat = next(d for d in body["dimensions"] if d["key"] == "materials_ready")
        out["p1_readiness"] = {
            "mode": body["mode"],
            "materials_status": mat["status"],
            "materials_reasons": mat["reason_codes"],
            "lines": sorted(
                [
                    [ln["item_name"], ln["required_qty"], ln["on_hand_qty"], ln["in_transit_qty"], ln["available_qty"], ln["short_qty"], ln["ready"]]
                    for ln in (body.get("material_lines") or [])
                ]
            ),
            "dimension_status": {d["key"]: d["status"] for d in body["dimensions"]},
        }

        r = await c.get(f"{API}/orders/{ds.order_a.id}/delivery-prediction")
        assert r.status_code == 200, r.text
        body = r.json()
        keep = ("band", "material", "missing_inputs", "reason_codes", "target_date", "order_status", "remaining_qty")
        out["p1_delivery"] = _strip({k: body[k] for k in keep})

    promise = await run_order_promise_check(db, tenant_id=t.id, order=ds.order_a)
    out["promise"] = {
        "atp_ok": promise.atp_ok,
        "ctp_ok": promise.ctp_ok,
        "reasons": promise.reasons,
        "lines": sorted(
            [[ln.item_code.split("-")[0], ln.required_qty, ln.available_qty, ln.shortage_qty] for ln in promise.lines]
        ),
    }

    chain = await get_order_chain_readiness(db, t.id, ds.order_a.id)
    out["chain_readiness"] = json.loads(json.dumps(
        {k: v for k, v in chain.items() if k in ("overall_status", "error")}, default=str, sort_keys=True
    ))
    cm = chain.get("materials") or chain.get("chain") or {}
    out["chain_materials"] = {
        "statuses": {k: v.get("status") for k, v in sorted(cm.items())},
        "material_readiness": _strip(json.loads(json.dumps(cm.get("material_readiness"), default=str, sort_keys=True))),
    }

    snap = await compute_planning_grounding_snapshot(db, tenant_id=t.id, order_id=ds.order_a.id)
    out["grounding_signals"] = {
        s.code: [s.status, s.confidence, s.value if s.code == "material_atp_ctp" else None] for s in snap.signals
    } if snap else None

    mrp = await run_mrp(db, t.id, as_of_date=MONDAY)
    out["mrp_planned"] = sorted(
        [[names.get(p.item_id), str(p.required_qty), str(p.planned_qty), str(p.requirement_date)] for p in mrp.planned_orders],
        key=lambda x: str(x[0]),
    )
    out["mrp_exceptions"] = sorted(e.code for e in mrp.exceptions)
    await db.execute(delete(PlannedOrder).where(PlannedOrder.tenant_id == t.id))
    await db.flush()
    for key, item in (("FAB", ds.fab), ("TRM", ds.trm)):
        rows = await calculate_projected_balance(db, t.id, item.id, horizon_days=3)
        out[f"projected_balance_{key}"] = [[str(r.receipts), str(r.pab), str(r.net_required)] for r in rows]

    created = await check_reorder_points(db, t.id)
    out["reorder"] = sorted([[names.get(s.item_id), str(s.suggested_qty)] for s in created], key=lambda x: str(x[0]))
    await db.execute(delete(ReorderSuggestion).where(ReorderSuggestion.tenant_id == t.id))
    await db.flush()
    return out




# Captured from the unchanged code (seed_golden dataset). Do not edit to make a test pass.
GOLDEN_FLAG_OFF = {
    "chain_materials": {
        "material_readiness": {
            "items": [
                {"available": 1085.0, "category": "FABRIC", "item_name": "FAB", "on_hand": 500.0, "ready": False,
                 "required": 1500.0, "short": 415.0},
                {"available": 150.0, "category": "TRIM", "item_name": "TRM", "on_hand": 200.0, "ready": False,
                 "required": 300.0, "short": 150.0},
            ],
            "ready_count": 0,
            "status": "warning",
            "total": 2,
        },
        "statuses": {
            "customer_approval": "not_started",
            "line_allocated": "ready",
            "material_readiness": "warning",
            "merch_samples": "ready",
            "ob_ready": "ready",
            "style_linked": "ready",
        },
    },
    "chain_readiness": {"overall_status": "warning"},
    "endpoint_item_availability": [500.0, 700.0, 115.0, 1085.0],
    "grounding_signals": {
        "delivery_window": ["ok", "high", None],
        "dependency_completeness": ["blocked", "high", None],
        "line_capacity_context": ["ok", "medium", None],
        "material_atp_ctp": ["blocked", "medium", {"atp_ok": False, "ctp_ok": True, "line_count": 2}],
        "production_readiness_chain": ["warning", "medium", None],
    },
    "item_availability_single": [500.0, 700.0, 115.0, 1085.0],
    "items_availability": {"FAB": [500.0, 700.0, 115.0, 1085.0], "TRM": [200.0, 0.0, 50.0, 150.0]},
    "items_availability_raw": {"FAB": [500.0, 0.0, 0.0, 500.0]},
    "items_availability_store": {"FAB": [500.0, 700.0, 115.0, 1085.0], "TRM": [200.0, 0.0, 50.0, 150.0]},
    "mrp_exceptions": ["MISSING_BOM"],
    "mrp_planned": [["FAB", "1500.0000", "65.0000", "2030-04-01"], ["TRM", "300.0000", "150.0000", "2030-04-01"]],
    "p1_delivery": {
        "band": "UNKNOWN",
        "material": {
            "authority": "ORDER_BOM",
            "reason_codes": ["MATERIAL_SHORT", "SHARED_SUPPLY_NOT_ALLOCATED"],
            "status": "BLOCKED",
        },
        "missing_inputs": ["materials"],
        "order_status": "CONFIRMED",
        "reason_codes": ["MATERIAL_NOT_READY"],
        "remaining_qty": "300.000",
        "target_date": "2030-04-01",
    },
    "p1_readiness": {
        "dimension_status": {
            "capacity_allocated": "READY",
            "commercially_confirmed": "READY",
            "financially_supported": "NOT_EVALUATED",
            "fully_ready": "BLOCKED",
            "materials_ready": "BLOCKED",
            "technically_approved": "NOT_APPLICABLE",
        },
        "lines": [
            ["FAB", "1500.0000", "500.0000", "700.0000", "1085.0000", "415.0000", False],
            ["TRM", "300.0000", "200.0000", "0.0000", "150.0000", "150.0000", False],
        ],
        "materials_reasons": ["MATERIAL_SHORT", "SHARED_SUPPLY_NOT_ALLOCATED"],
        "materials_status": "BLOCKED",
        "mode": "ORDER_BOM_V2",
    },
    "projected_balance_FAB": [["1050.0000", "1550.0000", "0"], ["0", "1550.0000", "0"], ["0", "1550.0000", "0"]],
    "projected_balance_TRM": [["0", "200.0000", "0"], ["0", "200.0000", "0"], ["0", "200.0000", "0"]],
    "promise": {
        "atp_ok": False,
        "ctp_ok": True,
        "lines": [["FAB", 1500.0, 1085.0, 415.0], ["TRM", 300.0, 150.0, 150.0]],
        "reasons": ["Insufficient stock for one or more BOM items"],
    },
    "reorder": [["TRM", "300.0000"]],
}


@pytest.mark.asyncio
async def test_flag_off_matches_golden_captured_before_the_reader_change(db_session_integration):
    ds = await seed_golden(db_session_integration)
    assert await snapshot(db_session_integration, ds) == GOLDEN_FLAG_OFF



def _flag_on_expected() -> dict:
    """Designed result with the flag ON on the dataset PLUS the ACTIVE rows (see _add_active_rows).

    FAB holds: legacy SOFT 40 (tentative, ignored), legacy HARD 60 (order A), legacy HARD 15 of the CANCELLED order
    (counts 0), ACTIVE HARD_ATP 30 (order B), TENTATIVE 25 and INFORMATIONAL 10 (ignored). TRM: legacy HARD 20
    (order A) + HARD_ATP 10 (order B); legacy SOFT 30 ignored. Open FAB PO supply = 1000 - 300 accepted = 700
    (the DRAFT PO of 50 is not supply). Checks of order A add back A's own holds.
    """
    exp = copy.deepcopy(GOLDEN_FLAG_OFF)
    exp["items_availability"] = {"FAB": [500.0, 700.0, 90.0, 1110.0], "TRM": [200.0, 0.0, 30.0, 170.0]}
    exp["items_availability_store"] = copy.deepcopy(exp["items_availability"])
    exp["item_availability_single"] = [500.0, 700.0, 90.0, 1110.0]
    exp["endpoint_item_availability"] = [500.0, 700.0, 90.0, 1110.0]
    exp["promise"]["lines"] = [["FAB", 1500.0, 1170.0, 330.0], ["TRM", 300.0, 190.0, 110.0]]
    # R2 readiness v3: a line is ready only with issued stock + the order's own hard holds (A holds FAB 60, TRM 20), so
    # short = required - own hold; stock on hand alone no longer counts, and the shared-supply caveat is gone.
    exp["p1_readiness"]["lines"] = [
        ["FAB", "1500.0000", "500.0000", "700.0000", "1170.0000", "1440.0000", False],
        ["TRM", "300.0000", "200.0000", "0.0000", "190.0000", "280.0000", False],
    ]
    exp["p1_readiness"]["materials_reasons"] = ["MATERIAL_SHORT", "SUPPLY_NOT_PEGGED"]
    exp["p1_delivery"]["material"] = {
        "authority": "ORDER_BOM",
        "reason_codes": ["MATERIAL_SHORT", "SUPPLY_NOT_PEGGED"],
        "status": "BLOCKED",
        "expected_material_date": None,
    }
    items = exp["chain_materials"]["material_readiness"]["items"]
    items[0].update(available=1170.0, short=330.0)
    items[1].update(available=190.0, short=110.0)
    exp["mrp_planned"] = [["FAB", "1500.0000", "330.0000", "2030-04-01"], ["TRM", "300.0000", "110.0000", "2030-04-01"]]
    exp["projected_balance_FAB"] = [["700.0000", "1200.0000", "0"], ["0", "1200.0000", "0"], ["0", "1200.0000", "0"]]
    exp["projected_balance_TRM"] = [["0.0000", "200.0000", "0"], ["0", "200.0000", "0"], ["0", "200.0000", "0"]]
    exp["reorder"] = []
    return exp


async def _add_active_rows(db, ds) -> None:
    await add_reservation(db, ds.tenant, ds.fab, "30", status="ACTIVE", kind="HARD_ATP", order=ds.order_b, source="TEST")
    await add_reservation(db, ds.tenant, ds.fab, "25", status="ACTIVE", kind="TENTATIVE", order=ds.order_b, source="TEST")
    await add_reservation(db, ds.tenant, ds.fab, "10", status="ACTIVE", kind="INFORMATIONAL", order=ds.order_b, source="TEST")
    await add_reservation(db, ds.tenant, ds.trm, "10", status="ACTIVE", kind="HARD_ATP", order=ds.order_b, source="TEST")
    await db.commit()


@pytest.mark.asyncio
async def test_active_rows_never_leak_flag_on_changes_as_designed_and_off_again_is_golden(db_session_integration):
    db = db_session_integration
    ds = await seed_golden(db)
    await _add_active_rows(db, ds)

    # 1) flag OFF (default) with HARD_ATP / TENTATIVE / INFORMATIONAL rows present: byte-identical to the golden
    assert await snapshot(db, ds) == GOLDEN_FLAG_OFF

    # 2) flag ON: values change exactly as designed
    set_flags(ds.tenant, **{ALLOC_FLAG: True})
    await db.flush()
    assert await snapshot(db, ds) == _flag_on_expected()

    # 3) flag OFF again: identical to the golden
    set_flags(ds.tenant, **{ALLOC_FLAG: False})
    await db.flush()
    assert await snapshot(db, ds) == GOLDEN_FLAG_OFF


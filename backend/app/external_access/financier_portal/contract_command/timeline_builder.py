"""13-node contract lifecycle ribbon (status per node)."""

from __future__ import annotations

from typing import Any

from app.models.commercial import BtbLc, MasterContract
from app.models.merch import Order


def build_timeline(
    master: MasterContract,
    orders: list[Order],
    btbs: list[BtbLc],
) -> list[dict[str, Any]]:
    any_pi = any(o.pi_issued_at for o in orders)
    any_lc = any(o.lc_received_at for o in orders)
    btb_open = any((b.status or "").upper() not in ("DRAFT", "CANCELLED") for b in btbs)
    any_rm = any((o.rm_received_pct or 0) >= 95 for o in orders)
    any_prod = any(o.production_started_at for o in orders)
    any_ship = any(o.shipped_at for o in orders)
    any_pay = any(o.payment_received_at for o in orders)

    nodes = [
        ("contract_opened", "ok" if (master.status or "").upper() not in ("DRAFT",) else "pending"),
        ("pi_issued", "ok" if any_pi else "pending"),
        ("btb_opened", "ok" if btb_open else "pending"),
        ("rm_ordered", "ok" if btbs else "pending"),
        ("rm_inhouse", "ok" if any_rm else "amber"),
        ("production_started", "ok" if any_prod else "pending"),
        ("cutting", "pending"),
        ("sewing", "pending"),
        ("finishing", "pending"),
        ("qc", "pending"),
        ("shipped", "ok" if any_ship else "pending"),
        ("docs_submitted", "pending"),
        ("proceeds_received", "ok" if any_pay else "pending"),
        ("btb_repaid", "pending"),
    ]
    return [{"id": nid, "status": st} for nid, st in nodes]

"""Line balancing: assign operations to workstations (greedy split by SMV)."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OperationBulletinOp


async def run_line_balance(
    db: AsyncSession,
    tenant_id: int,
    ob_id: int,
    num_workstations: int,
) -> dict[str, Any]:
    """Distribute OB operations across workstations; return bottleneck."""
    result = await db.execute(
        select(OperationBulletinOp)
        .where(
            OperationBulletinOp.tenant_id == tenant_id,
            OperationBulletinOp.ob_id == ob_id,
        )
        .order_by(OperationBulletinOp.sequence_no)
    )
    ops = list(result.scalars().all())
    if not ops or num_workstations < 1:
        return {
            "workstations": [],
            "bottleneck_cycle_time": 0.0,
            "balance_efficiency_pct": 0.0,
            "predicted_output_per_hour": 0.0,
            "total_smv": 0.0,
        }

    total_smv = float(sum(float(o.smv or 0) for o in ops))
    # Greedy: fill workstations round-robin by operation order
    buckets: list[list[dict[str, Any]]] = [[] for _ in range(num_workstations)]
    loads = [0.0] * num_workstations
    for i, op in enumerate(ops):
        w = i % num_workstations
        smv = float(op.smv or 0)
        buckets[w].append({"id": op.id, "operation_name": op.operation_name, "smv": smv})
        loads[w] += smv

    bottleneck = max(loads) if loads else 0.0
    balance_eff = (total_smv / (num_workstations * bottleneck) * 100.0) if bottleneck > 0 else 0.0
    pred_hr = (60.0 / bottleneck) if bottleneck > 0 else 0.0

    workstations = [
        {"workstation_no": idx + 1, "assigned_ops": buckets[idx], "cycle_time": loads[idx]}
        for idx in range(num_workstations)
    ]

    return {
        "workstations": workstations,
        "bottleneck_cycle_time": bottleneck,
        "balance_efficiency_pct": round(balance_eff, 4),
        "predicted_output_per_hour": round(pred_hr, 4),
        "total_smv": total_smv,
    }

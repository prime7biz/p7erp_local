"""Inventory movement layer: String money/qty -> Numeric (go-live remediation Phase 3).

Revision ID: 181
Revises: 180
"""

import sys
from pathlib import Path
from typing import Sequence, Union

from alembic import op

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from numeric_column_helpers import (  # noqa: E402
    alter_numeric_to_string,
    alter_string_to_numeric,
    scrub_string_decimal,
)

revision: str = "181"
down_revision: Union[str, None] = "180"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_MONEY = "numeric(18,4)"
_MONEY_FMT = "FM999999999999999999.9999"


def _upgrade_qty_nn(table: str, col: str) -> None:
    scrub_string_decimal(table, col, default_lit="0", nullable=False)
    alter_string_to_numeric(
        table, col, prec_sql=_MONEY, existing_len=32, nullable=False, server_default_sql="0"
    )


def _downgrade_qty_nn(table: str, col: str) -> None:
    alter_numeric_to_string(table, col, prec_sql=_MONEY, existing_len=32, nullable=False, fmt=_MONEY_FMT)


def upgrade() -> None:
    _upgrade_qty_nn("purchase_order_items", "quantity")
    _upgrade_qty_nn("purchase_order_items", "unit_price")

    _upgrade_qty_nn("goods_receiving_items", "quantity")

    _upgrade_qty_nn("stock_movements", "quantity")

    _upgrade_qty_nn("inventory_cost_layers", "qty_original")
    _upgrade_qty_nn("inventory_cost_layers", "qty_remaining")
    _upgrade_qty_nn("inventory_cost_layers", "unit_cost")

    _upgrade_qty_nn("physical_inventory_lines", "expected_qty")

    _upgrade_qty_nn("delivery_challan_items", "quantity")

    _upgrade_qty_nn("process_orders", "input_quantity")
    _upgrade_qty_nn("process_orders", "expected_output_qty")
    _upgrade_qty_nn("process_orders", "processing_charges")

    _upgrade_qty_nn("process_order_cost_lines", "amount")

    _upgrade_qty_nn("manufacturing_orders", "planned_quantity")
    _upgrade_qty_nn("manufacturing_orders", "completed_quantity")

    _upgrade_qty_nn("warehouse_transfer_lines", "quantity")

    scrub_string_decimal("stock_adjustments", "quantity", nullable=False)
    alter_string_to_numeric(
        "stock_adjustments",
        "quantity",
        prec_sql=_MONEY,
        existing_len=32,
        nullable=False,
        server_default_sql=None,
    )

    _upgrade_qty_nn("production_material_issue_lines", "actual_issue_qty")


def downgrade() -> None:
    _downgrade_qty_nn("production_material_issue_lines", "actual_issue_qty")

    alter_numeric_to_string(
        "stock_adjustments", "quantity", prec_sql=_MONEY, existing_len=32, nullable=False, fmt=_MONEY_FMT
    )

    _downgrade_qty_nn("warehouse_transfer_lines", "quantity")

    _downgrade_qty_nn("manufacturing_orders", "completed_quantity")
    _downgrade_qty_nn("manufacturing_orders", "planned_quantity")

    _downgrade_qty_nn("process_order_cost_lines", "amount")

    _downgrade_qty_nn("process_orders", "processing_charges")
    _downgrade_qty_nn("process_orders", "expected_output_qty")
    _downgrade_qty_nn("process_orders", "input_quantity")

    _downgrade_qty_nn("delivery_challan_items", "quantity")

    _downgrade_qty_nn("physical_inventory_lines", "expected_qty")

    _downgrade_qty_nn("inventory_cost_layers", "unit_cost")
    _downgrade_qty_nn("inventory_cost_layers", "qty_remaining")
    _downgrade_qty_nn("inventory_cost_layers", "qty_original")

    _downgrade_qty_nn("stock_movements", "quantity")

    _downgrade_qty_nn("goods_receiving_items", "quantity")

    _downgrade_qty_nn("purchase_order_items", "unit_price")
    _downgrade_qty_nn("purchase_order_items", "quantity")

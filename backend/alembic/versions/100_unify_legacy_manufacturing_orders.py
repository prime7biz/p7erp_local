"""Unify legacy inventory manufacturing orders: migration pointer + deprecation flag.

Revision ID: 100
Revises: 099
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "100"
down_revision: Union[str, None] = "099"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "manufacturing_orders",
        sa.Column("migrated_mfg_work_order_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "manufacturing_orders",
        sa.Column("legacy_deprecated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_foreign_key(
        "fk_manufacturing_orders_migrated_mfg_wo",
        "manufacturing_orders",
        "mfg_work_orders",
        ["migrated_mfg_work_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_manufacturing_orders_migrated_mfg_work_order_id",
        "manufacturing_orders",
        ["migrated_mfg_work_order_id"],
    )

    # Best-effort: create mfg_work_orders for legacy rows without migration target
    op.execute(
        r"""
        INSERT INTO mfg_work_orders (
            tenant_id, mo_number, item_id, plan_line_id, routing_id,
            qty_planned, qty_completed, status, notes, created_at, updated_at
        )
        SELECT
            mo.tenant_id,
            LEFT('LEG-' || mo.mo_number, 32),
            mo.finished_item_id,
            NULL,
            NULL,
            COALESCE(
                CASE WHEN TRIM(COALESCE(mo.planned_quantity, '')) ~ '^[0-9]+\.?[0-9]*$'
                THEN TRIM(mo.planned_quantity)::numeric ELSE 0 END, 0
            ),
            COALESCE(
                CASE WHEN TRIM(COALESCE(mo.completed_quantity, '')) ~ '^[0-9]+\.?[0-9]*$'
                THEN TRIM(mo.completed_quantity)::numeric ELSE 0 END, 0
            ),
            CASE mo.status
                WHEN 'draft' THEN 'draft'
                WHEN 'completed' THEN 'completed'
                WHEN 'cancelled' THEN 'cancelled'
                ELSE 'released'
            END,
            COALESCE(mo.notes, '') || ' [migrated from manufacturing_orders]',
            mo.created_at,
            mo.updated_at
        FROM manufacturing_orders mo
        WHERE NOT EXISTS (
            SELECT 1 FROM mfg_work_orders w
            WHERE w.tenant_id = mo.tenant_id AND w.mo_number = LEFT('LEG-' || mo.mo_number, 32)
        )
        """
    )

    op.execute(
        """
        UPDATE manufacturing_orders mo
        SET migrated_mfg_work_order_id = w.id,
            legacy_deprecated = true
        FROM mfg_work_orders w
        WHERE w.tenant_id = mo.tenant_id
          AND w.mo_number = LEFT('LEG-' || mo.mo_number, 32)
          AND mo.migrated_mfg_work_order_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_manufacturing_orders_migrated_mfg_work_order_id", table_name="manufacturing_orders")
    op.drop_constraint("fk_manufacturing_orders_migrated_mfg_wo", "manufacturing_orders", type_="foreignkey")
    op.drop_column("manufacturing_orders", "legacy_deprecated")
    op.drop_column("manufacturing_orders", "migrated_mfg_work_order_id")

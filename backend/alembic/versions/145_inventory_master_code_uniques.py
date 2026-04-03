"""Tenant-scoped unique constraints on inventory master codes.

Revision ID: 145
Revises: 144
Create Date: 2026-03-31

Renames duplicate (tenant_id, <code>) rows (keeps lowest id per key) so unique constraints can be applied.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "145"
down_revision: Union[str, None] = "144"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Assign fresh codes so we never collide with an unrelated row (e.g. CATDUP-7 vs existing).
    # VARCHAR limits: category/subcategory/item 32 (uuid hex fits); unit 16.
    conn.execute(
        sa.text(
            """
            WITH ranked AS (
              SELECT id,
                     ROW_NUMBER() OVER (PARTITION BY tenant_id, category_code ORDER BY id) AS rn
              FROM item_categories
            )
            UPDATE item_categories AS ic
            SET category_code = REPLACE(gen_random_uuid()::text, '-', '')
            FROM ranked r
            WHERE ic.id = r.id AND r.rn > 1
            """
        )
    )
    conn.execute(
        sa.text(
            """
            WITH ranked AS (
              SELECT id,
                     ROW_NUMBER() OVER (PARTITION BY tenant_id, subcategory_code ORDER BY id) AS rn
              FROM item_subcategories
            )
            UPDATE item_subcategories AS isc
            SET subcategory_code = REPLACE(gen_random_uuid()::text, '-', '')
            FROM ranked r
            WHERE isc.id = r.id AND r.rn > 1
            """
        )
    )
    conn.execute(
        sa.text(
            """
            WITH ranked AS (
              SELECT id,
                     ROW_NUMBER() OVER (PARTITION BY tenant_id, unit_code ORDER BY id) AS rn
              FROM item_units
            )
            UPDATE item_units AS iu
            SET unit_code = LEFT(REPLACE(gen_random_uuid()::text, '-', ''), 16)
            FROM ranked r
            WHERE iu.id = r.id AND r.rn > 1
            """
        )
    )
    conn.execute(
        sa.text(
            """
            WITH ranked AS (
              SELECT id,
                     ROW_NUMBER() OVER (PARTITION BY tenant_id, item_code ORDER BY id) AS rn
              FROM items
            )
            UPDATE items AS it
            SET item_code = REPLACE(gen_random_uuid()::text, '-', '')
            FROM ranked r
            WHERE it.id = r.id AND r.rn > 1
            """
        )
    )

    op.create_unique_constraint(
        "uq_item_categories_tenant_category_code",
        "item_categories",
        ["tenant_id", "category_code"],
    )
    op.create_unique_constraint(
        "uq_item_subcategories_tenant_subcategory_code",
        "item_subcategories",
        ["tenant_id", "subcategory_code"],
    )
    op.create_unique_constraint(
        "uq_item_units_tenant_unit_code",
        "item_units",
        ["tenant_id", "unit_code"],
    )
    op.create_unique_constraint(
        "uq_items_tenant_item_code",
        "items",
        ["tenant_id", "item_code"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_items_tenant_item_code", "items", type_="unique")
    op.drop_constraint("uq_item_units_tenant_unit_code", "item_units", type_="unique")
    op.drop_constraint("uq_item_subcategories_tenant_subcategory_code", "item_subcategories", type_="unique")
    op.drop_constraint("uq_item_categories_tenant_category_code", "item_categories", type_="unique")

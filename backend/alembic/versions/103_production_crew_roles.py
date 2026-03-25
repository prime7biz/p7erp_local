"""Create production_crew_roles and seed default role sets.

Revision ID: 103
Revises: 102
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "103"
down_revision: Union[str, None] = "102"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "production_crew_roles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("department_type", sa.String(length=32), nullable=False),
        sa.Column("role_key", sa.String(length=64), nullable=False),
        sa.Column("role_name", sa.String(length=128), nullable=False),
        sa.Column("is_named", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("designation_filter", sa.String(length=128), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "department_type", "role_key", name="uq_production_crew_roles_tenant_dept_role"),
    )
    op.create_index(op.f("ix_production_crew_roles_tenant_id"), "production_crew_roles", ["tenant_id"], unique=False)
    op.create_index(
        op.f("ix_production_crew_roles_department_type"),
        "production_crew_roles",
        ["department_type"],
        unique=False,
    )

    conn = op.get_bind()
    tenant_ids = [r[0] for r in conn.execute(sa.text("SELECT id FROM tenants")).fetchall()]
    if not tenant_ids:
        return

    role_table = sa.table(
        "production_crew_roles",
        sa.column("tenant_id", sa.Integer()),
        sa.column("department_type", sa.String()),
        sa.column("role_key", sa.String()),
        sa.column("role_name", sa.String()),
        sa.column("is_named", sa.Boolean()),
        sa.column("designation_filter", sa.String()),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
    )

    seed_by_dept = {
        "sewing": [
            ("line_incharge", "Line In-charge", True, "Line Incharge"),
            ("sewing_operator", "Sewing Operator", False, None),
            ("sewing_helper", "Sewing Helper", False, None),
            ("quality_inspector", "Quality Inspector", False, None),
            ("iron_man", "Iron Man", False, None),
            ("final_qc", "Final QC", False, None),
            ("folding_man", "Folding Man", False, None),
            ("packing_man", "Packing Man", False, None),
        ],
        "knitting": [
            ("supervisor", "Supervisor", True, "Supervisor"),
            ("machine_operator", "Machine Operator", False, None),
            ("helper", "Helper", False, None),
        ],
        "dyeing": [
            ("supervisor", "Supervisor", True, "Supervisor"),
            ("operator", "Operator", False, None),
            ("helper", "Helper", False, None),
            ("lab_technician", "Lab Technician", False, None),
        ],
        "printing": [
            ("supervisor", "Supervisor", True, "Supervisor"),
            ("operator", "Operator", False, None),
            ("helper", "Helper", False, None),
        ],
        "aop": [
            ("supervisor", "Supervisor", True, "Supervisor"),
            ("operator", "Operator", False, None),
            ("helper", "Helper", False, None),
        ],
        "embroidery": [
            ("supervisor", "Supervisor", True, "Supervisor"),
            ("operator", "Operator", False, None),
            ("helper", "Helper", False, None),
            ("quality_inspector", "Quality Inspector", False, None),
        ],
        "elastic": [
            ("supervisor", "Supervisor", True, "Supervisor"),
            ("operator", "Operator", False, None),
            ("helper", "Helper", False, None),
        ],
        "washing": [
            ("supervisor", "Supervisor", True, "Supervisor"),
            ("operator", "Operator", False, None),
            ("helper", "Helper", False, None),
            ("quality_inspector", "Quality Inspector", False, None),
        ],
    }
    rows = []
    for tenant_id in tenant_ids:
        for dept, defs in seed_by_dept.items():
            for idx, (key, label, is_named, filt) in enumerate(defs):
                rows.append(
                    {
                        "tenant_id": tenant_id,
                        "department_type": dept,
                        "role_key": key,
                        "role_name": label,
                        "is_named": is_named,
                        "designation_filter": filt,
                        "sort_order": idx,
                        "is_active": True,
                    }
                )
    op.bulk_insert(role_table, rows)


def downgrade() -> None:
    op.drop_index(op.f("ix_production_crew_roles_department_type"), table_name="production_crew_roles")
    op.drop_index(op.f("ix_production_crew_roles_tenant_id"), table_name="production_crew_roles")
    op.drop_table("production_crew_roles")

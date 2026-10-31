"""Create hr_compliance_requirements + seed system templates (Sprint H1)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "225"
down_revision: Union[str, None] = "224"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_compliance_requirements",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("framework_id", sa.Integer(), nullable=False),
        sa.Column("requirement_code", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=False, server_default="LABOR"),
        sa.Column("verification_method", sa.String(length=128), nullable=True),
        sa.Column("required_documents", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["framework_id"], ["hr_compliance_frameworks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hr_compliance_requirements_tenant_id", "hr_compliance_requirements", ["tenant_id"])
    op.create_index("ix_hr_compliance_requirements_framework_id", "hr_compliance_requirements", ["framework_id"])
    op.create_index(
        "ix_hr_compliance_requirements_requirement_code", "hr_compliance_requirements", ["requirement_code"]
    )

    # Seed system templates via Python (avoids hardcoding tenant_id).
    from app.modules.hr_compliance.seed_data import SYSTEM_FRAMEWORKS

    conn = op.get_bind()
    frameworks = sa.table(
        "hr_compliance_frameworks",
        sa.column("id", sa.Integer),
        sa.column("tenant_id", sa.Integer),
        sa.column("framework_name", sa.String),
        sa.column("version", sa.String),
        sa.column("is_system", sa.Boolean),
        sa.column("is_active", sa.Boolean),
    )
    requirements = sa.table(
        "hr_compliance_requirements",
        sa.column("tenant_id", sa.Integer),
        sa.column("framework_id", sa.Integer),
        sa.column("requirement_code", sa.String),
        sa.column("title", sa.String),
        sa.column("description", sa.Text),
        sa.column("category", sa.String),
        sa.column("verification_method", sa.String),
        sa.column("required_documents", postgresql.JSONB),
        sa.column("is_active", sa.Boolean),
    )
    for fw in SYSTEM_FRAMEWORKS:
        result = conn.execute(
            frameworks.insert()
            .values(
                tenant_id=None,
                framework_name=fw["framework_name"],
                version=fw.get("version"),
                is_system=True,
                is_active=True,
            )
            .returning(frameworks.c.id)
        )
        fw_id = result.scalar_one()
        for req in fw["requirements"]:
            conn.execute(
                requirements.insert().values(
                    tenant_id=None,
                    framework_id=fw_id,
                    requirement_code=req["code"],
                    title=req["title"],
                    description=None,
                    category=req.get("category", "LABOR"),
                    verification_method=req.get("method"),
                    required_documents=req.get("docs"),
                    is_active=True,
                )
            )


def downgrade() -> None:
    op.drop_index("ix_hr_compliance_requirements_requirement_code", table_name="hr_compliance_requirements")
    op.drop_index("ix_hr_compliance_requirements_framework_id", table_name="hr_compliance_requirements")
    op.drop_index("ix_hr_compliance_requirements_tenant_id", table_name="hr_compliance_requirements")
    op.drop_table("hr_compliance_requirements")
    # Remove system frameworks seeded in upgrade
    op.execute("DELETE FROM hr_compliance_frameworks WHERE is_system IS TRUE AND tenant_id IS NULL")

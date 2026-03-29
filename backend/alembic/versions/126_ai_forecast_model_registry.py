"""Forecast run extras + ai_forecast_models registry.

Revision ID: 126
Revises: 125
Create Date: 2026-03-28
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "126"
down_revision: Union[str, None] = "125"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    fc_cols = {c["name"] for c in insp.get_columns("ai_forecast_runs")}
    extras = [
        ("model_version", sa.String(64)),
        ("model_type", sa.String(64)),
        ("training_data_hash", sa.String(64)),
        ("confidence_lower", sa.JSON()),
        ("confidence_upper", sa.JSON()),
        ("quality_metrics", sa.JSON()),
        ("expires_at", sa.DateTime()),
        ("celery_task_id", sa.String(128)),
    ]
    for name, col in extras:
        if name not in fc_cols:
            op.add_column("ai_forecast_runs", sa.Column(name, col, nullable=True))
    if "celery_task_id" not in fc_cols:
        op.create_index("ix_ai_forecast_runs_celery_task_id", "ai_forecast_runs", ["celery_task_id"])
    if "expires_at" not in fc_cols:
        op.create_index("ix_ai_forecast_runs_expires_at", "ai_forecast_runs", ["expires_at"])

    if not insp.has_table("ai_forecast_models"):
        op.create_table(
            "ai_forecast_models",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("tenant_id", sa.Integer(), nullable=False),
            sa.Column("target_variable", sa.String(128), nullable=False),
            sa.Column("model_type", sa.String(64), nullable=False),
            sa.Column("model_version", sa.String(64), nullable=False),
            sa.Column("serialized_path", sa.String(512), nullable=True),
            sa.Column("training_rows", sa.Integer(), nullable=True),
            sa.Column("training_data_hash", sa.String(64), nullable=True),
            sa.Column("quality_metrics", sa.JSON(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("trained_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "tenant_id",
                "target_variable",
                "model_version",
                name="uq_ai_forecast_models_tenant_target_version",
            ),
        )
        op.create_index("ix_ai_forecast_models_tenant_id", "ai_forecast_models", ["tenant_id"])
        op.create_index("ix_ai_forecast_models_target_variable", "ai_forecast_models", ["target_variable"])
        op.create_index("ix_ai_forecast_models_is_active", "ai_forecast_models", ["is_active"])


def downgrade() -> None:
    op.drop_table("ai_forecast_models")
    for name in (
        "celery_task_id",
        "expires_at",
        "quality_metrics",
        "confidence_upper",
        "confidence_lower",
        "training_data_hash",
        "model_type",
        "model_version",
    ):
        try:
            op.drop_column("ai_forecast_runs", name)
        except Exception:
            pass

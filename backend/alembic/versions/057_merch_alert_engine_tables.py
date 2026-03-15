"""Merch Critical Alert Engine: alert_definition, alert_instance, alert_history, alert_comment, alert_related_entity, alert_scan_log.

Revision ID: 057
Revises: 056
Create Date: 2026-03-14

Phase 1 of Advanced Critical Alert Center. See docs/MERCH_CRITICAL_ALERT_CENTER_FINAL_BLUEPRINT.md.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "057"
down_revision: Union[str, None] = "056"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "alert_definition",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("rule_key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("severity_default", sa.String(length=16), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("config_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_alert_definition_tenant_id", "alert_definition", ["tenant_id"], unique=False)
    op.create_unique_constraint("uq_alert_definition_tenant_rule", "alert_definition", ["tenant_id", "rule_key"])

    op.create_table(
        "alert_instance",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("definition_id", sa.Integer(), nullable=False),
        sa.Column("natural_key", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("alert_type", sa.String(length=64), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="system"),
        sa.Column("assigned_to_id", sa.Integer(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by_id", sa.Integer(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_id", sa.Integer(), nullable=True),
        sa.Column("snoozed_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason_text", sa.String(length=512), nullable=True),
        sa.Column("recommended_action", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["definition_id"], ["alert_definition.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["acknowledged_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["resolved_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_alert_instance_tenant_id", "alert_instance", ["tenant_id"], unique=False)
    op.create_index("ix_alert_instance_tenant_status_severity", "alert_instance", ["tenant_id", "status", "severity"], unique=False)
    op.create_index("ix_alert_instance_tenant_assigned_to", "alert_instance", ["tenant_id", "assigned_to_id"], unique=False)
    op.create_index("ix_alert_instance_tenant_created_at", "alert_instance", ["tenant_id", "created_at"], unique=False)
    op.create_unique_constraint("uq_alert_instance_tenant_natural_key", "alert_instance", ["tenant_id", "natural_key"])

    op.create_table(
        "alert_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("alert_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("field_name", sa.String(length=64), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["alert_id"], ["alert_instance.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_alert_history_alert_id", "alert_history", ["alert_id", "created_at"], unique=False)

    op.create_table(
        "alert_comment",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("alert_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_internal", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["alert_id"], ["alert_instance.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_alert_comment_alert_id", "alert_comment", ["alert_id", "created_at"], unique=False)

    op.create_table(
        "alert_related_entity",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("alert_id", sa.Integer(), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["alert_id"], ["alert_instance.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_alert_related_entity_entity", "alert_related_entity", ["entity_type", "entity_id"], unique=False)
    op.create_index("ix_alert_related_entity_alert_id", "alert_related_entity", ["alert_id"], unique=False)

    op.create_table(
        "alert_scan_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("rule_key", sa.String(length=64), nullable=False),
        sa.Column("trigger", sa.String(length=32), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("instances_created", sa.Integer(), nullable=True),
        sa.Column("instances_updated", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_alert_scan_log_tenant_started", "alert_scan_log", ["tenant_id", "started_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_alert_scan_log_tenant_started", table_name="alert_scan_log")
    op.drop_table("alert_scan_log")
    op.drop_index("ix_alert_related_entity_alert_id", table_name="alert_related_entity")
    op.drop_index("ix_alert_related_entity_entity", table_name="alert_related_entity")
    op.drop_table("alert_related_entity")
    op.drop_index("ix_alert_comment_alert_id", table_name="alert_comment")
    op.drop_table("alert_comment")
    op.drop_index("ix_alert_history_alert_id", table_name="alert_history")
    op.drop_table("alert_history")
    op.drop_constraint("uq_alert_instance_tenant_natural_key", "alert_instance", type_="unique")
    op.drop_index("ix_alert_instance_tenant_created_at", table_name="alert_instance")
    op.drop_index("ix_alert_instance_tenant_assigned_to", table_name="alert_instance")
    op.drop_index("ix_alert_instance_tenant_status_severity", table_name="alert_instance")
    op.drop_index("ix_alert_instance_tenant_id", table_name="alert_instance")
    op.drop_table("alert_instance")
    op.drop_constraint("uq_alert_definition_tenant_rule", "alert_definition", type_="unique")
    op.drop_index("ix_alert_definition_tenant_id", table_name="alert_definition")
    op.drop_table("alert_definition")

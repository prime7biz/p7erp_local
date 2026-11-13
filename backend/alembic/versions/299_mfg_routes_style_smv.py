"""Route stages on follow-up templates / actions and the governed style standard SMV (Phase 2, R4).

Additive and nullable only. Nothing reads the new columns while the strict tenant flag
``mfg_integrated_planning_v1`` is OFF (TNA generators copy the route fields, which stay NULL until a template
carries them).

* ``followup_action_templates``: ``product_type``, ``sourcing_mode``, ``route_code``, ``gate_class``,
  ``predecessor_codes`` (JSON list of template codes), ``lag_days``, ``stage_kind``, ``stage_position``,
  ``lead_time_days``; index (tenant_id, route_code).
* ``order_followup_actions``: ``route_code``, ``stage_kind``, ``stage_position``, ``gate_class``, ``lead_time_days``
  (copied from the template when the TNA is generated).
* ``garment_styles``: ``standard_smv`` Numeric(10,4) > 0, ``standard_smv_source``, ``standard_smv_confidence``,
  ``standard_smv_approved_by`` (FK users SET NULL), ``standard_smv_updated_at``.
* Allowlist CHECKs are added ``NOT VALID`` and then validated (short lock, existing rows are all NULL).

Rollback: ``alembic downgrade 298`` drops the columns (route data on templates / actions and approved style SMVs
are lost; export them first).

Revision ID: 299
Revises: 298
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "299"
down_revision: Union[str, None] = "298"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TEMPLATES = "followup_action_templates"
ACTIONS = "order_followup_actions"
STYLES = "garment_styles"

SOURCING_MODES = ("IN_HOUSE", "IMPORTED", "LOCAL", "SUBCONTRACT", "BUYER_SUPPLIED")
GATE_CLASSES = ("MANDATORY", "INFORMATIONAL")
STAGE_KINDS = ("INTERNAL", "EXTERNAL_PROCESS", "SUBCONTRACT")
STAGE_POSITIONS = ("PRE_SEWING", "SEWING", "POST_SEWING")
SMV_SOURCES = ("OB", "IE_STUDY", "HISTORICAL", "BUYER", "ESTIMATE")
SMV_CONFIDENCES = ("HIGH", "MEDIUM", "LOW")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IS NULL OR {column} IN ({','.join(repr(v) for v in values)})"


def _route_checks(prefix: str, *, template: bool) -> list[tuple[str, str]]:
    checks = [
        (f"ck_{prefix}_gate_class", _in("gate_class", GATE_CLASSES)),
        (f"ck_{prefix}_stage_kind", _in("stage_kind", STAGE_KINDS)),
        (f"ck_{prefix}_stage_position", _in("stage_position", STAGE_POSITIONS)),
        (f"ck_{prefix}_lead_time", "lead_time_days IS NULL OR (lead_time_days >= 0 AND lead_time_days <= 365)"),
    ]
    if template:
        checks += [
            (f"ck_{prefix}_sourcing_mode", _in("sourcing_mode", SOURCING_MODES)),
            (f"ck_{prefix}_lag_days", "lag_days IS NULL OR (lag_days >= -365 AND lag_days <= 365)"),
        ]
    return checks


STYLE_CHECKS = [
    ("ck_garment_styles_standard_smv_positive", "standard_smv IS NULL OR standard_smv > 0"),
    ("ck_garment_styles_standard_smv_source", _in("standard_smv_source", SMV_SOURCES)),
    ("ck_garment_styles_standard_smv_confidence", _in("standard_smv_confidence", SMV_CONFIDENCES)),
]
TEMPLATE_CHECKS = _route_checks("fat_route", template=True)
ACTION_CHECKS = _route_checks("ofa_route", template=False)


def _add_checks(table: str, checks: list[tuple[str, str]]) -> None:
    for name, expr in checks:
        op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({expr}) NOT VALID")
    for name, _expr in checks:
        op.execute(f"ALTER TABLE {table} VALIDATE CONSTRAINT {name}")


def _drop_checks(table: str, checks: list[tuple[str, str]]) -> None:
    for name, _expr in checks:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}")


def _route_columns() -> list[sa.Column]:
    return [
        sa.Column("route_code", sa.String(length=32), nullable=True),
        sa.Column("gate_class", sa.String(length=16), nullable=True),
        sa.Column("stage_kind", sa.String(length=24), nullable=True),
        sa.Column("stage_position", sa.String(length=16), nullable=True),
        sa.Column("lead_time_days", sa.Integer(), nullable=True),
    ]


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    for col in _route_columns():
        op.add_column(TEMPLATES, col)
    op.add_column(TEMPLATES, sa.Column("product_type", sa.String(length=100), nullable=True))
    op.add_column(TEMPLATES, sa.Column("sourcing_mode", sa.String(length=24), nullable=True))
    op.add_column(TEMPLATES, sa.Column("predecessor_codes", sa.JSON(), nullable=True))
    op.add_column(TEMPLATES, sa.Column("lag_days", sa.Integer(), nullable=True))
    _add_checks(TEMPLATES, TEMPLATE_CHECKS)
    op.create_index("ix_followup_action_templates_tenant_route", TEMPLATES, ["tenant_id", "route_code"])

    for col in _route_columns():
        op.add_column(ACTIONS, col)
    _add_checks(ACTIONS, ACTION_CHECKS)

    op.add_column(STYLES, sa.Column("standard_smv", sa.Numeric(precision=10, scale=4), nullable=True))
    op.add_column(STYLES, sa.Column("standard_smv_source", sa.String(length=24), nullable=True))
    op.add_column(STYLES, sa.Column("standard_smv_confidence", sa.String(length=8), nullable=True))
    op.add_column(STYLES, sa.Column("standard_smv_approved_by", sa.Integer(), nullable=True))
    op.add_column(STYLES, sa.Column("standard_smv_updated_at", sa.DateTime(), nullable=True))
    op.create_foreign_key(
        "fk_garment_styles_standard_smv_approved_by", STYLES, "users", ["standard_smv_approved_by"], ["id"],
        ondelete="SET NULL",
    )
    _add_checks(STYLES, STYLE_CHECKS)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    _drop_checks(STYLES, STYLE_CHECKS)
    op.drop_constraint("fk_garment_styles_standard_smv_approved_by", STYLES, type_="foreignkey")
    for name in (
        "standard_smv_updated_at",
        "standard_smv_approved_by",
        "standard_smv_confidence",
        "standard_smv_source",
        "standard_smv",
    ):
        op.drop_column(STYLES, name)

    _drop_checks(ACTIONS, ACTION_CHECKS)
    for col in reversed(_route_columns()):
        op.drop_column(ACTIONS, col.name)

    op.drop_index("ix_followup_action_templates_tenant_route", table_name=TEMPLATES)
    _drop_checks(TEMPLATES, TEMPLATE_CHECKS)
    for name in ("lag_days", "predecessor_codes", "sourcing_mode", "product_type"):
        op.drop_column(TEMPLATES, name)
    for col in reversed(_route_columns()):
        op.drop_column(TEMPLATES, col.name)

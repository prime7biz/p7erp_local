"""KPI engine registry, security, blocked KPIs, commitment revisions, predictive."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.common.tenant_feature_keys import (
    is_kpi_engine_v1_enabled,
    is_kpi_predictive_v1_enabled,
)
from app.modules.kpi_engine.catalog import SEED_DEFINITIONS
from app.modules.kpi_engine.compute_base import apply_target_status, pct
from app.modules.kpi_engine.security import (
    applicability_for_tenant,
    can_view_definition,
    user_max_sensitivity,
)


def test_seed_catalogue_covers_tier1_and_blocks_dhu_rft():
    codes = {r["code"] for r in SEED_DEFINITIONS}
    assert "SEW-01" in codes
    assert "COM-01" in codes
    assert "AGT-03" in codes
    blocked = {r["code"]: r.get("blocked_reason") for r in SEED_DEFINITIONS}
    assert blocked["QA-01"] == "QA_04_UNSTRUCTURED_QC"
    assert blocked["QA-02"] == "QA_04_UNSTRUCTURED_QC"
    assert len(SEED_DEFINITIONS) >= 45


def test_flag_helpers_strict_default_off():
    assert is_kpi_engine_v1_enabled({}) is False
    assert is_kpi_engine_v1_enabled({"kpi_engine_v1": True}) is True
    assert is_kpi_predictive_v1_enabled({"kpi_predictive_v1": True}) is False
    assert is_kpi_predictive_v1_enabled({"kpi_engine_v1": True, "kpi_predictive_v1": True}) is True


def test_pct_zero_denominator():
    assert pct(Decimal("1"), Decimal("0")) is None
    assert pct(Decimal("25"), Decimal("100")) == Decimal("25")


def test_apply_target_status_directions():
    assert apply_target_status(Decimal("90"), direction="UP", target=Decimal("80")) == "GREEN"
    assert apply_target_status(Decimal("70"), direction="UP", target=Decimal("80"), amber_lower=Decimal("75")) == "RED"
    assert apply_target_status(None, direction="UP", target=Decimal("80")) == "NO_DATA"
    assert apply_target_status(Decimal("10"), direction="DOWN", target=None) == "NO_TARGET"


def test_applicability_by_tenant_type():
    assert applicability_for_tenant(SimpleNamespace(tenant_type="manufacturer")) == {"F"}
    assert applicability_for_tenant(SimpleNamespace(tenant_type="buying_house")) == {"A", "B"}
    assert applicability_for_tenant(SimpleNamespace(tenant_type="both")) == {"F", "A", "B"}


def test_sensitivity_authority_off_vs_on():
    user = SimpleNamespace(is_tenant_super_admin=False, authority_class="CLASS_4", role=None)
    tenant_off = SimpleNamespace(feature_flags={})
    tenant_on = SimpleNamespace(feature_flags={"user_authority_classes_v1": True})
    assert user_max_sensitivity(user, tenant_off, None) == 1  # operational for non-privileged
    admin = SimpleNamespace(
        is_tenant_super_admin=False,
        authority_class=None,
        role=SimpleNamespace(name="admin", permissions={}),
    )
    assert user_max_sensitivity(admin, tenant_off, admin.role) >= 3
    assert user_max_sensitivity(user, tenant_on, None) == 1
    class1 = SimpleNamespace(is_tenant_super_admin=False, authority_class="CLASS_1", role=None)
    assert user_max_sensitivity(class1, tenant_on, None) == 4


def test_confidential_hidden_without_finance_grant():
    user = SimpleNamespace(is_tenant_super_admin=False, authority_class=None, role=None)
    tenant = SimpleNamespace(feature_flags={})
    role = SimpleNamespace(name="viewer", permissions={"kpi.read": True})
    assert (
        can_view_definition(
            user=user, tenant=tenant, role=role, sensitivity="CONFIDENTIAL"
        )
        is False
    )
    role2 = SimpleNamespace(
        name="viewer",
        permissions={"kpi.read": True, "finance.mis_report.view": True},
    )
    # Still operational-max without privilege — CONFIDENTIAL needs privilege or explicit finance
    # With explicit finance grant and soft path: user_max is OPERATIONAL so still false.
    assert can_view_definition(user=user, tenant=tenant, role=role2, sensitivity="CONFIDENTIAL") is False
    admin_role = SimpleNamespace(name="admin", permissions={})
    admin = SimpleNamespace(is_tenant_super_admin=False, authority_class=None, role=admin_role)
    assert can_view_definition(user=admin, tenant=tenant, role=admin_role, sensitivity="CONFIDENTIAL") is True


def test_soft_deny_kpi_read():
    user = SimpleNamespace(is_tenant_super_admin=False, authority_class=None, role=None)
    tenant = SimpleNamespace(feature_flags={})
    role = SimpleNamespace(name="viewer", permissions={"kpi.read": False})
    assert can_view_definition(user=user, tenant=tenant, role=role, sensitivity="OPERATIONAL") is False


@pytest.mark.asyncio
async def test_compute_blocked_dhu_rft():
    from app.models.kpi_engine import KpiDefinition
    from app.modules.kpi_engine.compute.service import compute_kpi

    d = KpiDefinition(
        id=1,
        tenant_id=1,
        code="QA-02",
        name="DHU",
        module="production",
        metric_type="KPI",
        tier="CORE",
        unit="DHU",
        direction="DOWN",
        applicability=["F"],
        sensitivity="OPERATIONAL",
        adapter_key="dhu",
        dashboard_codes=["executive"],
        active=True,
        definition_version=1,
        blocked_reason="QA_04_UNSTRUCTURED_QC",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    # db unused for blocked path
    class _DB:
        pass

    v = await compute_kpi(_DB(), 1, d, as_of=date.today())  # type: ignore[arg-type]
    assert v.status == "NO_DATA"
    assert "QA_04_UNSTRUCTURED_QC" in v.missing_inputs


def test_order_delay_weights_sum_to_one():
    from app.modules.kpi_engine.predictive_service import ORDER_DELAY_WEIGHTS

    total = sum(ORDER_DELAY_WEIGHTS.values())
    assert total == Decimal("1.00") or abs(total - Decimal("1")) < Decimal("0.001")


def test_kpi_models_importable():
    from app.models.kpi_engine import (
        KpiDefinition,
        KpiPrediction,
        KpiResult,
        OrderCommitmentRevision,
    )

    assert KpiDefinition.__tablename__ == "kpi_definitions"
    assert OrderCommitmentRevision.__tablename__ == "order_commitment_revisions"
    assert KpiResult.__tablename__ == "kpi_results"
    assert KpiPrediction.__tablename__ == "kpi_predictions"


def test_migration_314_exists():
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "314_kpi_engine_registry.py"
    assert path.exists()
    text = path.read_text(encoding="utf-8")
    assert "order_commitment_revisions" in text
    assert "p7_tenant_isolation" in text
    assert 'down_revision: Union[str, None] = "313"' in text

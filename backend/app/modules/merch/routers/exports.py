"""Merchandising reports catalog (Phase 9) — stable index of in-app report surfaces."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.models import Tenant, User
from app.modules.merch.deps import ensure_tenant

router = APIRouter(tags=["merch-reports"])


@router.get("/reports/catalog")
async def get_merch_reports_catalog(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
):
    """Static catalog of merchandising-related analytics endpoints and UI routes (for hubs / docs)."""
    ensure_tenant(user, tenant)
    return {
        "tenant_id": tenant.id,
        "reports": [
            {
                "key": "control_tower",
                "title": "Merch control tower",
                "api_path": "/api/v1/merch/control-tower/summary",
                "ui_path": "/app/merchandising/control-tower",
            },
            {
                "key": "pipeline",
                "title": "Merch pipeline",
                "api_path": "/api/v1/merch/pipeline",
                "ui_path": "/app/merchandising/pipeline",
            },
            {
                "key": "pipeline_analytics",
                "title": "Pipeline analytics",
                "api_path": "/api/v1/merch/pipeline/analytics",
                "ui_path": "/app/merchandising/pipeline-analytics",
            },
            {
                "key": "style_summary",
                "title": "Style summary report",
                "api_path": "/api/v1/merch/styles/summary-report",
                "ui_path": "/app/reports/style-360",
            },
            {
                "key": "wastage",
                "title": "Wastage report",
                "api_path": "/api/v1/merch/reports/wastage/summary",
                "ui_path": "/app/merchandising/wastage-report",
            },
            {
                "key": "consumption_reconciliation",
                "title": "Consumption reconciliation",
                "api_path": "/api/v1/merch/consumption-reconciliation/dashboard",
                "ui_path": "/app/merchandising/consumption-reconciliation",
            },
            {
                "key": "critical_alerts",
                "title": "Critical alerts",
                "api_path": "/api/v1/merch/critical-alerts",
                "ui_path": "/app/merchandising/alerts",
            },
            {
                "key": "samples",
                "title": "Sample development",
                "api_path": "/api/v1/merch/samples",
                "ui_path": "/app/merchandising/samples",
            },
        ],
    }

"""Backward-compatible exports for code that imported symbols from the legacy merch router.

All HTTP routes are registered via ``app.modules.merch.routers``.
"""

from __future__ import annotations

from app.modules.merch.routers.consumption import get_order_material_requirement

__all__ = ["get_order_material_requirement"]

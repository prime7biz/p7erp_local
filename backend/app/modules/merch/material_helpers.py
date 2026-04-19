"""Material grouping (fabric / trim / other) for wastage and consumption reconciliation."""

from __future__ import annotations

from app.models import Item, ItemCategory


def material_group_from_item(item: Item, category: ItemCategory | None) -> str:
    if not category:
        return "other"
    code = (category.category_code or "").upper()
    if "FABRIC" in code or code.startswith("FAB"):
        return "fabric"
    if "TRIM" in code or "PACK" in code or "ACCESSORY" in code:
        return "trim"
    return "other"

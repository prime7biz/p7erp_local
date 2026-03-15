"""Phase F: BOM-related AI tools – suggest BOM from similar style, suggest item for BOM line."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bom, BomItem, GarmentStyle, Item, ItemUnit
from app.modules.ai_tool.query_parser import parse_search_query


def _to_float(value: str | None) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


async def suggest_bom_from_similar_style(
    db: AsyncSession, *, tenant_id: int, prompt: str
) -> dict:
    """Return BOMs from styles similar to the given style (by department or style_id)."""
    query = parse_search_query(prompt)
    style_id: int | None = None
    department: str | None = None
    if query.reference_text:
        try:
            style_id = int(query.reference_text.strip())
        except ValueError:
            department = query.reference_text.strip()
    text = (prompt or "").lower()
    if "style" in text and "id" in text and not style_id:
        for word in prompt.split():
            if word.isdigit():
                style_id = int(word)
                break
    if "department" in text and not department:
        for word in prompt.split():
            if len(word) > 1 and not word.isdigit():
                department = word
                break

    if style_id:
        style = await db.get(GarmentStyle, style_id)
        if not style or style.tenant_id != tenant_id:
            return {
                "title": "Suggest BOM from similar style",
                "summary": "Style not found or not in tenant.",
                "data": {"similar_boms": [], "anchor_style_id": style_id},
            }
        department = style.department

    if not department and not style_id:
        return {
            "title": "Suggest BOM from similar style",
            "summary": "Provide a style ID or department (e.g. 'similar BOM for style 5' or 'BOMs in department Knit').",
            "data": {"similar_boms": [], "anchor_style_id": None},
        }
    stmt = (
        select(Bom, GarmentStyle.style_code, GarmentStyle.name)
        .join(GarmentStyle, GarmentStyle.id == Bom.style_id)
        .where(Bom.tenant_id == tenant_id)
    )
    if department:
        stmt = stmt.where(func.lower(GarmentStyle.department) == department.lower())
    if style_id:
        stmt = stmt.where(Bom.style_id != style_id)
    stmt = stmt.order_by(Bom.version_no.desc()).limit(10)
    result = await db.execute(stmt)
    rows = result.all()
    similar_boms = [
        {
            "bom_id": bom.id,
            "style_id": bom.style_id,
            "style_code": style_code,
            "style_name": style_name,
            "version_no": bom.version_no,
        }
        for bom, style_code, style_name in rows
    ]
    return {
        "title": "Suggest BOM from similar style",
        "summary": f"Found {len(similar_boms)} BOM(s) from same department or similar context.",
        "data": {
            "anchor_style_id": style_id,
            "department_filter": department,
            "similar_boms": similar_boms,
        },
    }


async def suggest_items_for_bom_line(
    db: AsyncSession, *, tenant_id: int, prompt: str
) -> dict:
    """Search inventory items by name/code/category for adding a BOM line."""
    query = parse_search_query(prompt)
    search = (query.reference_text or query.normalized or prompt or "").strip()
    if len(search) < 2:
        return {
            "title": "Suggest item for BOM line",
            "summary": "Provide a search term (item name, code, or category).",
            "data": {"items": []},
        }
    pattern = f"%{search.lower()}%"
    stmt = (
        select(Item)
        .where(Item.tenant_id == tenant_id)
        .where(
            func.lower(Item.item_code).like(pattern)
            | func.lower(Item.name).like(pattern)
            | (Item.description.isnot(None) & func.lower(Item.description).like(pattern))
        )
        .limit(query.top_n)
    )
    result = await db.execute(stmt)
    items = list(result.scalars().all())
    unit_map: dict[int | None, str] = {}
    for item in items:
        if item.unit_id and item.unit_id not in unit_map:
            unit = await db.get(ItemUnit, item.unit_id)
            unit_map[item.unit_id] = unit.unit_code if unit else ""
    out_items = [
        {
            "item_id": i.id,
            "item_code": i.item_code,
            "item_name": i.name,
            "description": i.description,
            "uom": unit_map.get(i.unit_id),
        }
        for i in items
    ]
    return {
        "title": "Suggest item for BOM line",
        "summary": f"Found {len(out_items)} item(s) matching '{search[:50]}'.",
        "data": {"search": search, "items": out_items},
    }

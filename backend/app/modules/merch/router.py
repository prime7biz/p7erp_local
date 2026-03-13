"""
Merchandising linked module (PrimeX parity slice):
- styles + components + colorways + size scales
- boms + bom items
- consumption plans + plan items
- order followups and pipeline/alerts aggregates
"""
from datetime import date
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.codegen import next_tenant_code
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    Bom,
    BomItem,
    ConsumptionPlan,
    ConsumptionPlanItem,
    Followup,
    GarmentStyle,
    Inquiry,
    Order,
    Quotation,
    StyleColorway,
    StyleComponent,
    StyleSizeScale,
    Tenant,
    User,
)

router = APIRouter(prefix="/merch", tags=["merch"])
STYLE_PICTURE_MAX_BYTES = 2 * 1024 * 1024
ALLOWED_STYLE_PICTURE_CONTENT_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
STYLE_PICTURE_DIR = Path(__file__).resolve().parents[3] / "media" / "style_pictures"


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


class StyleCreate(BaseModel):
    style_code: str | None = None
    name: str
    buyer_customer_id: int | None = None
    season: str | None = None
    department: str | None = None
    style_image_url: str | None = None
    status: str = "ACTIVE"
    notes: str | None = None


class StyleUpdate(BaseModel):
    style_code: str | None = None
    name: str | None = None
    buyer_customer_id: int | None = None
    season: str | None = None
    department: str | None = None
    style_image_url: str | None = None
    status: str | None = None
    notes: str | None = None


class StyleImageUploadResponse(BaseModel):
    style_image_url: str
    filename: str
    size_bytes: int


class StyleComponentBody(BaseModel):
    component_name: str
    sequence_no: int = 1
    notes: str | None = None


class StyleColorwayBody(BaseModel):
    color_name: str
    color_code: str | None = None
    notes: str | None = None


class StyleSizeScaleBody(BaseModel):
    scale_name: str
    sizes_csv: str | None = None
    notes: str | None = None


class BomCreate(BaseModel):
    style_id: int
    version_no: int = 1
    status: str = "DRAFT"
    notes: str | None = None


class BomUpdate(BaseModel):
    version_no: int | None = None
    status: str | None = None
    notes: str | None = None


class BomItemBody(BaseModel):
    category: str
    item_code: str | None = None
    description: str | None = None
    uom: str | None = None
    base_consumption: str
    wastage_pct: str | None = None


class ConsumptionPlanCreate(BaseModel):
    order_id: int
    status: str = "PLANNED"


class ConsumptionPlanUpdate(BaseModel):
    status: str | None = None


class ConsumptionPlanItemBody(BaseModel):
    item_code: str | None = None
    required_qty: str
    uom: str | None = None


class FollowupCreate(BaseModel):
    order_id: int
    title: str
    due_date: date | None = None
    status: str = "OPEN"
    severity: str | None = None
    notes: str | None = None


class FollowupUpdate(BaseModel):
    title: str | None = None
    due_date: date | None = None
    status: str | None = None
    severity: str | None = None
    notes: str | None = None


@router.get("/styles")
async def list_styles(
    status_filter: str | None = Query(default=None, alias="status"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(GarmentStyle).where(GarmentStyle.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(GarmentStyle.status == status_filter)
    result = await db.execute(stmt.order_by(GarmentStyle.created_at.desc()))
    rows = result.scalars().all()
    return rows


@router.post("/styles", status_code=201)
async def create_style(
    body: StyleCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    style_code = (body.style_code or "").strip().upper()
    if not style_code:
        style_code = await next_tenant_code(
            db,
            model=GarmentStyle,
            tenant_id=tenant.id,
            prefix="STY-",
            width=4,
        )
    row = GarmentStyle(
        tenant_id=tenant.id,
        style_code=style_code,
        name=body.name,
        buyer_customer_id=body.buyer_customer_id,
        season=body.season,
        department=body.department,
        style_image_url=body.style_image_url,
        status=body.status,
        notes=body.notes,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.get("/styles/{style_id}")
async def get_style(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(GarmentStyle, style_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Style not found")
    return row


@router.patch("/styles/{style_id}")
async def update_style(
    style_id: int,
    body: StyleUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(GarmentStyle, style_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Style not found")
    for field in (
        "style_code",
        "name",
        "buyer_customer_id",
        "season",
        "department",
        "style_image_url",
        "status",
        "notes",
    ):
        value = getattr(body, field)
        if value is not None:
            setattr(row, field, value)
    await db.flush()
    await db.refresh(row)
    return row


@router.post(
    "/styles/{style_id}/upload-picture",
    response_model=StyleImageUploadResponse,
)
async def upload_style_picture(
    style_id: int,
    *,
    file: UploadFile = File(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    style = await db.get(GarmentStyle, style_id)
    if not style or style.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Style not found")

    content_type = (file.content_type or "").lower()
    extension = ALLOWED_STYLE_PICTURE_CONTENT_TYPES.get(content_type)
    if not extension:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Allowed: PNG, JPG, GIF, WEBP.",
        )

    data = await file.read()
    size_bytes = len(data)
    if size_bytes == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")
    if size_bytes > STYLE_PICTURE_MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Style picture exceeds 2MB limit.")

    STYLE_PICTURE_DIR.mkdir(parents=True, exist_ok=True)
    safe_filename = f"tenant_{tenant.id}_style_{style.id}_{uuid4().hex}{extension}"
    target_path = STYLE_PICTURE_DIR / safe_filename
    target_path.write_bytes(data)

    style.style_image_url = f"/media/style_pictures/{safe_filename}"
    await db.flush()

    return StyleImageUploadResponse(
        style_image_url=style.style_image_url,
        filename=safe_filename,
        size_bytes=size_bytes,
    )


@router.delete("/styles/{style_id}", status_code=204)
async def delete_style(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(GarmentStyle, style_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Style not found")
    await db.delete(row)
    await db.flush()


@router.get("/styles/{style_id}/components")
async def list_style_components(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(StyleComponent)
        .where(StyleComponent.style_id == style_id, StyleComponent.tenant_id == tenant.id)
        .order_by(StyleComponent.sequence_no, StyleComponent.id)
    )
    return result.scalars().all()


@router.post("/styles/{style_id}/components", status_code=201)
async def create_style_component(
    style_id: int,
    body: StyleComponentBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = StyleComponent(tenant_id=tenant.id, style_id=style_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.patch("/styles/{style_id}/components/{component_id}")
async def update_style_component(
    style_id: int,
    component_id: int,
    body: StyleComponentBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StyleComponent, component_id)
    if not row or row.tenant_id != tenant.id or row.style_id != style_id:
        raise HTTPException(status_code=404, detail="Component not found")
    row.component_name = body.component_name
    row.sequence_no = body.sequence_no
    row.notes = body.notes
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/styles/{style_id}/components/{component_id}", status_code=204)
async def delete_style_component(
    style_id: int,
    component_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StyleComponent, component_id)
    if not row or row.tenant_id != tenant.id or row.style_id != style_id:
        raise HTTPException(status_code=404, detail="Component not found")
    await db.delete(row)
    await db.flush()


@router.get("/styles/{style_id}/colorways")
async def list_style_colorways(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(StyleColorway)
        .where(StyleColorway.style_id == style_id, StyleColorway.tenant_id == tenant.id)
        .order_by(StyleColorway.id)
    )
    return result.scalars().all()


@router.post("/styles/{style_id}/colorways", status_code=201)
async def create_style_colorway(
    style_id: int,
    body: StyleColorwayBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = StyleColorway(tenant_id=tenant.id, style_id=style_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.patch("/styles/{style_id}/colorways/{colorway_id}")
async def update_style_colorway(
    style_id: int,
    colorway_id: int,
    body: StyleColorwayBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StyleColorway, colorway_id)
    if not row or row.tenant_id != tenant.id or row.style_id != style_id:
        raise HTTPException(status_code=404, detail="Colorway not found")
    row.color_name = body.color_name
    row.color_code = body.color_code
    row.notes = body.notes
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/styles/{style_id}/colorways/{colorway_id}", status_code=204)
async def delete_style_colorway(
    style_id: int,
    colorway_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StyleColorway, colorway_id)
    if not row or row.tenant_id != tenant.id or row.style_id != style_id:
        raise HTTPException(status_code=404, detail="Colorway not found")
    await db.delete(row)
    await db.flush()


@router.get("/styles/{style_id}/size-scales")
async def list_style_size_scales(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(StyleSizeScale)
        .where(StyleSizeScale.style_id == style_id, StyleSizeScale.tenant_id == tenant.id)
        .order_by(StyleSizeScale.id)
    )
    return result.scalars().all()


@router.post("/styles/{style_id}/size-scales", status_code=201)
async def create_style_size_scale(
    style_id: int,
    body: StyleSizeScaleBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = StyleSizeScale(tenant_id=tenant.id, style_id=style_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.patch("/styles/{style_id}/size-scales/{scale_id}")
async def update_style_size_scale(
    style_id: int,
    scale_id: int,
    body: StyleSizeScaleBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StyleSizeScale, scale_id)
    if not row or row.tenant_id != tenant.id or row.style_id != style_id:
        raise HTTPException(status_code=404, detail="Size scale not found")
    row.scale_name = body.scale_name
    row.sizes_csv = body.sizes_csv
    row.notes = body.notes
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/styles/{style_id}/size-scales/{scale_id}", status_code=204)
async def delete_style_size_scale(
    style_id: int,
    scale_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StyleSizeScale, scale_id)
    if not row or row.tenant_id != tenant.id or row.style_id != style_id:
        raise HTTPException(status_code=404, detail="Size scale not found")
    await db.delete(row)
    await db.flush()


@router.get("/boms")
async def list_boms(
    style_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(Bom).where(Bom.tenant_id == tenant.id)
    if style_id is not None:
        stmt = stmt.where(Bom.style_id == style_id)
    result = await db.execute(stmt.order_by(Bom.created_at.desc()))
    return result.scalars().all()


@router.post("/boms", status_code=201)
async def create_bom(
    body: BomCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = Bom(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.get("/boms/{bom_id}")
async def get_bom(
    bom_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    items = await db.execute(
        select(BomItem)
        .where(BomItem.tenant_id == tenant.id, BomItem.bom_id == bom_id)
        .order_by(BomItem.id)
    )
    return {"bom": bom, "items": items.scalars().all()}


@router.patch("/boms/{bom_id}")
async def update_bom(
    bom_id: int,
    body: BomUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Bom, bom_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    if body.version_no is not None:
        row.version_no = body.version_no
    if body.status is not None:
        row.status = body.status
    if body.notes is not None:
        row.notes = body.notes
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/boms/{bom_id}", status_code=204)
async def delete_bom(
    bom_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Bom, bom_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    await db.delete(row)
    await db.flush()


@router.post("/boms/{bom_id}/items", status_code=201)
async def create_bom_item(
    bom_id: int,
    body: BomItemBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = BomItem(tenant_id=tenant.id, bom_id=bom_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.patch("/boms/{bom_id}/items/{item_id}")
async def update_bom_item(
    bom_id: int,
    item_id: int,
    body: BomItemBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(BomItem, item_id)
    if not row or row.tenant_id != tenant.id or row.bom_id != bom_id:
        raise HTTPException(status_code=404, detail="BOM item not found")
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/boms/{bom_id}/items/{item_id}", status_code=204)
async def delete_bom_item(
    bom_id: int,
    item_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(BomItem, item_id)
    if not row or row.tenant_id != tenant.id or row.bom_id != bom_id:
        raise HTTPException(status_code=404, detail="BOM item not found")
    await db.delete(row)
    await db.flush()


@router.get("/consumption-plans")
async def list_consumption_plans(
    order_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ConsumptionPlan).where(ConsumptionPlan.tenant_id == tenant.id)
    if order_id is not None:
        stmt = stmt.where(ConsumptionPlan.order_id == order_id)
    result = await db.execute(stmt.order_by(ConsumptionPlan.created_at.desc()))
    return result.scalars().all()


@router.post("/consumption-plans", status_code=201)
async def create_consumption_plan(
    body: ConsumptionPlanCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = ConsumptionPlan(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.get("/consumption-plans/{plan_id}")
async def get_consumption_plan(
    plan_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ConsumptionPlan, plan_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Consumption plan not found")
    items = await db.execute(
        select(ConsumptionPlanItem)
        .where(ConsumptionPlanItem.tenant_id == tenant.id, ConsumptionPlanItem.plan_id == plan_id)
        .order_by(ConsumptionPlanItem.id)
    )
    return {"plan": row, "items": items.scalars().all()}


@router.patch("/consumption-plans/{plan_id}")
async def update_consumption_plan(
    plan_id: int,
    body: ConsumptionPlanUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ConsumptionPlan, plan_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Consumption plan not found")
    if body.status is not None:
        row.status = body.status
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/consumption-plans/{plan_id}", status_code=204)
async def delete_consumption_plan(
    plan_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ConsumptionPlan, plan_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Consumption plan not found")
    await db.delete(row)
    await db.flush()


@router.post("/consumption-plans/{plan_id}/items", status_code=201)
async def create_consumption_plan_item(
    plan_id: int,
    body: ConsumptionPlanItemBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = ConsumptionPlanItem(tenant_id=tenant.id, plan_id=plan_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.patch("/consumption-plans/{plan_id}/items/{item_id}")
async def update_consumption_plan_item(
    plan_id: int,
    item_id: int,
    body: ConsumptionPlanItemBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ConsumptionPlanItem, item_id)
    if not row or row.tenant_id != tenant.id or row.plan_id != plan_id:
        raise HTTPException(status_code=404, detail="Consumption item not found")
    row.item_code = body.item_code
    row.required_qty = body.required_qty
    row.uom = body.uom
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/consumption-plans/{plan_id}/items/{item_id}", status_code=204)
async def delete_consumption_plan_item(
    plan_id: int,
    item_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ConsumptionPlanItem, item_id)
    if not row or row.tenant_id != tenant.id or row.plan_id != plan_id:
        raise HTTPException(status_code=404, detail="Consumption item not found")
    await db.delete(row)
    await db.flush()


@router.get("/followups")
async def list_followups(
    order_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(Followup).where(Followup.tenant_id == tenant.id)
    if order_id is not None:
        stmt = stmt.where(Followup.order_id == order_id)
    if status_filter:
        stmt = stmt.where(Followup.status == status_filter)
    result = await db.execute(stmt.order_by(Followup.created_at.desc()))
    return result.scalars().all()


@router.post("/followups", status_code=201)
async def create_followup(
    body: FollowupCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = Followup(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.patch("/followups/{followup_id}")
async def update_followup(
    followup_id: int,
    body: FollowupUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Followup, followup_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Followup not found")
    for field in ("title", "due_date", "status", "severity", "notes"):
        value = getattr(body, field)
        if value is not None:
            setattr(row, field, value)
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/followups/{followup_id}", status_code=204)
async def delete_followup(
    followup_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Followup, followup_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Followup not found")
    await db.delete(row)
    await db.flush()


@router.get("/pipeline")
async def get_pipeline_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    inq_count = (
        await db.execute(select(func.count()).select_from(Inquiry).where(Inquiry.tenant_id == tenant.id))
    ).scalar() or 0
    qt_count = (
        await db.execute(select(func.count()).select_from(Quotation).where(Quotation.tenant_id == tenant.id))
    ).scalar() or 0
    ord_count = (
        await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == tenant.id))
    ).scalar() or 0
    return {
        "inquiries": inq_count,
        "quotations": qt_count,
        "orders": ord_count,
    }


@router.get("/critical-alerts")
async def get_critical_alerts(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    overdue = await db.execute(
        select(Followup).where(
            and_(
                Followup.tenant_id == tenant.id,
                Followup.status != "DONE",
                Followup.due_date.is_not(None),
                Followup.due_date < date.today(),
            )
        )
    )
    rows = overdue.scalars().all()
    alerts = [
        {
            "id": f"followup-{r.id}",
            "severity": "critical" if (date.today() - r.due_date).days > 7 else "warning",
            "category": "Order Follow-up",
            "title": r.title,
            "description": f"Order #{r.order_id} overdue by {(date.today() - r.due_date).days} day(s)",
            "order_id": r.order_id,
        }
        for r in rows
        if r.due_date is not None
    ]
    return {
        "summary": {
            "critical": len([a for a in alerts if a["severity"] == "critical"]),
            "warning": len([a for a in alerts if a["severity"] == "warning"]),
            "total": len(alerts),
        },
        "alerts": alerts,
    }


@router.get("/consumption-reconciliation/{order_id}")
async def get_consumption_reconciliation(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    plans = (
        await db.execute(
            select(ConsumptionPlan).where(
                ConsumptionPlan.tenant_id == tenant.id,
                ConsumptionPlan.order_id == order_id,
            )
        )
    ).scalars().all()
    plan_ids = [p.id for p in plans]
    if not plan_ids:
        return {"order_id": order_id, "items": [], "summary": {"total_planned": 0, "total_actual": 0, "variance": 0}}
    items = (
        await db.execute(
            select(ConsumptionPlanItem).where(
                ConsumptionPlanItem.tenant_id == tenant.id,
                ConsumptionPlanItem.plan_id.in_(plan_ids),
            )
        )
    ).scalars().all()
    total_planned = sum(float(i.required_qty or "0") for i in items)
    # Actual usage source is module-dependent in PrimeX; expose placeholder 0 until production consumption joins are added.
    total_actual = 0.0
    rows = [
        {
            "item_code": i.item_code,
            "planned_qty": float(i.required_qty or "0"),
            "actual_qty": 0.0,
            "variance": -float(i.required_qty or "0"),
            "uom": i.uom,
        }
        for i in items
    ]
    return {
        "order_id": order_id,
        "items": rows,
        "summary": {
            "total_planned": total_planned,
            "total_actual": total_actual,
            "variance": total_actual - total_planned,
        },
    }

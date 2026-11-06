"""Quotation revisions (v1 -> v2 -> v3 ...).

How a lineage is stored on ``quotations``:
- The first quotation (v1) is the *root*; its ``root_quotation_id`` stays NULL.
- Every later revision points at the root (``root_quotation_id``) and at the row it was
  copied from (``revision_of_id``).
- Only the newest revision is *current*. Older ones get ``superseded_at`` set and become
  read-only. A DB index allows only one current quotation per inquiry (migration 247).

Revising never touches AI suggestion tables, BOMs or orders; only costing lines are copied.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, inspect, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.common.db_datetime import utc_now_naive
from app.database import safe_async_session_rollback
from app.models import (
    Order,
    Quotation,
    QuotationCostSummary,
    QuotationManufacturing,
    QuotationMaterial,
    QuotationOtherCost,
    QuotationSizeRatio,
)

QUOTATION_SUPERSEDED = "QUOTATION_SUPERSEDED"
QUOTATION_LINKED_TO_ORDER = "QUOTATION_LINKED_TO_ORDER"
QUOTATION_REVISION_CONFLICT = "QUOTATION_REVISION_CONFLICT"

# Costing child tables copied onto a new revision (same tenant, new quotation_id).
COSTING_CHILD_MODELS = (
    QuotationMaterial,
    QuotationManufacturing,
    QuotationOtherCost,
    QuotationSizeRatio,
    QuotationCostSummary,
)
_CHILD_COLUMNS_NOT_COPIED = {"id", "quotation_id", "tenant_id", "created_at", "updated_at"}


def lineage_root_id(quotation: Quotation) -> int:
    """Root (v1) id of the lineage this quotation belongs to."""
    return quotation.root_quotation_id or quotation.id


def is_latest_revision(quotation: Quotation) -> bool:
    return quotation.superseded_at is None


def ensure_quotation_not_superseded(quotation: Quotation, *, action: str) -> None:
    """409 when someone tries to change an old (superseded) revision."""
    if quotation.superseded_at is None:
        return
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": QUOTATION_SUPERSEDED,
            "message": (
                f"Quotation {quotation.quotation_code} (v{quotation.version_no}) was replaced by a newer "
                f"revision and is read-only. Open the latest revision to {action}."
            ),
        },
    )


async def lock_quotation_for_update(
    db: AsyncSession, *, tenant_id: int, quotation_id: int
) -> Quotation | None:
    """Load a tenant-owned quotation with a row lock (SELECT ... FOR UPDATE).

    ``populate_existing`` refreshes an already-loaded object so we always see the latest
    committed ``superseded_at`` after waiting for another transaction's lock.
    """
    result = await db.execute(
        select(Quotation)
        .where(Quotation.id == quotation_id, Quotation.tenant_id == tenant_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def list_lineage(db: AsyncSession, *, tenant_id: int, root_id: int) -> list[Quotation]:
    """All revisions in one lineage (root included), oldest version first."""
    result = await db.execute(
        select(Quotation)
        .where(
            Quotation.tenant_id == tenant_id,
            or_(Quotation.id == root_id, Quotation.root_quotation_id == root_id),
        )
        .order_by(Quotation.version_no.asc(), Quotation.id.asc())
    )
    return list(result.scalars().all())


async def clone_costing_children(db: AsyncSession, source: Quotation, new: Quotation) -> None:
    """Copy costing lines from ``source`` onto ``new`` (keeps serial_no, drops ids/timestamps)."""
    for model in COSTING_CHILD_MODELS:
        result = await db.execute(
            select(model)
            .where(model.quotation_id == source.id, model.tenant_id == source.tenant_id)
            .order_by(model.id)
        )
        keys = [
            attr.key
            for attr in inspect(model).column_attrs
            if attr.key not in _CHILD_COLUMNS_NOT_COPIED
        ]
        for row in result.scalars().all():
            values = {key: getattr(row, key) for key in keys}
            db.add(model(tenant_id=source.tenant_id, quotation_id=new.id, **values))


async def revise_quotation(db: AsyncSession, *, tenant_id: int, quotation_id: int) -> Quotation:
    """Create the next revision of a quotation and mark the source as superseded."""
    source = await lock_quotation_for_update(db, tenant_id=tenant_id, quotation_id=quotation_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    ensure_quotation_not_superseded(source, action="create another revision")

    linked_order = (
        await db.execute(
            select(Order.order_code)
            .where(Order.tenant_id == tenant_id, Order.quotation_id == source.id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if linked_order is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": QUOTATION_LINKED_TO_ORDER,
                "message": (
                    f"Quotation {source.quotation_code} is already linked to order {linked_order}. "
                    "Change the order with an order amendment instead of revising the quotation."
                ),
            },
        )

    root_id = lineage_root_id(source)
    max_version = (
        await db.execute(
            select(func.max(Quotation.version_no)).where(
                Quotation.tenant_id == tenant_id,
                or_(Quotation.id == root_id, Quotation.root_quotation_id == root_id),
            )
        )
    ).scalar_one_or_none()
    next_version = max(max_version or 1, source.version_no or 1) + 1

    code = await next_tenant_code(db, model=Quotation, tenant_id=tenant_id, prefix="QT-", width=4)
    try:
        # Supersede first: the "one current quotation per inquiry" index must never see two.
        source.superseded_at = utc_now_naive()
        await db.flush()

        revised = Quotation(
            tenant_id=tenant_id,
            customer_id=source.customer_id,
            inquiry_id=source.inquiry_id,
            quotation_code=code,
            style_ref=source.style_ref,
            style_id=source.style_id,
            customer_intermediary_id=source.customer_intermediary_id,
            shipping_term=source.shipping_term,
            commission_mode=source.commission_mode,
            commission_type=source.commission_type,
            commission_value=source.commission_value,
            department=source.department,
            projected_quantity=source.projected_quantity,
            projected_delivery_date=source.projected_delivery_date,
            quotation_date=source.quotation_date,
            target_price=source.target_price,
            target_price_currency=source.target_price_currency,
            exchange_rate=source.exchange_rate,
            material_cost=source.material_cost,
            manufacturing_cost=source.manufacturing_cost,
            other_cost=source.other_cost,
            total_cost=source.total_cost,
            cost_per_piece=source.cost_per_piece,
            profit_percentage=source.profit_percentage,
            quoted_price=source.quoted_price,
            currency=source.currency,
            total_amount=source.total_amount,
            status="DRAFT",
            version_no=next_version,
            root_quotation_id=root_id,
            revision_of_id=source.id,
            valid_until=source.valid_until,
            size_ratio_enabled=source.size_ratio_enabled,
            pack_ratio=source.pack_ratio,
            pcs_per_carton=source.pcs_per_carton,
            notes=source.notes,
        )
        db.add(revised)
        await db.flush()

        await clone_costing_children(db, source, revised)
        await db.flush()
    except IntegrityError as exc:
        await safe_async_session_rollback(db)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": QUOTATION_REVISION_CONFLICT,
                "message": "Another revision of this quotation was saved at the same time. Reload and try again.",
            },
        ) from exc

    await db.refresh(revised)
    return revised


async def restore_previous_revision(
    db: AsyncSession, *, tenant_id: int, revision_of_id: int | None
) -> None:
    """After deleting the *current* revision, make the revision it replaced current again.

    Call after the delete has been flushed, passing the deleted row's ``revision_of_id``.
    Without this the older revision would stay read-only forever and the inquiry would
    have no current quotation.
    """
    if revision_of_id is None:
        return
    previous = await lock_quotation_for_update(db, tenant_id=tenant_id, quotation_id=revision_of_id)
    if previous is None or previous.superseded_at is None:
        return
    previous.superseded_at = None
    await db.flush()

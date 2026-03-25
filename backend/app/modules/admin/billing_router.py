"""Platform admin: plans, subscriptions, invoices, payments, revenue."""

from __future__ import annotations

import csv
import io
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    BillingInvoice,
    BillingPayment,
    PlatformPlan,
    Tenant,
    TenantSubscription,
)
from app.modules.admin.auth import AdminContext, log_admin_action, super_or_billing, super_only

router = APIRouter(prefix="/billing", tags=["platform-admin-billing"])


@router.get("/plans")
async def list_plans(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_billing),
):
    r = await db.execute(select(PlatformPlan).order_by(PlatformPlan.sort_order, PlatformPlan.id))
    rows = r.scalars().all()
    return {
        "items": [
            {
                "id": p.id,
                "name": p.name,
                "code": p.code,
                "max_users": p.max_users,
                "max_storage_gb": p.max_storage_gb,
                "max_ai_tokens_monthly": p.max_ai_tokens_monthly,
                "features_included": p.features_included,
                "support_level": p.support_level,
                "optional_addons": p.optional_addons,
                "overage_rules": p.overage_rules,
                "price_monthly_usd": float(p.price_monthly_usd),
                "price_yearly_usd": float(p.price_yearly_usd),
                "is_active": p.is_active,
                "sort_order": p.sort_order,
            }
            for p in rows
        ]
    }


@router.post("/plans")
async def create_plan(
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    p = PlatformPlan(
        name=str(body.get("name") or "Plan"),
        code=str(body.get("code") or "plan"),
        max_users=int(body.get("max_users") or 0),
        max_storage_gb=int(body.get("max_storage_gb") or 0),
        max_ai_tokens_monthly=int(body.get("max_ai_tokens_monthly") or 0),
        features_included=body.get("features_included"),
        support_level=str(body.get("support_level") or "standard"),
        optional_addons=body.get("optional_addons"),
        overage_rules=body.get("overage_rules"),
        price_monthly_usd=Decimal(str(body.get("price_monthly_usd") or 0)),
        price_yearly_usd=Decimal(str(body.get("price_yearly_usd") or 0)),
        is_active=bool(body.get("is_active", True)),
        sort_order=int(body.get("sort_order") or 0),
    )
    db.add(p)
    await db.commit()
    return {"id": p.id}


@router.patch("/plans/{pid}")
async def patch_plan(
    pid: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    p = await db.get(PlatformPlan, pid)
    if not p:
        raise HTTPException(404)
    for k in ("name", "code", "is_active", "sort_order", "features_included", "optional_addons", "overage_rules"):
        if k in body:
            setattr(p, k, body[k])
    if "support_level" in body:
        p.support_level = str(body["support_level"])
    if "max_users" in body:
        p.max_users = int(body["max_users"])
    if "max_storage_gb" in body:
        p.max_storage_gb = int(body["max_storage_gb"])
    if "max_ai_tokens_monthly" in body:
        p.max_ai_tokens_monthly = int(body["max_ai_tokens_monthly"])
    if "price_monthly_usd" in body:
        p.price_monthly_usd = Decimal(str(body["price_monthly_usd"]))
    if "price_yearly_usd" in body:
        p.price_yearly_usd = Decimal(str(body["price_yearly_usd"]))
    await db.commit()
    return {"ok": True}


@router.get("/subscriptions")
async def list_subscriptions(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_billing),
    status: str | None = None,
    tenant_id: int | None = None,
):
    q = select(TenantSubscription)
    if status:
        q = q.where(TenantSubscription.status == status)
    if tenant_id is not None:
        q = q.where(TenantSubscription.tenant_id == tenant_id)
    r = await db.execute(q.order_by(TenantSubscription.id.desc()).limit(500))
    rows = r.scalars().all()
    return {
        "items": [
            {
                "id": s.id,
                "tenant_id": s.tenant_id,
                "plan_id": s.plan_id,
                "status": s.status,
                "billing_cycle": s.billing_cycle,
            }
            for s in rows
        ]
    }


@router.put("/tenants/{tid}/subscription")
async def put_subscription(
    tid: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_billing),
):
    plan_id = int(body.get("plan_id") or 0)
    if not plan_id:
        raise HTTPException(400, "plan_id required")
    sub = (await db.execute(select(TenantSubscription).where(TenantSubscription.tenant_id == tid))).scalar_one_or_none()
    if not sub:
        sub = TenantSubscription(tenant_id=tid, plan_id=plan_id, status=str(body.get("status") or "active"))
        db.add(sub)
    else:
        sub.plan_id = plan_id
        if "status" in body:
            sub.status = str(body["status"])
    await log_admin_action(db, admin_id=ctx.admin.id, action="SUBSCRIPTION_UPDATE", target_tenant_id=tid)
    await db.commit()
    return {"id": sub.id}


@router.post("/tenants/{tid}/subscription/cancel")
async def cancel_sub(
    tid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_billing),
):
    sub = (await db.execute(select(TenantSubscription).where(TenantSubscription.tenant_id == tid))).scalar_one_or_none()
    if sub:
        sub.status = "cancelled"
    await db.commit()
    return {"ok": True}


def _next_invoice_number(db: AsyncSession) -> str:
    return f"INV-{datetime.utcnow().strftime('%Y%m%d')}-{secrets_rand(6)}"


def secrets_rand(n: int) -> str:
    import random
    import string

    return "".join(random.choices(string.digits, k=n))


@router.get("/invoices")
async def list_invoices(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_billing),
):
    r = await db.execute(select(BillingInvoice).order_by(BillingInvoice.id.desc()).limit(500))
    invs = r.scalars().all()
    return {
        "items": [
            {
                "id": i.id,
                "tenant_id": i.tenant_id,
                "invoice_number": i.invoice_number,
                "total": float(i.total),
                "status": i.status,
                "due_date": i.due_date.isoformat() if i.due_date else None,
            }
            for i in invs
        ]
    }


@router.post("/invoices")
async def create_invoice(
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_billing),
):
    tid = int(body["tenant_id"])
    inv = BillingInvoice(
        tenant_id=tid,
        subscription_id=body.get("subscription_id"),
        invoice_number=_next_invoice_number(db),
        period_start=body.get("period_start"),
        period_end=body.get("period_end"),
        subtotal=Decimal(str(body.get("subtotal") or 0)),
        tax=Decimal(str(body.get("tax") or 0)),
        total=Decimal(str(body.get("total") or 0)),
        currency=str(body.get("currency") or "USD"),
        status="draft",
        due_date=body.get("due_date"),
        line_items=body.get("line_items"),
        notes=body.get("notes"),
    )
    db.add(inv)
    await db.commit()
    return {"id": inv.id, "invoice_number": inv.invoice_number}


@router.patch("/invoices/{iid}")
async def patch_invoice(
    iid: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_billing),
):
    inv = await db.get(BillingInvoice, iid)
    if not inv:
        raise HTTPException(404)
    if "status" in body:
        inv.status = str(body["status"])
    if "line_items" in body:
        inv.line_items = body["line_items"]
    await db.commit()
    return {"ok": True}


@router.post("/invoices/{iid}/send")
async def send_invoice(
    iid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_billing),
):
    inv = await db.get(BillingInvoice, iid)
    if not inv:
        raise HTTPException(404)
    inv.status = "sent"
    await db.commit()
    return {"ok": True}


@router.post("/invoices/{iid}/mark-paid")
async def mark_paid(
    iid: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_billing),
):
    inv = await db.get(BillingInvoice, iid)
    if not inv:
        raise HTTPException(404)
    inv.status = "paid"
    inv.paid_at = datetime.utcnow()
    pay = BillingPayment(
        invoice_id=inv.id,
        tenant_id=inv.tenant_id,
        amount=inv.total,
        method=str(body.get("method") or "bank_transfer"),
        reference=body.get("reference"),
        status="completed",
        paid_at=datetime.utcnow(),
    )
    db.add(pay)
    await db.commit()
    return {"ok": True}


@router.post("/invoices/{iid}/void")
async def void_invoice(
    iid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_billing),
):
    inv = await db.get(BillingInvoice, iid)
    if not inv:
        raise HTTPException(404)
    inv.status = "void"
    await db.commit()
    return {"ok": True}


@router.get("/payments")
async def list_payments(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_billing),
):
    r = await db.execute(select(BillingPayment).order_by(BillingPayment.id.desc()).limit(500))
    pays = r.scalars().all()
    return {
        "items": [
            {
                "id": p.id,
                "invoice_id": p.invoice_id,
                "tenant_id": p.tenant_id,
                "amount": float(p.amount),
                "method": p.method,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
            }
            for p in pays
        ]
    }


@router.get("/revenue")
async def revenue(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_billing),
):
    paid = await db.execute(select(func.coalesce(func.sum(BillingInvoice.total), 0)).where(BillingInvoice.status == "paid"))
    mrr_approx = float(paid.scalar() or 0)
    return {"mrr_approx_usd": mrr_approx, "note": "Manual invoices; MRR is approximate sum of paid totals."}


@router.get("/revenue/export")
async def revenue_export(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_or_billing),
):
    r = await db.execute(select(BillingInvoice).where(BillingInvoice.status == "paid").limit(5000))
    rows = r.scalars().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "tenant_id", "invoice_number", "total", "currency", "paid_at"])
    for inv in rows:
        w.writerow([inv.id, inv.tenant_id, inv.invoice_number, float(inv.total), inv.currency, inv.paid_at])
    return Response(content=buf.getvalue(), media_type="text/csv")

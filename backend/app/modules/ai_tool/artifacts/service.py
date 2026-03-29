"""CRUD and commit flow for approval artifacts."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.ai_tool import AiApprovalArtifact
from app.modules.ai_tool.artifacts.lifecycle import can_transition_artifact
from app.modules.mcp_server import erp_backend


async def create_artifact(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    session_id: int | None,
    artifact_type: str,
    source_tool: str,
    source_module: str,
    original_input: dict[str, Any],
    generated_payload: dict[str, Any],
    status: str = "pending_review",
) -> AiApprovalArtifact:
    code = f"ART-{uuid4().hex[:10].upper()}"
    row = AiApprovalArtifact(
        tenant_id=tenant_id,
        user_id=user_id,
        session_id=session_id,
        artifact_code=code,
        artifact_type=artifact_type,
        source_tool=source_tool,
        source_module=source_module,
        status=status,
        original_input_json=original_input,
        generated_payload_json=generated_payload,
        expires_at=datetime.utcnow() + timedelta(days=14),
    )
    db.add(row)
    await db.flush()
    return row


async def get_artifact(db: AsyncSession, *, tenant_id: int, artifact_id: int) -> AiApprovalArtifact | None:
    r = await db.execute(
        select(AiApprovalArtifact).where(
            AiApprovalArtifact.id == artifact_id,
            AiApprovalArtifact.tenant_id == tenant_id,
        )
    )
    return r.scalar_one_or_none()


async def list_artifacts_for_tenant(
    db: AsyncSession,
    *,
    tenant_id: int,
    status: str | None = None,
    limit: int = 50,
) -> list[AiApprovalArtifact]:
    q = select(AiApprovalArtifact).where(AiApprovalArtifact.tenant_id == tenant_id)
    if status:
        q = q.where(AiApprovalArtifact.status == status)
    q = q.order_by(AiApprovalArtifact.created_at.desc()).limit(limit)
    return list((await db.execute(q)).scalars().all())


async def approve_artifact(
    db: AsyncSession,
    *,
    tenant_id: int,
    artifact_id: int,
    reviewer: User,
    comments: str | None = None,
) -> AiApprovalArtifact | None:
    row = await get_artifact(db, tenant_id=tenant_id, artifact_id=artifact_id)
    if not row:
        return None
    if not can_transition_artifact(row.status, "approved"):
        return None
    row.status = "approved"
    row.reviewer_user_id = reviewer.id
    row.reviewer_comments = comments
    row.reviewed_at = datetime.utcnow()
    await db.flush()
    return row


async def reject_artifact(
    db: AsyncSession,
    *,
    tenant_id: int,
    artifact_id: int,
    reviewer: User,
    comments: str | None = None,
) -> AiApprovalArtifact | None:
    row = await get_artifact(db, tenant_id=tenant_id, artifact_id=artifact_id)
    if not row:
        return None
    if not can_transition_artifact(row.status, "rejected"):
        return None
    row.status = "rejected"
    row.reviewer_user_id = reviewer.id
    row.reviewer_comments = comments
    row.reviewed_at = datetime.utcnow()
    await db.flush()
    return row


async def commit_artifact(
    db: AsyncSession,
    *,
    tenant_id: int,
    artifact_id: int,
    user: User,
) -> tuple[AiApprovalArtifact | None, dict[str, Any] | None, str | None]:
    """Execute stub ERP backend from stored payload. Returns (row, erp_result, error)."""
    row = await get_artifact(db, tenant_id=tenant_id, artifact_id=artifact_id)
    if not row:
        return None, None, "Artifact not found"
    if row.status != "approved":
        return row, None, "Artifact must be approved before commit"
    payload = row.generated_payload_json or {}
    tool = row.source_tool
    err: str | None = None
    result: dict[str, Any] | None = None
    try:
        if tool == "create_sales_inquiry":
            result = await erp_backend.create_sales_inquiry(
                tenant_id=tenant_id,
                customer_id=int(payload.get("customer_id", 0)),
                items=list(payload.get("items") or []),
                raw_notes=str(payload.get("raw_notes") or ""),
            )
        elif tool == "create_financial_voucher":
            from datetime import date as date_cls

            vd = payload.get("voucher_date")
            if isinstance(vd, str):
                vd = date_cls.fromisoformat(vd[:10])
            result = await erp_backend.create_financial_voucher(
                tenant_id=tenant_id,
                voucher_type=str(payload.get("voucher_type") or ""),
                amount=float(payload.get("amount") or 0),
                debit_account=str(payload.get("debit_account") or ""),
                credit_account=str(payload.get("credit_account") or ""),
                voucher_date=vd,
                narrative=str(payload.get("narrative") or ""),
            )
        elif tool == "process_goods_receipt":
            result = await erp_backend.process_goods_receipt(
                tenant_id=tenant_id,
                po_number=str(payload.get("po_number") or ""),
                received_items=list(payload.get("received_items") or []),
                reference_document=str(payload.get("reference_document") or ""),
            )
        else:
            err = f"Unsupported source_tool for commit: {tool}"
            return row, None, err
    except Exception as exc:  # noqa: BLE001
        return row, None, str(exc)

    if not can_transition_artifact(row.status, "committed"):
        return row, None, "Invalid state transition"
    row.status = "committed"
    row.committed_payload_json = payload
    row.commit_reference = str((result or {}).get("voucher_no") or (result or {}).get("grn_no") or (result or {}).get("inquiry_code") or "")
    row.committed_at = datetime.utcnow()
    await db.flush()
    return row, result, None


async def rollback_artifact(
    db: AsyncSession,
    *,
    tenant_id: int,
    artifact_id: int,
    user: User,
    reason: str,
) -> AiApprovalArtifact | None:
    row = await get_artifact(db, tenant_id=tenant_id, artifact_id=artifact_id)
    if not row or row.status != "committed":
        return None
    if not can_transition_artifact(row.status, "rolled_back"):
        return None
    row.status = "rolled_back"
    row.rollback_reason = reason
    row.rolled_back_at = datetime.utcnow()
    row.rolled_back_by_user_id = user.id
    await db.flush()
    return row

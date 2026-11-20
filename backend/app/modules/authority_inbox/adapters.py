"""Allowlisted resource adapters for authority change requests."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.models.finance import AccountGroup, ChartOfAccount


def _as_decimal(value: Any, *, field: str) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be a number") from exc

ALLOWED_GROUP_FIELDS = {
    "code",
    "name",
    "parent_group_id",
    "nature",
    "description",
    "reporting_code",
    "is_active",
    "statement_class",
    "sort_order",
}
ALLOWED_ACCOUNT_FIELDS = {
    "account_number",
    "name",
    "group_id",
    "normal_balance",
    "opening_balance",
    "is_active",
    "description",
}
# Mirror finance router protected PATCH allow-lists (intersection with CR field allowlists).
PROTECTED_GROUP_FIELDS = {"name", "description", "reporting_code", "is_active"}
PROTECTED_ACCOUNT_FIELDS = {"name", "description", "is_active"}


def redact_group(row: AccountGroup | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": row.id,
        "code": row.code,
        "name": row.name,
        "parent_group_id": row.parent_group_id,
        "nature": row.nature,
        "description": row.description,
        "reporting_code": getattr(row, "reporting_code", None),
        "is_active": bool(getattr(row, "is_active", True)),
        "statement_class": getattr(row, "statement_class", None),
        "sort_order": getattr(row, "sort_order", None),
    }


def redact_account(row: ChartOfAccount | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": row.id,
        "account_number": row.account_number,
        "name": row.name,
        "group_id": row.group_id,
        "normal_balance": row.normal_balance,
        "opening_balance": str(getattr(row, "opening_balance", None) or "0"),
        "is_active": bool(getattr(row, "is_active", True)),
        "description": getattr(row, "description", None),
    }


def clean_proposed(resource_type: str, proposed: dict[str, Any]) -> dict[str, Any]:
    allowed = ALLOWED_GROUP_FIELDS if resource_type == "account_group" else ALLOWED_ACCOUNT_FIELDS
    out: dict[str, Any] = {}
    for key, value in (proposed or {}).items():
        if key in allowed:
            out[key] = value
    if not out:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="proposed_snapshot has no allowed fields")
    return out


def _assert_protected_mutation_allowed(
    *,
    resource_type: str,
    action: str,
    proposed: dict[str, Any],
    is_protected: bool,
) -> None:
    """Refuse CR apply/submit that would bypass finance protected-master rules."""
    if not is_protected:
        return
    if action == "CREATE":
        return
    # DEACTIVATE only flips is_active — same as finance allowing is_active on protected PATCH.
    if action == "DEACTIVATE":
        return
    allowed = PROTECTED_GROUP_FIELDS if resource_type == "account_group" else PROTECTED_ACCOUNT_FIELDS
    forbidden = sorted(k for k in proposed if k not in allowed)
    if forbidden:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Cannot change protected system master fields via change request: "
                + ", ".join(forbidden)
            ),
        )


async def assert_proposed_allowed_for_resource(
    db: AsyncSession,
    *,
    tenant_id: int,
    resource_type: str,
    resource_id: int | None,
    action: str,
    proposed: dict[str, Any],
) -> None:
    """Early submit-time check so invalid protected mutations never enter the queue."""
    if action == "CREATE" or resource_id is None:
        return
    if resource_type == "account_group":
        row = await db.get(AccountGroup, resource_id)
        if row is None or row.tenant_id != tenant_id:
            raise HTTPException(status_code=404, detail="Account group not found")
        _assert_protected_mutation_allowed(
            resource_type=resource_type,
            action=action,
            proposed=proposed,
            is_protected=bool(getattr(row, "is_protected", False)),
        )
        return
    if resource_type == "chart_of_account":
        row = await db.get(ChartOfAccount, resource_id)
        if row is None or row.tenant_id != tenant_id:
            raise HTTPException(status_code=404, detail="Ledger account not found")
        _assert_protected_mutation_allowed(
            resource_type=resource_type,
            action=action,
            proposed=proposed,
            is_protected=bool(getattr(row, "is_protected", False)),
        )
        return


async def load_before(
    db: AsyncSession,
    *,
    tenant_id: int,
    resource_type: str,
    resource_id: int | None,
) -> dict[str, Any] | None:
    if resource_id is None:
        return None
    if resource_type == "account_group":
        row = await db.get(AccountGroup, resource_id)
        if row is None or row.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account group not found")
        return redact_group(row)
    if resource_type == "chart_of_account":
        row = await db.get(ChartOfAccount, resource_id)
        if row is None or row.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ledger account not found")
        return redact_account(row)
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported resource_type")


async def apply_change(
    db: AsyncSession,
    *,
    tenant_id: int,
    resource_type: str,
    action: str,
    resource_id: int | None,
    proposed: dict[str, Any],
    base_version: int,
) -> int:
    """Apply under lock. Returns resource id. Raises CONFLICT if base_version stale (simple id-presence check)."""
    del base_version  # reserved for optimistic concurrency on future versioned masters
    proposed = clean_proposed(resource_type, proposed)

    if resource_type == "account_group":
        if action == "CREATE":
            code = str(proposed.get("code") or "").strip().upper()
            name = str(proposed.get("name") or "").strip()
            if not code or not name:
                raise HTTPException(status_code=400, detail="code and name are required")
            parent_id = proposed.get("parent_group_id")
            await ensure_owned(db, AccountGroup, parent_id, tenant_id, "Parent account group")
            exists = (
                await db.execute(
                    select(AccountGroup.id).where(AccountGroup.tenant_id == tenant_id, AccountGroup.code == code).limit(1)
                )
            ).scalar_one_or_none()
            if exists is not None:
                raise HTTPException(status_code=409, detail="Account group code already exists")
            row = AccountGroup(
                tenant_id=tenant_id,
                code=code,
                name=name,
                parent_group_id=parent_id,
                nature=proposed.get("nature") or "Asset",
                description=proposed.get("description"),
                reporting_code=proposed.get("reporting_code"),
                is_active=bool(proposed.get("is_active", True)),
                statement_class=proposed.get("statement_class"),
                sort_order=int(proposed.get("sort_order") or 0),
            )
            db.add(row)
            await db.flush()
            return int(row.id)
        row = await db.get(AccountGroup, resource_id)
        if row is None or row.tenant_id != tenant_id:
            raise HTTPException(status_code=404, detail="Account group not found")
        protected = bool(getattr(row, "is_protected", False))
        _assert_protected_mutation_allowed(
            resource_type=resource_type, action=action, proposed=proposed, is_protected=protected
        )
        if action == "DEACTIVATE":
            row.is_active = False
        elif protected:
            for key, value in proposed.items():
                if key in PROTECTED_GROUP_FIELDS:
                    setattr(row, key, value)
        else:
            if "parent_group_id" in proposed:
                await ensure_owned(
                    db, AccountGroup, proposed.get("parent_group_id"), tenant_id, "Parent account group"
                )
            for key, value in proposed.items():
                if key == "code":
                    continue
                setattr(row, key, value)
        await db.flush()
        return int(row.id)

    if resource_type == "chart_of_account":
        if action == "CREATE":
            number = str(proposed.get("account_number") or "").strip()
            name = str(proposed.get("name") or "").strip()
            group_id = proposed.get("group_id")
            if not number or not name or not group_id:
                raise HTTPException(status_code=400, detail="account_number, name and group_id are required")
            await ensure_owned(db, AccountGroup, int(group_id), tenant_id, "Account group")
            opening = _as_decimal(proposed.get("opening_balance", "0"), field="opening_balance")
            row = ChartOfAccount(
                tenant_id=tenant_id,
                account_number=number,
                name=name,
                group_id=int(group_id),
                normal_balance=str(proposed.get("normal_balance") or "debit"),
                opening_balance=opening,
                balance=opening,
                is_active=bool(proposed.get("is_active", True)),
                description=proposed.get("description"),
            )
            db.add(row)
            await db.flush()
            return int(row.id)
        row = await db.get(ChartOfAccount, resource_id)
        if row is None or row.tenant_id != tenant_id:
            raise HTTPException(status_code=404, detail="Ledger account not found")
        protected = bool(getattr(row, "is_protected", False))
        _assert_protected_mutation_allowed(
            resource_type=resource_type, action=action, proposed=proposed, is_protected=protected
        )
        if action == "DEACTIVATE":
            row.is_active = False
        elif protected:
            for key, value in proposed.items():
                if key in PROTECTED_ACCOUNT_FIELDS:
                    setattr(row, key, value)
        else:
            if "group_id" in proposed and proposed.get("group_id") is not None:
                await ensure_owned(db, AccountGroup, int(proposed["group_id"]), tenant_id, "Account group")
            for key, value in proposed.items():
                if key == "account_number":
                    continue
                if key == "opening_balance":
                    setattr(row, key, _as_decimal(value, field="opening_balance"))
                    continue
                if key == "group_id" and value is not None:
                    setattr(row, key, int(value))
                    continue
                setattr(row, key, value)
        await db.flush()
        return int(row.id)

    raise HTTPException(status_code=400, detail="Unsupported resource_type")

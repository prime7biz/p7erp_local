"""Fail-closed section gates for Customer 360 / timeline (Phase 4)."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authority.module_access import module_code_for_permission
from app.common.authority.policy import (
    can_view_pnl_balance_sheet,
    is_authority_classes_enabled_for_tenant,
    load_user_module_codes,
    user_has_module,
)
from app.common.permissions import get_user_role_for_tenant, internal_permission_granted
from app.common.tenant_feature_keys import (
    RBAC_MODE_ENFORCE,
    get_tenant_rbac_mode,
    is_finance_control_tower_v2_enabled,
    is_inbound_job_work_v1_enabled,
)
from app.external_access.feature_flags import is_customer_portal_enabled
from app.models import Tenant, User
from app.modules.mfg_intelligence.finance_gate import may_view_mfg_finance


@dataclass(frozen=True)
class Customer360Gates:
    merch: bool
    commercial: bool
    trade: bool
    inventory: bool
    production: bool
    planning_read: bool
    job_work: bool
    finance: bool
    profitability: bool
    partners: bool
    portal: bool
    contacts: bool
    ai_audit: bool


async def _has_module_grant(
    db: AsyncSession,
    user: User,
    *,
    permission_key: str,
    feature_flags,
) -> bool:
    if not is_authority_classes_enabled_for_tenant(feature_flags):
        return True
    if not user.is_active:
        return False
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return True
    code = module_code_for_permission(permission_key)
    if code is None:
        return True
    modules = await load_user_module_codes(db, tenant_id=user.tenant_id, user_id=user.id)
    return user_has_module(modules, code)


async def _soft_or_enforce(
    db: AsyncSession,
    user: User,
    tenant: Tenant,
    permission_key: str,
) -> bool:
    """Deny only in enforce RBAC mode (same idea as can_access_module), plus authority grants."""
    flags = tenant.feature_flags
    if not await _has_module_grant(db, user, permission_key=permission_key, feature_flags=flags):
        return False
    if get_tenant_rbac_mode(flags) != RBAC_MODE_ENFORCE:
        return True
    role = await get_user_role_for_tenant(db, user, tenant.id)
    return internal_permission_granted(role=role, permission_key=permission_key)


async def _fail_closed(
    db: AsyncSession,
    user: User,
    tenant: Tenant,
    permission_key: str,
) -> bool:
    """Always require the key (every RBAC mode) + authority module grant when ON."""
    flags = tenant.feature_flags
    if not await _has_module_grant(db, user, permission_key=permission_key, feature_flags=flags):
        return False
    role = await get_user_role_for_tenant(db, user, tenant.id)
    return internal_permission_granted(role=role, permission_key=permission_key)


def _trade_enabled(tenant: Tenant) -> bool:
    flags = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    return flags.get("trade_enabled") is not False


async def evaluate_customer_360_gates(
    db: AsyncSession,
    *,
    user: User,
    tenant: Tenant,
) -> Customer360Gates:
    merch = await _soft_or_enforce(db, user, tenant, "merch.access")
    commercial = merch
    trade = (await _soft_or_enforce(db, user, tenant, "trade.access")) and _trade_enabled(tenant)
    inventory = await _soft_or_enforce(db, user, tenant, "inventory.access")
    production = await _soft_or_enforce(db, user, tenant, "production.access")
    planning_read = await _soft_or_enforce(db, user, tenant, "production.planning.read")
    job_work = production and is_inbound_job_work_v1_enabled(tenant.feature_flags)
    finance = await _fail_closed(db, user, tenant, "finance.access")
    profitability = False
    if finance and is_finance_control_tower_v2_enabled(tenant.feature_flags):
        profitability = (
            await may_view_mfg_finance(db, user, tenant)
            and await can_view_pnl_balance_sheet(db, user, feature_flags=tenant.feature_flags)
        )
    partners = merch
    portal = (await _fail_closed(db, user, tenant, "settings.access")) and is_customer_portal_enabled(
        tenant
    )
    contacts = merch
    ai_audit = (await _soft_or_enforce(db, user, tenant, "ai.access")) and (
        await _soft_or_enforce(db, user, tenant, "customers.ai.audit")
    )
    return Customer360Gates(
        merch=merch,
        commercial=commercial,
        trade=trade,
        inventory=inventory,
        production=production,
        planning_read=planning_read,
        job_work=job_work,
        finance=finance,
        profitability=profitability,
        partners=partners,
        portal=portal,
        contacts=contacts,
        ai_audit=ai_audit,
    )


def denied_block() -> dict:
    return {"allowed": False}

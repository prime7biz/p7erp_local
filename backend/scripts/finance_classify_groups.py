"""Propose statement classes for a tenant's Unclassified account groups (dry run by default).

Deterministic standard rules only (system_code, top-level legacy codes, group nature); never by name. The rules
live in `app/modules/finance/statements/classification_rules.py`. Groups that inherit a class from a parent are
listed and skipped. `--apply` writes every proposal in ONE transaction, tenant-scoped, with one audit row per
change (action finance.account_group.statement_class.update). Groups marked "review" are left for a finance admin.

Usage (inside Docker):
  docker compose exec -T backend python scripts/finance_classify_groups.py --company-code LAKH806201
  docker compose exec -T backend python scripts/finance_classify_groups.py --company-code LAKH806201 --apply
Rollback: Finance -> Setup -> Account groups -> clear the class (audited), or restore from backup.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from app.common.rls import bind_session_bypass, bind_session_tenant  # noqa: E402
from app.database import AsyncSessionLocal, safe_async_session_rollback  # noqa: E402
from app.models import Tenant  # noqa: E402
from app.modules.finance.statements.classification_rules import (  # noqa: E402
    ACTION_SET,
    GroupProposal,
    apply_group_classes,
    propose_group_classes,
)


def format_table(proposals: list[GroupProposal]) -> str:
    headers = ("group_id", "code", "name", "nature", "proposed_class", "action", "reason")
    body = [
        (str(p.group_id), p.code, p.name, p.nature, p.proposed_class or "-", p.action, p.reason) for p in proposals
    ]
    widths = [max(len(h), *(len(r[i]) for r in body)) if body else len(h) for i, h in enumerate(headers)]
    line = " | ".join(h.ljust(w) for h, w in zip(headers, widths))
    out = [line, "-+-".join("-" * w for w in widths)]
    out += [" | ".join(c.ljust(w) for c, w in zip(r, widths)) for r in body]
    return "\n".join(out)


async def main(company_code: str, apply: bool) -> int:
    async with AsyncSessionLocal() as db:
        await bind_session_bypass(db)
        tenant = (await db.execute(select(Tenant).where(Tenant.company_code == company_code))).scalar_one_or_none()
        if tenant is None:
            print(f"No tenant with company code {company_code}.")
            return 2
        await bind_session_tenant(db, tenant.id)
        proposals = await propose_group_classes(db, tenant.id)
        print(f"Tenant {tenant.company_code} (id {tenant.id}): {len(proposals)} Unclassified group(s)")
        print(format_table(proposals) if proposals else "(nothing to classify)")
        to_set = sum(1 for p in proposals if p.action == ACTION_SET)
        if not apply:
            print(f"\nDry run: {to_set} group(s) would be classified. Re-run with --apply to write them.")
            await db.rollback()
            return 0
        try:
            applied = await apply_group_classes(db, tenant.id, user_id=None)
            await db.commit()
        except Exception as exc:  # noqa: BLE001 - report and leave the database unchanged
            await safe_async_session_rollback(db)
            print(f"Apply failed, nothing written: {type(exc).__name__}: {exc}")
            return 1
        print(f"\nApplied: {len(applied)} group(s) classified (one audit row each).")
        return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--company-code", required=True)
    parser.add_argument("--apply", action="store_true", help="Write the proposals (default: dry run)")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.company_code.strip(), args.apply)))

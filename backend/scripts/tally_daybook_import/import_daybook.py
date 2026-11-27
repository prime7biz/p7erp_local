"""Create DRAFT vouchers from a parsed Tally day book.

Usage inside the backend container:

    python scripts/tally_daybook_import/import_daybook.py --dry-run < parsed.json
    python scripts/tally_daybook_import/import_daybook.py --apply --company-code LAKH752050 --actor-user-id 1 < parsed.json

--dry-run writes nothing and does not move voucher numbers.
--apply writes drafts in date order and uses the ERP voucher number series.
The Tally number is stored in the narration and in voucher.reference.

Do not run --apply on production until migration 339 is deployed, the flag
finance_sub_ledger_tracking_v1 is on for that company, a verified backup exists,
and a person has approved the ledger match list.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

from app.common.rls import bind_session_bypass, bind_session_tenant
from app.database import AsyncSessionLocal
from app.models.finance import ChartOfAccount, Voucher, VoucherLine
from app.modules.finance.sub_ledger_service import replace_line_intents
from app.modules.finance.voucher_controls import allocate_series_voucher_number, compute_duplicate_risk_hash
from app.modules.finance.voucher_history import record_voucher_event
from app.modules.finance.voucher_signature import apply_voucher_signature
from sqlalchemy import select


def sort_key(row: dict) -> tuple:
    text = row.get("voucher_date") or row.get("voucher_date_text") or ""
    for fmt in ("%Y-%m-%d", "%d-%b-%Y", "%d-%b-%y"):
        try:
            parsed = datetime.strptime(text, fmt).date()
            break
        except ValueError:
            parsed = date.min
    return (parsed, row.get("tally_type") or "", row.get("tally_no") or "")


async def _run(payload: dict, *, apply: bool, company_code: str, actor_user_id: int) -> dict:
    from app.models.tenant import Tenant
    from app.models.user import User

    vouchers = sorted(payload.get("vouchers") or [], key=sort_key)
    report = {"company_code": company_code, "count": len(vouchers), "created": [], "skipped": [], "mode": "apply" if apply else "dry-run"}
    if not apply:
        report["note"] = "Dry run only. No voucher numbers were used."
        report["order"] = [row.get("reference") for row in vouchers]
        return report

    async with AsyncSessionLocal() as db:
        await bind_session_bypass(db)
        tenant = (await db.execute(select(Tenant).where(Tenant.company_code == company_code))).scalar_one_or_none()
        if tenant is None:
            raise SystemExit(f"Company {company_code} was not found.")
        await bind_session_tenant(db, tenant.id)
        actor = await db.get(User, actor_user_id)
        if actor is None or actor.tenant_id != tenant.id:
            raise SystemExit("actor-user-id is not a user of this company.")
        for row in vouchers:
            ref = (row.get("reference") or "")[:64]
            existing = (
                await db.execute(select(Voucher.id).where(Voucher.tenant_id == tenant.id, Voucher.reference == ref))
            ).scalar_one_or_none()
            if existing is not None:
                report["skipped"].append({"reference": ref, "reason": "already imported", "voucher_id": existing})
                continue
            voucher_date = date.fromisoformat(row["voucher_date"])
            number, seq, series_key, fy = await allocate_series_voucher_number(
                db, tenant_id=tenant.id, voucher_date=voucher_date, voucher_type=row["erp_type"], branch_code=None
            )
            voucher = Voucher(
                tenant_id=tenant.id,
                voucher_number=number,
                voucher_type=row["erp_type"],
                voucher_date=voucher_date,
                status="DRAFT",
                description=(row.get("narration") or "")[:4000],
                reference=ref,
                source_module="TALLY_DAYBOOK_IMPORT",
                source_module_ref=ref,
                allow_manual_edit=True,
                instrument_reference=row.get("instrument_reference"),
                series_sequence=seq,
                number_series_key=series_key,
                fiscal_year=fy,
                currency="BDT",
                base_currency="BDT",
                exchange_rate="1",
                created_by=actor.id,
            )
            db.add(voucher)
            await db.flush()
            built = []
            account_ids = []
            for line in row["lines"]:
                account = await db.get(ChartOfAccount, int(line["account_id"]))
                if account is None or account.tenant_id != tenant.id:
                    raise SystemExit(f"Ledger {line['account_id']} is not in this company.")
                account_ids.append(account.id)
                built.append(
                    VoucherLine(
                        tenant_id=tenant.id,
                        voucher_id=voucher.id,
                        account_id=account.id,
                        sub_account_id=line.get("sub_account_id"),
                        entry_type=line["entry_type"],
                        amount=str(line["amount"]),
                        base_amount=str(line["amount"]),
                        currency="BDT",
                        exchange_rate="1",
                    )
                )
                db.add(built[-1])
            debit = sum(Decimal(str(line["amount"])) for line in row["lines"] if line["entry_type"] == "DEBIT")
            credit = sum(Decimal(str(line["amount"])) for line in row["lines"] if line["entry_type"] == "CREDIT")
            if debit != credit:
                raise SystemExit(f"{ref} is not balanced.")
            apply_voucher_signature(voucher, built)
            voucher.duplicate_risk_hash = compute_duplicate_risk_hash(
                tenant_id=tenant.id,
                voucher_date=voucher_date,
                reference=ref,
                line_account_ids=account_ids,
                debit_total=float(debit),
                credit_total=float(credit),
            )
            await db.flush()
            await replace_line_intents(
                db,
                tenant_id=tenant.id,
                user_id=actor.id,
                voucher=voucher,
                pairs=[
                    (
                        built_line,
                        [
                            SimpleNamespace(
                                allocation_type=intent.get("allocation_type"),
                                amount=intent.get("amount"),
                                reference_no=intent.get("reference_no"),
                                target_bill_reference_id=intent.get("target_bill_reference_id"),
                                due_date=intent.get("due_date"),
                                notes=intent.get("notes"),
                            )
                            for intent in (raw.get("bill_intents") or [])
                        ],
                    )
                    for built_line, raw in zip(built, row["lines"])
                ],
                feature_flags=tenant.feature_flags,
            )
            await record_voucher_event(
                db,
                tenant_id=tenant.id,
                user_id=actor.id,
                voucher_id=voucher.id,
                event="create",
                summary="Imported Tally day book draft",
                to_status="DRAFT",
            )
            report["created"].append({"reference": ref, "voucher_id": voucher.id, "voucher_number": number})
        await db.commit()
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--company-code", default="")
    parser.add_argument("--actor-user-id", type=int, default=0)
    args = parser.parse_args()
    if args.apply == args.dry_run:
        raise SystemExit("Choose exactly one of --dry-run or --apply.")
    payload = json.load(sys.stdin)
    report = asyncio.run(_run(payload, apply=args.apply, company_code=args.company_code, actor_user_id=args.actor_user_id))
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()

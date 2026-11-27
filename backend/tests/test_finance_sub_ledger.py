"""Sub-accounts and draft-safe bill references.

Run: docker compose exec -T backend pytest tests/test_finance_sub_ledger.py tests/test_tally_daybook_import.py -q
"""

from __future__ import annotations

from datetime import date

import pytest

from sqlalchemy import func, select

from app.models.finance import AccountingPeriod, AccountGroup, BillAllocation, BillReference
from app.modules.finance.sub_ledger_service import classify_bill_type
from tests.benchmark_fixtures import api_client
from tests.finance_statement_fixtures import seed_world


def test_bill_type_codes_fit_the_column():
    class Group:
        system_code = "TRADE_PAYABLES"
        name = "Sundry Creditors"
        nature = "Liability"

    assert len(classify_bill_type(Group(), "CREDIT", "NEW_REF")) <= 20
    Group.system_code = "TRADE_RECEIVABLES"
    Group.name = "Sundry Debtors"
    Group.nature = "Asset"
    assert classify_bill_type(Group(), "CREDIT", "ADVANCE") == "CUSTOMER_ADVANCE"
    assert len("SUPPLIER_ADVANCE") <= 20
    assert len("HAND_LOAN_TAKEN") <= 20


@pytest.mark.asyncio
async def test_draft_reference_is_hidden_until_post_and_a_foreign_person_is_rejected(db_session_integration):
    db = db_session_integration
    tenant, user, world = await seed_world(db, flags={"finance_sub_ledger_tracking_v1": False})
    async with api_client(db, tenant, user) as client:
        denied = await client.get("/api/v1/finance/sub-accounts")
        assert denied.status_code == 403

        tenant.feature_flags = {
            **(tenant.feature_flags or {}),
            "finance_sub_ledger_tracking_v1": True,
            "direct_post_vouchers": True,
        }
        db.add(
            AccountingPeriod(
                tenant_id=tenant.id,
                period_name="Jul 2026",
                start_date=date(2026, 7, 1),
                end_date=date(2026, 7, 31),
                is_closed=False,
            )
        )
        await db.flush()

        created = await client.post(
            "/api/v1/finance/sub-accounts",
            json={"code": "ADV-01", "name": "Office advance", "category": "EMPLOYEE_ADVANCE"},
        )
        assert created.status_code == 200, created.text
        person_id = created.json()["id"]

        other = await client.post(
            "/api/v1/finance/vouchers",
            json={
                "voucher_type": "JOURNAL",
                "voucher_date": "2026-07-06",
                "description": "Being a test supplier bill",
                "lines": [
                    {
                        "account_id": world["ledgers"]["rent"].id,
                        "entry_type": "DEBIT",
                        "amount": "100.0000",
                        "sub_account_id": 999999,
                    },
                    {"account_id": world["ledgers"]["cash"].id, "entry_type": "CREDIT", "amount": "100.0000"},
                ],
            },
        )
        assert other.status_code == 400

        ap = world["ledgers"]["ap"]
        group = await db.get(AccountGroup, ap.group_id)
        assert group is not None
        draft = await client.post(
            "/api/v1/finance/vouchers",
            json={
                "voucher_type": "JOURNAL",
                "voucher_date": "2026-07-06",
                "description": "[Tally Ref: JV#0001] Being a test supplier bill",
                "reference": "TALLY-2026-07-06-JV-0001",
                "lines": [
                    {"account_id": world["ledgers"]["rent"].id, "entry_type": "DEBIT", "amount": "250.0000"},
                    {
                        "account_id": ap.id,
                        "entry_type": "CREDIT",
                        "amount": "250.0000",
                        "sub_account_id": person_id,
                        "bill_intents": [
                            {"allocation_type": "NEW_REF", "reference_no": "BILL-1", "amount": "250.0000"}
                        ],
                    },
                ],
            },
        )
        assert draft.status_code == 200, draft.text
        body = draft.json()
        assert body["status"] == "DRAFT"
        assert body["voucher_number"].startswith("VCH-")
        assert body["lines"][1]["bill_intents"][0]["reference_no"] == "BILL-1"

        before = await client.get("/api/v1/finance/bill-references/report/outstanding")
        assert before.status_code == 200
        assert before.json()["payable"]["count"] == 0

        posted = await client.post(f"/api/v1/finance/vouchers/{body['id']}/direct-post")
        assert posted.status_code == 200, posted.text
        assert posted.json()["status"] == "POSTED"

        after = await client.get("/api/v1/finance/bill-references/report/outstanding")
        assert after.json()["payable"]["total"] == 250.0
        listed = await client.get("/api/v1/finance/bill-references", params={"source_voucher_id": body["id"]})
        assert listed.status_code == 200
        assert listed.json()[0]["bill_number"] == "BILL-1"
        assert listed.json()[0]["entry_side"] == "CREDIT"
        bill_id = listed.json()[0]["id"]

        hijack = await client.post(
            "/api/v1/finance/vouchers",
            json={
                "voucher_type": "JOURNAL",
                "voucher_date": "2026-07-07",
                "description": "Being an attempt to rewrite a bill",
                "lines": [
                    {"account_id": world["ledgers"]["rent"].id, "entry_type": "DEBIT", "amount": "10.0000"},
                    {
                        "account_id": ap.id,
                        "entry_type": "CREDIT",
                        "amount": "10.0000",
                        "bill_intents": [
                            {
                                "allocation_type": "NEW_REF",
                                "reference_no": "BILL-X",
                                "amount": "10.0000",
                                "target_bill_reference_id": bill_id,
                            }
                        ],
                    },
                ],
            },
        )
        assert hijack.status_code == 400

        wrong_ledger = await client.post(
            "/api/v1/finance/vouchers",
            json={
                "voucher_type": "JOURNAL",
                "voucher_date": "2026-07-07",
                "description": "Being a reference on rent",
                "lines": [
                    {
                        "account_id": world["ledgers"]["rent"].id,
                        "entry_type": "DEBIT",
                        "amount": "10.0000",
                        "bill_intents": [{"allocation_type": "NEW_REF", "reference_no": "RENT-1", "amount": "10.0000"}],
                    },
                    {"account_id": world["ledgers"]["cash"].id, "entry_type": "CREDIT", "amount": "10.0000"},
                ],
            },
        )
        assert wrong_ledger.status_code == 400

        missing_target = await client.post(
            "/api/v1/finance/vouchers",
            json={
                "voucher_type": "PAYMENT",
                "voucher_date": "2026-07-08",
                "description": "Being a settlement with no bill",
                "lines": [
                    {
                        "account_id": ap.id,
                        "entry_type": "DEBIT",
                        "amount": "250.0000",
                        "bill_intents": [{"allocation_type": "AGAINST_REF", "amount": "250.0000"}],
                    },
                    {"account_id": world["ledgers"]["cash"].id, "entry_type": "CREDIT", "amount": "250.0000"},
                ],
            },
        )
        assert missing_target.status_code == 400

        unknown_bill = await client.post(
            "/api/v1/finance/vouchers",
            json={
                "voucher_type": "PAYMENT",
                "voucher_date": "2026-07-08",
                "description": "Being a settlement of a missing bill",
                "lines": [
                    {
                        "account_id": ap.id,
                        "entry_type": "DEBIT",
                        "amount": "1.0000",
                        "bill_intents": [
                            {"allocation_type": "ON_ACCOUNT", "amount": "1.0000", "target_bill_reference_id": 999999}
                        ],
                    },
                    {"account_id": world["ledgers"]["cash"].id, "entry_type": "CREDIT", "amount": "1.0000"},
                ],
            },
        )
        assert unknown_bill.status_code == 400

        settle = await client.post(
            "/api/v1/finance/vouchers",
            json={
                "voucher_type": "PAYMENT",
                "voucher_date": "2026-07-08",
                "description": "Being settlement of BILL-1",
                "lines": [
                    {
                        "account_id": ap.id,
                        "entry_type": "DEBIT",
                        "amount": "250.0000",
                        "bill_intents": [
                            {
                                "allocation_type": "AGAINST_REF",
                                "amount": "250.0000",
                                "target_bill_reference_id": bill_id,
                            }
                        ],
                    },
                    {"account_id": world["ledgers"]["cash"].id, "entry_type": "CREDIT", "amount": "250.0000"},
                ],
            },
        )
        assert settle.status_code == 200, settle.text
        settle_id = settle.json()["id"]
        posted_settle = await client.post(f"/api/v1/finance/vouchers/{settle_id}/direct-post")
        assert posted_settle.status_code == 200, posted_settle.text
        cancelled = await client.post(f"/api/v1/finance/vouchers/{settle_id}/cancel-posting")
        assert cancelled.status_code == 200, cancelled.text
        gone = (
            await db.execute(
                select(func.count()).select_from(BillAllocation).where(BillAllocation.voucher_id == settle_id)
            )
        ).scalar()
        assert gone == 0
        again = await client.post(f"/api/v1/finance/vouchers/{settle_id}/direct-post")
        assert again.status_code == 200, again.text
        kept = (
            await db.execute(
                select(func.count()).select_from(BillAllocation).where(BillAllocation.voucher_id == settle_id)
            )
        ).scalar()
        assert kept == 1
        still = await db.get(BillReference, bill_id)
        assert still is not None
        assert still.bill_number == "BILL-1"

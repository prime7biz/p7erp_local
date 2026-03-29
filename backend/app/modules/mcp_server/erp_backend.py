from __future__ import annotations

from datetime import datetime, date
from uuid import uuid4


async def create_sales_inquiry(
    *,
    tenant_id: int,
    customer_id: int,
    items: list[dict],
    raw_notes: str,
) -> dict:
    inquiry_code = f"SI-{datetime.utcnow().strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"
    return {
        "status": "SIMULATION",
        "simulation": True,
        "committed": False,
        "execution_mode": "simulation",
        "inquiry_code": inquiry_code,
        "tenant_id": tenant_id,
        "customer_id": customer_id,
        "items_count": len(items),
        "raw_notes": raw_notes,
        "message": "[SIMULATION] Sales inquiry draft generated. No ERP transaction was created.",
    }


async def create_financial_voucher(
    *,
    tenant_id: int,
    voucher_type: str,
    amount: float,
    debit_account: str,
    credit_account: str,
    voucher_date: date,
    narrative: str,
) -> dict:
    voucher_no = f"FV-{datetime.utcnow().strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"
    return {
        "status": "SIMULATION",
        "simulation": True,
        "committed": False,
        "execution_mode": "simulation",
        "voucher_no": voucher_no,
        "tenant_id": tenant_id,
        "voucher_type": voucher_type,
        "amount": float(amount),
        "debit_account": debit_account,
        "credit_account": credit_account,
        "date": voucher_date.isoformat(),
        "narrative": narrative,
        "message": "[SIMULATION] Financial voucher preview only. No ERP posting was created.",
    }


async def process_goods_receipt(
    *,
    tenant_id: int,
    po_number: str,
    received_items: list[dict],
    reference_document: str,
) -> dict:
    grn_no = f"GRN-{datetime.utcnow().strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"
    return {
        "status": "SIMULATION",
        "simulation": True,
        "committed": False,
        "execution_mode": "simulation",
        "grn_no": grn_no,
        "tenant_id": tenant_id,
        "po_number": po_number,
        "line_count": len(received_items),
        "reference_document": reference_document,
        "message": "[SIMULATION] Goods receipt preview only. No inventory transaction was posted.",
    }


async def execute_mock_tool(*, tenant_id: int, tool_required: str, prompt: str) -> dict:
    text = prompt.strip()
    if tool_required == "create_sales_inquiry":
        return await create_sales_inquiry(
            tenant_id=tenant_id,
            customer_id=1,
            items=[{"sku": "SKU-DEMO-001", "qty": 10}],
            raw_notes=text[:2000],
        )
    if tool_required == "create_financial_voucher":
        return await create_financial_voucher(
            tenant_id=tenant_id,
            voucher_type="journal",
            amount=1000.0,
            debit_account="Inventory",
            credit_account="Accounts Payable",
            voucher_date=date.today(),
            narrative=text[:2000],
        )
    if tool_required == "process_goods_receipt":
        return await process_goods_receipt(
            tenant_id=tenant_id,
            po_number="PO-DEMO-001",
            received_items=[{"sku": "SKU-DEMO-001", "qty": 10, "condition": "good"}],
            reference_document=text[:2000],
        )
    return {
        "status": "BLOCKED",
        "tool_required": tool_required,
        "message": "Unsupported tool requested for escalation.",
    }

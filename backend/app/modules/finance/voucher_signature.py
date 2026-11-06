"""Voucher QR signature: one canonical payload shared by signing and verification.

Changing the payload fields or their formatting invalidates every printed voucher QR code,
so keep this function byte-for-byte stable.
"""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime

from app.common.orm_numeric import decimal_to_money_response, decimal_to_rate_response
from app.models.finance import Voucher, VoucherLine


def voucher_signature_payload(voucher: Voucher, lines: list[VoucherLine]) -> dict:
    serialized_lines = [
        {
            "account_id": line.account_id,
            "cost_center_id": line.cost_center_id,
            "entry_type": line.entry_type,
            "amount": decimal_to_money_response(line.amount),
            "base_amount": decimal_to_money_response(line.base_amount),
            "currency": line.currency,
            "exchange_rate": decimal_to_rate_response(line.exchange_rate),
            "notes": line.notes,
        }
        for line in lines
    ]
    return {
        "voucher_id": voucher.id,
        "voucher_number": voucher.voucher_number,
        "voucher_type": voucher.voucher_type,
        "voucher_date": voucher.voucher_date.isoformat(),
        "status": voucher.status,
        "currency": voucher.currency,
        "base_currency": voucher.base_currency,
        "exchange_rate": decimal_to_rate_response(voucher.exchange_rate),
        "lines": serialized_lines,
    }


def compute_voucher_signature_hash(voucher: Voucher, lines: list[VoucherLine]) -> str:
    canonical = json.dumps(voucher_signature_payload(voucher, lines), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def apply_voucher_signature(voucher: Voucher, lines: list[VoucherLine]) -> None:
    voucher.signature_hash = compute_voucher_signature_hash(voucher, lines)
    voucher.verification_id = voucher.verification_id or f"VFY-{secrets.token_hex(8).upper()}"
    voucher.signed_at = datetime.utcnow()
    voucher.signed_by_system = True

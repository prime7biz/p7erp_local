"""Turn a Tally Day Book text export into balanced voucher rows.

The live Lakhsma PDF is not stored in git. Put a text extract under local_data/ (gitignored)
and pass that path. This module only parses text. It does not write to the database.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

VOUCHER_TYPES = {"CPV": "PAYMENT", "CRV": "RECEIPT", "BRV": "RECEIPT", "CV": "CONTRA", "JV": "JOURNAL"}
HEADER_RE = re.compile(r"^(CPV|CRV|BRV|CV|JV)\s*#?\s*([0-9]+)\s+(\d{1,2}-[A-Za-z]{3}-\d{2,4})", re.I)
AMOUNT_RE = re.compile(r"([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(Dr|Cr)\b", re.I)


def indian_amount(text: str) -> Decimal:
    """1,05,512.50 -> Decimal('105512.50')."""
    cleaned = text.replace(",", "").strip()
    try:
        return Decimal(cleaned).quantize(Decimal("0.01"))
    except InvalidOperation as exc:
        raise ValueError(f"Not an amount: {text}") from exc


def tally_reference(voucher_date: str, tally_type: str, tally_no: str) -> str:
    return f"TALLY-{voucher_date}-{tally_type}-{tally_no}"


def narration_with_tally_ref(tally_type: str, tally_no: str, being: str) -> str:
    prefix = f"[Tally Ref: {tally_type}#{tally_no}]"
    body = (being or "").strip()
    if not body:
        return prefix
    return f"{prefix} {body}"[:2000]


def parse_daybook_text(text: str) -> tuple[list[dict], list[dict]]:
    """Return (balanced vouchers, held-out vouchers). Same-day order is the source order."""
    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.lower().startswith("day book") or line.lower().startswith("page "):
            continue
        lines.append(line)

    blocks: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if HEADER_RE.match(line) and current:
            blocks.append(current)
            current = [line]
        else:
            current.append(line)
    if current:
        blocks.append(current)

    ok: list[dict] = []
    held: list[dict] = []
    for block in blocks:
        header = HEADER_RE.match(block[0])
        if header is None:
            held.append({"reason": "no voucher header", "text": " ".join(block)[:200]})
            continue
        tally_type = header.group(1).upper()
        tally_no = header.group(2).zfill(4)
        voucher_date = header.group(3)
        debits = Decimal("0")
        credits = Decimal("0")
        ledger_lines = []
        being = ""
        cheque = ""
        for line in block[1:]:
            if line.lower().startswith("being"):
                being = line
            cheque_match = re.search(r"\b([A-Z]{1,3}\d{5,})\b", line)
            if cheque_match:
                cheque = cheque_match.group(1)
            amount_match = AMOUNT_RE.search(line)
            if amount_match:
                amount = indian_amount(amount_match.group(1))
                side = amount_match.group(2).upper()
                name = line[: amount_match.start()].strip(" -")
                if side == "DR":
                    debits += amount
                else:
                    credits += amount
                ledger_lines.append({"ledger_name": name, "side": "DEBIT" if side == "DR" else "CREDIT", "amount": str(amount)})
        row = {
            "tally_type": tally_type,
            "tally_no": tally_no,
            "voucher_date_text": voucher_date,
            "erp_type": VOUCHER_TYPES[tally_type],
            "reference": tally_reference(voucher_date, tally_type, tally_no),
            "narration": narration_with_tally_ref(tally_type, tally_no, being),
            "instrument_reference": cheque or None,
            "lines": ledger_lines,
            "debit_total": str(debits),
            "credit_total": str(credits),
        }
        if not ledger_lines or debits != credits:
            row["reason"] = "does not balance" if ledger_lines else "no amounts"
            held.append(row)
        else:
            ok.append(row)
    return ok, held

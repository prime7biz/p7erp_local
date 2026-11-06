"""Bangladesh bond / UD register calculations (pure functions, easy to unit-test).

Assumptions (documented for users in Help & Tutorials):
- A bonded-warehouse IMPORT entry adds raw material to the bond; an EXPORT entry
  removes (consumes) it against shipped garments.
- An entry counts against a UD permitted-import line when it is linked by
  ``ud_entitlement_id``; unlinked entries fall back to matching the UD number and
  the item description (case-insensitive).
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from app.common.business_date import today_local

ZERO = Decimal("0")
EXPIRY_WARNING_DAYS = 30


def _d(v: Any) -> Decimal:
    if v is None or v == "":
        return ZERO
    return v if isinstance(v, Decimal) else Decimal(str(v))


def _fmt(d: Decimal) -> str:
    """Plain decimal text without trailing zeros (380.0000 -> 380)."""
    return format(d.normalize(), "f") if d else "0"


def _norm(text: str | None) -> str:
    return " ".join((text or "").lower().split())


def entry_matches_entitlement(entry: dict[str, Any], ent: dict[str, Any], ud_no: str) -> bool:
    if entry.get("ud_entitlement_id") is not None:
        return entry["ud_entitlement_id"] == ent["id"]
    return _norm(entry.get("ud_no")) == _norm(ud_no) and _norm(entry.get("item_description")) == _norm(
        ent.get("item_description")
    )


def compute_utilization(
    ud: dict[str, Any],
    entitlements: list[dict[str, Any]],
    entries: list[dict[str, Any]],
    *,
    today: date | None = None,
) -> dict[str, Any]:
    """Entitled vs imported vs consumed per UD line, plus warnings."""
    today = today or today_local()
    lines: list[dict[str, Any]] = []
    warnings: list[dict[str, str]] = []
    total_entitled_value = ZERO
    total_imported_value = ZERO
    for ent in entitlements:
        matched = [e for e in entries if entry_matches_entitlement(e, ent, ud["ud_no"])]
        imported = sum((_d(e.get("quantity")) for e in matched if e.get("entry_type") == "IMPORT"), ZERO)
        consumed = sum((_d(e.get("quantity")) for e in matched if e.get("entry_type") == "EXPORT"), ZERO)
        imported_value = sum((_d(e.get("value_bdt")) for e in matched if e.get("entry_type") == "IMPORT"), ZERO)
        entitled = _d(ent.get("entitled_qty"))
        remaining = entitled - imported
        pct = float(imported / entitled * 100) if entitled > 0 else None
        if entitled > 0 and imported > entitled:
            warnings.append(
                {
                    "kind": "OVER_UTILIZED",
                    "message": f"{ent['item_description']}: imported {_fmt(imported)} exceeds UD entitlement {_fmt(entitled)}.",
                }
            )
        if consumed > imported:
            warnings.append(
                {
                    "kind": "CONSUMED_MORE_THAN_IMPORTED",
                    "message": f"{ent['item_description']}: consumed {_fmt(consumed)} is more than imported {_fmt(imported)}.",
                }
            )
        total_entitled_value += _d(ent.get("entitled_value_usd"))
        total_imported_value += imported_value
        lines.append(
            {
                "entitlement_id": ent["id"],
                "item_description": ent["item_description"],
                "hs_code": ent.get("hs_code"),
                "uom": ent.get("uom"),
                "entitled_qty": str(entitled),
                "imported_qty": str(imported),
                "consumed_qty": str(consumed),
                "remaining_entitlement_qty": str(remaining),
                "in_bond_qty": str(imported - consumed),
                "utilization_pct": round(pct, 1) if pct is not None else None,
                "entry_count": len(matched),
            }
        )
    expiry = ud.get("expiry_date")
    if expiry and ud.get("status") != "CLOSED":
        days_left = (expiry - today).days
        if days_left < 0:
            warnings.append({"kind": "EXPIRED", "message": f"UD expired on {expiry.isoformat()}."})
        elif days_left <= EXPIRY_WARNING_DAYS:
            warnings.append({"kind": "EXPIRING", "message": f"UD expires in {days_left} day(s) ({expiry.isoformat()})."})
    return {
        "lines": lines,
        "warnings": warnings,
        "total_entitled_value_usd": str(total_entitled_value),
        "total_imported_value_bdt": str(total_imported_value),
    }


def bond_register_rows(
    entries: list[dict[str, Any]],
    *,
    from_date: date | None = None,
) -> dict[str, Any]:
    """Chronological bond register with running in-bond balance per item.

    Entries dated before ``from_date`` are folded into an opening balance and not listed.
    """
    def key(e: dict[str, Any]) -> str:
        if e.get("ud_entitlement_id") is not None:
            return f"ent:{e['ud_entitlement_id']}"
        return f"desc:{_norm(e.get('item_description'))}"

    ordered = sorted(entries, key=lambda e: (e.get("entry_date") or date.min, e["id"]))
    balance: dict[str, Decimal] = {}
    opening: dict[str, Decimal] = {}
    rows: list[dict[str, Any]] = []
    for e in ordered:
        k = key(e)
        qty = _d(e.get("quantity"))
        sign = Decimal("1") if e.get("entry_type") == "IMPORT" else Decimal("-1")
        balance[k] = balance.get(k, ZERO) + sign * qty
        d = e.get("entry_date")
        if from_date and d and d < from_date:
            opening[k] = balance[k]
            continue
        rows.append(
            {
                "id": e["id"],
                "entry_date": d.isoformat() if d else None,
                "reference_no": e.get("reference_no"),
                "entry_type": e.get("entry_type"),
                "ud_no": e.get("ud_no"),
                "up_no": e.get("up_no"),
                "item_description": e.get("item_description"),
                "in_qty": str(qty) if sign > 0 else "0",
                "out_qty": str(qty) if sign < 0 else "0",
                "value_bdt": str(_d(e.get("value_bdt"))),
                "balance_qty": str(balance[k]),
                "status": e.get("status"),
            }
        )
    return {
        "rows": rows,
        "opening_items": len(opening),
        "opening_balance_qty": str(sum(opening.values(), ZERO)),
        "closing_balance_qty": str(sum(balance.values(), ZERO)),
    }

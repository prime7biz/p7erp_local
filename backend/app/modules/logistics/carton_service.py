"""Carton maths for packing lists: range validation, totals, colour/size breakdown."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal


@dataclass(frozen=True)
class CartonLineIn:
    carton_from: int
    carton_to: int
    color_name: str
    size: str
    pcs_per_carton: int
    net_kg_per_carton: Decimal | None = None
    gross_kg_per_carton: Decimal | None = None
    length_cm: Decimal | None = None
    width_cm: Decimal | None = None
    height_cm: Decimal | None = None


@dataclass
class CartonSummary:
    total_cartons: int = 0
    total_pcs: int = 0
    net_kg: Decimal = Decimal("0")
    gross_kg: Decimal = Decimal("0")
    cbm: Decimal = Decimal("0")
    by_color_size: dict[tuple[str, str], int] = field(default_factory=dict)


class CartonError(ValueError):
    pass


def summarize(lines: list[CartonLineIn]) -> CartonSummary:
    """Raises CartonError for bad ranges, overlapping different ranges, or a cell repeated in one range."""
    ranges: dict[tuple[int, int], list[CartonLineIn]] = {}
    for ln in lines:
        if ln.carton_from < 1 or ln.carton_to < ln.carton_from:
            raise CartonError(f"Carton range {ln.carton_from}–{ln.carton_to} is not valid")
        if ln.pcs_per_carton < 1:
            raise CartonError("Pieces per carton must be at least 1")
        ranges.setdefault((ln.carton_from, ln.carton_to), []).append(ln)

    ordered = sorted(ranges)
    for (a_from, a_to), (b_from, b_to) in zip(ordered, ordered[1:]):
        if b_from <= a_to:
            raise CartonError(f"Cartons {a_from}–{a_to} and {b_from}–{b_to} overlap")

    out = CartonSummary()
    for (c_from, c_to), group in ranges.items():
        cells = [(g.color_name.strip().lower(), g.size.strip().lower()) for g in group]
        if len(set(cells)) != len(cells):
            raise CartonError(f"Cartons {c_from}–{c_to} list the same colour and size twice")
        count = c_to - c_from + 1
        out.total_cartons += count
        first = group[0]
        if first.net_kg_per_carton is not None:
            out.net_kg += first.net_kg_per_carton * count
        if first.gross_kg_per_carton is not None:
            out.gross_kg += first.gross_kg_per_carton * count
        if first.length_cm and first.width_cm and first.height_cm:
            out.cbm += first.length_cm * first.width_cm * first.height_cm / Decimal("1000000") * count
        for g in group:
            pcs = g.pcs_per_carton * count
            out.total_pcs += pcs
            k = (g.color_name.strip(), g.size.strip())
            out.by_color_size[k] = out.by_color_size.get(k, 0) + pcs
    out.cbm = out.cbm.quantize(Decimal("0.001"))
    return out

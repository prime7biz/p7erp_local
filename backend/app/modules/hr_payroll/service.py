"""Payroll calculation and GL mapping helpers."""

from __future__ import annotations


def sum_payroll_lines_net(lines: list[dict]) -> float:
    total = 0.0
    for ln in lines:
        try:
            total += float(ln.get("net_pay") or 0)
        except (TypeError, ValueError):
            continue
    return round(total, 2)

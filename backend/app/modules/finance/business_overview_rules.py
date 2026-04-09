"""Rule-based narrative when AI is off."""


def deterministic_summary(overview: dict) -> dict:
    bullets = []
    debt = overview.get("active_debt_principal") or 0
    if debt and float(debt) > 0:
        bullets.append(f"Active drawn debt principal (facility module): {debt}.")
    rec = overview.get("receivables_open") or 0
    pay = overview.get("payables_open") or 0
    bullets.append(f"Open receivables {rec}; open payables {pay}.")
    emi = overview.get("obligation_emi_by_month") or {}
    if emi:
        bullets.append(f"Scheduled EMI-style outflows in {len(emi)} future month buckets.")
    return {"bullets": bullets, "severity": "info"}

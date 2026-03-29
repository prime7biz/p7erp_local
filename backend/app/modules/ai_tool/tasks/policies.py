from __future__ import annotations

# Task types that must never auto-run without human approval (MCP / API).
APPROVAL_GATED_TYPES: frozenset[str] = frozenset(
    {
        "bulk_finance_post",
        "inventory_auto_po",
        "merch_bulk_commit",
        "payroll_commit",
        "production_order_release",
    }
)


def classify_task(task_type: str) -> tuple[str, bool]:
    """
    Returns (task_category, requires_approval_before_execution).

    - approval_gated: COMMIT_REQUIRED for MCP; stays pending_approval until approved via API.
    - draft: side-effect drafts only (no ERP commit).
    - informational: read-only style checks / summaries.
    """
    tt = (task_type or "").strip().lower()
    if not tt:
        return "informational", False
    if tt in APPROVAL_GATED_TYPES or tt.startswith("commit_"):
        return "approval_gated", True
    if tt.startswith("draft_"):
        return "draft", False
    return "informational", False

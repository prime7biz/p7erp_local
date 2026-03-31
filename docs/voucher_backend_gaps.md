# Voucher module – backend gaps and follow-ups

This document stages **higher-risk or schema-heavy** work that the UI adoption plan does not fully implement. Use it for prioritization and future sprints.

## 1. Approval matrix and enforcement

- **Current:** `GET /vouchers/meta/approval-rules` returns a fixed JSON; `GET /vouchers/{id}/available-actions` uses role **names** (admin/manager/…) for privileged actions.
- **Gap:** Configurable rules by amount, voucher type, branch/department, and `roles.permissions`-style keys (e.g. `finance.voucher.approve`).
- **Follow-up:** New tables or tenant JSON config + enforcement in `update_voucher_status` / `post_voucher`; extend `available-actions` response.

## 2. Voucher audit trail and reasons

- **Current:** Status changes do not persist optional `reason` / comment on the voucher row; generic HTTP `AuditLog` may exist but is not a voucher event log.
- **Gap:** Mandatory remarks for reject/cancel/reverse/reopen/manual FX override stored **in DB** and visible on detail.
- **Follow-up:** `voucher_status_events` (or similar) migration: `voucher_id`, `user_id`, `action`, `from_status`, `to_status`, `comment`, `created_at`.

## 3. Duplicate detection

- **Current:** No similarity check on date/reference/amount/accounts/party.
- **Follow-up:** `POST /vouchers/duplicate-check` or run on save with tunable thresholds; return warnings for UI badges.

## 4. Approval queue API

- **Current:** List endpoint supports single `status_filter`; queue UIs may merge multiple statuses client-side.
- **Gap:** Dedicated `GET /vouchers/approval-queue` with filters, sort, pagination, aging, optional `include_available_actions` to avoid N+1.

## 5. Bill-wise allocation consistency

- **Current:** `allocate_bill_wise` exists; behavior vs posted-only and period rules should be reviewed for strict accounting.
- **Follow-up:** Require `POSTED` voucher where appropriate; align with bill reference lifecycle.

## 6. Finance RBAC

- **Current:** `_require_manager_or_admin` is role-name based.
- **Follow-up:** Mirror `trade_case/permissions.py` / `merch/permissions.py` patterns for finance keys.

## 7. FX and integrations

- **Current:** Backend `_lookup_exchange_rate` can use tenant rate table + public API; frontend may also call open.er-api.com directly.
- **Follow-up:** Single source of truth (backend-only FX for UI) and audit of manual overrides.

## 8. Attachments and PDF

- **Current:** Print route uses browser print; no voucher-specific attachment store.
- **Follow-up:** Attachment entity linked to `voucher_id`; optional server PDF (e.g. WeasyPrint) if product requires.

## 9. Reversal linkage

- **Current:** Reversal creates a new posted voucher; source marked `REVERSED`; explicit `reversal_of_voucher_id` may be missing.
- **Follow-up:** Optional FK for navigation and reporting.

---

*Use this list when planning migrations and API versioning; keep existing routes stable until replacements are ready.*

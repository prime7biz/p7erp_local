# Account Group Redesign — Finance Module

Short architecture/design note for redesigning the ERP "Account Group" feature. Design only; no code.

---

## 1. Data model

Beyond the core fields **code**, **name**, **parent_group_id**, and **nature**, the following are recommended for a robust, reportable, and governable structure.

| Field | Purpose |
|-------|--------|
| **description** | Free-text explanation for auditors and power users; helps onboarding and COA documentation. |
| **reporting_code** | Optional code used in statutory or group reporting (e.g. group consolidation, tax schedules). Enables mapping to external charts without changing internal codes. |
| **default_normal_balance** | Suggested normal balance (debit/credit) for the group. Used when creating accounts under this group and for validation; should align with **nature**. |
| **allow_posting** | Whether ledger postings are allowed directly to this group. Summary/header groups typically set this to false; only leaf groups or groups that double as posting targets set it true. |
| **is_summary_group** | Marks groups that aggregate children only (no direct posting). Drives tree behaviour and report layout (e.g. bold subtotals vs detail lines). |
| **sort_order** | Explicit display order within the same parent. Supports consistent COA presentation and predictable dropdown ordering. |
| **governance_review_date** (or **last_reviewed_at**) | Date of last COA/governance review. Supports periodic "review by" reminders and audit trails. |

**Existing fields** to keep: **tenant_id**, **affects_gross_profit**, **is_bank_group**, **is_active**, **created_at**, **updated_at**. Consider indexing **reporting_code** and **nature** where used in reporting or filters.

---

## 2. API: flat list vs hierarchy

- **Flat list**  
  A single endpoint returning all groups (e.g. with `parent_group_id`) is sufficient for CRUD, bulk operations, and simple dropdowns. The client can build a tree in memory if needed.

- **Hierarchy endpoint**  
  A dedicated endpoint that returns the tree structure (nested children, with optional depth limit) is strongly recommended for UX. It avoids repeated client-side recursion, keeps payload size predictable when using lazy-load or depth=1, and matches how users think about the COA (Group → Type → Main Account). Reporting and Group Summary screens can consume this same shape so that "drill-down" and "expand/collapse" behave consistently. Prefer **one hierarchy endpoint** as the default for list/drill UX, and keep a **flat list** (or flat-with-parent-id) for admin grids, exports, and validation.

**Conclusion:** Provide both; use hierarchy as the primary contract for list/drill and tree UIs; use flat for admin, import, and reporting engines that need a simple list.

---

## 3. UX: Group → Type → Main Account and form complexity

- **Hierarchy (COA best practice)**  
  Present the structure as **Account Group → Account Type → Main Account (ledger)**. Groups define nature and reporting buckets; types add classification (e.g. Bank, Receivable); main accounts are the posting targets. The UI should make this path obvious (e.g. breadcrumbs, tree, or stepped wizard when creating an account).

- **Simplicity vs scalability**  
  For small tenants, a single flat list of groups with an optional "Parent group" dropdown may be enough. For larger or multi-entity setups, a tree view (with expand/collapse and inline or side-panel edit) scales better. Default to the simple view (list + parent dropdown); expose tree view as an option or as the default when group count exceeds a threshold (e.g. &gt; 15–20).

- **Standard vs Advanced form**  
  **Standard form:** code, name, parent group, nature, and optionally description and sort order. Enough for most users. **Advanced form:** add reporting_code, default_normal_balance, allow_posting, is_summary_group, governance/review date, and any tenant-specific flags. Show "Advanced" as a toggle or secondary section so power users and implementers can set reporting and governance without cluttering the default flow.

---

## 4. "Advanced design" view (one paragraph)

An **Advanced design** view can mean a dedicated screen or mode that goes beyond single-record edit and focuses on structure and impact. It could include: **(1)** a **tree preview** of the full Group → Type → Account hierarchy with drag-and-drop reorder and reparent, so structural changes are visible before save; **(2)** **reporting impact**: which reports or templates reference a group (e.g. Group Summary, P&amp;L lines, balance sheet headings) and a short impact note when the user changes nature or reporting_code; **(3)** **template import/export**: upload or download a CSV/Excel of groups (and optionally types and accounts) to bulk-define or clone a COA from a template. Together, these support implementers and auditors who need to see the "big picture" and safely evolve the chart without breaking reports or compliance.

---

## 5. Implementation summary (P7 ERP)

- **Backend (FastAPI):**
  - Migration `054_account_groups_advanced_fields.py`: added `description`, `reporting_code`, `default_normal_balance`, `allow_posting`, `is_summary_group`, `last_reviewed_at` to `account_groups`.
  - `GET /api/v1/finance/account-groups/hierarchy`: returns tree with `children` and `account_count` per group.
  - `POST /api/v1/finance/account-groups/seed`: idempotent seed of default groups (no-op if any exist).
  - Create accepts optional `code`; else auto-generates. Delete blocked if group has children.
- **Frontend:**
  - **Finance > Advance Options** (`/app/accounts/advance-options`): landing page linking to **Account Groups (Advanced)**.
  - **Account Groups** page: List | Hierarchy | Advance design tabs; form with “Show advanced fields” (description, reporting code, default normal balance, allow posting, is summary group, last reviewed); seed default groups button; tree view with edit/delete.
  - Advance design view: full hierarchy preview plus “Reporting impact” note (Trial Balance, Financial Statements, Group Summary, Ratio Analysis).

---

## 6. Ledger (Chart of Accounts) advances

The following extend the **Chart of Accounts** (ledgers) and tie into the group redesign:

- **Account type:** `posting` (default), `statistical` (non-monetary data collection), `header` (roll-up only; no posting). Header and groups with `allow_posting = false` are blocked from voucher postings.
- **Data collection:** For statistical accounts, `statistical_unit` (e.g. Count, SqFt) and optional `statistical_formula` support ratios and allocation.
- **Ledger metadata:** `reporting_code`, `display_order`, `last_reviewed_at`; optional `parent_account_id` for ledger hierarchy.
- **Validation:** Normal balance can be validated against the account group’s `default_normal_balance` (tenant config). Group parent changes are checked for circular reference.
- **Code generation:** Tenant-scoped **CoA config** (`coa_config` table) defines account/group code prefix and width; optional allow manual account number.
- **Import/export:** CSV export and import of groups and accounts with conflict handling (skip / update / abort). See `docs/COA_ADVANCED_DESIGN.md`.

*Document: Account Group Redesign (Finance). Design + implementation summary.*

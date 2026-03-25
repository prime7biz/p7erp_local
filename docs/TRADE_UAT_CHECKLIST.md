# Trade Module UAT Checklist

Use this checklist to verify the Trade (export/import) workflow end-to-end before go-live. Execute in order where possible.

## Pre-requisites

- [ ] Tenant type is `buying_house` or `both` (so Trade Cases, Control Tower, and Logistics are visible).
- [ ] At least one Order and optionally one Proforma Invoice exist for linking.
- [ ] User has permission to create/edit Trade Cases and upload documents (or use default allow — see **TRADE-UAT-017**).
- [ ] For **TRADE-UAT-018:** admin access to **Settings → Configuration** to toggle **Enable Trade module**.

---

## UAT Steps

### TRADE-UAT-001: Create Trade Case from order

1. Go to **App → Trade Cases**.
2. Click **Create Trade Case**.
3. Set Direction = `EXPORT`, Reference = e.g. `UAT-001`, link an Order (and optionally PI).
4. Save.
5. **Pass:** Case appears in list and opens in detail view with stage `DRAFT` or first stage.

---

### TRADE-UAT-002: Add shipment (Logistics)

1. Go to **App → Logistics** (or open case and add shipment from case detail if available).
2. Select the Trade Case created in 001.
3. Enter Shipment reference, ETD, ETA, carrier, BL/AWB if known.
4. Save.
5. **Pass:** Shipment is linked to the case and visible.

---

### TRADE-UAT-003: Upload required documents

1. Open the Trade Case detail.
2. In **Documents**, upload at least: **PI**, **LC** (if applicable), **INVOICE**, **PACKING_LIST**, **BL** (or types required by your stage flow).
3. **Pass:** Each document type shows as uploaded; no upload errors.

---

### TRADE-UAT-004: Stage transitions

1. In Trade Case detail, use **Stage Transition**.
2. Move from initial stage through to **COMMERCIAL** → **LC_OPEN** (if LC required) → **BOOKING** → **DOCS** → **SHIPPED** as per your configuration.
3. If blocked, fix missing documents and retry.
4. **Pass:** Stage moves and stage log shows the transition.

---

### TRADE-UAT-005: Control Tower and alerts

1. Go to **App → Trade Control Tower**.
2. Confirm the UAT case appears in the relevant widgets (e.g. missing docs, at-risk list) when it qualifies.
3. Resolve one alert (e.g. upload missing doc or update ETD) and refresh.
4. **Pass:** Control Tower lists cases correctly; resolving data updates/removes the alert.

---

### TRADE-UAT-006: Margin and audit

1. On the Trade Case, enter or confirm cost/value (or ensure linked PI/order provide it).
2. Check that margin/GP is displayed where configured.
3. Move stage to **SETTLED**.
4. **Pass:** Margin panel shows expected values; stage is SETTLED; activity is visible in audit logs.

---

### TRADE-UAT-007: AI document-due reminder (optional)

1. In AI chat (or automation UI), send a request containing e.g. “trade case document due reminder” or “document due reminder”.
2. Confirm the proposed action is “Trade case document due reminder” and run it.
3. **Pass:** Response includes a summary of trade cases with documents missing before ETD (or “0 case(s)” if none).

---

### TRADE-UAT-008: Tenant visibility

1. Log in as a user in a **manufacturer-only** tenant (if available).
2. **Pass:** Export & Import section is visible, but **Trade Cases**, **Trade Control Tower**, and **Logistics** are not in the menu.
3. Log in as **buying_house** or **both** tenant.
4. **Pass:** Trade Cases, Trade Control Tower, and Logistics are visible.

---

### TRADE-UAT-009: Master contract cost center auto-link

1. Go to **App → Commercial → Master Contracts**.
2. Create a contract and set status `ACTIVE` (or update existing to ACTIVE).
3. Open contract detail.
4. **Pass:** `Cost Center` is visible (auto-linked or selected).

---

### TRADE-UAT-010: BTB utilization cap and color bands

1. Open BTB LCs under one master contract.
2. Verify utilization color bands at `<50`, `<60`, `<65`, `<=70`, and attempt `>70`.
3. **Pass:** UI shows expected band color/label; backend blocks opening above 70%.

---

### TRADE-UAT-011: BTB LC accounting lifecycle posting

1. Go to **App → Commercial → BTB LCs**.
2. Row **Actions → Accounting**.
3. Run in order:
   - Record Opening
   - Record Documents Acceptance
   - Record Realization
4. **Pass:** Lifecycle status changes `OPEN → DOCUMENTS_ACCEPTED → REALIZED`; voucher IDs are shown.

---

### TRADE-UAT-012: Voucher traceability

1. Go to **App → Vouchers**.
2. Find lifecycle vouchers created from BTB LC accounting.
3. **Pass:** Voucher rows show `BTB LC` reference (`btb_lc_id`) and can be traced back to the LC.

---

### TRADE-UAT-013: Utilization and maturity alerts

1. Go to **App → Critical Alerts** and click **Run scan**.
2. Return to **Master Contracts** and **BTB LCs** list pages.
3. Click alert badge from a row.
4. **Pass:** Badge opens Alerts page scoped to that exact `entity_type` + `entity_id`; alerts show utilization or maturity risk correctly.

---

### TRADE-UAT-014: Scheduled daily trade alert scan

1. Confirm the backend is running with the lifespan task that runs the trade alert scan on a **daily** interval (see `backend/app/main.py`).
2. After at least one interval (or after a deploy that triggers startup), open **App → Merchandising → Critical Alerts** (or your alerts list) and verify **new** trade-related alerts exist without anyone clicking **Run scan**.
3. Optionally compare with a manual **Run scan** — counts should be consistent for the same rules.
4. **Pass:** Trade alerts are created/updated by the scheduled job, not only by manual scan.

---

### TRADE-UAT-015: Finance linkage (`trade_case_id`)

1. Create or open a Trade Case and ensure linked finance activity (e.g. voucher or payment run) carries `trade_case_id` where your workflow sets it (migration / API).
2. Open **Trade Case detail → Margin** (or margin API) for that case.
3. **Pass:** Linked vouchers/payment runs appear in trade-linked finance data; margin view reflects linked amounts where implemented.

---

### TRADE-UAT-016: DELETE draft trade document (DRAFT-only)

1. Open a Trade Case in **DRAFT** with at least one uploaded document.
2. Delete a **draft** document via the API/UI (DRAFT case only).
3. Move the case out of DRAFT (or use a non-DRAFT case) and attempt the same delete.
4. **Pass:** Delete succeeds only for DRAFT cases; non-DRAFT returns **400** (or equivalent) and document remains.

---

### TRADE-UAT-017: Trade RBAC permissions

1. On a test role, set `roles.permissions` JSON so `trade.create` is **false** (explicit). Assign to a test user.
2. **Pass:** User cannot create a trade case (API/UI returns forbidden).
3. Set `trade.document.upload` to **false**; **Pass:** Upload is blocked. Restore permissions for production users.

---

### TRADE-UAT-018: Feature flag `trade_enabled`

1. In **Settings → Configuration**, uncheck **Enable Trade module** (sets `tenants.feature_flags.trade_enabled` to `false`) for a `buying_house` or `both` tenant. Save.
2. Refresh the app (session refetch).
3. **Pass:** Trade Cases, Control Tower, Logistics, and trade report routes are hidden or redirect; sidebar matches.
4. Re-enable the checkbox and **Pass:** Trade navigation and routes return.

---

## Sign-off

| Role        | Name | Date | Signature |
|------------|------|------|-----------|
| Test lead  |      |      |           |
| Product    |      |      |           |

When all steps pass, use **docs/TRADE_GO_LIVE_CRITERIA.md** for go/no-go decision.

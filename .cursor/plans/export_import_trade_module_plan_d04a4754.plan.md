
---
## Part 2: Advanced Trade Module – Improvement Plan

**Goal:** Elevate the Trade module to advanced level: hardening, automation, finance linkage, and go-live readiness.

---

### Phase F: Backend Hardening & Finance Linkage

- **Scheduled trade alert rules:** Run trade alert rules (e.g. daily) alongside the existing merch alert scan. Plug point: same lifespan background task in `backend/app/main.py` that runs `_run_alert_scan_all_tenants()` — add a parallel or sequential call to a trade alert scan (e.g. `run_trade_alert_scan(db, tenant_id)`) on the same interval or a separate daily schedule; alternatively use a small worker/APScheduler if preferred. Prefer lifespan for consistency with existing merch scan.
- **Finance linkage:** Add `trade_case_id` (FK, nullable) to one relevant finance table — either `vouchers` or `payment_run` (choose one that fits margin/cost tracing). Expose it in margin APIs and in voucher/payment response schemas so UI and reports can link finance to trade cases.
- **DELETE draft document:** Add an endpoint to delete a draft document (last version only). Support optional soft-delete (e.g. `deleted_at`) or hard delete; document behavior in API spec.
- **Permissions:** If a permission matrix exists (e.g. in roles/settings), add and wire: `trade.create`, `trade.transition`, `trade.document.upload` for Trade module actions.
- **Exit criteria:** Trade scan runs on schedule; voucher (or payment_run) optionally linked to trade case; draft document deletable; permissions wired if applicable.

---

### Phase G: Frontend & UX Advancements

- **Document Flow page:** Extend to include Trade Case and Shipment documents, or add a clear link from Document Flow to the Trade Case doc vault so users can reach trade docs from one place.
- **Trade Cases list:** Stronger filters: date range, stage, at-risk. Optional export (CSV/Excel) for the filtered list.
- **Control Tower:** Drill-down by alert type; link to alerts list filtered by `entity_type` (e.g. trade_case, shipment) so users can jump from dashboard to relevant alerts.
- **Optional:** Simple trade report: cases by stage, shipments by status (summary view).
- **Exit criteria:** Document Flow shows trade docs path; list has filters and export; Control Tower has drill-down by alert type and link to filtered alerts.

---

### Phase H: Automation, Storage & Go-Live

- **AI automation rule (if `ai_tool` exists):** Add a reminder rule for "Trade case document due" before ETD (e.g. X days before ETD), using existing automation/reminder machinery.
- **Feature-flag or tenant setting:** Control visibility of the Trade section (sidebar + routes) so it is shown only for tenants using export/import (e.g. tenant type or explicit feature flag).
- **Media / storage:** Document env-based config for S3-compatible object store for `trade_docs` (production-scale); keep local file storage as dev fallback and document the production path.
- **UAT checklist:** Create case from order → PI/LC → shipment → docs → transitions → resolve alert → verify audit and margin; sign-off.
- **SOP:** Update `docs/TRADE_MODULE_SOP.md` with advanced steps (scheduled scan, finance link, draft delete, permissions) and troubleshooting.
- **Exit criteria:** AI reminder optional; feature-flag or tenant setting in place; SOP and UAT checklist updated; storage path documented.

---

### Order of Implementation (Advanced)

**F → G → H.** Within each phase: backend work before frontend where applicable (e.g. F backend first, then F frontend if any; G/H similarly).

# Go-Live UAT Evidence (Engineering Run)

**Date:** 2026-06-05  
**Scope:** Full big-bang (Merch, Inventory, Manufacturing, Trade, Finance, HR, portals)  
**Environment:** Local Docker (`docker compose`)

This file records **automated engineering evidence**. Business owners must still sign manual UAT sheets in the linked checklists.

---

## Phase 0 — Build & test evidence

| Check | Result | Notes |
|-------|--------|-------|
| `alembic upgrade head` | **PASS** | At revision **182 (head)** |
| Backend `import app.main` | **PASS** | Docker container |
| Backend `pytest` (full) | **PASS** | **352 passed**, 3 skipped, 0 failed |
| Frontend `npm run lint` | **PASS** | 0 errors, 1 warning (react-hooks) |
| Frontend `npm run build` | **PASS** | `dist/` produced |
| Frontend `npm test` (vitest) | **PASS** | 23 passed |
| `docker compose -f docker-compose.prod.yml config` | **PASS** | Valid from repo root |

---

## New go-live integration tests (Phase 2)

| Test file | Scenario | Result |
|-----------|----------|--------|
| `test_hr_go_live_integration.py` | Leave request approve | **PASS** |
| `test_hr_go_live_integration.py` | Payroll run finalize → approve → **finance post** | **PASS** |
| `test_trade_case_go_live_integration.py` | Trade case create → PI upload → COMMERCIAL transition | **PASS** |
| `test_inventory_go_live_integration.py` | PO → GRN receive → delivery challan **POSTED** | **PASS** |

Run command:

```powershell
docker compose exec -e GEMINI_ENABLED=false -e OPENROUTER_ENABLED=false -e OLLAMA_ENABLED=false backend pytest tests/test_hr_go_live_integration.py tests/test_trade_case_go_live_integration.py tests/test_inventory_go_live_integration.py -v
```

---

## Phase 9 — Go-live data remediation (engineering)

### Numeric migrations (revisions 180–182)

| Revision | Scope | Upgrade | Downgrade spot-check |
|----------|-------|---------|----------------------|
| **180** | Finance money/qty `String` → `Numeric(18,4)` | **PASS** | **PASS** (`182 → 181 → 180 → 179`, then `upgrade head`) |
| **181** | Inventory movement-layer qty/price | **PASS** | **PASS** (same run) |
| **182** | HR payroll/leave/attendance, wastage, knitting qty | **PASS** | **PASS** (same run) |

Spot-check commands (local Docker dev DB only):

```powershell
docker compose exec backend alembic current
docker compose exec backend alembic downgrade -1
docker compose exec backend alembic downgrade -1
docker compose exec backend alembic downgrade -1
docker compose exec backend alembic current
docker compose exec backend alembic upgrade head
docker compose exec backend alembic current
```

**Result:** `182 → 181 → 180 → 179` with no errors; restored to **182 (head)**.

### Automated remediation tests

| Test file | Scenario | Result |
|-----------|----------|--------|
| `test_go_live_data_remediation.py` | Negative voucher amount rejected; qty non-neg coercion; Decimal → API money string | **PASS** |
| `test_money_schema_nonneg.py` | `MoneyStrNonNeg` / `QtyStrNonNeg` validators | **PASS** |
| `test_delete_guards_integration.py` | Customer delete blocked when inquiry exists (409) | **PASS** |

Run command:

```powershell
docker compose exec backend pytest tests/test_go_live_data_remediation.py tests/test_delete_guards_integration.py tests/test_money_schema_nonneg.py -v
```

### New tenant minimum seed (Phase 8)

```powershell
docker compose exec backend python scripts/seed_new_tenant_minimum.py --company-code <CODE>
```

Admin tenant create also seeds system COA at create time (`seed_tenant_system_coa`).

---

## Manual edit / delete UAT (business sign-off)

Execute on a **staging or dev tenant** (not production first). Mark Pass/Fail in your UAT sheet.

### Field edit (PATCH) — expect 200 and persisted values

| # | Area | Steps | Expected |
|---|------|-------|----------|
| E1 | HR performance | Open cycle → edit title/dates via PATCH → reload | Changes saved |
| E2 | HR recruitment | Edit requisition title or candidate contact via PATCH | Changes saved |
| E3 | Manufacturing routing | Edit routing template name or step sequence via PATCH | Changes saved |
| E4 | Finance voucher (draft) | Edit draft line amount (positive string) → save | Amount stored; list shows formatted string |
| E5 | Inventory PO line | Edit draft PO quantity (positive) → save | Qty stored; API returns string e.g. `10.0000` |

### Delete guards — expect **409** when dependents exist

| # | Record | Setup | Delete attempt | Expected |
|---|--------|-------|----------------|----------|
| D1 | Customer | Customer linked to inquiry | DELETE customer | **409** with inquiry dependency message |
| D2 | Order | Order with downstream docs (PI, shipment, etc.) | DELETE order | **409** |
| D3 | Quotation | Quotation converted to order | DELETE quotation | **409** |
| D4 | Vendor | Vendor on open PO or GRN | DELETE vendor | **409** |
| D5 | Currency rate | Rate referenced by open commercial doc | DELETE rate | **409** |
| D6 | Production master | Sewing line / shift / crew role in use | DELETE master row | **409** |

### Delete allowed — expect **200/204** when no dependents

| # | Record | Steps | Expected |
|---|--------|-------|----------|
| D7 | Customer | Create standalone customer (no inquiries/orders) → delete | **Success** |
| D8 | Draft PO | Create draft PO with no GRN → delete | **Success** |

### Intentionally not editable (workflow / audit only)

| Area | Use instead |
|------|-------------|
| Posted finance vouchers | Reversal / adjustment voucher |
| Closed accounting periods | Reopen procedure per finance SOP |
| Employee documents | Upload new document row |
| Employee status history | Add new history row |

See `docs/GO_LIVE_PRODUCTION_HARDENING.md` for PATCH route list and immutability notes.

---

## Finance UAT (FIN-UAT-001..044)

| Status | Evidence |
|--------|----------|
| **Code mapped** | `docs/FINANCE_UAT_CLOSURE_REPORT.md` — 44/44 cases mapped |
| **Automated regression** | Finance pytest modules pass in full suite (`test_auto_posting_service`, `test_voucher_controls_warnings`, `test_system_coa_seeding`, commercial lock/timeline tests) |
| **Manual execution** | **Pending business sign-off** — run `docs/FINANCE_UAT_TEST_CASES.md` on staging/production tenant and mark Pass/Fail |

**Hard gate:** 100% pass on **Critical** finance cases before finance go-live.

---

## HR UAT

| Status | Evidence |
|--------|----------|
| **Engineering closure** | `docs/HR_UAT_CLOSURE_REPORT.md` — 35/35 automated critical path (prior run) |
| **New HTTP tests** | Leave approve + payroll post (this run) |
| **HR demo seed** | `seed_hr_demo.py` on `LAKH806201` — **PASS** |
| **Manual verify scripts** | `verify_hr_uat_critical_api.py` expects tenant `LAKHSMA4821` — align company code or update script before live UAT walkthrough |

Run manual checklist: `docs/HR_UAT_TEST_CASES.md` + `docs/HR_UAT_CRITICAL_RUN_SHEET_2026-03-12.md`.

---

## Trade UAT

| Status | Evidence |
|--------|----------|
| **Automated** | `test_trade_case_go_live_integration.py` — **PASS** |
| **Manual** | Execute `docs/TRADE_UAT_CHECKLIST.md` (TRADE-UAT-001..018) on buying_house/both tenant |

Seed for practice:

```powershell
docker compose exec backend python scripts/seed_lakhsma_interconnected_demo.py
docker compose exec backend python scripts/seed_trade_import_export_workflow_demo.py --tenant-code LAKH806201
```

---

## Inventory ↔ Finance GL UAT

| Case | Automated proxy | Result |
|------|-----------------|--------|
| U1 GRN receive | Inventory integration test (stock IN) | **PASS** |
| U2 DC POSTED | Inventory integration test (stock OUT) | **PASS** |
| U3–U10 GL reconciliation | Manual | Run `docs/INVENTORY_FINANCE_UAT.md` on tenant with CoA mapping |

---

## Merchandising end-to-end

| Check | Result |
|-------|--------|
| Lakhsma interconnected seed | **PASS** (`LKH-CUST-01` marker) |
| Merch pytest suite | **PASS** (tenant isolation, BOM, samples, control tower, reports) |
| `verify_merch_workflow_release.py` | **Needs credentials** — expects `LAKHSMA4821` + API login; use Lakhsma tenant credentials or update script env |

---

## Tenant-type scorecard (automated layer)

| Layer | Manufacturer | Buying house | Both |
|-------|:------------:|:------------:|:----:|
| Platform & tests | ✅ | ✅ | ✅ |
| Merch + inventory HTTP | ✅ | ✅ | ✅ |
| Manufacturing (code) | ✅ | N/A | ✅ |
| Trade HTTP | N/A | ✅ | ✅ |
| Finance (automated) | ✅ | ✅ | ✅ |
| HR HTTP + payroll post | ✅ | ✅ | ✅ |
| **Business sign-off** | ☐ | ☐ | ☐ |

---

## Sign-off (business — fill after manual UAT)

| Role | Name | Date | Decision |
|------|------|------|----------|
| Finance lead | | | |
| HR lead | | | |
| Operations lead | | | |
| Project owner | | | |

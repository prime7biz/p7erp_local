# Master Contract, Cost Center & BTB LC Finance Linkage

This document describes how **Master Export LC / Sales Contracts** link to **cost centers** in accounting, and how **Back-to-Back (BTB) LCs** drive **LC liability**, **blocked credit facility**, **import bill liability**, and **realization** in the books.

---

## 1. Overview

- **Master Contract** = customer-side Master Export LC or Sales Contract. It is the parent under which multiple **BTB LCs** (back-to-back LCs) can be opened to pay vendors (raw material / import).
- Every Master Contract must have a **cost center** in accounting. All payments (BTB LC, bank payment, cash) and **Cost of Goods Sold (COGS)** type expenses for that contract are allocated to this cost center.
- **BTB LC** is a payment instrument to the vendor. When a BTB LC is opened:
  1. An **upcoming import LC liability** is recorded in accounting.
  2. Bank **credit facility** used for the LC becomes **blocked**.
- When LC **documents are accepted** (per payment terms e.g. 90/120 days):
  3. **Import bill liability** is created (we call it **maturity against import bill**).
- On **maturity date**:
  4. The import bill is **realized** (liability settled, bank debited).

---

## 2. Master Contract ↔ Cost Center

| Step | Action |
|------|--------|
| When a **Master LC or Sales Contract is opened** | A **cost center** is required. The system can auto-create one (e.g. code = `MC-{reference}`) or the user can link an existing cost center. |
| When **payments** are made | Any payment for raw material purchase or other COGS-type expense tied to this contract (BTB LC, bank payment, or cash) should use this **cost center** on the voucher lines. |
| Reporting | Cost center-wise P&L and expense reports show profitability per master contract. |

**Schema:**

- `master_contracts.cost_center_id` → FK to `cost_centers.id`. Optional at create; can be set when contract is activated or later. When creating a new master contract with status OPEN/ACTIVE, the app can create a cost center automatically if none is linked.

**Usage:**

- Voucher entry (payment, expense, COGS): user selects or system suggests the **cost center** from the linked Master Contract (e.g. when payment is linked to a trade case / BTB LC that rolls up to a master contract).

---

## 3. BTB LC → Accounting Lifecycle

### 3.1 When BTB LC is opened

- **LC liability (upcoming import LC)**  
  - Record: We have an obligation to pay the bank (or the import will be settled under this LC).  
  - Typical posting (conceptual):  
    - **Dr** LC Liability / Import LC Obligation (expense or liability account)  
    - **Cr** Bank LC Liability / Credit facility (liability)  
  - Or as per your chart: **Dr** “Upcoming Import LC” (asset/expense), **Cr** “LC Liability” (liability).
- **Blocked credit facility**  
  - The bank’s credit line used for this BTB LC is blocked until the LC is utilized and settled.  
  - Tracked in the same or a related voucher; amount = LC amount.  
- **Cost center**  
  - All such entries use the **cost center** of the **Master Contract** to which this BTB LC belongs (`btb_lcs.master_contract_id` → `master_contracts.cost_center_id`).

### 3.2 When documents are accepted (per LC terms: 90/120 days etc.)

- **Import bill liability (maturity against import bill)**  
  - The obligation becomes a definite **import bill payable** at maturity.  
  - Posting (conceptual):  
    - **Dr** LC Liability (clear the “upcoming” obligation)  
    - **Cr** Import Bill Liability / Maturity against import bill (liability)  
  - Store **maturity_date** and **maturity_amount** (already on `btb_lcs`).  
- **Cost center**  
  - Same cost center as the master contract.

### 3.3 On maturity date – realization

- **Realize import bill**  
  - Settle the import bill liability and record actual payment to bank.  
  - Posting (conceptual):  
    - **Dr** Import Bill Liability  
    - **Cr** Bank  
  - Mark the import bill as **realized** (e.g. `btb_lc_accounting.realization_voucher_id` and status REALIZED).  
- **Cost center**  
  - Same cost center.

---

## 4. Data Model (Summary)

| Entity | Purpose |
|--------|--------|
| `master_contracts.cost_center_id` | Links master contract to one cost center for all related payments and COGS. |
| `btb_lc_accounting` | One row per BTB LC to track finance lifecycle: `lc_open_voucher_id`, `import_bill_voucher_id`, `maturity_date`, `realization_voucher_id`, `status` (OPEN \| DOCUMENTS_ACCEPTED \| REALIZED). |
| Voucher lines | Use `cost_center_id` from the master contract when posting BTB LC open, import bill acceptance, and realization. |
| Voucher | Optional `btb_lc_id` or reference in description for traceability. |

---

## 5. Account Types (to configure in CoA)

- **LC liability / Upcoming import LC** – liability (or expense) for LC obligation when BTB is opened.
- **Blocked credit facility** – liability (or contra to bank facility) for the blocked portion.
- **Import bill liability / Maturity against import bill** – liability until maturity.
- **Bank** – for realization payment.

Exact account names and groups can be tenant-specific; the above are the logical roles.

---

## 6. Solid Link Chain (Reference)

1. **Master Contract** ↔ **Cost Center** (one-to-one for allocation).
2. **Master Contract** → many **BTB LCs** (existing).
3. **BTB LC opened** → **LC liability** + **blocked facility** (voucher + optional `btb_lc_accounting.lc_open_voucher_id`).
4. **Documents accepted** → **Import bill liability** (voucher + `btb_lc_accounting.import_bill_voucher_id`, maturity date stored).
5. **Maturity date** → **Realize** import bill (voucher + `btb_lc_accounting.realization_voucher_id`, status REALIZED).
6. Every voucher line in this chain uses the **cost center** of the **Master Contract** linked to the BTB LC.

This gives a single, auditable trail from master contract and cost center through BTB LC to liability and realization.

---

## 7. API endpoints (implemented)

### Commercial

- `GET /api/v1/commercial/btb-lcs/{lc_id}/accounting`  
  Returns lifecycle row (`OPEN | DOCUMENTS_ACCEPTED | REALIZED`) and linked voucher IDs.
- `POST /api/v1/commercial/btb-lcs/{lc_id}/record-opening`  
  Creates LC open voucher (`LCJ`) and stores `lc_open_voucher_id`.
- `POST /api/v1/commercial/btb-lcs/{lc_id}/record-documents-acceptance`  
  Creates import bill voucher (`LCJ`), sets `maturity_date`, stores `import_bill_voucher_id`.
- `POST /api/v1/commercial/btb-lcs/{lc_id}/record-realization`  
  Creates realization voucher (`LCJ`), stores `realization_voucher_id`, marks lifecycle `REALIZED`.

### Finance

- Voucher payload now supports `btb_lc_id` for direct traceability.
- BTB lifecycle vouchers created by commercial APIs are tagged with `btb_lc_id`.

---

## 8. Risk controls and alerts (implemented)

- BTB opening cap is enforced server-side at **70%** of parent master contract amount.
- Utilization bands in UI:
  - `< 50%` very good
  - `< 60%` good
  - `< 65%` satisfactory
  - `<= 70%` no credit zone
  - `> 70%` red flag
- Alert engine rules:
  - `master_contract_btb_utilization_risk`
  - `btb_lc_maturity_due_or_overdue`

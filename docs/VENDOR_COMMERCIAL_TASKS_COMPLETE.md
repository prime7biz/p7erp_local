# Vendor & Commercial Tasks – Completion Checklist

This document confirms that the three development tasks (backend routers, VendorsPage rebuild, MasterContract tracking) are **implemented and complete** in the codebase.

---

## Task 1: Build/extend backend routers

| Requirement | Status | Location |
|-------------|--------|----------|
| Vendor advanced CRUD | Done | `backend/app/modules/inventory/router.py` – list/create/get/patch/delete with ledger_id, default_currency, payment_terms_days, vendor_type, country, city, banking, credit_limit; filters: vendor_type, currency, has_ledger |
| MasterContract CRUD | Done | `backend/app/modules/commercial/router.py` – list, get, create, PATCH update; utilization recomputed on get and after BTB LC create/update |
| BtbLc with parent, vendor, vendor-PI linkage | Done | Same router – create/update with master_contract_id, vendor_id, vendor_proforma_invoice_id, purchase_order_id; validation for IMPORT PI and master remaining amount |
| PO vendor-select + currency | Done | `backend/app/modules/inventory/router.py` – PO create accepts vendor_id; currency defaulted from vendor.default_currency; currency, exchange_rate_to_base, base_total_amount, btb_lc_id on PO |
| AP base-currency settlement | Done | `backend/app/modules/finance/router.py` – PaymentRun/PaymentRunItem store base_currency, source_currency, fx_rate_to_base, base_amount; execute uses base amounts for voucher posting |

---

## Task 2: Rebuild VendorsPage as advanced workspace UI

| Requirement | Status | Location |
|-------------|--------|----------|
| KPI strip | Done | `frontend/src/pages/app/VendorsPage.tsx` + `VendorKpiCards.tsx` – total, active, ledger-linked, foreign-currency |
| Smart filters | Done | `VendorFilterBar.tsx` – search, active only, vendor type, currency, has ledger, table/cards toggle |
| Split view | Done | VendorsPage – list (table or cards) + right-hand detail drawer |
| Tabbed detail drawer: Profile, Commercial, Banking, Accounting, Activity | Done | `VendorDetailDrawer.tsx` – tabs: Profile, Commercial, Banking, Accounting, Activity, Edit |

---

## Task 3: Wire MasterContract tracking panel

| Requirement | Status | Location |
|-------------|--------|----------|
| Show all BTB LCs under Master Contract with utilization | Done | `frontend/src/pages/app/commercial/MasterContractsPage.tsx` – row click opens drawer with utilization bar (used/remaining), child BTB LC table, editable contract fields |
| Vendor PI flow | Done | Proforma Invoices: direction EXPORT/IMPORT, vendor_id for IMPORT; BtbLcsPage and ProformaInvoiceFormPage – Vendor PI (IMPORT) selection for BTB LC |
| PO vendor-select + currency defaults | Done | PO create/UI uses vendor selection; backend defaults currency from vendor.default_currency; PO response includes currency, base_total_amount |

---

## Quick verification

- **Backend:** `python -m py_compile backend/app/modules/inventory/router.py backend/app/modules/commercial/router.py backend/app/modules/finance/router.py`
- **Frontend:** `npm run build` in `frontend/`
- **Routes:** Vendors at `/app/inventory/vendors`, Master Contracts at `/app/commercial/master-contracts`, BTB LCs at `/app/commercial/btb-lcs`, Payment Runs at `/app/banking/payment-runs`

All three tasks are complete. Optional next steps: more KPIs, preset permissions for settlement audit, or reporting exports.

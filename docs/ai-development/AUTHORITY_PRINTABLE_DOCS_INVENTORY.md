# Printable documents inventory (authority Phase 5–6)

Flag: `user_authority_classes_v1` (default OFF). Phase 5 locks **formatted** P&L / Balance Sheet doors (statements, classic financial statements, comparative MIS, Management Performance posted-profit summary, AI P&L/BS commentary) and switches **statement** exports on phone to **Save PDF** + **Share** (`shareOrSaveBlob`).

**Confidentiality bound (accepted design):** Trial Balance stays open to Class 2+ with Finance. Ratio analysis / MIS health may still show derived profitability figures; Phase 5 does **not** make net profit itself Class-1-only. Extending that would be a later scope change.

## Already have server PDF (or blob) + phone-friendly save

| Document | Source | Phone UX (Phase 5/6) |
| --- | --- | --- |
| Trial Balance / Balance Sheet / P&L / cash / funds / ratios | `GET /finance/statements/{report}/export` | StatementExportBar: Save PDF + Share; desktop keeps Print |
| HR payslips | payroll PDF download | `saveBlob` |
| Production cutting bundles | `GET /production/cutting/bundles/barcode-pdf/{id}` | Phone: Save PDF + Share (`shareOrSaveBlob`); desktop keeps Download |
| Gate pass | `GET /inventory/enhanced-gate-passes/{id}/pdf` | Detail page Save PDF + Share |
| Purchase order | `GET /inventory/purchase-orders/{id}/pdf` | `PurchaseOrderPrintPage` via `PrintPdfToolbarActions` |
| Goods receiving (GRN) | `GET /inventory/goods-receiving/{id}/pdf` | `GoodsReceivingPrintPage` via `PrintPdfToolbarActions` |
| Inquiry / Quotation / Order / Style / Customer | `GET /{resource}/{id}/pdf` (merch.access) | Print pages: Save PDF + Share via `PrintPdfToolbarActions` |
| Proforma invoice (PI) | `GET /commercial/proforma-invoices/{id}/pdf` | Print page via `PrintPdfToolbarActions` |
| Commercial invoice | `GET /commercial/invoices/{id}/pdf` | Detail page via `PrintPdfToolbarActions` |
| Mushak 6.3 | `GET /compliance/bd/mushak/6-3/{invoiceId}/pdf` | `Mushak63PrintPage` via `PrintPdfToolbarActions` |

## Browser HTML print only (deferred PDF)

| Document | Route / component | Notes |
| --- | --- | --- |
| Voucher | `VoucherPrintPage`, `PrintPreviewModal` | Desktop Print OK; need server PDF + Bangla font for phone Share |
| Gate pass list CSV | reports page | CSV via `saveBlob` |
| Cheque | `ChequePrintPage` | `window.print` |
| Payment advice | `PaymentAdvicePage` | `window.print` |
| Party ledger | `PartyLedgerDetailPage` | `window.print` |
| Employee profile / organogram / daily attendance | HR pages | Mixed print / PNG / CSV |
| Tutorials / legal | print helpers | Not operational docs |

## Phase 6 expectation

For each HTML-only document in a module roll-out: add a permission-checked, tenant-scoped PDF endpoint (Bangla-capable), then replace phone Print with Save PDF + Share. Desktop may keep Print. Finance voucher/cheque/advice/ledger HTML prints remain deferred beyond Phase 6.

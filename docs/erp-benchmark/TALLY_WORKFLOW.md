# Tally (TallyPrime / Tally.ERP 9) – how it works

Research date: 2026-11-04. Current release at time of writing: **TallyPrime 7.1** (20 May 2026).
Sources are mostly the official TallyHelp site (`help.tallysolutions.com`); partner/vendor blogs are marked.
Items marked *(uncertain)* could not be fully confirmed.

---

## 1. The core idea in one paragraph

Tally is built from only two things: **masters** (setup records: ledgers, groups, stock items, godowns, units, voucher types) and **vouchers** (transactions: payment, receipt, sales, purchase, journal, stock journal ...). Saving a voucher (`Ctrl+A`) **posts it immediately** — there is no draft → post step. Every report is computed live from vouchers, and every number in every report **drills down** to the vouchers behind it. Features are switched on gradually per company (`F11`) and per screen (`F12`), so a small shop sees a simple screen and a manufacturer can turn on depth.

---

## 2. Accounting workflow (step by step)

1. **Create company** – name, financial year start, base currency. Navigation starts at the **Gateway of Tally** menu.
2. **Masters**
   - **Groups:** 28 predefined groups (15 primary, 13 sub-groups) such as Capital Account, Current Assets, Sundry Debtors, Sundry Creditors, Duties & Taxes, Bank Accounts. The group a ledger sits under **decides its behaviour** (e.g. Sundry Debtors/Creditors get bill-wise tracking; Duties & Taxes ledgers get a tax type).
   - **Ledgers:** one per party, bank, expense, income, tax.
   - **Cost categories / cost centres**, **budgets**, **scenarios**, **currencies**.
   - **Voucher types:** custom types are derived from base types (e.g. "Export Sales" from Sales), each with its own numbering method and optional **voucher class** (presets for ledgers/godowns).
3. **Voucher entry** (keyboard-first):
   | Key | Voucher |
   |---|---|
   | F4 | Contra (cash ↔ bank) |
   | F5 | Payment |
   | F6 | Receipt |
   | F7 | Journal |
   | F8 | Sales |
   | F9 | Purchase |
   | F10 | Other vouchers list (TallyPrime) |
   | Alt+F6 / Alt+F5 | Credit Note / Debit Note (TallyPrime; ERP 9 used Ctrl+F8 / Ctrl+F9) |
   | Alt+C | Create a missing master **from inside** the voucher |
   | Alt+G (Go To) | Open any other screen on top, come back without losing the half-typed voucher |
   | Ctrl+A | Accept (save = post) |
   - Modes: single-entry vs double-entry; **Accounting Invoice** vs **Item Invoice** (Ctrl+H switches mode).
   - **Bill-wise details** while entering: `New Ref`, `Agst Ref`, `Advance`, `On Account`. This single step feeds all outstanding/ageing reports.
   - Special vouchers: **Post-dated**, **Optional** (not in books, used in "scenario" reports), **Memorandum**, **Reversing Journal**.
4. **Banking:** cheque printing from payment voucher, **bank reconciliation** (manual or by importing the bank statement), e-payments, "Connected Banking" in newer releases.
5. **Outstandings:** receivables/payables with ageing, interest calculation, reminder letters; credit limit and credit days on party ledgers *(uncertain whether over-limit only warns or can block)*.
6. **Reports:** Balance Sheet, P&L, Trial Balance, Day Book, Cash/Fund Flow, Ratio Analysis, Exception reports (negative ledgers, negative stock, overdue). All drill down → group → ledger → monthly summary → voucher, and the voucher can be edited right there.
7. **No year-end closing.** Change period with `F2`; closing balances carry forward automatically. Splitting data into per-year companies is optional (only when data gets large).
8. **Security & audit:** user roles / security levels (per voucher type: create / alter / print), **Edit Log** in TallyPrime (who changed what), Tally Vault (encryption), backups, multi-currency.
9. **Statutory (India):** GST, TDS, TCS. **e-Invoice and e-Way Bill** are generated online **during voucher save** and stored on the voucher. Bangladesh **Mushak VAT is not built in** — local partners add it via TDL customisation.

---

## 3. Inventory, orders and manufacturing workflow

### 3.1 Procure-to-pay

| # | Step | Voucher | Effect |
|---|---|---|---|
| 1 | Order to supplier | **Purchase Order** | No accounting / stock effect; appears in "Order Outstandings". |
| 2 | Goods arrive | **Receipt Note** (GRN) | Stock up. Linked by **Tracking No.** Value shows as **"Purchase Bills to Come"** in TB/P&L. |
| 3 | Reject before bill | **Rejections Out** | Stock down, against the Receipt Note tracking no. |
| 4 | Supplier bill | **Purchase** | Pull Receipt Note / PO details in. Forgetting the link is Tally's own "#1 cause of bookkeeping clutter". |
| 5 | Return after bill | **Debit Note** | Against the original invoice. |
| 6 | Pay | **Payment** | Settled bill-by-bill (`Agst Ref`). |

The chain is **optional**: PO → Purchase, PO → GRN → Purchase, or GRN without PO are all allowed.

### 3.2 Order-to-cash

| # | Step | Voucher | Effect |
|---|---|---|---|
| 1 | Customer order | **Sales Order** | Partial cancel / **pre-close with reason** supported. |
| 2 | Dispatch | **Delivery Note** | Stock down. Value shows as **"Sales Bills to Make"**. |
| 3 | Reject before invoice | **Rejections In** | Stock back up. |
| 4 | Invoice | **Sales** | Pulls order/delivery details. Warns on negative stock. |
| 5 | Return after invoice | **Credit Note** | Against original invoice. |
| 6 | Collect | **Receipt** | Bill-wise. |

### 3.3 How documents are linked
- **Order No.** links orders → notes → invoices (what was *promised*).
- **Tracking No.** links receipt/delivery notes → rejections → invoices (what physically *moved*).
- From these links Tally gives **exception reports**: "Goods delivered but orders not received", "Goods received but orders not sent", "Goods received but bills not received", "Bills received but goods not received", Order Outstandings with ageing.

### 3.4 Inventory masters and vouchers
- **Stock Groups** (hierarchy, e.g. brand) + **Stock Categories** (second independent axis, e.g. product type).
- **Units:** simple, compound (Kg = 1000 g), and **alternate units per item** (Box = 10 Nos) which can be **overridden on each voucher**.
- **Godowns:** hierarchical, with flags "Our stock with third party" (counted in our value) and "Third party stock with us" (not counted) — used for job work and consignment.
- **Batches** with mfg/expiry dates; **price levels & price lists** with quantity slabs; **reorder levels** (simple or consumption-based).
- **Stock Journal** (transfers, adjustments; transit loss captured in the same voucher), **Physical Stock** (enter counted qty, system computes difference), **Material In / Out** (job work), **Manufacturing Journal**.
- **Actual vs Billed quantity** columns (e.g. 13 shipped, 12 billed — 1 free).

### 3.5 Manufacturing
- **BOM** on the finished item; **multiple named BOMs**; each line is Component / Co-product / By-product / Scrap with cost-share %.
- **Manufacturing Journal:** pick product + BOM + qty → components auto-fill, add overhead lines, see effective cost.
- **Job work** (principal and job-worker side) with Job Work Out/In orders and stock-with-job-worker reports.
- **Job costing** via cost centres; **cost tracking numbers** for profit per order.

### 3.6 Valuation and reports
- Costing method **per item**: Average (default), FIFO, FIFO perpetual, LIFO, last purchase, standard, monthly average, zero. Stock Summary can compare methods side by side.
- Negative stock is a **warning only**.
- **"Integrate accounts with inventory"** (F11) – when on, closing stock in the Balance Sheet comes live from stock.
- Reports: Stock Summary, Movement Analysis, Stock Ageing, Godown Summary, Reorder Status, Batch Summary, registers — all drill down to the voucher.

### 3.7 Payroll (brief)
Employee groups → employees → **pay heads** (earnings/deductions/employer contributions) → **attendance & production types** (supports piece-rate) → salary structure per group (effective-dated) → monthly **Attendance voucher** → **Payroll voucher** (auto-fill) → Payment vouchers → payslips and statutory forms (India PF/ESI).

### 3.8 Multi-branch and multi-user
- Branch **synchronisation** (client/server, rules per voucher type, branch always initiates). Many branches → "mirror companies" at head office.
- **TallyPrime Server:** multi-user concurrency with snapshots; heavy jobs (import, sync) slow others; restore/split block everyone.

### 3.9 Configuration philosophy
- **F11 Features** per company, in three tiers: default → "Show more features" → "Show all features".
- **F12 Configure** per screen (voucher type, master form, report).
- Inactive voucher types (PO, Receipt Note, Rejections ...) are **activated the first time you try to use them**.
- Two-level switches: company switch (F11 Enable Batches) reveals an item-level switch ("Maintain in Batches").

---

## 4. The 20 design ideas accountants love (and why)

1. **Save = post.** No extra posting step; reports are always current.
2. **Drill-down everywhere.** Any number → its vouchers; builds trust in reports.
3. **Edit from the report.** Fix a voucher right where you found the problem.
4. **Keyboard-first entry (F4–F9, Ctrl+A).** Data-entry operators never touch the mouse — very fast.
5. **Alt+C create master on the fly.** No leaving the voucher to add a missing ledger/item.
6. **Go To without losing work.** Check a report mid-entry and come back.
7. **Group decides behaviour.** Put a ledger under Sundry Debtors and bill-wise tracking just works.
8. **Bill-wise tagging during entry.** Outstandings/ageing need no separate AR/AP module.
9. **Optional / memorandum / reversing vouchers + scenarios.** Forecasts without touching real books.
10. **No year-end close.** Balances carry forward automatically.
11. **Order No. vs Tracking No.** Promise vs physical movement – partial deliveries and rejections stay clean.
12. **Optional document chain.** Small users skip steps; big users get full traceability on the same model.
13. **"Bills to Come / Bills to Make" accruals.** Profit is correct between goods movement and invoicing.
14. **Exception reports from the links.** Gaps surface automatically instead of at audit.
15. **Pre-close order with reason.** Cancelled balances stop polluting pending reports.
16. **Alternate units overridable per voucher.** Real cartons vary; no fake items.
17. **Third-party godown flags.** One location model covers job work, consignment and bonded stock.
18. **Costing method per item + side-by-side comparison.** Finance can test before switching.
19. **Physical Stock voucher.** Enter the count; the system computes the difference.
20. **Progressive features (F11/F12, activate on first use).** Simple for small users, deep for big ones.

---

## 5. Weaknesses / criticisms

- **Desktop and file-based** data; corruption risk on shared network folders; browser access is reports only.
- **Branch sync instead of one central database** – consolidation is brittle.
- **No built-in multi-step approval workflow** (only security levels + Edit Log) *(likely, not fully confirmed)*.
- **No MRP**, no production orders, no WIP stages, routing, capacity or scheduling – manufacturing is a posting after the fact.
- **No colour × size matrix** – garment users fake it with SKU names, units or batches.
- **No QC / inspection workflow.**
- **Negative stock only warns** (blocking needs TDL customisation).
- Chain integrity depends on users linking tracking numbers.
- Two overlapping cost systems (cost centres vs cost tracking).
- Paid subscription (TSS) for connected features; customisation needs TDL experts; hard to integrate.

---

## 6. Sources (selection)

- F11 features: https://help.tallysolutions.com/tally-prime/set-up-tally-prime/company-features-f11-tally/
- Purchase order & receipt note: https://help.tallysolutions.com/purchase-order-tally/ , https://help.tallysolutions.com/receipt-notes/
- Sales order outstandings: https://help.tallysolutions.com/sales-order-outstandings/
- Track purchases (bills pending): https://help.tallysolutions.com/track-purchases/
- Units of measure: https://help.tallysolutions.com/units-of-measurement/
- Third-party godowns: https://help.tallysolutions.com/manage-godowns-for-third-party-tally/
- Stock journal / physical stock: https://help.tallysolutions.com/stock-journal/ , https://help.tallysolutions.com/physical-stock/
- Manufacturing: https://help.tallysolutions.com/manage-inventory-in-manufacturing-tally/ , https://help.tallysolutions.com/manufacturing-journal/
- Job work: https://help.tallysolutions.com/job-work-setup/
- Costing methods: https://help.tallysolutions.com/costing-methods/
- Reorder: https://help.tallysolutions.com/reorder-stock-items-reorder-status-and-reorder-quantity/
- Payroll: https://help.tallysolutions.com/payroll-features-of-tally-erp-tally/
- Sync & server: https://help.tallysolutions.com/data-exchange-synchronisation/ , https://help.tallysolutions.com/tally-prime-server-faq/
- Negative stock (Tally article): https://tallysolutions.com/accounting/tools-support-negative-stock/
- Release notes 7.1: https://help.tallysolutions.com/release-notes-tallyprime-7-1/
- Garment limitations (vendor blogs, biased): https://www.tallyatcloud.com/ , https://factostack.com/blog/tally-limitations-for-manufacturers

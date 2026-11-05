# Akij ERP (AKIJ iBOS) – how it works

Research date: 2026-11-04.

## 0. Identification note

The original request said **"Azik ERP"**. No product with that exact name exists (`azikerp.com` and `azik.com.bd` are not live sites). The closest match is the **AKIJ iBOS** suite, which its vendor markets as **"Akij ERP"** ("Azik" is a common romanisation slip for আকিজ / Akij). The product owner confirmed this is the intended product.

Vendor: iBOS Limited (part of AKIJ Resource), Dhaka. Claims 500+ businesses and 200K+ users. Website: https://ibos.io/

Other candidates checked and ruled out: ZAB ERP (zaberp.com), Easy ERP (easysoftbd.net), AZKA ERP, AzteQ ERP, Azentio Orion ERP, the older Akij Online ERP.

Caution: most public material is the vendor's own marketing/SEO content; the garments edition is mostly visible via 2023 LinkedIn posts.

---

## 1. Product suite (modules)

| Product | What it covers |
|---|---|
| **Managerium ERP** | Procurement, Sales & Export Sales, Inventory & Warehouse, Accounts & Finance, Production, QC, Payroll & HR, POS, Fixed Assets, **Approvals**, After-sales service, Route-to-market (distributors), Business configuration |
| **iBOS Enterprise – Garments Edition** | Merchandising (price quotation, orders, sales contract, budget & costing, POs, samples), merchandising dashboard, **LC-wise commercial tracking dashboard / LC performance**, automated IE & production planning, **barcode-tagged production**, hourly/daily target vs achievement, **order-wise costing vs profit**, collection & payment schedules, customer/supplier ageing, MIS |
| **PeopleDesk (HR)** | Attendance & leave, payroll, loans & PF, organogram, approval workflow, performance, training, expenses, employee self-service, final settlement. Biometric / face / GPS attendance. **Piece-rate, daily-wage and salaried pay in one run.** Bilingual UI claimed. |
| **Prime VAT** | **NBR-enlisted** VAT software. Official Mushak forms 4.3, 6.1, 6.2 / 6.2.1, 6.3, 6.4–6.10, 9.1, 9.3, 9.4. Multi-branch, multi-BIN. |

Not publicly documented: bond licence / UD handling, BTB LC opening workflow, buying-house commission handling.

---

## 2. Workflows

### 2.1 Procurement (well documented)
1. **Purchase Demand / Requisition** – requester, department/project, cost context, required date.
2. **Approval chain** – department → procurement → finance → management.
3. **RFQ** to selected suppliers.
4. **Supplier quotations** – entered internally or by suppliers via a **supplier portal**; stored per RFQ / supplier / office with attachments and negotiation history.
5. **Comparative Statement (CS)** – side-by-side supplier comparison; **reason for selection is recorded**.
6. **Purchase Order** – created and approved.
7. **Receiving** – gate-in → purchase receive → **lot/barcode tagging** with quality status.
8. Stock updated across offices/warehouses.
9. Payment and returns; finance entries auto-post.

### 2.2 Garments: order to shipment (partly inferred from feature lists)
1. Merchandiser enters **price quotation** and **costing budget**.
2. Order confirmed with **sales contract** and shipment date.
3. Procurement raises fabric/trims requirements against the order.
4. Store records **what physically arrived** ("not what was ordered").
5. Planning / IE checks capacity and allocates lines using live line load.
6. Cutting (size breakdown, marker).
7. **Barcode-tagged sewing**; hourly/daily target vs achievement.
8. Finishing, packing, QC.
9. Shipment tracked on the **LC dashboard**.
10. Finance sees order cost build up → **order-wise cost vs profit** report.

### 2.3 HR and payroll
1. Biometric / GPS punches → attendance dashboard (late, absent, missing checkout, overtime).
2. Approved leave flows into payroll automatically.
3. Overtime per Bangladesh Labour Act.
4. Mixed pay structures (piece-rate + daily + salaried) processed together.
5. Payslips via employee self-service.

### 2.4 VAT (NBR rules)
1. Every purchase updates **Mushak 6.1** (purchase register) and **6.2.1** in real time.
2. Every sale creates a **Mushak 6.3** VAT invoice; sales above BDT 2 lakh are flagged for **6.10**.
3. Adjustments: 6.4 (subcontract), 6.5 (stock transfer), 6.6 (VDS certificate), 6.7 (credit note), 6.8 (debit note).
4. Monthly return **9.1** generated in one click before the 15th; 9.3 late, 9.4 amended.
5. Manufacturers declare input–output coefficients on **4.3**.

---

## 3. Ideas worth copying (and why)

1. **Comparative Statement with recorded selection reason before every PO** – Bangladeshi auditors and owners expect a "CS"; makes buying decisions defensible.
2. **Supplier portal for quotations** – moves RFQs out of email; keeps negotiation history on the record.
3. **Plan from "what arrived", not "what was ordered"** – assumed fabric availability is a top cause of late shipments.
4. **Step / owner / typical-failure table for planning** – doubles as user guide and dashboard design.
5. **"Why did this date move?" audit on plans** – planners see which input changed and when.
6. **Order-wise costing vs profit as a headline report** – owners judge an ERP by this.
7. **LC performance dashboard** – one view of LC value, shipped, realised, outstanding.
8. **One approval inbox across modules** – purchase, leave, payroll, expense, assets in one queue.
9. **Biometric/GPS → attendance → payroll with exception review** – HR reviews exceptions only.
10. **Mixed wage engine** (piece-rate, daily, salaried) – the normal mix on BD factory floors.
11. **Full official Mushak form set from transactions + 6.10 auto-flag** – NBR-enlisted software is mandatory above BDT 5 crore turnover.
12. **Multi-BIN, multi-branch VAT** – groups file under several BINs.
13. **Published pricing tiers in taka** – builds trust with BD buyers.
14. **Pre-implementation data checklist** (items, CoA, opening balances, approval rules, roles) – shortens go-live.
15. **Separate sellable products on shared masters** (HR, VAT, ERP) – customers start small and upsell.

---

## 4. Weaknesses

- Thin public detail on the garments edition; main site is retail / POS / distribution focused.
- No public evidence of BTB LC opening, bond / UD, export realisation or buying-house commission flows.
- VAT is a separate product; depth of integration with Managerium is unclear.
- "3–7 day implementation" claims fit retail, not RMG factories.
- Weak mobile app (≈5K downloads, poor recent reviews).
- Bangla UI only claimed for PeopleDesk.
- Little independent validation (mostly vendor content).

---

## 5. Sources

- Akij ERP / iBOS Enterprise: https://ibos.io/ibos-enterprise-best-erp-solution-in-bangladesh/
- Managerium: https://ibos.io/managerium-best-erp-software-bangladesh/ , https://ibos.io/managerium-details/ , pricing https://ibos.io/managerium-pricing/
- Procurement: https://ibos.io/purchase-to-outlet-erp/ , https://ibos.io/supplier-quotation-submission-erp/
- Garment planning: https://ibos.io/production-planning-in-garment-industry/
- PeopleDesk: https://ibos.io/peopledesk-details/ , https://ibos.io/top-hr-software-for-every-industry-in-bangladesh-2026/
- Prime VAT: https://ibos.io/primevat-details/ , https://ibos.io/no-1-vat-software-in-bangladesh-prime-vat/ , https://ibos.io/best-vat-software-in-bangladesh/
- Garments edition (LinkedIn, 2023): https://www.linkedin.com/posts/ikbal-hossain-a17b30b3_erprmggarments-rmg-%E0%A6%B8%E0%A6%95%E0%A6%9F%E0%A6%B0%E0%A6%B0-%E0%A6%9C%E0%A6%A8%E0%A6%AF-ibos-activity-7039841532828389376-_1Jy
- Mobile app stats: https://chrome-stats.com/d/com.ibossme

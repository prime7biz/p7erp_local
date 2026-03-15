# Wastage & Loss Analysis Report – Full Blueprint

**P7 ERP · Garments profitability-control report**  
**Version:** 1.0 · **Date:** 2026-03-14

This document is the single source of truth for the comprehensive Wastage & Loss Analysis Report. It combines Architect, Domain, UX/UI, Frontend, and Backend perspectives and aligns with the Critical Alert Center.

---

## 1. Architect Summary

### 1.1 Purpose

The Wastage & Loss Analysis Report is a **profitability-control report** (not a simple summary). It answers:

- Where exactly are we losing money?
- Which order / style / buyer / factory / supplier has high wastage?
- Is actual consumption exceeding costing / BOM / budgeted consumption?
- Is fabric wastage mainly in cutting, sewing, washing, finishing, inspection, or packing?
- Are trim and accessories over-consumed?
- Is wastage within allowed threshold or beyond tolerance?
- Commercial impact in qty, kg, yards, and money value?
- Which wastage is normal, abnormal, controllable, uncontrollable, recoverable, or non-recoverable?
- Which departments or users need corrective action?

### 1.2 Connection to Merchandising Alerts

- **Wastage report** is the **source of truth** for consumption variance. The **Critical Alert Center** consumes it:
  - Rule `wastage_vs_bom`: when actual wastage % exceeds tenant threshold (e.g. 15% High, 25% Critical), an alert is created and linked to `order` + optional `item_id`.
  - Additional wastage-driven alert types (cutting variance, trim overconsumption, rejection-induced loss, repeated reason, order profitability at risk, no wastage capture for completed order) are **generated from** wastage report data or wastage transactions.
- **Bidirectional link:** From a wastage report row (or detail drawer), the user can open "Linked alerts"; from an alert card, the user can open "Wastage detail" for that order/item.

### 1.3 Source Data Dependencies

| Domain | Existing in P7 | Used for wastage | Gaps / New |
|--------|----------------|------------------|------------|
| **Costing / Quotation** | Quotation, QuotationMaterial | Planned material cost, margin | Use for "planned consumption value" and "wastage as % of order value" |
| **BOM** | Bom, BomItem (item_id, base_consumption, wastage_pct) | Planned consumption per piece, allowed wastage % | Per-stage wastage % optional (Phase 2) |
| **Order** | Order (customer_id, quotation_id, quantity, delivery_date) | Order-level aggregation, buyer, shipment | factory_id / floor optional (Phase 2) |
| **Material booking / Store** | StockMovement (CONSUMPTION_ISSUE, reference_id=order_id), optional CONSUMPTION_RETURN | Actual issued, returned | Add reference_type for stage (e.g. CUTTING_ISSUE) optional; wastage_reason_id on movement optional |
| **Cutting** | — | Cutting wastage qty/value | **New:** cutting_report or wastage_transaction with stage=cutting |
| **Production** | ManufacturingOrder, ManufacturingStage (process_loss_percentage) | Stage-wise loss % | Link MO to order optional; use for process loss |
| **QC / Rejection** | Manufacturing NCR / quality (if exists) | Rejection qty, rejection-induced loss | **New:** rejection/wastage link or wastage_transaction reason=rejection |
| **Shipment / Packing** | DeliveryChallan, orders.status | Shipped qty, order closure | For "produced vs shipped" variance |
| **Inventory** | StockMovement, Item (default_cost), ItemCategory | Valuation, material type (fabric/trim) | UOM conversion (ItemUnit), multi-currency via Quotation |
| **Purchase / Supplier** | PurchaseOrder, Vendor | Supplier-level wastage (short receipt vs use) | **New:** short receipt vs actual use for "supplier variance" |

**Conclusion:** Reuse Order, Quotation, BOM, StockMovement (CONSUMPTION_ISSUE), Item, ItemCategory, Customer (buyer). Add **wastage_transaction** (and optionally wastage_reason, wastage_threshold_rule, wastage_order_summary snapshot) for detailed breakdown, process stage, reason, and value. Extend StockMovement or add a wastage-specific table for **process stage** and **reason** where needed.

### 1.4 Phased Build Plan

| Phase | Scope | Deliverables |
|-------|--------|--------------|
| **Phase 1 (MVP)** | Core variance report + KPIs + filters + alert link | Extend existing wastage API (buyer, date, value); add wastage KPIs API; frontend: KPI bar, filter panel, variance table, threshold badge, link to alerts; wastage_vs_bom alert already exists. |
| **Phase 2** | Taxonomy, reasons, process stage, drill-down, export | wastage_reason, wastage_transaction (or stage/reason on movements); detail drawer with order/BOM/issue summary, reason breakdown; Excel/PDF export; more alert types (cutting variance, trim overconsumption). |
| **Phase 3** | Snapshot, thresholds, management summary | wastage_report_snapshot, wastage_threshold_rule; management summary view; saved views; configurable threshold by buyer/order type/material type. |
| **Phase 4** | Advanced analytics, prediction | Trend analytics, top N loss orders/materials/reasons; optional AI-driven wastage prediction (anomaly by style/buyer/factory). |

---

## 2. Wastage Business Logic (Domain & Workflow)

### 2.1 Real Garments Wastage Scenarios

1. **Cutting:** Marker inefficiency, end-bit/remnant, spreading loss, shade-band/panel rejection, bundle loss.
2. **Sewing:** Thread overconsumption, damage, rejection causing fabric/trim write-off.
3. **Washing/Finishing:** Shrinkage overconsumption, damage, rejection.
4. **Inspection/Packing:** Final rejection, poly/carton overuse, label wastage.
5. **Store:** Excess issue vs standard, return shortage, dead stock after order closure, physical stock mismatch.
6. **Commercial:** Buyer-allowed tolerance vs internal tolerance; chargeable vs non-chargeable; recoverable salvage vs net loss.

### 2.2 Wastage Categories by Process Stage

- **Cutting** – marker, spreading, end-bit, shade-band, cutting rejection, bundle loss.
- **Sewing** – sewing rejection, thread/trim overuse, damage.
- **Washing** – wash damage, shrinkage overconsumption.
- **Finishing** – finishing rejection.
- **Inspection** – final inspection rejection.
- **Packing** – packing material overuse, damage.
- **Store/Inventory** – excess issue, return short, dead stock, variance.

### 2.3 Acceptable Threshold Examples

- **Fabric:** Often 3–8% allowed (tenant configurable); 8–15% High alert; >15–25% Critical (configurable).
- **Trim:** Often 2–5% allowed; above 5–10% High; >10% Critical (configurable).
- **Buyer-approved tolerance:** May be higher (e.g. 10% fabric); store per buyer or order type.

### 2.4 Variance Logic (Planned vs Actual)

- **Planned consumption** = order_qty × BOM base_consumption × (1 + BOM wastage_pct/100). Optionally × (1 + process_loss_pct/100) if present.
- **Actual issued** = sum(StockMovement OUT where reference_type=CONSUMPTION_ISSUE, reference_id=order_id, item_id).
- **Actual net** = actual issued − returns (CONSUMPTION_RETURN or IN with same reference) if tracked.
- **Variance** = actual − planned; **Variance %** = (actual − planned) / planned × 100 (when planned > 0).
- **Actual wastage %** = (actual − net_theoretical) / net_theoretical × 100 where net_theoretical = order_qty × base (no wastage). For simplicity, "wastage %" in UI = variance % vs BOM (planned) as currently implemented.

---

## 3. Wastage Taxonomy

### A. Fabric Wastage

| Code | Name |
|------|------|
| marker_cutting | Marker / cutting wastage |
| spreading | Spreading wastage |
| end_bit_remnant | End-bit / remnant wastage |
| shade_band_panel | Shade-band / panel rejection loss |
| cutting_rejection | Cutting rejection |
| bundle_loss | Bundle loss |
| sewing_rejection_fabric | Sewing rejection causing fabric loss |
| washing_damage | Washing damage loss |
| finishing_rejection | Finishing rejection loss |
| inspection_rejection | Final inspection rejection loss |

### B. Trim & Accessories Wastage

| Code | Name |
|------|------|
| thread_overconsumption | Thread overconsumption |
| label_wastage | Label wastage |
| poly_carton_packaging | Poly / carton / packaging wastage |
| button_zipper_elastic_tape | Button / zipper / elastic / tape wastage |
| replacement_issue_qty | Replacement issue qty |
| short_receipt_vs_use | Short receipt vs actual use mismatch |

### C. Process Loss

| Code | Name |
|------|------|
| rework_loss | Rework loss |
| repair_loss | Repair loss |
| rejection_loss | Rejection loss |
| sample_consumption | Sample-related consumption loss |
| damage_loss | Damage loss |
| handling_loss | Handling loss |
| shrinkage_overconsumption | Shrinkage-related overconsumption |
| process_transfer_loss | Process-to-process transfer loss |

### D. Inventory / Store Loss

| Code | Name |
|------|------|
| excess_issue_vs_standard | Excess issue vs standard |
| return_shortage | Return shortage |
| dead_stock_closure | Dead stock from order closure |
| leftover_balance | Leftover balance |
| unaccounted_variance | Unaccounted variance |
| physical_stock_mismatch | Physical stock mismatch |

### E. Commercial Wastage Impact

| Code | Name |
|------|------|
| cost_impact_base_currency | Cost impact in base currency |
| wastage_pct_order_value | Wastage as % of order value |
| wastage_pct_material_cost | Wastage as % of material cost |
| buyer_chargeable | Buyer chargeable loss |
| buyer_non_chargeable | Buyer non-chargeable loss |
| recoverable_salvage | Recoverable salvage value |
| net_loss | Net wastage cost |

### Recoverable vs Non-Recoverable

- **Recoverable:** End-bit/remnant (sale as scrap), reusable trim, salvage fabric (e.g. small pieces). Stored as `recoverable_value` or flag on wastage_transaction.
- **Non-recoverable:** Rejection, damage, handling loss, excess issue consumed. Stored as `net_loss` or equivalent.

### Buyer vs Internal Tolerance

- **Internal tolerance:** Tenant-level (e.g. 5% fabric, 3% trim). Used for alerts and "above threshold" count.
- **Buyer-approved tolerance:** Optional per buyer or order type (e.g. 10% fabric). Used for "within buyer allowance" vs "beyond buyer allowance" in report.

### Sustainability / Recycling (Optional Phase 2)

- Classify wastage_reason by `recyclable` (e.g. fabric scrap), `reusable` (trim), `disposal`. Used for sustainability dashboard later.

---

## 4. Formulas and Calculation Rules

### 4.1 Core Formulas

| # | Concept | Formula |
|---|--------|---------|
| 1 | **Planned consumption (qty)** | `order_qty × base_consumption × (1 + wastage_pct/100)` |
| 2 | **Actual issued consumption** | `SUM(StockMovement.quantity)` where movement_type=OUT, reference_type=CONSUMPTION_ISSUE, reference_id=order_id, item_id |
| 3 | **Actual net consumption** | `Actual issued − SUM(return movements)` (if CONSUMPTION_RETURN or IN with same reference) |
| 4 | **Returned balance adjustment** | `net = issued − returned`; use net for variance when returns are tracked |
| 5 | **Standard wastage %** | From BOM: `wastage_pct` (allowed). From tenant: default e.g. 5% fabric, 3% trim |
| 6 | **Actual wastage %** | `(actual − planned) / planned × 100` (same as variance % vs BOM); or `(actual − net_theoretical) / net_theoretical × 100` |
| 7 | **Variance %** | `(actual − planned) / planned × 100` |
| 8 | **Wastage value** | `variance_qty × unit_cost` (Item.default_cost or valuation from PO/costing) |
| 9 | **Recoverable value** | From wastage_transaction.recoverable_value or estimated salvage % |
| 10 | **Net loss value** | `wastage_value − recoverable_value` |
| 11 | **Wastage per unit** | `wastage_value / order_qty` (per piece) |
| 12 | **Order-level wastage score** | e.g. `SUM(net_loss_value)` for order; or weighted score by material cost |

### 4.2 UOM and Multi-Currency

- **UOM:** Store and display in item's unit (yard, kg, meter, pcs). Conversion via ItemUnit or conversion table (e.g. 1 kg = X yards by fabric type) if needed for roll/kg/yard/meter/piece consistency; Phase 1 can keep per-item UOM without cross-UOM aggregation.
- **Valuation:** Use Item.default_cost (base currency) for wastage value. If quotation/material cost in foreign currency, convert using order/quotation exchange_rate to base for report.
- **Presentation:** Report in base currency; optional column "cost in order currency" using order's currency and exchange rate.

### 4.3 Style-Color-Size (Optional)

- If BOM has variant-level consumption (size/color), planned = sum over variants; actual can be at order level (total issue) or at variant if issue is recorded per variant. MVP at order×item level; Phase 2 add style-color-size breakdown where data exists.

---

## 5. UX/UI Proposal

### 5.1 Principles

- **Premium, clean, operational, management-friendly.** Clear hierarchy: summary → trends → detail table → drill-down.
- **Role-based:** Operational users see filters, variance table, reason breakdown; management sees KPIs, trend, top loss, management summary.

### 5.2 Page Structure

1. **Top Summary Header**  
   Page title "Wastage & Loss Analysis", report period (date range), last refresh time, Export (Excel/PDF), Print, Saved view (Phase 2).

2. **KPI Cards (WastageKPIBar)**  
   Total wastage value, Fabric wastage %, Trim wastage %, Rejection loss, Rework loss, Recoverable value, Net loss, Above-threshold orders count. Compact cards with trend indicator (e.g. vs previous period) optional.

3. **Trend / Visualization (WastageTrendCharts)**  
   Monthly wastage trend, Wastage by process stage, Wastage by buyer, Wastage by factory (if data), Wastage by material group, Top loss reasons, Recoverable vs non-recoverable (pie or bar).

4. **Main Detailed Variance Table (WastageVarianceTable)**  
   Columns: Buyer, Order no, Style, Shipment date, Planned qty, Produced qty, Shipped qty, Planned fabric cons., Actual fabric cons., Fabric variance, Fabric wastage %, Trim variance value, Rejection qty, Rework qty, Total wastage value, Allowed threshold, Threshold breach (badge), Root cause, Responsible team. Sortable, filterable, row click → detail drawer.

5. **Drill-Down Detail Drawer (WastageDetailDrawer)**  
   On row click: Order summary, Costing summary, BOM summary, Material issue and return summary, Process-stage breakdown, Rejection breakdown, Wastage reason analysis, Linked comments/notes, Linked alerts, Recommended actions.

6. **Root Cause & Reason Analysis (WastageReasonBreakdown)**  
   List of reasons (marker inefficiency, excess issue, poor cutting, shade issue, sewing damage, wash damage, quality rejection, poor planning, inaccurate BOM, supplier short, wrong booking, data entry error, stock control issue) with count and value. In drawer or separate section.

7. **Management Summary View (WastageManagementSummary)**  
   Top problem areas, Biggest financial loss contributors, Repeat offender orders/suppliers/processes, Month-over-month change, Suggested corrective action areas.

### 5.3 WastageThresholdBadge

- Green: within tolerance; Amber: above allowed, below critical; Red: critical. Tooltip: allowed % and actual %.

---

## 6. Frontend Component Tree

```
WastageReportPage
├── Page header (title, period, last refresh, WastageExportMenu, saved view)
├── WastageFilterPanel (tenant, buyer, brand, order no, style, color, season, factory, floor, merchandiser, supplier, material type, material group, fabric/trim category, process stage, date range, shipment month, order status, wastage type, recoverability, above-threshold only, root cause, responsible department)
├── WastageKPIBar (total wastage value, fabric %, trim %, rejection, rework, recoverable, net loss, above-threshold count)
├── WastageTrendCharts (monthly trend, by process stage, by buyer, by factory, by material group, top reasons, recoverable vs non-recoverable)
├── WastageVarianceTable (columns as in §5.2; WastageThresholdBadge per row; row click → open drawer)
├── WastageDetailDrawer (order summary, costing, BOM, issue/return, process breakdown, rejection, reason analysis, comments, LinkedAlertPanel, actions)
├── WastageReasonBreakdown (section or inside drawer)
├── WastageManagementSummary (top problems, top loss, repeat offenders, MoM, suggested actions)
└── LinkedAlertPanel (inside drawer: list of alerts linked to this order/item with deep link to Alert Center)
```

- **WastageExportMenu:** Print, PDF, Excel, management summary export, detailed variance export, order-specific wastage sheet.

---

## 7. Backend Schema Proposal

### 7.1 New / Extended Tables

| Table | Purpose |
|-------|--------|
| **wastage_reason** | Master list of wastage reason codes (from taxonomy §3); tenant_id, code, name, category (fabric/trim/process/store/commercial), recoverable (bool), optional recyclable. |
| **wastage_transaction** | Optional: each recorded wastage event (order_id, item_id, stage, reason_id, qty, unit_cost, value, recoverable_value, net_loss, reference_type, reference_id, movement_id, tenant_id, created_at). Enables process-stage and reason breakdown. |
| **wastage_threshold_rule** | Tenant-level or buyer/order_type/material_type override: allowed_pct, critical_pct, scope (tenant, buyer, order_type, material_type). |
| **wastage_comment** | Comments on order-level or line-level wastage (order_id, item_id nullable, user_id, body, created_at). |
| **wastage_adjustment** | Manual adjustment to wastage value or qty for audit (order_id, item_id, adjustment_type, value, reason, user_id, created_at). |
| **wastage_alert_link** | Optional: explicit link wastage_report_snapshot or order_id + item_id to alert_instance.id for "linked alerts" in UI. Or use existing alert_related_entity (entity_type=order, entity_id=order_id). |
| **wastage_report_snapshot** | Period-level or run-level snapshot for performance (tenant_id, period_start, period_end, snapshot_at, summary_json, order_count, total_wastage_value, etc.). |
| **wastage_order_summary** | Materialized order-level summary (tenant_id, order_id, planned_fabric_cons, actual_fabric_cons, fabric_variance_pct, trim_wastage_value, total_wastage_value, rejection_qty, rework_qty, above_threshold, snapshot_at). Refreshed by job or on demand. |

### 7.2 Source Transaction Lineage

- Each wastage value should be traceable: from StockMovement (reference_type, reference_id, movement_date) and/or wastage_transaction (reference_type, reference_id). Detail drawer shows "Source: CONSUMPTION_ISSUE #movement_id" with link to inventory movement if applicable.

### 7.3 Indexes

- wastage_transaction: (tenant_id, order_id), (tenant_id, created_at), (tenant_id, wastage_reason_id).  
- wastage_order_summary: (tenant_id, order_id), (tenant_id, snapshot_at).  
- wastage_threshold_rule: (tenant_id, scope_type, scope_id).

---

## 8. API Proposal

### 8.1 Existing (Keep and Extend)

- **GET /api/v1/merch/reports/wastage** – Extend query params: buyer_id, brand, order_no (search), style_id, color, season, factory_id, merchandiser_id, supplier_id, material_type, material_group, fabric_trim_category, process_stage, date_from, date_to, shipment_month, order_status, wastage_type, recoverability, above_threshold_only, root_cause_reason_id, responsible_department. Add in response: buyer_name, order_value, planned_consumption_value, actual_consumption_value, wastage_value, allowed_threshold_pct, threshold_breach, root_cause_code (when wastage_transaction exists).
- **GET /api/v1/merch/reports/wastage/summary** – Extend to return KPI aggregates: total_wastage_value, fabric_wastage_pct_avg, trim_wastage_pct_avg, rejection_loss_value, rework_loss_value, recoverable_value, net_loss, above_threshold_orders_count, and by_style as today.

### 8.2 New Endpoints

- **GET /api/v1/merch/reports/wastage/kpis** – Query: date_from, date_to, buyer_id, … (same filters). Response: KPI object (total wastage value, fabric %, trim %, rejection, rework, recoverable, net loss, above-threshold count). Can merge into summary.
- **GET /api/v1/merch/reports/wastage/trends** – Query: date_from, date_to, group_by=month|buyer|process_stage|material_group. Response: series for charts (monthly trend, by buyer, by process stage, etc.).
- **GET /api/v1/merch/reports/wastage/order/{order_id}** – Detail for one order: order summary, costing summary, BOM lines with planned/actual, issue/return summary, process-stage breakdown (if wastage_transaction), rejection breakdown, wastage reasons, linked alert IDs.
- **GET /api/v1/merch/reports/wastage/reasons** – List wastage_reason for tenant (for filters and reason breakdown).
- **GET /api/v1/merch/reports/wastage/management-summary** – Top 10 high-loss orders, top 10 materials, top 10 reasons; month-over-month change; suggested action areas (e.g. "Cutting variance high for Buyer X").
- **POST /api/v1/merch/reports/wastage/export** – Body: format (excel, pdf), filter params. Return file or download URL.
- **GET /api/v1/merch/reports/wastage/thresholds** – List wastage_threshold_rule for tenant (for badge and config).
- **POST /api/v1/merch/reports/wastage/comments** – Add wastage_comment (order_id, item_id optional, body).
- **GET /api/v1/merch/reports/wastage/order/{order_id}/alerts** – Alerts linked to this order (from alert_related_entity). Used by LinkedAlertPanel.

---

## 9. Alert Integration Plan

### 9.1 Wastage-Driven Alert Types

| Alert type | Trigger | Severity | Link to report |
|------------|--------|----------|----------------|
| **wastage_vs_bom** (existing) | Actual wastage % > threshold (e.g. 15%) | High/Critical by % | Order + item; row in wastage table |
| **cutting_variance_above** | Cutting-stage variance above tolerance | High | Order; wastage detail drawer |
| **trim_overconsumption_above** | Trim actual vs BOM above threshold | High | Order + item |
| **rejection_loss_above** | Rejection-induced loss value above threshold | High/Critical | Order |
| **repeated_wastage_reason** | Same reason recurring for same supplier/factory/style | Medium | Order / style; management summary |
| **order_profitability_at_risk** | Wastage value as % of order margin above threshold | Critical | Order |
| **abnormal_unused_balance** | Unused material balance after order closure above threshold | High | Order |
| **no_wastage_capture_completed_order** | Order status = completed/shipped but no wastage/consumption recorded | Medium | Order |

### 9.2 Implementation

- Reuse `alert_definition` + `alert_instance` + `alert_related_entity`. Add new rule_key for each type.  
- Alert scan job (or event): run wastage report logic; for each row/order meeting condition, upsert alert with natural_key e.g. `wastage_vs_bom:order:{id}:item:{item_id}`.  
- In wastage UI: "Linked alerts" = GET alerts where entity_type=order, entity_id=order_id (and optionally item in description or related_entity).  
- From alert card: deep link to wastage report with order_id (and item_id) filter and optionally open detail drawer.

---

## 10. KPI Definitions

| KPI | Definition | Operational | Management |
|-----|------------|-------------|------------|
| Total wastage value | Sum(net_loss_value) or sum(wastage_value − recoverable) in scope | ✓ | ✓ |
| Fabric wastage % | Avg or weighted avg of (actual − planned)/planned × 100 for fabric items | ✓ | ✓ |
| Trim wastage % | Same for trim items | ✓ | ✓ |
| Rejection loss | Sum of value where reason = rejection | ✓ | ✓ |
| Rework loss | Sum of value where reason = rework | ✓ | ✓ |
| Recoverable value | Sum(recoverable_value) | ✓ | ✓ |
| Net loss | Total wastage value − recoverable | ✓ | ✓ |
| Above-threshold orders count | Count of orders with at least one line above allowed_pct | ✓ | ✓ |
| Wastage per piece | total_wastage_value / order_qty (order or global) | ✓ | Optional |
| Wastage per dozen | × 12 where applicable | ✓ | Optional |
| Top 10 high-loss orders | Orders by total wastage value desc | Optional | ✓ |
| Top 10 high-loss materials | Items by total wastage value desc | Optional | ✓ |
| Top 10 repeated wastage reasons | Reason codes by count or value | Optional | ✓ |
| Wastage trend by month | Time series of total wastage value or % | ✓ | ✓ |

---

## 11. Management Summary Layout

- **Top problem areas:** List of 5–10 dimensions (e.g. "Cutting – Buyer A", "Trim – Style X") with wastage value and % of total.  
- **Biggest financial loss contributors:** Top 10 orders by net loss; top 5 materials by net loss.  
- **Repeat offender orders / suppliers / processes:** Orders or suppliers with repeated same reason (e.g. "excess_issue" 3+ times).  
- **Month-over-month change:** Total wastage value and count of above-threshold orders, previous month vs current month.  
- **Suggested corrective action areas:** Derived from rules (e.g. "Review cutting process for orders with marker_cutting > 10%"; "Tighten trim issue policy for Buyer B").

---

## 12. Export / Print Strategy

- **Print-friendly layout:** CSS print media; hide filters/charts optional; show KPI bar + variance table + management summary.  
- **PDF export:** Same content as print; generate via browser print-to-PDF or backend (e.g. WeasyPrint / reportlab).  
- **Excel export:** KPI summary sheet + Detail variance sheet (all columns) + optional Management summary sheet; filters applied.  
- **Management summary export:** One-page summary (KPIs + top problems + MoM).  
- **Order-specific wastage sheet:** Single order detail (BOM, planned, actual, variance, reasons) for sharing with factory/buyer.

---

## 13. Phased Build Plan (Detailed)

- **Phase 1 (MVP):**  
  - Backend: Extend GET wastage (filters: buyer_id, date range, above_threshold_only); add GET wastage/summary with KPI fields (total_wastage_value from sum of (actual−planned)×unit_cost, fabric/trim %, above_threshold_orders_count). Add GET order/{id} detail (order, quotation, BOM lines, movements, linked alerts).  
  - Frontend: WastageReportPage with WastageKPIBar, WastageFilterPanel (buyer, date, order, style, above-threshold), WastageVarianceTable with threshold badge and wastage value column; WastageDetailDrawer (order summary, BOM vs actual, linked alerts); WastageExportMenu (Excel, Print).  
  - Alerts: Keep wastage_vs_bom; ensure alert list and detail link to wastage report (query param order_id).

- **Phase 2:**  
  - wastage_reason table + seed; wastage_transaction (optional) or extend movements with stage/reason; GET wastage/reasons, GET wastage/trends; detail drawer process-stage and reason breakdown; more alert types (cutting_variance, trim_overconsumption, rejection_loss_above); Excel/PDF export with reason columns.

- **Phase 3:**  
  - wastage_threshold_rule, wastage_order_summary snapshot job; saved views; configurable threshold; management summary API and WastageManagementSummary component.

- **Phase 4:**  
  - Top N APIs, trend analytics; optional AI wastage prediction (anomaly detection by style/buyer).

---

## 14. Risks / Edge Cases

- **Missing BOM or style:** Order without quotation or style_id → skip in report or show "No BOM" in detail.  
- **No CONSUMPTION_ISSUE:** Orders with no store issue → actual=0; variance % = −100% or show "No consumption recorded".  
- **Multiple BOM versions:** Use latest by version_no per style; document in spec.  
- **Unit cost zero:** Wastage value = 0; show qty variance only; optionally take cost from quotation material.  
- **Multi-currency:** Consistently convert to base for aggregation; show order currency in detail if needed.  
- **Performance:** Large tenant with many orders – paginate variance table; use wastage_order_summary materialized view for KPIs/trends in Phase 3.  
- **Data entry errors:** Wrong reference_id on movement → wrong order; audit trail and wastage_comment for corrections.

---

## 15. Cursor’s Improvement Suggestions

- **Single "wastage score" per order:** Combine fabric %, trim value, and rejection into one 0–100 score for ranking and management view.  
- **Benchmark by style/buyer:** Store historical avg wastage % by style or buyer; show "vs benchmark" in table and trend.  
- **Approval workflow for high wastage:** When net loss > threshold amount, require acknowledgment or approval from merchandiser/planning before closing order.  
- **Integration with costing:** When wastage is high, optionally suggest "Revise BOM wastage %" or "Update quotation material cost" for future orders.  
- **Dashboard widget:** Small KPI widget on main dashboard (total wastage value this month, above-threshold count) with link to full report.

---

## Appendix A: Missing Wastage Scenarios (Suggestions)

- **Pilot run / sample consumption:** Dedicated consumption for samples not booked to order (sample_consumption reason).  
- **Subcontractor loss:** Material sent to subcontractor not fully returned (process_transfer_loss or new reason).  
- **Dyeing/printing process loss:** If process order exists, input vs output yield as wastage.  
- **Packaging reuse:** Carton/poly reuse not tracked leading to apparent over-consumption (document as "packaging_reuse" adjustment).  
- **Buyer-specific allowances:** Per-buyer allowed wastage % and "chargeable to buyer" flag for dispute handling.

---

## Appendix B: Recommended MVP (Phase 1) Scope

- Extend existing wastage API with: buyer filter, date range, above_threshold_only; add wastage value (planned/actual value using Item.default_cost) and allowed_threshold_pct (tenant default 15%) in response.  
- New endpoint: GET wastage/summary with total_wastage_value, fabric_wastage_pct_avg, trim_wastage_pct_avg, above_threshold_orders_count, by_style.  
- New endpoint: GET wastage/order/{order_id} returning order info, BOM lines with planned/actual/variance, linked alert IDs.  
- Frontend: KPI bar (4–6 cards), filter panel (buyer, date, order, style, above-threshold), variance table with buyer, order, style, planned/actual qty, wastage %, wastage value, threshold badge; row click → detail drawer (order summary, BOM vs actual, linked alerts); Export Excel + Print.  
- No new DB tables in Phase 1; use existing Order, BOM, StockMovement, Item, Customer; threshold from tenant config or default 15%.

---

## Appendix C: Phase 2 Analytics Ideas

- Trend by week/month; by buyer, by style, by material group.  
- Top 10 loss orders, materials, reasons.  
- Recoverable vs non-recoverable pie chart.  
- Process-stage breakdown (cutting vs sewing vs packing) when wastage_transaction or movement stage is available.  
- Comparison: "This month vs last month" and "This buyer vs tenant average".

---

## Appendix D: AI-Driven Wastage Prediction (Phase 4)

- Use historical wastage by style, buyer, factory, material type to train a simple anomaly model (e.g. isolation forest or threshold on z-score).  
- Flag "Order X has predicted wastage risk High" when order is created or when consumption starts, based on style/buyer/factory combination that historically had high wastage.  
- Surface in Alert Center as informational alert and in wastage report as "Predicted risk" badge.

---

*End of Wastage & Loss Analysis Report Blueprint.*

# Advanced Critical Alert Center – Domain & Workflow Blueprint (Sub-Agent 1)

**Role:** Domain & Workflow Analyst · **Output:** Recommendations for Architect merge  
**Context:** P7 ERP garments merchandising; existing models and simple Critical Alerts (overdue followups + wastage). This document defines alert taxonomy, extra alert types, risk/escalation, severity rules, action flow, and tenant configurability.

---

## 1. ALERT TAXONOMY – Full merchandising map (Categories A–H)

For each category, alert types are listed with: **trigger condition**, **table/field used**, **severity**, **recommended next action**.

---

### A. Order & TNA

| Alert type | Trigger condition | Table / field | Severity | Recommended next action |
|------------|-------------------|---------------|----------|-------------------------|
| **Order missing TNA plan** | Order has `delivery_date` set and status not CANCELLED/DRAFT, but no `ManufacturingTnaPlan` with `order_id` = this order | `orders.delivery_date`, `orders.status`; `mfg_tna_plans.order_id` (absence) | High | Create TNA plan from template and link to order. |
| **TNA plan has overdue tasks** | At least one `ManufacturingTnaPlanTask` has `planned_date` < today and `status` not in (DONE, CANCELLED) for a plan linked to an order | `mfg_tna_plan_tasks.planned_date`, `status`; `mfg_tna_plans.order_id` | Critical if critical-path task, else High | Update task status or dates; add remark; reassign if blocked. |
| **TNA critical task at risk** | Task on critical path (or milestone) has `planned_date` within next N days (e.g. 3) and still NOT_STARTED or IN_PROGRESS with no `actual_date` | `mfg_tna_plan_tasks` (planned_date, status, template_task.is_milestone); plan.order_id | High | Start task or confirm dependency completion; set actual_date when done. |
| **Order delivery in past** | Order has `delivery_date` < today and status indicates active (e.g. CONFIRMED, IN_PRODUCTION) | `orders.delivery_date`, `orders.status` | Critical | Revise delivery date with amendment and inform buyer; close or re-plan order. |
| **Order delivery soon, no TNA** | Order has `delivery_date` within next 14 days and no linked TNA plan | Same as first row | Critical | Create and activate TNA plan immediately. |

---

### B. Costing / Quotation

| Alert type | Trigger condition | Table / field | Severity | Recommended next action |
|------------|-------------------|---------------|----------|-------------------------|
| **Quotation pending too long** | Quotation status = DRAFT or SENT and `quotation_date` or `created_at` older than threshold (e.g. 7 days) | `quotations.status`, `quotations.quotation_date` or `quotations.created_at` | Medium | Send or revise quotation; set valid_until. |
| **Quotation expired** | `valid_until` is set and `valid_until` < today; status not EXPIRED/CONVERTED/CANCELLED | `quotations.valid_until`, `quotations.status` | Medium | Mark expired or extend validity; follow up with customer. |
| **Quotation margin below threshold** | Computed margin (e.g. (quoted_price − cost) / quoted_price) below tenant-configured % for status DRAFT/SENT | `quotations` (quoted_price, total_cost/cost fields); computed margin | High if very low, else Medium | Review costing (QuotationMaterial, BOM, other costs); re-quote or escalate. |
| **Inquiry has no quotation** | Inquiry status allows quotation (e.g. not CANCELLED) and no Quotation with `inquiry_id` = this inquiry | `inquiries.status`; `quotations.inquiry_id` (absence) | Low | Create quotation from inquiry. |
| **Order has no linked quotation** | Order status is CONFIRMED or beyond and `quotation_id` is null | `orders.quotation_id`, `orders.status` | Medium | Link existing quotation or create order from quotation for audit trail. |

---

### C. Sampling

| Alert type | Trigger condition | Table / field | Severity | Recommended next action |
|------------|-------------------|---------------|----------|-------------------------|
| **Sample request overdue** | `ManufacturingSampleRequest.target_date` < today and status not DISPATCHED/APPROVED/CANCELLED | `mfg_sample_requests.target_date`, `status` | High | Update sample status; dispatch or revise target date. |
| **Sample request due soon** | `target_date` within next 5 days and status still in progress (e.g. IN_PROGRESS, PENDING) | Same | Medium | Prioritize sample; assign or chase. |
| **Sample not assigned** | Sample request status not CANCELLED and `assigned_user_id` is null | `mfg_sample_requests.assigned_user_id`, `status` | Low | Assign merchandiser or sample room. |
| **Order confirmed, critical sample pending** | Order status = CONFIRMED; linked or same-style sample request exists with status not APPROVED/DISPATCHED and sample_type = 'approval' or 'fit' | `orders.status`; `mfg_sample_requests.order_id` or style/item link; `sample_type`, `status` | High | Get sample approved before bulk; link sample to order if not linked. |

---

### D. Material Readiness

| Alert type | Trigger condition | Table / field | Severity | Recommended next action |
|------------|-------------------|---------------|----------|-------------------------|
| **Order has no consumption plan** | Order status beyond DRAFT and no `ConsumptionPlan` with `order_id` = this order | `orders.status`; `consumption_plans.order_id` (absence) | High | Create consumption plan from BOM/style. |
| **Consumption plan not finalized** | Consumption plan status = PLANNED and order delivery_date within 30 days | `consumption_plans.status`, `orders.delivery_date` | Medium | Finalize consumption plan and trigger PO/requisition. |
| **BOM missing for style on order** | Order references a style (via quotation.style_id or style_ref lookup) and that style has no BOM with status APPROVED/ACTIVE | `orders.quotation_id` → quotation.style_id; or style_ref → garment_styles; `boms.style_id`, `boms.status` | High | Create or approve BOM for style. |
| **PO overdue for order materials** | PurchaseOrder linked to order (via PO reference or order_id if added) has `expected_date` < today and status not RECEIVED/CLOSED | `purchase_orders.expected_date`, `status`; link to order (e.g. via consumption plan or PO metadata) | High | Chase supplier; update GRN or expected date. |
| **Style has no approved BOM** | GarmentStyle is ACTIVE and has orders or quotations referencing it but no BOM with status APPROVED | `garment_styles.status`; `boms.style_id`, `boms.status` | Medium | Complete and approve BOM. |

---

### E. Commercial / Document

| Alert type | Trigger condition | Table / field | Severity | Recommended next action |
|------------|-------------------|---------------|----------|-------------------------|
| **Order ready for shipment, no PI** | Order status indicates ready to ship (e.g. READY_TO_SHIP, INSPECTED) and no ProformaInvoice linked to this order (requires order_id on proforma_invoices or join table) | `orders.status`; `proforma_invoices` (link by reference = order_code or future order_id) | High | Create proforma invoice and send to buyer. |
| **LC not received before cutoff** | Order has delivery_date within N days (e.g. 21); no BtbLc in CONFIRMED/OPEN status linked to order (convention or order_id) | `orders.delivery_date`; `btb_lcs.status`; link to order | Critical | Escalate to commercial; confirm LC opening timeline. |
| **Export case missing for order** | Order status = READY_TO_SHIP or SHIPPED and no ExportCase linked (reference or order_id) | `orders.status`; `export_cases` (link) | High | Create export case and attach documents. |
| **PI sent but not confirmed** | ProformaInvoice status = SENT and invoice_date older than 5 days | `proforma_invoices.status`, `invoice_date` | Medium | Follow up with buyer for confirmation. |

*Note: Today ExportCase, ProformaInvoice, BtbLc have no `order_id`. Recommendations assume either reference convention (e.g. reference = order_code) or adding order_id / order_export_docs join table for accurate linking.*

---

### F. Production & Shipment Risk

| Alert type | Trigger condition | Table / field | Severity | Recommended next action |
|------------|-------------------|---------------|----------|-------------------------|
| **High wastage vs BOM** | Actual consumption vs BOM consumption for an order/item exceeds tenant threshold (e.g. 15%) | Wastage report: BOM consumption, actual usage (e.g. consumption plan items, material issues); threshold | High | Investigate cause; log variance; adjust BOM or process. |
| **Open NCR on order work order** | ManufacturingNcr status = open for a work order that is linked to an order (via plan_line → order) | `mfg_ncrs.status`, `mfg_work_orders` → plan_line → `orders` | High | Resolve NCR or CAPA; block shipment if critical. |
| **CAPA overdue** | ManufacturingCapa has `due_date` < today and status = open/in_progress | `mfg_capas.due_date`, `status` | High | Complete CAPA or extend due date with reason. |
| **Order quantity vs production** | Order quantity significantly above total completed on linked work orders (if order–WO link exists) | `orders.quantity`; `mfg_work_orders` (qty_completed) via plan_line.order_id | Medium | Align production plan; create more WOs or revise order. |
| **Delivery date within lead time** | Order delivery_date is within standard production lead time (e.g. 30 days) and TNA not yet started or critical path behind | `orders.delivery_date`; TNA tasks status/dates | Critical | Expedite or renegotiate delivery; add resources. |

---

### G. Communication / Follow-up

| Alert type | Trigger condition | Table / field | Severity | Recommended next action |
|------------|-------------------|---------------|----------|-------------------------|
| **Follow-up overdue** | Followup has `due_date` < today and status != DONE | `order_followups.due_date`, `status` | Critical if >7 days overdue, else High | Complete follow-up or reschedule with note. |
| **Follow-up due today** | `due_date` = today and status = OPEN | `order_followups.due_date`, `status` | Medium | Perform follow-up and mark done or in progress. |
| **No follow-up on order for N days** | Order status is CONFIRMED or IN_PRODUCTION; no Followup with `created_at` or `due_date` in last N days (e.g. 14) | `orders.status`; `order_followups.order_id`, max(due_date/created_at) | Low | Schedule next follow-up. |
| **Inquiry not updated** | Inquiry status = SENT/DRAFT and `updated_at` older than 7 days | `inquiries.updated_at`, `status` | Low | Update inquiry status or add note; send reminder. |

---

### H. Data Quality

| Alert type | Trigger condition | Table / field | Severity | Recommended next action |
|------------|-------------------|---------------|----------|-------------------------|
| **Order missing delivery date** | Order status is CONFIRMED or beyond and `delivery_date` is null | `orders.delivery_date`, `orders.status` | High | Set delivery date (and trigger TNA if applicable). |
| **Order missing quantity** | Order status not DRAFT and `quantity` is null or 0 | `orders.quantity`, `orders.status` | Medium | Enter order quantity. |
| **Customer missing contact** | Customer linked to active orders has no email or phone (if such fields exist on customers) | `customers` (email, phone); orders.customer_id | Low | Add contact details. |
| **Style inactive with open orders** | GarmentStyle status != ACTIVE but orders or quotations reference it with non-cancelled status | `garment_styles.status`; orders/quotations by style_ref or style_id | Medium | Reactivate style or migrate orders to new style. |
| **Quotation missing valid_until** | Quotation status = SENT and `valid_until` is null | `quotations.valid_until`, `status` | Low | Set validity period. |

---

## 2. ADDITIONAL ALERT TYPES (Garments-specific, 5–8)

These are not already covered in the spec categories above:

1. **Lab-dip approval by color** – Style has colorways (`style_colorways`) but for at least one color there is no approval milestone or task completed in TNA/sample workflow (e.g. “Lab-dip approved” per color). *Table:* style_colorways; TNA/sample tasks or a dedicated approval table. *Severity:* High if order is confirmed and fabric is ordered before approval. *Action:* Get lab-dip approved per color before bulk fabric.

2. **Size set delay by style** – Style has size scale (`style_size_scales`); order or sample has a “size set approval” or “grading” task in TNA that is overdue or not started while cutting is planned. *Table:* style_size_scales; mfg_tna_plan_tasks (task name/code). *Severity:* High. *Action:* Complete size set approval before cutting.

3. **Trim card / accessory approval pending** – Order or style has trims in BOM (BomItem category = trim/accessory) but no “trim card approved” or similar milestone in TNA/sample. *Table:* bom_items.category; TNA template tasks. *Severity:* Medium. *Action:* Get trim card signed off; add milestone if missing.

4. **Pre-production sample (PP) overdue** – Sample request with sample_type = 'pp' or 'pre_production' has target_date in past and status not approved/dispatched. *Table:* mfg_sample_requests.sample_type, target_date, status. *Severity:* Critical. *Action:* Expedite PP sample and buyer approval.

5. **Fabric booking before lab-dip** – Consumption plan or PO exists for fabric (by category) for an order whose style has colorways with no “lab-dip approved” (or equivalent) for that fabric/color. *Table:* consumption_plans, purchase_orders/items, items (category), style_colorways; approval flags or TNA. *Severity:* High. *Action:* Hold fabric PO until lab-dip approved.

6. **Multiple amendments on order** – Order has more than N (e.g. 3) OrderAmendment records with status APPROVED. *Table:* order_amendments.order_id, status. *Severity:* Medium. *Action:* Review order stability; confirm final specs with buyer.

7. **Buyer handover delay** – Order status = CONFIRMED but order_date is more than N days ago and no TNA plan or first TNA task not started (indicates handover to production delayed). *Table:* orders.order_date, status; mfg_tna_plans, mfg_tna_plan_tasks. *Severity:* High. *Action:* Hand over to production; create TNA and assign.

8. **Duplicate follow-up same day** – Two or more followups for same order with same due_date and both OPEN (possible duplicate). *Table:* order_followups.order_id, due_date, status. *Severity:* Informational. *Action:* Merge or close duplicate.

---

## 3. RISK & ESCALATION LOGIC (3 example alert types)

### Example 1: Follow-up overdue (G – Communication)

- **Trigger condition:** `order_followups.due_date` < today AND `status` != 'DONE'.
- **Aging rule:**  
  - Days overdue 1–7: **High**.  
  - Days overdue >7: **Critical**.
- **Escalation rule:** If alert state is **New** and not acknowledged within 3 business days, auto-transition to **Escalated** and notify manager (or configured escalation role).
- **SLA countdown:** SLA = due_date + 3 days for “acknowledge”; display “Acknowledge by &lt;date&gt;” on alert card. After SLA breach, show “Overdue by X days” and escalate.

### Example 2: Order missing TNA plan (A – Order & TNA)

- **Trigger condition:** Order has `delivery_date` set, `status` in (CONFIRMED, IN_PRODUCTION, etc.), and no `mfg_tna_plans` row with `order_id` = order.id.
- **Aging rule:**  
  - Delivery date > 14 days away: **High**.  
  - Delivery date ≤ 14 days away: **Critical**.
- **Escalation rule:** If alert remains **New** or **Acknowledged** for 2 business days and delivery is within 21 days, escalate to production/merch manager.
- **SLA countdown:** “Create TNA by &lt;delivery_date − 21 days&gt;” (or tenant-configured offset). Countdown to that date; after breach, severity becomes Critical and alert escalates.

### Example 3: Quotation margin below threshold (B – Costing)

- **Trigger condition:** Quotation margin (%) < tenant-configured `margin_below_pct`; status DRAFT or SENT.
- **Aging rule:**  
  - Margin 0–5%: **Critical**.  
  - Margin 5% to threshold: **High**.  
  - (No time-based aging; severity is value-based.)
- **Escalation rule:** If alert is **Acknowledged** but quotation not revised (no status change, no updated_at change) within 5 days, escalate to commercial/finance manager.
- **SLA countdown:** “Revise or approve margin by &lt;created_at + 5 days&gt;”. Display days left; on breach, escalate.

---

## 4. SEVERITY RULES (Critical vs High vs Medium vs Low vs Informational)

- **Critical**  
  - Immediate impact on delivery, payment, or safety: delivery_date in past; TNA missing with delivery in &lt;14 days; follow-up &gt;7 days overdue; LC not received before cutoff; PP sample overdue; CAPA overdue with quality block.  
  - Numeric: e.g. margin &lt;5%; wastage &gt;25% (tenant-configurable).

- **High**  
  - Significant risk if not acted on soon: TNA overdue tasks; sample overdue; consumption plan missing; BOM missing for style on order; PO overdue; order missing delivery date; NCR open on order WO; follow-up 1–7 days overdue.  
  - Numeric: margin below threshold but ≥5%; wastage 15–25%.

- **Medium**  
  - Should be resolved in normal workflow: quotation pending/expired; order without quotation; sample due soon; PI not confirmed; follow-up due today; order missing quantity; style inactive with open orders.

- **Low**  
  - Good to fix: inquiry has no quotation; sample not assigned; no follow-up for N days; inquiry not updated; customer missing contact; quotation missing valid_until.

- **Informational**  
  - No immediate action: duplicate follow-up; optional “order created” or “TNA created” confirmations if needed for audit.

**Rule-of-thumb:**  
- **Critical** = delivery/money/quality at risk **now** or within ~2 weeks.  
- **High** = will become critical in ~2–4 weeks or blocks a key milestone.  
- **Medium** = process gap or delay in normal cycle.  
- **Low/Informational** = housekeeping or visibility.

---

## 5. ACTION FLOW – States and transitions

| State | Who can do what | What happens to the alert |
|-------|------------------|----------------------------|
| **New** | Any user with merch/alert read: view. Merch/manager: **Acknowledge**, **Snooze**, **Escalate**, or move to **In Progress** / **Waiting on Buyer** / **Waiting on Supplier**. | Alert appears in “New”; unacknowledged alerts may auto-escalate after SLA (see §3). |
| **Acknowledged** | Owner/assignee or manager: move to **In Progress**, **Waiting on Buyer**, **Waiting on Supplier**, **Resolved**, or **Snoozed**. | Alert no longer counts as “unacknowledged” for escalation; remains open until next state. |
| **In Progress** | Owner: update comment; move to **Waiting on Buyer**, **Waiting on Supplier**, **Resolved**, or **Snoozed**. Manager: reassign, escalate. | Indicates someone is actively working; snooze pauses SLA (optional). |
| **Waiting on Buyer** | Owner/merch: when buyer responds, move to **In Progress** or **Resolved**. Manager: escalate if buyer delay. | Alert stays in queue; optional SLA “response by” for buyer (informational). |
| **Waiting on Supplier** | Owner/merch: when supplier responds or material received, move to **In Progress** or **Resolved**. | Same as above for supplier. |
| **Resolved** | Any transition to Resolved requires optional **resolution note**. Only owner or manager can set **Resolved**. | Alert disappears from active list; can be filtered in “Resolved” list; underlying trigger may re-fire if condition persists (new alert instance). |
| **Snoozed** | User sets **snooze until** date. When that date passes, alert returns to **New** (or previous state) and reappears. | Alert hidden until snooze end; no escalation during snooze (optional). |
| **Escalated** | Manager: reassign, move to **In Progress**, **Waiting on Buyer/Supplier**, or **Resolved**. Original assignee: view only unless re-assigned. | Alert appears in manager queue and in “Escalated” filter; escalation audit logged. |

**State transitions (summary):**  
New → Acknowledged | In Progress | Waiting on Buyer | Waiting on Supplier | Snoozed | Escalated.  
Acknowledged / In Progress / Waiting on Buyer / Waiting on Supplier → any of the same + Resolved + Snoozed; In Progress/Waiting can also → Escalated.  
Snoozed → (on snooze end) New.  
Escalated → In Progress | Waiting on Buyer | Waiting on Supplier | Resolved.  
Resolved is terminal unless condition recurs (then new alert).

---

## 6. TENANT-CONFIGURABLE ITEMS

Recommend making the following configurable per tenant (e.g. in tenant settings or alert_config table):

| Key | Description | Default | Used in |
|-----|-------------|---------|--------|
| **margin_below_pct** | Quotation margin % below which to raise alert | 10 | B – Costing |
| **quotation_pending_days** | Days after which draft/sent quotation is “pending too long” | 7 | B |
| **valid_until_required** | Require valid_until on SENT quotations (boolean) | true | H |
| **followup_overdue_critical_days** | Days overdue for follow-up to be Critical (else High) | 7 | G |
| **days_inactive_style** | Days with no activity to consider “no follow-up on order” | 14 | G |
| **wastage_threshold_pct** | Wastage vs BOM % to raise alert | 15 | F (existing) |
| **wastage_critical_pct** | Wastage % for Critical (above this) | 25 | F |
| **delivery_lead_time_days** | Standard production lead time for “delivery within lead time” alert | 30 | F |
| **tna_days_before_delivery** | Days before delivery by which TNA must exist (SLA) | 21 | A |
| **sample_due_soon_days** | Days before target_date to show “sample due soon” | 5 | C |
| **escalation_ack_sla_days** | Business days to acknowledge before auto-escalate | 3 | §3 |
| **escalation_revision_sla_days** | Days to revise quotation (margin alert) before escalate | 5 | §3 |
| **enable_lab_dip_alerts** | Enable lab-dip approval by color alerts | true | §2 |
| **enable_size_set_alerts** | Enable size set delay alerts | true | §2 |
| **max_amendments_before_alert** | Number of amendments on order to trigger alert | 3 | §2 |
| **buyer_handover_delay_days** | Days after order_date with no TNA start to alert | 7 | §2 |

---

*End of Domain & Workflow Blueprint. All table and field names refer to P7 ERP models (merch, manufacturing, commercial, inventory, costing). Commercial–order linking may require schema change (order_id or join table) for precise alerts.*

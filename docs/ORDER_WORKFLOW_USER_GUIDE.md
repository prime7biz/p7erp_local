# How the order workflow works (user guide)

**Who this is for:** Merchandisers, planners, store / purchase staff, production, and quality users who work in Prime7 ERP day to day.

**Goal:** Follow one clear path from a buyer inquiry to a shipped and paid order.

---

## The idea in one sentence

You create documents in order (inquiry → quotation → order). After the order is confirmed, the system tracks progress on an **order pipeline**. When you finish real work (BOM, purchase, receiving, production, challan, payment), the pipeline moves forward — you do not need to manually click every stage.

---

## Full picture (simple map)

```text
1. Inquiry          →  Buyer request
2. Quotation        →  Price and costing
3. Order            →  Confirmed job (center of everything)
4. Order BOM        →  What materials are needed
5. Follow-up (TNA)  →  Calendar of tasks and approvals
6. Purchase order   →  Buy fabric / trims
7. Goods receiving  →  Materials arrive in stock
8. Line / planning  →  Which line will sew this order
9. Daily production →  Cutting / sewing / finishing
10. Quality         →  Checks / CAPA if needed
11. Delivery challan→  Goods leave the factory
12. Payment         →  Money received → order completed
```

Open the **Order** screen any time to see where you are and what is next.

---

## Part A — Selling (before production)

### 1. Inquiry

**Menu:** Merchandising → Inquiries

1. Create an inquiry for the customer / style.
2. Fill quantity, target price, and other details.
3. Submit when ready.
4. Convert to a quotation when the buyer wants a formal offer.

**Statuses (simple):** Draft → Submitted → Converted (or Lost / Cancelled).

### 2. Quotation

**Menu:** Merchandising → Quotations

1. Build costing (materials, CM, other costs).
2. Submit for approval.
3. After approval, send to the buyer.
4. Convert to an order when the buyer confirms.

**Tip:** Once a quotation is approved / sent / converted, many commercial fields are locked. Changes go through a **change request** where your company requires it.

### 3. Order

**Menu:** Merchandising → Orders → open the order

1. Order is created from the quotation.
2. Commercial terms are saved as a snapshot at conversion.
3. Confirm the order to start the factory / merch execution path.
4. On the order page you will see:
   - **Order pipeline** (stages from confirmed → completed)
   - **Next required action** (what to do next)
   - Links to planning, follow-up, and related screens

**Remember:** The **order** is the hub. Link BOM, purchase, production, and shipment back to this order whenever the screen asks for an order.

---

## Part B — After the order is confirmed

### 4. Order BOM (bill of materials)

**Menu:** Merchandising → BOM Builder / Consumption Plans (order BOM)

1. Create or open the **order** BOM (tied to this order, not only the style).
2. Link inventory items, consumption, and wastage.
3. Submit → Approve → (optional) Freeze when it is the final version.

**Why it matters:** Purchase and material readiness use the **approved / frozen order BOM**. A style-only BOM is for reference / costing — it does not finish the pipeline by itself.

### 5. Follow-up TNA (time and action calendar)

**Menu:** Merchandising → Follow-up TNA (canonical)

This is the **main calendar** for the order: samples, approvals, fabric in-house, cutting, inspection, shipment, and so on.

1. Generate TNA from templates (needs a delivery date on the order).
2. Assign people and update planned / actual dates.
3. Mark tasks submitted, approved, rejected, or completed as work happens.

**Also useful:** Merchandising → Sample development for proto / fit / PP / lab dip style samples.

**Note:** Manufacturing → Samples / TNA (marked “legacy” in the menu) is an older path. Prefer **Follow-up TNA** and **Sample development** under Merchandising.

### 6. Buy materials (PO → GRN)

**Menu:** Inventory → Purchase Orders → Goods Receiving

1. Generate purchase orders from the approved / frozen order BOM (or create POs linked to the order).
2. Send / approve POs with your vendors.
3. When goods arrive, create a **GRN** (goods receiving) and receive into stock.

The order pipeline moves toward **PO issued** and **RM received** as this work is done.

### 7. Plan the line

**Menu:** Manufacturing → Planning / Line plan board

1. Check that materials are ready enough for the order.
2. Propose or confirm a sewing line reservation for the order.
3. Firm booking means “this line is allocated to this order.”

### 8. Daily production

**Menu:** Manufacturing → Hourly (Cutting / Sewing / …) or department screens

1. Enter production against the **order** (and line when asked).
2. Cutting → sewing → finishing / packing as your factory process requires.

**Tip:** Always pick the order when entering hourly data. That keeps the pipeline and on-time delivery tracking accurate.

### 9. Quality

**Menu:** Quality → Inspections / CAPA (and shop-floor QC under Manufacturing)

1. Record inspections and results.
2. Open CAPA if there is a serious problem.
3. Close CAPA before shipping if your company blocks challans on open CAPA.

### 10. Ship and close

**Menu:** Inventory → Delivery Challans → then Accounts / vouchers for payment

1. Create a delivery challan linked to the order.
2. **Post** the challan when goods leave — pipeline moves to **Shipped**.
3. When payment is posted against the order, the pipeline moves to **Payment received** and then **Completed**.

---

## How to read the order pipeline

On **Order detail**, stages look like this (names may be slightly shortened on screen):

| Stage | Meaning |
|-------|---------|
| Order confirmed | Sales order is live |
| PI issued | Proforma invoice done (export) |
| LC received | Letter of credit received (export; local orders may skip) |
| BOM created | Order BOM approved / frozen |
| PO issued | Purchase order raised for materials |
| RM received | Materials largely in-house |
| In production | Floor / process work started |
| Shipped | Delivery challan posted |
| Payment received | Receipt posted |
| Completed | Finished |

You usually **do work on the specialist screens**; the pipeline **updates itself** when those documents exist.

---

## Where to look when something is stuck

| Question | Go here |
|----------|---------|
| What should I do next on this order? | Orders → open order → **Next required action** |
| Which approvals / dates are late? | Merchandising → Follow-up TNA |
| Overall merch health? | Merchandising → Merch control tower |
| Is BOM ready? | BOM Builder / order BOM status |
| Did we buy / receive fabric? | Purchase Orders / Goods Receiving |
| Is production linked to the order? | Hourly / line plan — check order is selected |
| Has it shipped? | Delivery Challans (status must be **Posted**) |

---

## Optional company settings (admin)

In **Settings → Configuration**, your admin can turn on extra rules (all off by default):

| Setting (plain meaning) | What changes for users |
|-------------------------|-------------------------|
| TNA event sync | Completing GRN / sample / challan / hourly can auto-tick matching Follow-up tasks |
| Require order on shop floor | You must select an order when entering hourly production |
| Line allocation → TNA sync | Confirming a line booking can update Follow-up tasks |
| Sample approvals gate PO | You cannot generate BOM→PO until key sample / approval TNA steps are done |
| Open CAPA blocks challan | You cannot post a delivery challan while CAPA is still open on that order |

Ask your admin which of these are on for your company.

---

## Roles — who usually does what

| Role | Typical steps |
|------|----------------|
| Merchandiser | Inquiry, quotation, order, TNA, samples, commercial |
| BOM / costing | Order BOM, consumption |
| Purchase / store | PO, GRN, stock |
| Planning | Line allocation |
| Production | Hourly / department output |
| Quality | Inspections, CAPA |
| Commercial / accounts | PI, LC, challan, payment |

One person may wear several hats in a small company — the **order** still stays the single place to check progress.

---

## Short checklist (happy path)

1. [ ] Inquiry submitted and converted  
2. [ ] Quotation approved / sent and converted to order  
3. [ ] Order confirmed; delivery date set  
4. [ ] Follow-up TNA generated  
5. [ ] Order BOM approved (or frozen)  
6. [ ] Samples / buyer approvals done as required  
7. [ ] POs raised and GRNs received  
8. [ ] Line reserved / firm booked  
9. [ ] Production entered with order selected  
10. [ ] Quality cleared  
11. [ ] Delivery challan **posted**  
12. [ ] Payment posted → order completed  

---

## Related help

- In-app: **Help & Tutorials** (search for pipeline, inquiry, quotation, order).
- Technical spine (for admins / implementers): `docs/ORDER_EXECUTION_SPINE.md`.

---

*Last updated: 2026-07-18 — matches the order execution workflow in Prime7 ERP.*

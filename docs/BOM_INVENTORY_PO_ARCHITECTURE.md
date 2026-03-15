# BOM → Inventory → PO → Finance/Commercial Architecture

Advanced, interconnected flow with wastage control, production efficiency, and multi-level AI. Reference: PrimeX `generatePOFromBOM`, `generateRmRequirement`; P7 parity and extension.

---

## 1. Current state (what you have)

| Area | P7 today |
|------|----------|
| **BOM** | `Bom` (style_id, version_no, status), `BomItem` (category, item_code, description, uom, base_consumption, wastage_pct). No FK to inventory Item. |
| **Inventory** | `Item` (item_code, name, category_id, unit_id, default_cost), `ItemCategory`, `ItemUnit`, `PurchaseOrder` (supplier_name text), `PurchaseOrderItem` (item_id → Item). |
| **Style** | Linked to BOM; no "generate PO from BOM" in P7. |
| **PrimeX reference** | BOM lines have itemId; `generatePOFromBOM(bomId, quantity)` builds PO lines from BOM components; `generateRmRequirement(orderId)` creates RM requirement from approved BOM + order qty. |

So: BOM is not yet tied to the Item master or to vendors; "BOM → PO" and "order → material requirement" don't exist in P7.

---

## 2. Target: one connected chain

**Goal:** Style → BOM (with inventory items) → material requirement / PO → GRN → stock → production / wastage → finance & commercial.

- **Style ↔ BOM:** Already linked; strengthen with "BOM" tab on style detail and "Generate PO from BOM" from BOM.
- **BOM ↔ Inventory:** BOM lines should reference **Item** (and thus category, unit, default cost). Optionally "preferred vendor" per item or per category.
- **BOM → Purchase order:** From an approved (or at least "ready") BOM + quantity (and optionally order), generate PO lines: item, qty = f(base_consumption, wastage, quantity), unit, price (from item or last PO).
- **Vendors:** Today PO only has `supplier_name`. For "vendor list" and AI (e.g. "which vendor for this item?"), introduce a **Vendor/Supplier** master and `purchase_order.vendor_id` (optional migration).
- **Finance & commercial:** PO approval → GRN → optional 3-way match → voucher/AP; cost flows into job/style costing and commercial (margin, LC, etc.). No schema change needed for the "link" if you already have PO/GRN and vouchers; you mainly need the **data flow** (BOM → PO → GRN → books).

So "BOM builder advanced" means: **BOM lines linked to Items (and categories), then "Generate PO" and "Generate material requirement" from BOM, with wastage and efficiency in the loop.**

---

## 3. Data model and API gaps (to make it "advanced")

### BomItem ↔ Item

- Add **`item_id`** (FK to `items.id`, nullable) on `bom_items`. Keep `item_code`/`description` for display/import; when `item_id` is set, use Item's category, unit, default cost.
- BOM UI: when adding/editing a line, **pick from Item master** (with category filter). Optionally "create item from BOM line" for new materials.

### Vendor master (recommended for "vendor list" and AI)

- Tables: `vendors` (tenant_id, code, name, contact, …), optionally `item_vendor` (item_id, vendor_id, preferred, last_price). PO: add `vendor_id` FK, keep `supplier_name` as fallback.

### "Generate PO from BOM"

- **Input:** `bom_id`, `quantity`, optional `order_id` (for reference), optional `vendor_id` (or per-line vendor later).
- **Logic:** for each BOM line with `item_id`, compute `qty = quantity × base_consumption × (1 + wastage_pct)`. Create PO (or PO draft) + PO lines with item_id, qty, unit, unit_price from Item or last PO.
- **API:** e.g. `POST /api/v1/merch/boms/{bom_id}/generate-purchase-order` (or under inventory module).

### "Generate material requirement" from order

- Like PrimeX `generateRmRequirement`: for an order with style_id, take approved (or latest) BOM for that style, explode by order qty + wastage → "requirement" lines (item, required_qty, available_stock, shortage). Optionally create a **material requirement** entity (table) and then "Convert to PO" from that.

### Wastage and production efficiency

- **Wastage:** already in BOM (`wastage_pct`). Use it in:
  - PO generation (qty includes wastage).
  - Consumption / cutting: record "actual consumption" per order or batch; compare to BOM (expected); report variance (e.g. wastage % vs standard).
- **Efficiency:** link production (e.g. manufacturing orders, batches) to order/style and to consumption. Metrics: output qty, actual vs expected consumption, efficiency %. You already have `ConsumptionChangeRequest` and consumption plans; add reporting (by style, order, period) and optional AI "anomaly" (e.g. wastage above threshold).

### Item categories

- Already exist. Use them in: BOM (filter items by category), PO (group lines by category), reports. Optional: "category-level wastage defaults" used when creating BOM lines.

---

## 4. UI/UX: BOM builder and style (advanced mode)

### Style detail

- **Tabs:** Overview, Components, Colorways, Size scale, **BOM**, History.
- **BOM tab:** list BOMs for this style (version, status); "Add BOM" / "Open in BOM builder"; "Generate PO from BOM" (with quantity modal).

### BOM builder

- **Item selection:** Add/edit BOM line by choosing from **Item** master (search by code/name, filter by category). Show category, unit, default cost. If you add `item_id` to BomItem, show item code/name and allow override of description.
- **Wastage:** Per-line wastage % (already in model); optional "wastage template" by category.
- **Actions:**
  - **"Generate purchase order":** opens modal (quantity, optional vendor, target warehouse); creates PO draft and redirects to PO edit.
  - **"Generate material requirement":** for an order linked to this style, explode BOM to requirement lines and show shortage; optional "Create PO from shortage".
- **Costing:** Show estimated material cost (BOM qty × item default_cost or last price) for a given quantity; link to quotation/order costing if you have it.

### Purchase order

- When creating PO from BOM, prefill lines from BOM (item, qty, unit). Allow adding vendor (when you have vendor master), splitting lines by vendor, and editing qty/price before submit.

### Vendor list

- If you add vendor master: vendors list/detail; on Item or PO line, "preferred vendor"; in "Generate PO from BOM", "default vendor" or "by item".

---

## 5. Multi-level AI integration (futuristic automation)

Use existing AI tooling (dashboard, inventory, production, vendors, approvals) and add BOM/merchandising-specific hooks.

### Level 1 – Assistive (what you can add first)

- **BOM:** "Suggest BOM from similar style" (e.g. by product type / department): use PrimeX-style `suggestBom` (historical BOMs by style type) to prefill lines; user confirms.
- **Items:** When user types a BOM line description, "Suggest item from inventory" (search items by name/code/category).
- **PO:** "Suggest vendor for this item" from history (which vendor was used for this item_id last time) once you have vendor master.

### Level 2 – Wastage and efficiency

- **Anomaly:** "Style X / Order Y has wastage % above threshold" (actual vs BOM); feed from consumption vs BOM.
- **Report:** "Styles with highest wastage last month" (from consumption data).
- **Forecast:** "Material requirement for next 30 days" from orders + BOMs (like materialPlanningRoutes in PrimeX).

### Level 3 – Automation

- **Rules:** "When BOM approved and order has delivery date in next N days → suggest/create material requirement and highlight shortage."
- **Auto-suggest PO:** "Orders with shortage and no PO yet" → one-click "Create PO from shortage" (from exploded BOM vs stock).
- **Commercial:** "Style profitability" already exists; feed it with BOM-based material cost and PO/GRN actuals for real margin.

### Where it lives in the stack

- **New tools** in `backend/app/modules/ai_tool/tools/`: e.g. `bom_tools.py` (suggest BOM, suggest item for line), `purchase_tools.py` (suggest vendor, suggest PO from shortage).
- **Existing:** `inventory_tools` (shortages), `vendors_tools` (late vendors); tie "shortage" to "BOM explosion for open orders."
- **Intent/parser:** e.g. "Create PO from BOM", "Which styles have high wastage?", "Material requirement for order X".

---

## 6. Suggested implementation order

**Phase A (done):** `item_id` on `bom_items`, BOM API accept/return `item_id`, create-BOM-item auto-fills from Item when `item_id` set; BOM builder UI: item picker from inventory, base consumption & wastage % inputs, table shows UOM and wastage %.

**Phase B (done):** `POST /merch/boms/{bom_id}/generate-purchase-order` with body `{ quantity, supplier_name? }`; creates draft PO + lines from BOM lines that have `item_id` (qty = quantity × base_consumption × (1 + wastage_pct/100)); unit_price from Item.default_cost. BOM builder: "Generate purchase order" button and modal (quantity, supplier name), then redirect to Purchase Orders list.

**Phase D (done):** `GET /merch/orders/{order_id}/material-requirement` returns exploded requirement from the order’s style BOM (style resolved via order’s linked quotation); required vs available (from `stock_movements` IN/OUT) and shortage per item. Order detail page: "Material requirement" button opens a modal with the requirement table (Item, UOM, Required, Available, Shortage). No persistence yet; "Create PO from shortage" can be added later.

| Phase | What | Why |
|-------|------|-----|
| **A** | Add `item_id` (FK to Item) to BomItem; BOM API and UI: pick item from master when adding/editing line. | So BOM lines are real inventory items and can drive PO. |
| **B** | Implement "Generate PO from BOM": API + UI (quantity, optional vendor); create PO + lines with qty = f(consumption, wastage). | Core "BOM → PO" link; reuse existing PO/GRN. |
| **C** | **(Done)** Vendor master + PO.vendor_id; "Vendor list" page. | Needed for "vendor list" and AI "suggest vendor". |
| **D** | "Generate material requirement" from order (approved BOM + order qty); show shortage; optional "Create PO from shortage". | Matches PrimeX; feeds wastage and AI shortage. |
| **E** | **(Done)** Wastage reporting: actual vs BOM by order/item; efficiency by style; alerts when wastage exceeds threshold. | Wastage control and production efficiency. |
| **F** | **(Done)** AI: suggest BOM from similar style; suggest item for BOM line; suggest vendor; anomaly "high wastage"; suggest orders with shortage. | Multi-level AI and automation. |

---

## 7. Summary

- **Style and BOM** stay interconnected; style detail gets a BOM tab and actions "Open in BOM builder" and "Generate PO from BOM".
- **BOM** is tied to **inventory** by linking each BOM line to **Item** (and thus categories, units, cost); BOM drives purchase orders and material requirement.
- **Vendor list** (and optional preferred vendor per item) connects to PO and to AI.
- **Finance and commercial** are reached through existing PO → GRN → voucher and costing; you mainly need the flows (BOM → PO, order → requirement) and optional reporting by style/order.
- **Wastage and production efficiency** come from BOM wastage %, actual consumption, and reports/alerts.
- **Multi-level AI** is added via new tools (BOM, purchase, wastage) and by reusing inventory/vendor tools, so the system moves toward "futuristic" automation (suggestions, anomaly detection, and automated PO suggestions from shortage).

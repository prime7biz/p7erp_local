import type { TutorialSection } from "../types";

const S = "/tutorials/screens";
const D = "/tutorials/diagrams/inventory";

export const inventorySection: TutorialSection = {
  id: "inventory",
  title: "Inventory",
  description:
    "Items and warehouses, vendors, purchase orders, goods receiving (GRN), material issue, process orders, transfers, stock reports, delivery challans, gate passes and traceability.",
  articles: [
    {
      id: "inv-overview",
      title: "Inventory module map: from buying to dispatch",
      summary:
        "See every Inventory screen on one page and how a requisition becomes a PO, a GRN, stock, a material issue and finally a delivery challan and gate pass.",
      content: `## Overview

**Inventory** is where the store, the buyers and the warehouse record every piece of material that **comes in**, **moves**, **gets used** or **leaves** the factory: fabric, yarn, trims, accessories, packing material and finished goods.

Who uses it:

- **Buyers / purchase team** — vendors, requisitions, purchase orders (PO).
- **Store keepers** — goods receiving (GRN), material issue, transfers, adjustments, stock counts.
- **Dispatch and security** — delivery challans and gate passes.
- **Managers and accounts** — stock reports, valuation, approvals.

Every number in the stock reports comes from these documents, so if the documents are right, the stock is right.

## Before you start

- Your role needs access to the **Inventory** menu. Some items only appear when a feature is turned on for your company (marked *optional* below). An admin turns them on in **Settings → Configuration** (\`/app/settings/config\`).
- Set up master data first: **items, units, warehouses** and **vendors**. See *Set up items, units, warehouses and stock groups* and *Add and manage vendors*.

## Steps — the normal flow

1. **Requisition & CS** *(optional)* — a department asks for material, a manager approves, the buyer compares supplier quotations. \`/app/procurement/requisitions\`
2. **Purchase Orders** — you promise to buy from a supplier. \`/app/inventory/purchase-orders\`
3. **Goods Receiving (GRN)** — the truck arrives; you record what came in and click **Receive to stock**. \`/app/inventory/goods-receiving\`
4. **GRN Inspection** *(optional)* — QC accepts, rejects or holds the received goods. \`/app/inventory/grn-inspection\`
5. **Stock** — the goods are now on hand in a warehouse. Check them in **Stock Summary**.
6. **Use the stock** — issue material to production in **Consumption Control**, or send it for dyeing / printing / washing with a **Process Order**.
7. **Move or correct** — **Transfers** between warehouses, **Adjustments** after a count or damage.
8. **Delivery Challans** — finished goods leave stock when the challan is **POSTED**.
9. **Gate Passes** — security releases the vehicle.
10. **Invoice and ship** — from a posted challan click **Create Invoice** (Commercial) and make the packing list (Logistics).

## Where each screen lives in the sidebar

**Master and setup** — **Stock Master** (\`/app/inventory\`: tabs Masters, Groups, Units, Warehouses, Items) · **Stock Groups** · **Stock Items (hierarchy)** and **Godown Stock** *(optional)* · **Vendors**.

**Procurement** — **Requisitions & CS** *(optional)* · **Purchase Orders** · **Goods Receiving** · **Process Orders**.

**Planning & manufacturing** — **MRP Run**, **Reorder Suggestions**, **Inter-Dept Transfers**, **Receive IDT**, **Process Loss Report**, **Post-Costing**, **Process Loss Standards**, **GRN Inspection**, **Quality Dashboard**, **Vendor Scorecard**, **Cycle Count**, **Serial Tracking**, **Kit Builder**, **Consignment Stock** (each *optional*) · **ABC Analysis**, **EOQ**, **Stock Aging** (always shown). See *Planning and analysis tools*.

**Stock control** — **Transfers** · **Batch Stock Transfer** *(optional)* · **Adjustments** · **Consumption Control** · **Reconciliation**.

**Reports and analytics** — **Stock Summary** · **Inventory Summary (FIFO)** · **Dashboard** · **Ledger** · **Valuation**.

**Outbound** — **Delivery Challans** · **Gate Passes**.

**Traceability** — **Lot Traceability** · **Certificates & order trace** *(optional)*.

## What happens next

- **Merchandising** creates POs from an approved order BOM; they appear in Purchase Orders as **DRAFT**.
- **Finance** turns a received GRN into a **vendor bill** so the supplier can be paid.
- **Manufacturing** uses issued material; production orders live under **Manufacturing** (\`/app/production/manufacturing-orders\`), not here.
- **Commercial / Logistics** take over after a delivery challan is posted (invoice, packing list, shipment).

## Tips

- Every list uses one **Actions** button per row — open it to print, approve, receive or post.
- Documents start as **DRAFT**. A draft never changes stock; only *receive* / *post* does.
- Printed challans, gate passes, GRNs, transfers, material issues and process orders carry a **QR code** for verification.

## Common problems

- **I can't see a menu item (for example Requisitions & CS or MRP Run).** → That feature is off for your company. Ask an admin to turn it on in **Settings → Configuration**.
- **A screen says "… is disabled. Enable …".** → Same reason: the page opened but the feature flag is off.
- **Stock shows a negative number.** → More went out than came in for that item and warehouse. Open **Ledger**, filter the item, and find the missing GRN or the wrong issue.
- **"Requires admin/manager role or permission '…'".** → You hit a material-control gate. See *Approvals and material control gates*.`,
      tags: ["inventory", "stock", "store", "warehouse", "PO", "GRN", "challan", "gate pass", "module map"],
      keywords: ["inventory overview", "store module", "procure to pay", "procurement flow", "material flow", "godown", "stock in stock out", "what is inventory"],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      featured: true,
      coverImage: `${S}/inventory.jpg`,
      infographics: [
        {
          type: "diagram",
          title: "From buying to dispatch",
          caption: "Teal steps bring material in; orange steps use it or send it out. Dashed boxes are optional features.",
          imageSrc: `${D}/procure-to-stock.svg`,
          imageAlt: "Flow: requisition and CS, purchase order, goods receiving, QC inspection, stock, then material issue, transfers, delivery challan, gate pass and invoice",
        },
        {
          type: "flow",
          title: "Open each step",
          steps: [
            { label: "Requisitions & CS", href: "/app/procurement/requisitions" },
            { label: "Purchase Orders", href: "/app/inventory/purchase-orders" },
            { label: "Goods Receiving", href: "/app/inventory/goods-receiving" },
            { label: "Stock Summary", href: "/app/inventory/stock-summary" },
            { label: "Consumption Control", href: "/app/inventory/consumption-control" },
            { label: "Delivery Challans", href: "/app/inventory/delivery-challans" },
            { label: "Gate Passes", href: "/app/inventory/enhanced-gate-passes" },
          ],
        },
      ],
      images: [
        {
          src: `${S}/inventory-stock-summary.jpg`,
          alt: "Stock Summary listing on-hand quantity per item and warehouse",
          caption: "Stock Summary is the quickest way to answer \"how much do we have?\".",
        },
      ],
      relatedAppRoutes: [
        "/app/inventory",
        "/app/inventory/purchase-orders",
        "/app/inventory/goods-receiving",
        "/app/inventory/stock-summary",
        "/app/inventory/delivery-challans",
        "/app/inventory/enhanced-gate-passes",
        "/app/procurement/requisitions",
      ],
      relatedArticleIds: [
        "inv-setup-items-warehouses",
        "inv-po-deep",
        "inv-grn-deep",
        "inv-material-issue",
        "inv-challan-gatepass",
        "inv-stock-reports",
        "inv-approval-gates",
        "gs-row-actions",
      ],
    },
    {
      id: "inv-setup-items-warehouses",
      title: "Step-by-step: set up items, units, warehouses and stock groups",
      summary:
        "Create the categories, units, warehouses and items that every PO, GRN, issue and report depends on — on the Stock Master tabs.",
      content: `## Overview

Before anyone can buy or receive material, the system must know **what** the material is (an **item**), **how it is counted** (a **unit** such as Kg, Yard, Pieces) and **where it is kept** (a **warehouse**, also called a godown or store).

All of this lives on **Inventory → Master and setup → Stock Master** (\`/app/inventory\`). The page has five tabs: **Masters**, **Groups**, **Units**, **Warehouses** and **Items**.

## Before you start

- You need permission to edit inventory masters (usually store in-charge or admin).
- Agree on names with your team first (for example "160 GSM cotton jersey", not "Jersey fabric new").

## Steps

1. **Categories and subcategories** — open the **Masters** tab. Under **Add Category** type a **Name** (for example *Fabric*, *Trim*, *Yarn*) and click **Create Category**. Under **Add Subcategory** choose the category, type a **Name** (for example *Sewing trims*) and click **Create Subcategory**. Codes like \`CAT-0001\` and \`SUBCAT-0001\` are made for you.
2. **Units** — open the **Units** tab, type the **Name** in **Add Unit** (for example *Yard*, *Kilogram*, *Pieces*, *Dozen*) and click **Create Unit**. The code (\`UOM-0001\`) is automatic.
3. **Warehouses** — open the **Warehouses** tab. Under **Add Warehouse** type the **Name** (for example *Main RM Warehouse*, *Finished Goods*) and an optional **Address**, then click **Create Warehouse**. Codes like \`WH-0001\` are automatic.
4. **Items** — open the **Items** tab. In **Add Item** fill:
   - **Item name \\*** — clear and unique.
   - **Category** and **Subcategory** (optional).
   - **Unit** — the unit you count stock in (the *base unit*).
   - **Default WH (optional)** — the warehouse new PO lines will suggest.
   - **Stock group (optional)** — used for accounting (GL) mapping and FIFO reports.
   - **Default cost** — a starting price; real cost comes from GRNs.
   - Tick **Auto reorder** and type a **Reorder lvl** if you want reorder suggestions.
   - Click the orange **+** button to save. The code (\`ITEM-000001\`) is automatic.
5. **Alternate unit** *(optional)* — click the item row, then **Edit**. Fill **Alternate unit (optional)** (for example *Roll*) and **1 Roll = how many Yard?** (for example *50*). Click **Save changes**. Buyers can now enter POs in rolls.
6. **Stock groups** *(optional, for accounts)* — open **Inventory → Stock Groups**. Type a **Group name \\***, choose a parent (or **No parent (top level)**), and optionally pick the GL accounts (**Inventory asset**, **GRNI / clearing**, **COGS**, **WIP**, **Stock adjustment**). Click **Add Group**. Leave GL fields on **— None —** to use the company defaults.

## What happens next

- New items and warehouses appear at once in the PO, GRN, transfer, adjustment and challan forms.
- You can also add an item or a supplier without leaving a PO: click **+ New** next to the list (or press **Alt+C**).

## Tips

- Search the **All Items** list (**Search by code or name…**) before adding — duplicates make stock reports confusing.
- Untick **Active** on an item you no longer use instead of deleting it; old documents still need it.
- Item, unit and warehouse **codes cannot be changed** after creation. Names can.

## Common problems

- **The Category or Unit list says "Add a category first" / "Add a unit first".** → Create them on the **Masters** and **Units** tabs first.
- **"Add at least one item category and unit first (Inventory → Items)."** when clicking **+ New** on a PO. → Same fix.
- **"Cannot delete stock group: … item(s) still reference it."** → Move those items to another group (Edit item → **Stock group**) first.
- **PO lines suggest the wrong warehouse.** → Set the item's **Default warehouse** in Edit item.`,
      tags: ["item master", "items", "warehouse", "unit", "category", "stock group", "setup"],
      keywords: ["add item", "new item", "item code", "godown", "store location", "UOM", "unit of measure", "alternate unit", "roll yard conversion", "subcategory", "GL mapping"],
      estimatedMinutes: 8,
      lastUpdated: "2026-11-06",
      coverImage: `${S}/inventory.jpg`,
      infographics: [
        {
          type: "steps",
          title: "Set up in this order",
          steps: [
            {
              title: "Categories",
              body: "**Masters** tab → **Create Category** / subcategory.",
              imageSrc: `${S}/inv-stock-master-masters.jpg`,
              imageAlt: "Stock Master Masters tab with Add Category and Add Subcategory",
              href: "/app/inventory?tab=masters",
            },
            {
              title: "Units",
              body: "**Units** tab → **Create Unit** (Kg, Yard, Pieces…).",
              imageSrc: `${S}/inv-stock-master-units.jpg`,
              imageAlt: "Stock Master Units tab",
              href: "/app/inventory?tab=units",
            },
            {
              title: "Warehouses",
              body: "**Warehouses** tab → **Create Warehouse**.",
              imageSrc: `${S}/inv-stock-master-warehouses.jpg`,
              imageAlt: "Stock Master Warehouses tab with Add Warehouse form and list",
              href: "/app/inventory?tab=warehouses",
            },
            {
              title: "Items",
              body: "**Items** tab → fill **Add Item** → orange **+**.",
              imageSrc: `${S}/inventory.jpg`,
              imageAlt: "Stock Master Items tab with Add Item form and All Items list",
              href: "/app/inventory?tab=items",
            },
            {
              title: "Alternate unit (optional)",
              body: "Item row **Actions → Edit** → **Alternate unit** and factor → **Save changes**.",
            },
          ],
        },
      ],
      images: [
        {
          src: `${S}/inventory-stock-groups.jpg`,
          alt: "Stock Groups page with Add Stock Group form and GL mapping fields",
          caption: "Stock Groups link items to accounting (GL) accounts. Leave GL fields on None to use company defaults.",
        },
        {
          src: `${S}/inv-item-edit.jpg`,
          alt: "Edit item dialog on Stock Master with name, category, unit, alternate unit, default warehouse and stock group",
          caption: "Row Actions → Edit opens this dialog. The item code cannot be changed; set the alternate unit here.",
        },
      ],
      relatedAppRoutes: ["/app/inventory", "/app/inventory/stock-groups", "/app/inventory/stock-items", "/app/inventory/godown-stock"],
      relatedArticleIds: ["inv-overview", "inv-vendors", "inv-po-deep"],
    },
    {
      id: "inv-vendors",
      title: "Step-by-step: add and manage vendors (suppliers)",
      summary: "Keep one clean supplier list so POs, GRNs, vendor bills and the vendor scorecard all point to the same supplier.",
      content: `## Overview

A **vendor** (supplier) is a company you buy from: fabric mills, trims suppliers, packing suppliers, dyeing or printing subcontractors. **Inventory → Vendors** (\`/app/inventory/vendors\`) is the supplier master used by purchase orders, goods receiving, process orders and finance.

## Before you start

- Collect the supplier's legal name, contact person, phone, email, address and the currency you pay them in.
- Check the list first (**Search by code or name…**) so you do not create the same supplier twice.

## Steps

1. Open **Inventory → Vendors**. The cards at the top show **Total vendors**, **Active**, **Inactive**, **Ledger linked** and **Foreign currency**.
2. Click **Add vendor**. A panel opens on the right.
3. Fill **Vendor code \\*** (your own short code, for example \`LKH-VEND-FABRIC-01\`) and **Name \\***.
4. Add **Contact person**, **Email**, **Phone** and **Address**.
5. Choose **Vendor type** and **Currency** (for example BDT or USD), and fill **Country** and **City**.
6. Click **Create vendor**.
7. To change a supplier later, click its row. In edit mode you also get **Ledger ID** (link to the accounts ledger), **Payment Terms (days)**, bank details (**Bank Name**, **Bank Account**, **SWIFT Code**) and **Credit Limit**. Click **Save**.

## What happens next

- The vendor appears in **Select vendor (optional)** on the PO form; its currency is filled in automatically.
- GRNs and vendor bills use the PO's vendor, so finance can pay the right party.
- **Vendor Scorecard** *(optional)* rates suppliers by QC rejections and delivery.

## Tips

- In a hurry while making a PO? Click **+ New** next to the vendor list (or **Alt+C**). A code like \`VEN-0001\` is generated and the supplier is selected for you. Complete the details on Vendors later.
- Use the filters (**All status**, **All vendor types**, currency, **All ledger**) to find suppliers that still need a ledger link.
- The **Supplier AI** box in the panel can **Extract from document** (for example a supplier's letterhead), **Enrich from website / hints**, **Validate profile** and **Find possible duplicates**. Its suggestions are only applied after you review them.

## Common problems

- **The supplier is missing in the PO list.** → It may be **Inactive**. Only active vendors are offered. Reactivate it on Vendors.
- **Wrong currency on new POs.** → Fix the vendor's **Currency**; it is copied to each new PO.
- **Two records for one supplier.** → Pick one, make the other inactive, and use the active one from now on.`,
      tags: ["vendor", "supplier", "vendor master", "supplier master"],
      keywords: ["add supplier", "new vendor", "supplier list", "subcontractor", "mill", "vendor code", "payment terms", "supplier bank"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      coverImage: `${S}/inventory-vendors.jpg`,
      images: [
        {
          src: `${S}/inv-vendor-add.jpg`,
          alt: "Add vendor panel with vendor code, name, contact and currency fields",
          caption: "Click Add vendor, fill the fields marked with a star, then click Create vendor.",
        },
      ],
      relatedAppRoutes: ["/app/inventory/vendors", "/app/inventory/vendor-scorecard"],
      relatedArticleIds: ["inv-po-deep", "inv-setup-items-warehouses", "inv-supplier-portal"],
    },
    {
      id: "inv-requisition-cs",
      title: "Step-by-step: requisition and comparative statement (CS)",
      summary:
        "Ask for material, get it approved, compare supplier quotations side by side, pick a supplier with a written reason, and turn it into a PO.",
      content: `## Overview

Use this when buying must be **approved and compared** before a PO is raised: someone requests material, a manager approves, the buyer collects **supplier quotations**, the **Comparative Statement (CS)** shows them side by side, and the chosen supplier becomes a PO. The reason for choosing a supplier is always recorded for audit.

The screen is **Inventory → Procurement → Requisitions & CS** (\`/app/procurement/requisitions\`).

## Before you start

- The feature must be on: **Settings → Configuration** (\`/app/settings/config\`, choose **More features** at the top) **→ Procurement → Requisitions & comparative statement (CS)**. If it is off, the page shows *"Procurement comparative statement is disabled."*
- Items must exist in Stock Master, and suppliers in Vendors (or add them with **+ New** while entering a quotation).
- Only an **admin or manager** can approve, reject and select the supplier.

## Steps

1. Click **+ New requisition**. Fill **Department** (for example *Merchandising*), **Required by**, **Purpose** (for example *Fabric for order 123*) and one line per item: **Select item…**, **Warehouse (optional)**, **Quantity**, **Est. price** (optional). Save the draft.
2. Open the requisition and click **Submit**.
3. A manager clicks **Approve** — or **Reject** with a reason (the requester can then edit and submit again).
4. While it is **Approved — collecting quotations**, add a **supplier quotation** for each supplier: choose the supplier (type to search, or **+ New**), currency, delivery days, payment terms and a unit price for each line. Add at least two to compare.
5. Read the **Comparative Statement**: the lowest price on each line is green; totals are ranked among suppliers that priced **every** line.
6. A manager clicks **Select** under the chosen supplier and types the **reason** (required — especially if it is not the cheapest, for example *"delivers in 10 days"*).
7. Click **Create PO**. A **DRAFT** purchase order is created with that supplier's prices and the requisition quantities. Continue under **Purchase Orders**.

## What happens next

- The requisition shows **PO created**. The PO follows the normal PO approval (see *Create a purchase order*).
- **History** at the bottom of the requisition shows every step, who did it and why.

## Tips

- Quotations can only be added or removed while the requisition is **Approved** (before a supplier is selected).
- Use **All statuses** on the list to filter, for example to see only requisitions waiting for approval.

## Common problems

- **"Procurement comparative statement is disabled."** → Ask an admin to turn on the feature (see *Before you start*).
- **I can't see Approve or Select.** → Only admins and managers can do these steps.
- **The CS warns about different currencies.** → Totals are not converted. Ask suppliers to quote in one currency or compare carefully by hand.
- **A supplier is missing from the ranking.** → It did not price every line, so its total is not comparable.`,
      tags: ["requisition", "purchase requisition", "comparative statement", "CS", "quotation", "procurement"],
      keywords: ["rfq", "supplier quote", "compare prices", "cheapest supplier", "approval", "PR", "indent", "demand note"],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      coverImage: `${S}/inv-requisition-new-form.jpg`,
      infographics: [
        {
          type: "diagram",
          title: "Requisition status steps",
          caption: "From draft to PO. A rejected requisition goes back to the requester.",
          imageSrc: `${D}/requisition-cs-lifecycle.svg`,
          imageAlt: "Requisition lifecycle: Draft, Submitted, Approved collecting quotations, Supplier selected, PO created, with Rejected going back to Draft",
        },
      ],
      images: [
        {
          src: `${S}/inv-requisition-new-form.jpg`,
          alt: "New requisition form with department, required by, purpose and item lines",
          caption: "+ New requisition opens this form: department, date needed, purpose and one line per item.",
        },
      ],
      relatedAppRoutes: ["/app/procurement/requisitions"],
      relatedArticleIds: ["inv-po-deep", "inv-vendors", "inv-overview"],
    },
    {
      id: "inv-po-deep",
      title: "Step-by-step: create a purchase order",
      summary:
        "Fill the New Purchase Order form, add item lines, save it as DRAFT, get it approved, then track receipts, history and the colour/size breakdown.",
      content: `## Overview

A **purchase order (PO)** is your written promise to buy material from a supplier at an agreed price. It tells the store what to expect, and finance what to pay. POs live in **Inventory → Procurement → Purchase Orders** (\`/app/inventory/purchase-orders\`). The **New Purchase Order** form is at the top of that page; the list of POs is below it.

## Before you start

- Items and warehouses exist in **Stock Master**, and the supplier exists in **Vendors** (or create them on the spot with **+ New** / **Alt+C**).
- Fields marked with **\\*\\*** are mandatory.
- Approving needs a manager (or a role your admin allows).

## Steps

1. Open **Inventory → Purchase Orders**.
2. **Supplier** — choose it in **Select vendor (optional)**. **Supplier name \\*\\*** and **Currency (USD/BDT)** fill in by themselves. New supplier? Click **+ New** (or press **Alt+C** on the list).
3. **Currency** — if you pay in foreign currency, type the **FX rate to base** (for example 1 USD = 110 BDT → \`110\`).
4. **Dates and links** — the first date box is the order date, the second is the **expected delivery date**. Fill **BTB LC ID (optional)** if the purchase is under a back-to-back LC, and **Notes**.
5. **Line** — pick the item (or **+ New**), the warehouse it goes to, **Qty** and **Unit price**. A grey hint shows the item's stock group, stock and average cost.
   - **Alternate units:** if the item has one (for example *1 Roll = 50 Yard*), choose **Enter in: Roll (alternate unit)**, type quantity and price per roll, and adjust the factor if this supplier's roll is different. The PO saves the base unit (4 Roll @ 100 → 200 Yard @ 2).
6. Click **Add Line**. The line appears under the form (*Line 1: … · Qty …*) with **Est. base total**. Repeat for each item.
7. Click **Create Purchase Order**. The PO appears in the list as **DRAFT**.
8. **Approve** — a manager opens **Actions → Approve** on the row (or ticks several rows and clicks **Approve** above the table).
9. **Print** — **Actions → Print** opens a printable PO to send to the supplier.

## What happens next

- When goods arrive: **Actions → Goods receiving (this PO)** (see *Goods receiving (GRN)*).
- **Actions → Receipt progress & vendor bill** shows, per line, **Ordered**, **Accepted recv.** and **Pending**, the received GRNs with **Create vendor bill draft**, the **History** of status changes and — when the supplier portal is on — **Supplier replies**.
- The status moves by itself to **PARTIALLY_RECEIVED** and **FULLY_RECEIVED** as GRNs are received.

## Colour / size breakdown

In **Actions → Receipt progress & vendor bill**, the **Colour / size breakdown** section splits each line by colour and size (for example trims per garment colour). **Use order colours & sizes** copies the linked order's grid. The breakdown never changes the PO quantity; once a PO is past **DRAFT**, a saved grid must add up to the line quantity, and closed or cancelled POs are read-only. (Feature \`po_color_size_matrix_enabled\`, on by default.)

## Pre-close or cancel

- **Actions → Close (pre-close)** on an **APPROVED** or **PARTIALLY_RECEIVED** PO when the supplier will not ship the rest. Type a **reason**; the history keeps the reason and the quantity still pending.
- **Actions → Cancel** (also with a reason) on **DRAFT**, **APPROVED** or **PARTIALLY_RECEIVED**. Cancelled and closed POs cannot be received.
- Bulk **Close** / **Cancel** above the table asks for one reason for all selected POs; POs whose status does not allow it are skipped.

## Tips

- Type a status in **Status Filter** (for example \`DRAFT\`) to see only those POs; the table also has **Views**, **Columns** and **Export**.
- POs created from a merchandising BOM arrive as **DRAFT** — check supplier and prices before approving.

## Common problems

- **"Select a vendor or enter supplier name".** → Choose a vendor or type the supplier name.
- **"Add at least one item line".** → You filled the line but did not click **Add Line** before **Create Purchase Order**.
- **"Enter how many Yard make one Roll."** → In alternate-unit mode the factor must be greater than 0.
- **Approve is missing in Actions.** → Only **DRAFT** POs can be approved. Older or demo POs marked **CONFIRMED** show only Print, Receipt progress and Goods receiving.
- **"Purchase order cannot move from … to …".** → That status change is not allowed (for example re-opening a CLOSED PO). Create a new PO instead.`,
      tags: ["purchase order", "PO", "procurement", "vendor", "colour size breakdown", "quick create", "pre-close"],
      keywords: ["create PO", "new PO", "raise PO", "work order to supplier", "approve PO", "close PO", "cancel PO", "BTB LC", "alternate unit", "roll", "color size matrix", "purchase order print"],
      estimatedMinutes: 8,
      lastUpdated: "2026-11-06",
      featured: true,
      coverImage: `${S}/inventory-purchase-orders.jpg`,
      videos: [
        {
          src: "/tutorials/videos/inv-create-po.webm",
          poster: "/tutorials/videos/inv-create-po-poster.jpg",
          title: "Create a purchase order",
          caption: "Pick the vendor, add an item line, then click Create Purchase Order to save it as DRAFT.",
          durationSeconds: 46,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Create and approve a PO",
          steps: [
            {
              title: "Fill the form and add lines",
              body: "Vendor, currency, dates, then item, warehouse, **Qty**, **Unit price** → **Add Line**.",
              imageSrc: `${S}/inv-po-form-filled.jpg`,
              imageAlt: "New Purchase Order form with vendor selected and one line added",
              href: "/app/inventory/purchase-orders",
            },
            {
              title: "Save as DRAFT",
              body: "Click **Create Purchase Order**. The PO appears in the list.",
              imageSrc: `${S}/inventory-purchase-orders.jpg`,
              imageAlt: "Purchase Orders list with PO code, supplier, vendor, currency and status columns",
            },
            {
              title: "Approve and follow up",
              body: "**Actions → Approve**, **Print**, **Goods receiving (this PO)** or **Receipt progress & vendor bill**.",
              imageSrc: `${S}/inv-po-actions-menu.jpg`,
              imageAlt: "Actions menu on a purchase order row",
            },
            {
              title: "Track receipts and history",
              body: "Ordered vs accepted vs pending per line, received GRNs and the status history.",
              imageSrc: `${S}/inv-po-receipt-progress.jpg`,
              imageAlt: "Receipt progress dialog with ordered, accepted and pending quantities",
            },
          ],
        },
        {
          type: "diagram",
          title: "PO status steps",
          caption: "Approve, receive, then close. Cancel or pre-close always needs a reason.",
          imageSrc: `${D}/po-lifecycle.svg`,
          imageAlt: "PO lifecycle: Draft, Approved, Partially received, Fully received, Closed, with Cancelled branch",
        },
      ],
      images: [
        {
          src: `${S}/inv-po-colour-size.jpg`,
          alt: "Receipt and AP dialog for a PO with the Colour / size breakdown grid at the bottom",
          caption: "Colour / size breakdown (when enabled): add colours and sizes per line; the grid total must equal the line quantity before Save breakdown.",
        },
      ],
      relatedAppRoutes: ["/app/inventory/purchase-orders", "/app/inventory/vendors", "/app/inventory"],
      relatedArticleIds: ["inv-grn-deep", "inv-requisition-cs", "inv-vendors", "inv-supplier-portal", "gs-row-actions"],
    },
    {
      id: "inv-grn-deep",
      title: "Step-by-step: goods receiving (GRN)",
      summary:
        "Record goods that arrive against a PO, check the lines, click Receive to stock, then hand the GRN to finance for the vendor bill.",
      content: `## Overview

A **GRN (goods receiving note)** records material that physically arrived at your store. Until a GRN is **received**, the material does not exist in stock. GRNs live in **Inventory → Procurement → Goods Receiving** (\`/app/inventory/goods-receiving\`).

Who uses it: the **store keeper** at the receiving bay; **QC** when inspection is on; **accounts** afterwards for the vendor bill.

## Before you start

- The PO should be **APPROVED** (a GRN cannot be made against a **CLOSED** or **CANCELLED** PO).
- Have the supplier's **delivery challan**, **invoice** and the **vehicle number** in hand.
- Count the goods first. **Receive to stock** cannot be undone from this screen.

## Steps

1. **Open the GRN from the PO** — on **Purchase Orders** use **Actions → Goods receiving (this PO)**. A blue bar says *"Filtered to purchase order #…"* and the form has the PO selected. (Or open Goods Receiving and pick the PO in **Select PO**.)
2. Leave the first list on **PO receipt**. (Use **Non-PO receipt** only for goods without a PO — see *Common problems*.)
3. **Vendor (optional / non-PO)** is taken from the PO. Fill **Default warehouse ID (optional)** only if PO lines have no warehouse.
4. Copy the paperwork: **Supplier challan no.**, **Supplier invoice no.**, **Vehicle info** and the received date. Add **Notes** if needed.
5. Click **Create GRN (header)**. A new **DRAFT** GRN appears in the list. Its lines are copied from the PO with the **pending** quantity of each line.
6. Click **Lines** on the row to check **Item**, **WH**, **Received**, **Accepted**, **Rejected**, **Reject reason** and **Pending**.
7. When the count matches, open **Actions → Receive to stock**. The status becomes **RECEIVED**, stock goes up, and the PO moves to **PARTIALLY_RECEIVED** or **FULLY_RECEIVED**.
8. After receiving, **Actions** offers **Print (layout)**, **Issue acknowledgement** (a receipt record for the supplier), **Create vendor bill draft (Finance)** and **GL postings**.

## What happens next

- **Finance**: **Create vendor bill draft (Finance)** makes a draft bill; accounts open **Finance → Vendor bills (GRN)**, enter the invoice reference and post it. (**Create legacy payable (Outstanding Bills)** is the older method — use it only if finance asks.)
- **QC inspection on** (\`grn_quality_inspection_enabled\`): received goods go to a **quarantine** warehouse first. QC opens **GRN Inspection** (\`/app/inventory/grn-inspection\`) and accepts, rejects or holds each line; only accepted goods become usable stock.
- **Stock Summary** and **Ledger** show the new stock with reference **GRN**.

## Tips

- Filter the list with **Status filter** (for example \`DRAFT\`) to find GRNs still waiting to be received.
- **Clear PO filter** in the blue bar shows all GRNs again.

## Common problems

- **Only part of the delivery arrived.** → This screen always copies the **full pending quantity** of every PO line and has no box to change it. Do not click **Receive to stock** for a short delivery. Wait for the rest, or ask your admin (with QC inspection on, QC can accept only what really arrived).
- **"Requires admin/manager role or permission 'inventory.over_receipt_approve'".** → The total received would be more than the PO line. Ask the buyer to amend the PO, or ask a manager to receive it.
- **"Non-PO receipts require a reason (governance)."** → For a **Non-PO receipt**, fill **Non-PO reason (required for non-PO)**. Receiving it also needs a manager or \`inventory.non_po_receipt_approve\`.
- **"Select a purchase order for a PO receipt, or choose Non-PO receipt".** → **PO receipt** needs a PO in **Select PO**. For goods without a PO, switch to **Non-PO receipt** and give a reason.
- **"GRN has no items" on Receive to stock.** → A non-PO GRN created on this screen has no lines, and PO lines that are already fully received are not copied. Raise a PO (even after the fact) and receive against it.
- **"Cannot receive against cancelled or closed PO".** → Re-open is not possible; create a new PO for the remaining goods.
- **"Each line needs a warehouse_id or default_warehouse_id on GRN".** → Give the PO line a warehouse, or type the **Default warehouse ID**.
- **Received too much by mistake.** → Correct it with a negative **Stock Adjustment** (reason \`COUNT\` or \`OTHER\`) and tell accounts.`,
      tags: ["GRN", "goods receiving", "receiving", "stock in", "PO", "vendor bill", "QC"],
      keywords: ["goods receipt note", "MRR", "material receiving report", "receive goods", "inward", "store receive", "supplier challan", "non-PO receipt", "over receipt", "quarantine", "acknowledgement"],
      estimatedMinutes: 8,
      lastUpdated: "2026-11-06",
      featured: true,
      coverImage: `${S}/inventory-goods-receiving.jpg`,
      videos: [
        {
          src: "/tutorials/videos/inv-grn-from-po.webm",
          poster: "/tutorials/videos/inv-grn-from-po-poster.jpg",
          title: "Receive goods against a PO (GRN)",
          caption: "Open Goods receiving from the PO, copy the supplier paperwork, create the GRN, check Lines, then Receive to stock.",
          durationSeconds: 55,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Receive a delivery",
          steps: [
            {
              title: "Start from the PO",
              body: "**Actions → Goods receiving (this PO)**, then copy challan, invoice and vehicle.",
              imageSrc: `${S}/inv-grn-from-po.jpg`,
              imageAlt: "Goods Receiving form filtered to one purchase order with supplier challan and invoice filled",
              href: "/app/inventory/purchase-orders",
            },
            {
              title: "Check the lines",
              body: "Click **Lines**: received, accepted, rejected and pending quantity per item.",
              imageSrc: `${S}/inv-grn-lines.jpg`,
              imageAlt: "GRN row expanded showing item, warehouse, received, accepted, rejected and pending columns",
            },
            {
              title: "Receive to stock",
              body: "**Actions → Receive to stock** on the DRAFT GRN. Afterwards: vendor bill draft, acknowledgement, GL postings.",
              imageSrc: `${S}/inv-grn-actions-menu.jpg`,
              imageAlt: "Actions menu of a GRN row with print, GL postings, acknowledgement and vendor bill options",
            },
          ],
        },
        {
          type: "diagram",
          title: "GRN steps and checks",
          caption: "A DRAFT GRN changes nothing. Receive to stock runs the checks and adds stock.",
          imageSrc: `${D}/grn-lifecycle.svg`,
          imageAlt: "GRN lifecycle from Create GRN header to Draft to Receive to stock to Received, with governance checks",
        },
      ],
      relatedAppRoutes: [
        "/app/inventory/goods-receiving",
        "/app/inventory/purchase-orders",
        "/app/inventory/grn-inspection",
        "/app/inventory/quality-dashboard",
      ],
      relatedArticleIds: ["inv-po-deep", "inv-approval-gates", "inv-returns-rejections", "fin-bills-ap", "inv-stock-reports"],
    },
    {
      id: "inv-material-issue",
      title: "Step-by-step: issue material to production (Consumption Control)",
      summary:
        "Issue fabric and trims to cutting or sewing against an order's approved BOM, see BOM vs actual usage, and request consumption changes.",
      content: `## Overview

When the cutting or sewing floor needs material, the store **issues** it. In P7 ERP this happens in **Inventory → Stock control → Consumption Control** (\`/app/inventory/consumption-control\`). Issuing against the order's **BOM** (bill of materials) lets the system compare **planned** use with **actual** use, so over-consumption is caught early.

The page has these parts, top to bottom:

- **Order picker** + **Finalize Order Snapshot** + **Open reconciliation**.
- **Material variance (BOM vs actual issues)** — BOM gross qty vs **Actual issued** per BOM line.
- **New production material issue (approved BOM)** — the main material issue (PMI).
- **Issue Reserved Material** — issue from quantities reserved for the order.
- **Consumption Change Requests** — ask to increase, decrease or substitute material.

## Before you start

- The order must have an **approved BOM** (Merchandising).
- The material must be in stock in the warehouse you issue from.
- Issuing more than the BOM allows needs a manager (\`inventory.over_issue_approve\`).

## Steps

1. Choose the order in the first list (it shows *order code | style | status*).
2. Look at **Material variance**: note the **BOM line** number (for example \`#43\`) and how much is still unissued.
3. In **New production material issue (approved BOM)** fill the four boxes from left to right: **BOM ID**, the stage (**Stage e.g. CUTTING**), **Covered order qty** (how many garments this issue covers) and the warehouse. (The grey hint text disappears once a box has a value, so remember this order.)
4. For each material, fill **BOM line ID** and **Actual issue qty**. Use **Add line** for more lines and **Remove** to drop one.
5. Click **Post production material issue**. The issue is **posted at once** (no draft): stock goes **OUT** and the issue appears under **Production material issues (this order)** with print and GL postings.
6. To issue reserved material instead, use **Issue Reserved Material**: pick the item (it shows *Remaining*), **Issue qty**, warehouse, optional **BOM line**, **Remarks**, then **Issue**.

## What happens next

- **Material variance** and **Stock Summary** update immediately; the Ledger shows reference **PRODUCTION**.
- **Open reconciliation** opens Merchandising's consumption reconciliation for the order.
- When the order is finished, **Finalize Order Snapshot** locks the planned-vs-actual numbers (**Snapshot Status** becomes **Locked**).

## Tips

- Need more fabric than the BOM? Raise a **Consumption Change Request** (**Quantity Increase**, **Quantity Decrease**, **Item Substitution** or **New Item**) with a reason, instead of over-issuing quietly.
- Check the issue slip with print preview before handing material over — it carries a QR code.

## Common problems

- **"Insufficient stock for issue. Available=…, Required=…".** → Not enough stock in that warehouse. Check **Stock Summary**, receive the pending GRN, or transfer stock first.
- **"Requires admin/manager role or permission 'inventory.over_issue_approve'".** → You issued more than BOM + tolerance. Ask a manager, or raise a change request.
- **Post production material issue is greyed out.** → Fill **BOM ID** and at least one **BOM line ID**.
- **I posted a wrong quantity.** → Posted issues cannot be edited. Return the extra material to the warehouse with a positive **Stock Adjustment** and note the issue code.`,
      tags: ["material issue", "PMI", "consumption", "BOM", "store issue", "production"],
      keywords: ["issue fabric", "issue trims", "store requisition", "material requisition slip", "stock out to production", "cutting issue", "over consumption", "consumption change request", "BOM variance"],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-06",
      coverImage: `${S}/inventory-consumption-control.jpg`,
      infographics: [
        {
          type: "steps",
          title: "Post a material issue",
          steps: [
            {
              title: "Pick the order and read the variance",
              body: "Choose the order; note BOM line numbers and what is still unissued.",
              imageSrc: `${S}/inventory-consumption-control.jpg`,
              imageAlt: "Consumption Control with order picker and material variance table",
              href: "/app/inventory/consumption-control",
            },
            {
              title: "Fill the issue",
              body: "**BOM ID**, stage, **Covered order qty**, warehouse, then **BOM line ID** + **Actual issue qty** per line.",
              imageSrc: `${S}/inv-consumption-pmi.jpg`,
              imageAlt: "New production material issue form with BOM ID, stage, covered quantity and lines",
            },
            {
              title: "Or issue reserved material",
              body: "Pick the reserved item, **Issue qty**, warehouse → **Issue**.",
              imageSrc: `${S}/inv-consumption-reserved.jpg`,
              imageAlt: "Issue Reserved Material form",
            },
          ],
        },
        {
          type: "diagram",
          title: "When stock really moves",
          caption: "A material issue posts immediately — there is no draft step.",
          imageSrc: `${D}/draft-then-post.svg`,
          imageAlt: "Transfers and adjustments are saved as draft then posted; production material issue posts at once",
        },
      ],
      relatedAppRoutes: ["/app/inventory/consumption-control", "/app/merchandising/consumption-reconciliation"],
      relatedArticleIds: ["inv-approval-gates", "inv-stock-reports", "inv-transfer-adjust", "mfg-overview"],
    },
    {
      id: "inv-process-orders",
      title: "Step-by-step: process orders (dyeing, printing, washing, knitting)",
      summary:
        "Send material to an internal or subcontract process, receive the converted output with its loss and charges, and get the order approved.",
      content: `## Overview

A **process order** converts one item into another through a process: grey fabric → dyed fabric, yarn → knitted fabric, plain panels → printed panels, garments → washed garments. It is used for **in-house** processing and for **subcontractors** (send-out work). Screen: **Inventory → Procurement → Process Orders** (\`/app/inventory/process-orders\`).

The system tracks the **input** that left, the **output** that came back, the **process loss** and the **charges**, so the output item gets a true cost.

## Before you start

- Both the **input item** (for example *grey fabric*) and the **output item** (for example *dyed fabric*) exist in Stock Master. For a finish change only (same item), tick **Output same as input (state/finish change only)**.
- The subcontractor exists in **Vendors** (choose it in **Vendor / subcontractor**).
- Enough input stock is in the input warehouse.

## Steps

1. In **Create Process Order**, choose the process type: **KNITTING**, **DYEING**, **FINISHING**, **CUTTING**, **WASHING** or **PRINTING**. Add a **Process stage label** if you use stages.
2. Fill **Prior process order ID** if this step follows another process order (for example dyeing after knitting).
3. Choose **Vendor / subcontractor**.
4. Search the input item (**Search input item…**) and the output item (**Search output item…**).
5. Enter the input quantity, the **Expected output qty** and, optionally, **Planned loss %**.
6. Choose the **Input warehouse** and **Output warehouse**.
7. Optional links: **Linked order ID**, **Source order ID**, **Source BOM ID**, **Output grade**, **Output lot #**, **Remarks**.
8. Click **Create**. The order appears in the list as **DRAFT**.
9. When the material leaves: **Actions → Issue input** → status **ISSUED** (input stock goes out to work-in-progress).
10. While ISSUED, add charges: **Actions → Add cost line** (**Cost type**, **Amount**, **Description**).
11. When the output comes back: **Actions → Receive output**, enter **Actual output qty** and **Processing charges** → status **RECEIVED**.
12. A manager clicks **Actions → Approve** → **APPROVED**.

## What happens next

- Output stock appears in the output warehouse; the loss shows in the **Loss** column (*plan %* and *act* quantity).
- **Inventory Summary (FIFO) → WIP** shows the value still sitting at processors.
- **Print preview** prints a QR-verified process order; **GL postings** shows the accounting entries.

## Tips

- Add all cost lines **before** **Receive output** — they are rolled into the output item's unit cost.
- Use **Output lot #** so dyed lots can be traced later.

## Common problems

- **"Please select both input and output items."** → Pick both items (or tick **Output same as input**).
- **"Insufficient stock…" on Issue input.** → Not enough input stock in the input warehouse. Receive or transfer it first.
- **"Requires admin/manager role or permission 'inventory.process_order_approve'".** → Approval is for managers or roles with that permission.
- **"Only received process order can be approved".** → Receive the output first.`,
      tags: ["process order", "subcontract", "dyeing", "printing", "washing", "knitting", "job work", "process loss"],
      keywords: ["send out", "sub-contract", "outsourced process", "grey fabric", "dyeing order", "print order", "wash order", "conversion", "WIP", "process charges", "finishing"],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-06",
      coverImage: `${S}/inventory-process-orders.jpg`,
      infographics: [
        {
          type: "diagram",
          title: "Process order status steps",
          caption: "Issue input, receive output, approve. Add cost lines while the order is ISSUED.",
          imageSrc: `${D}/process-order-lifecycle.svg`,
          imageAlt: "Process order lifecycle: Draft, Issued, Received, Approved",
        },
        {
          type: "flow",
          title: "Related screens",
          steps: [
            { label: "Vendors (subcontractors)", href: "/app/inventory/vendors" },
            { label: "Process Orders", href: "/app/inventory/process-orders" },
            { label: "Inventory Summary (FIFO) — WIP", href: "/app/inventory/stock-inventory-summary" },
          ],
        },
      ],
      relatedAppRoutes: ["/app/inventory/process-orders", "/app/inventory/stock-inventory-summary"],
      relatedArticleIds: ["inv-approval-gates", "inv-vendors", "inv-planning-tools", "inv-stock-reports"],
    },
    {
      id: "inv-transfer-adjust",
      title: "Step-by-step: transfers and stock adjustments",
      summary:
        "Move stock between warehouses with a transfer, and correct counts, damage or system errors with an adjustment — save as draft, then post.",
      content: `## Overview

- **Transfers** (\`/app/inventory/warehouse-transfers\`) move stock from one warehouse to another, for example from *Main RM Warehouse* to the *Cutting store*.
- **Adjustments** (\`/app/inventory/stock-adjustments\`) correct the quantity in one warehouse after a physical count, damage, or a system mistake.

Both work the same way: **save a draft** (nothing changes yet), then **Actions → Post to stock** (stock really moves).

## Before you start

- You know the exact item, warehouse and quantity.
- For an adjustment, keep the count sheet or damage report — write its number in **Notes**.

## Steps — transfer

1. Open **Inventory → Stock control → Transfers**.
2. In **New transfer (draft)** choose **From warehouse** and **To warehouse**, the **Transfer date** and **Notes**.
3. In the line, type in **Search item…**, pick the item and enter the **Qty**. Click **+ Add line** for more items; **Remove** drops a line.
4. Click **Save draft**. The transfer appears in the list as **DRAFT**.
5. When the goods have physically moved, open **Actions → Post to stock**. The status becomes **POSTED**: stock goes **OUT** of the source and **IN** to the destination.
6. **Actions → Print preview** prints the transfer note (with QR); **GL postings** shows accounting entries.

## Steps — adjustment

1. Open **Inventory → Stock control → Adjustments**.
2. Choose the warehouse (**Warehouse…**) and search the item (**Search item…**).
3. In **Qty (+ or −)** type a **positive** number to add stock or a **negative** number to remove it (for example \`-12\` for 12 damaged pieces).
4. Choose the reason: **COUNT**, **DAMAGE**, **SYSTEM** or **OTHER**, the date and **Notes**.
5. Click **Save draft adjustment**. It appears as **DRAFT**, with the item's code and name so you can double-check.
6. Open **Actions → Post to stock** to apply it.

## What happens next

- The **Ledger** shows the movement with reference **TRANSFER** or **ADJUSTMENT**, and **Stock Summary** updates.
- Accounts see the value change in **Valuation** and the GL postings.

## Tips

- For moving stock between departments with a conversion (for example yarn to the knitting section), use **Inter-Dept Transfers** *(optional)*. For batch-level moves, use **Batch Stock Transfer** *(optional)*.
- For regular counting, **Cycle Count** *(optional)* creates count sheets and adjustments for you.

## Common problems

- **"Insufficient stock for … at source. Available=…, required=…".** → The source warehouse does not have enough. Check **Stock Summary** for that warehouse.
- **"Insufficient stock for negative adjustment".** → You are removing more than is on hand.
- **From and To are the same, or reversed.** → Check before posting; a posted transfer can only be undone with another transfer.
- **Wrong sign on an adjustment.** → Positive adds, negative removes. If posted wrongly, post a second adjustment with the opposite sign.`,
      tags: ["transfer", "adjustment", "warehouse", "stock correction", "stock count", "damage"],
      keywords: ["stock transfer", "godown transfer", "move stock", "inter warehouse", "write off", "damaged goods", "physical count", "shortage", "excess", "post to stock"],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      coverImage: `${S}/inventory-warehouse-transfers.jpg`,
      infographics: [
        {
          type: "diagram",
          title: "Save first, post second",
          caption: "Drafts change nothing. Posting checks stock and writes the movement to the Ledger.",
          imageSrc: `${D}/draft-then-post.svg`,
          imageAlt: "Warehouse transfer and stock adjustment: save draft, Actions Post to stock, posted",
        },
      ],
      images: [
        {
          src: `${S}/inventory-warehouse-transfers.jpg`,
          alt: "Warehouse Transfers page with New transfer draft form",
          caption: "New transfer (draft): choose from, to, date and items, click Save draft, then Actions → Post to stock.",
        },
        {
          src: `${S}/inventory-stock-adjustments.jpg`,
          alt: "Stock Adjustments page with warehouse, item, quantity and reason fields",
          caption: "Qty (+ or −): a positive number adds stock, a negative number removes it. Pick a reason and click Save draft adjustment.",
        },
      ],
      relatedAppRoutes: [
        "/app/inventory/warehouse-transfers",
        "/app/inventory/stock-adjustments",
        "/app/inventory/stock-transfers",
        "/app/inventory/idt",
        "/app/inventory/cycle-count",
      ],
      relatedArticleIds: ["inv-stock-reports", "inv-returns-rejections", "inv-planning-tools", "gs-row-actions"],
    },
    {
      id: "inv-challan-gatepass",
      title: "Step-by-step: delivery challans and gate passes",
      summary:
        "Create a delivery challan for goods leaving the factory, move it to POSTED, then issue a gate pass so security can release the vehicle.",
      content: `## Overview

- A **delivery challan** lists the goods leaving your stock for a customer, buyer's forwarder or subcontractor. When it is **POSTED**, stock goes **OUT**. Screen: **Inventory → Outbound → Delivery Challans** (\`/app/inventory/delivery-challans\`).
- A **gate pass** lets security release a vehicle or goods from the factory gate. It can be linked to a challan. Screen: **Inventory → Outbound → Gate Passes** (\`/app/inventory/enhanced-gate-passes\`).

Both print with a **QR code** so the paper copy can be verified.

## Before you start

- The goods are in stock in the warehouse you dispatch from.
- If the dispatch is for an order, know the **order ID** (link it so you can make the invoice later).
- If CAPA blocking is on (\`capa_blocks_challan\`), open CAPAs on the order must be closed before posting.

## Steps — delivery challan

1. Click **New challan**. (From an order's **Delivery challans** link, the order is pre-linked.)
2. Fill **Customer name \\***, **Delivery date**, **Status** (leave **DRAFT**) and **Notes**.
3. Link orders: type the ID in **Link order ID** and click **Add order link**.
4. Add lines: **Search item…**, choose the warehouse, enter the quantity and click **Add line**.
5. Click **Create challan**. The challan page opens.
6. Move it through your approval with the **Workflow** buttons: **SUBMITTED → CHECKED → RECOMMENDED → APPROVED → POSTED** (you may skip steps if your company does).
7. On **POSTED** the system checks stock and takes it out. Then **Create Invoice** (commercial invoice) and **Create Packing List** appear.
8. Click **Print** for the challan copies.

## Steps — gate pass

1. Click **New gate pass**.
2. Choose **Linked challan (optional)**, type **Purpose \\*** (for example *Goods out — finished cartons*), **Destination**, **Vehicle** and **Notes**.
3. Click **Create gate pass**. The gate pass page opens.
4. Use the **Workflow** buttons: **SUBMITTED → APPROVED → RELEASED** (or **REJECTED**).
5. At the gate, the guard clicks **Toggle guard acknowledgement** — **Guard acknowledged** shows **Yes**.
6. Click **Print**.

## What happens next

- **Commercial**: **Create Invoice** makes a draft commercial invoice from the challan's orders. If orders have different customers or currencies, you are asked to **Create separate invoices**.
- **Logistics**: **Create Packing List** opens the packing screen for this challan.
- **Reconciliation** counts **Challan Posted** and **Gate Pass Released**.

## Tips

- The coloured boxes at the top of each list (DRAFT, SUBMITTED…) are filters — click one to see only that status.
- Search challans by **Code or customer**.

## Common problems

- **"Customer and at least one line are required."** → Fill the customer and click **Add line** before **Create challan**.
- **"Insufficient stock for item … in warehouse #…" when posting.** → Not enough stock there. Transfer stock or post the pending GRN first.
- **"Delivery challan cannot move from POSTED to DRAFT".** → POSTED is final because stock already went out. Fix a mistake with a **Stock Adjustment** and a new challan.
- **Create Invoice is greyed out.** → *"Link at least one order before creating an invoice"* — the challan has no linked order.
- **"Purpose is required."** on a gate pass → fill **Purpose**.`,
      tags: ["delivery challan", "challan", "gate pass", "dispatch", "outbound", "shipment", "security"],
      keywords: ["DC", "delivery note", "dispatch note", "gatepass", "gate out", "vehicle release", "goods out", "finished goods dispatch", "guard", "challan print", "QR"],
      estimatedMinutes: 8,
      lastUpdated: "2026-11-06",
      featured: true,
      coverImage: `${S}/inventory-delivery-challans.jpg`,
      infographics: [
        {
          type: "steps",
          title: "Dispatch goods",
          steps: [
            {
              title: "Create the challan",
              body: "**New challan** → customer, date, order link, lines → **Create challan**.",
              imageSrc: `${S}/inv-dc-new-form.jpg`,
              imageAlt: "New delivery challan form with customer name, delivery date, order link and lines",
              href: "/app/inventory/delivery-challans",
            },
            {
              title: "Move it to POSTED",
              body: "Use the **Workflow** buttons on the challan page. POSTED takes stock out.",
              imageSrc: `${S}/inv-dc-detail.jpg`,
              imageAlt: "Delivery challan detail page with workflow buttons, QR code and lines",
            },
            {
              title: "Issue the gate pass",
              body: "**New gate pass** → link the challan, purpose, destination, vehicle → **Create gate pass**.",
              imageSrc: `${S}/inv-gp-new-form.jpg`,
              imageAlt: "New gate pass form with linked challan, purpose, destination and vehicle",
              href: "/app/inventory/enhanced-gate-passes",
            },
            {
              title: "Release at the gate",
              body: "**RELEASED** + **Toggle guard acknowledgement**, then **Print**.",
              imageSrc: `${S}/inv-gp-detail.jpg`,
              imageAlt: "Gate pass detail page with workflow buttons and guard acknowledgement",
            },
          ],
        },
        {
          type: "diagram",
          title: "Challan and gate pass status steps",
          imageSrc: `${D}/challan-gatepass-lifecycle.svg`,
          imageAlt: "Delivery challan lifecycle Draft to Posted with Rejected, and gate pass lifecycle Draft to Released",
        },
      ],
      relatedAppRoutes: ["/app/inventory/delivery-challans", "/app/inventory/enhanced-gate-passes", "/app/reports/challans", "/app/reports/gate-passes"],
      relatedArticleIds: ["inv-qr-documents", "logistics-packing-cartons", "commercial-overview", "inv-stock-reports"],
    },
    {
      id: "inv-stock-reports",
      title: "Stock reports: summary, ledger, valuation and reconciliation",
      summary:
        "Which report answers which question: how much stock, where it came from, what it is worth, and whether all documents agree.",
      content: `## Overview

The **Reports and analytics** group in the Inventory sidebar answers four everyday questions:

- *How much do we have, and where?* → **Stock Summary**
- *What moved, when, and why?* → **Ledger**
- *What is it worth?* → **Valuation** and **Inventory Summary (FIFO)**
- *Do POs, GRNs, challans and gate passes add up?* → **Reconciliation** (under Stock control)

**Dashboard** (\`/app/inventory/stock-dashboard\`) adds open POs, GRNs to receive, low-stock lines and recent movements.

## Before you start

- Reports only show **received** and **posted** documents. Drafts are not counted.
- Most reports have **Export CSV** to open the data in Excel.

## Steps

1. **Stock Summary** (\`/app/inventory/stock-summary\`) — type in **Search item code or name…**, choose a warehouse (**All warehouses**), tick **Hide zero on-hand**. Columns: **In Qty**, **Out Qty**, **On Hand**.
2. **Ledger** (\`/app/inventory/stock-ledger\`) — every movement, newest first. Filter with **From** / **To** dates, **Search item…** and the warehouse. **Running bal.** is the balance after each movement; **Reference** shows the source document (GRN, PRODUCTION, ADJUSTMENT…).
3. **Valuation** (\`/app/inventory/stock-valuation\`) — **Total inventory value (FIFO)** and, per line, **On hand**, **Unit cost** and **Line value**.
4. **Inventory Summary (FIFO)** (\`/app/inventory/stock-inventory-summary\`) — tabs **Overview**, **By group**, **By warehouse** and **WIP** (stock at process orders). Pick a date to see value as of that day. **FIFO rebuild** recalculates cost layers (accounts / admin only).
5. **Reconciliation** (\`/app/inventory/reconciliation\`) — counters (**PO Open**, **GRN Open**, **Challan Posted**, **Gate Pass Released**, **Items On Hand**, **Prod. material issues**, **Vendor bills draft**…) and tabs **PO**, **GRN**, **Challan**, **Gate Pass**, **Stock**, **Finance / GL** with status and date filters, **Apply Filters** and **Export CSV**.

## What happens next

- Found a difference? Open the source document from the Ledger reference, then correct it with an **Adjustment** or the missing GRN / issue.
- Accounts use Valuation and **Stock vs GL reconciliation** at month end.

## Tips

- Use **Stock Summary** for counting, **Ledger** for investigating, **Valuation** for money.
- **Lot Traceability** (\`/app/inventory/lots\`) follows one lot or batch number through all movements.

## Common problems

- **On Hand is negative (for example −500).** → More went out than came in. Filter the Ledger by that item and warehouse to find the missing receipt or wrong issue.
- **A GRN is not in stock.** → It is still **DRAFT**. Open Goods Receiving → **Actions → Receive to stock**.
- **Values look wrong after old corrections.** → Ask accounts to run **FIFO rebuild** on Inventory Summary (FIFO).
- **Stock Items (hierarchy) shows different numbers than Stock Summary.** → Trust Stock Summary and the Ledger (built from every posted movement) and report the difference to your admin.
- **Dashboard shows "Internal Server Error".** → Click **Retry**; if it keeps failing, use Stock Summary and Reconciliation and report it to support.`,
      tags: ["stock report", "stock summary", "ledger", "valuation", "FIFO", "reconciliation", "on hand"],
      keywords: ["stock balance", "closing stock", "stock position", "bin card", "stock card", "inventory value", "stock register", "item ledger", "movement history", "export stock", "WIP value"],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      featured: true,
      coverImage: `${S}/inventory-stock-summary.jpg`,
      videos: [
        {
          src: "/tutorials/videos/inv-stock-summary-tour.webm",
          poster: "/tutorials/videos/inv-stock-summary-tour-poster.jpg",
          title: "Check stock on hand, history and value",
          caption: "Stock Summary for quantities, Ledger for every movement, Valuation for money.",
          durationSeconds: 47,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Read the reports",
          steps: [
            {
              title: "Stock Summary — how much",
              body: "On hand per item and warehouse. Search, filter, **Export CSV**.",
              imageSrc: `${S}/inventory-stock-summary.jpg`,
              imageAlt: "Stock Summary with item, warehouse, in, out and on-hand columns",
              href: "/app/inventory/stock-summary",
            },
            {
              title: "Ledger — what moved",
              body: "Every movement with **Running bal.** and **Reference**.",
              imageSrc: `${S}/inventory-stock-ledger.jpg`,
              imageAlt: "Stock Ledger with date, type, item, warehouse, quantity, running balance and reference",
              href: "/app/inventory/stock-ledger",
            },
            {
              title: "Valuation — what it is worth",
              body: "FIFO value per line and the total.",
              imageSrc: `${S}/inventory-stock-valuation.jpg`,
              imageAlt: "Stock Valuation with total inventory value and line values",
              href: "/app/inventory/stock-valuation",
            },
            {
              title: "Inventory Summary (FIFO) — by group, warehouse, WIP",
              body: "Switch tabs; pick a date for an as-of value.",
              imageSrc: `${S}/inv-fifo-by-warehouse.jpg`,
              imageAlt: "Inventory Summary FIFO By warehouse tab",
              href: "/app/inventory/stock-inventory-summary",
            },
            {
              title: "Reconciliation — do documents agree",
              body: "Counters and tabs for PO, GRN, Challan, Gate Pass, Stock, Finance / GL.",
              imageSrc: `${S}/inv-reconciliation-grn.jpg`,
              imageAlt: "Inventory Reconciliation with KPI counters and GRN tab",
              href: "/app/inventory/reconciliation",
            },
          ],
        },
      ],
      relatedAppRoutes: [
        "/app/inventory/stock-summary",
        "/app/inventory/stock-ledger",
        "/app/inventory/stock-valuation",
        "/app/inventory/stock-inventory-summary",
        "/app/inventory/stock-dashboard",
        "/app/inventory/reconciliation",
        "/app/inventory/lots",
      ],
      relatedArticleIds: ["inv-overview", "inv-transfer-adjust", "inv-grn-deep", "inv-planning-tools"],
    },
    {
      id: "inv-returns-rejections",
      title: "Returns and rejections: rejected receipts, supplier returns, production returns",
      summary:
        "What to do when goods are rejected at receipt, must go back to the supplier, or come back unused from the production floor.",
      content: `## Overview

P7 ERP has **no single "purchase return" document** today. Returns are handled with the documents you already know. This guide shows which one to use.

- *Goods fail QC when they arrive* → **GRN Inspection** *(optional)*: reject or hold them.
- *Goods already in stock must go back to the supplier* → **Gate Pass** + negative **Stock Adjustment** + **Debit Note** (Finance).
- *Unused material comes back from production* → the production execution flow; view it in **Quality → Returns**.

> **Important:** Talk to the supplier and agree the quantity and credit before anything leaves the gate.

## Before you start

- Agree the return with the supplier (quantity, reason, credit) before goods leave.
- Know the original **PO** and **GRN** codes — write them in every note.

## Steps — rejected at receipt (QC inspection on)

1. Receive the GRN as normal (**Actions → Receive to stock**). With \`grn_quality_inspection_enabled\` on, the goods go to a **quarantine** warehouse, not to usable stock.
2. QC opens **Inventory → GRN Inspection** (\`/app/inventory/grn-inspection\`), picks the **Received GRN**, and **accepts**, **rejects** or **holds** each line.
3. Only accepted quantity becomes usable stock. Rejected quantity is recorded and counts against the supplier in **Vendor Scorecard**.

## Steps — return goods already in stock to the supplier

1. Make a **Gate Pass**: **Purpose** *"Return to supplier — GRN …"*, the supplier as **Destination**, the **Vehicle**. Move it to **RELEASED** when the truck leaves.
2. Remove the quantity from stock with a **Stock Adjustment**: negative **Qty (+ or −)**, reason **DAMAGE** or **OTHER**, and the GRN and gate pass codes in **Notes**. **Post to stock**.
3. Ask accounts to raise a **Debit Note** to the supplier (Finance, if credit/debit notes are on).

## Steps — material returned from production

Returns of issued material are created from the production (shop floor) execution flow for the work order. **Quality → Returns** (\`/app/quality/returns\`) lists them: filter by **Work order ID**.

## What happens next

- Stock Summary and the Ledger show the adjustment; Vendor Scorecard shows the rejection rate (the PO's receipt dialog warns when it is above 5% in 90 days).

## Tips

- Always reference the original GRN in notes — auditors and accounts will ask for it.
- If you return goods often, ask your admin to turn on **GRN quality inspection** so rejections are caught before they enter stock.

## Common problems

- **"GRN quality inspection is disabled."** → The inspection feature is off; ask an admin (**Settings → Configuration**).
- **"Insufficient stock for negative adjustment".** → The goods are no longer in that warehouse; check the Ledger.
- **The supplier credit is missing in accounts.** → The stock adjustment does not create money entries for the supplier; finance must raise the debit note.`,
      tags: ["returns", "rejection", "purchase return", "supplier return", "QC", "debit note"],
      keywords: ["return to vendor", "RTV", "reject goods", "rejected material", "send back", "damaged receipt", "quarantine", "material return", "production return", "return challan"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      coverImage: `${S}/inventory-stock-adjustments.jpg`,
      infographics: [
        {
          type: "flow",
          title: "Return goods already in stock",
          steps: [
            { label: "Gate pass (purpose: return)", href: "/app/inventory/enhanced-gate-passes" },
            { label: "Negative stock adjustment", href: "/app/inventory/stock-adjustments" },
            { label: "Debit note (Finance)", href: "/app/finance/debit-notes/new" },
          ],
        },
        {
          type: "highlight",
          title: "Remember",
          body: "There is no separate purchase-return screen yet. Use a **gate pass** for the physical exit, a **negative adjustment** for stock, and a **debit note** for money.",
        },
      ],
      relatedAppRoutes: ["/app/inventory/grn-inspection", "/app/inventory/stock-adjustments", "/app/inventory/enhanced-gate-passes", "/app/quality/returns"],
      relatedArticleIds: ["inv-grn-deep", "inv-transfer-adjust", "inv-challan-gatepass", "quality-overview"],
    },
    {
      id: "inv-approval-gates",
      title: "Approvals and material control gates in Inventory",
      summary:
        "Why the system sometimes says \"Requires admin/manager role or permission …\", which four inventory actions are protected, and how an admin grants them.",
      content: `## Overview

To stop material leaking, four inventory actions need a **manager** (or a role with a special permission). When someone else tries, the screen shows an error like *"Requires admin/manager role or permission 'inventory.over_receipt_approve'"*.

The four gates:

1. **Receipt without a PO** — \`inventory.non_po_receipt_approve\`
2. **Receiving more than the PO** — \`inventory.over_receipt_approve\`
3. **Issuing more than the BOM + tolerance** — \`inventory.over_issue_approve\`
4. **Approving a process order** — \`inventory.process_order_approve\`

Other approvals in Inventory (PO **Approve**, requisition **Approve** / **Select**, challan and gate pass **Workflow** steps) follow your company's roles.

## Before you start

- **Admin** and **manager** roles always pass these gates.
- Only an admin can change role permissions.

## Steps — grant a gate to a role (admin)

1. Open **Settings → Roles** (\`/app/settings/roles\`).
2. Open the role (for example *Store in-charge*).
3. Find **Material control & finance governance**.
4. Switch on only the gate this role really needs (for example **inventory.over_receipt_approve** for the senior store keeper).
5. Save. The person may need to sign in again.

## Steps — what a user should do when blocked

1. Do **not** retry many times — nothing was saved.
2. Read which permission is named in the message.
3. Ask your manager to do the action, or ask whether the PO / BOM should be corrected first (often the right fix).

## What happens next

- Every protected action records who did it, so audits can see who approved an over-receipt or over-issue.

## Tips

- Give gates to as few people as possible; fixing the PO or BOM is usually better than overriding.

## Common problems

- **The switch is on but the user is still blocked.** → Make sure you changed the role the user actually has, and that they signed in again.
- **A manager is blocked.** → Their role name may not be exactly *manager*; grant the permission explicitly.`,
      tags: ["approval", "permission", "governance", "material control", "over receipt", "over issue", "roles"],
      keywords: ["requires admin manager", "permission denied", "403", "not allowed", "non PO receipt", "over issue approve", "process order approve", "store control", "who can approve"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      infographics: [
        {
          type: "diagram",
          title: "The four material control gates",
          caption: "Admin and manager roles always pass; other roles need the named permission.",
          imageSrc: `${D}/material-control-gates.svg`,
          imageAlt: "Four cards: non-PO receipt, over-receipt, over-issue and process order approval with their permission keys",
        },
      ],
      relatedAppRoutes: ["/app/settings/roles", "/app/inventory/goods-receiving", "/app/inventory/consumption-control", "/app/inventory/process-orders"],
      relatedArticleIds: ["inv-grn-deep", "inv-material-issue", "inv-process-orders", "settings-overview", "wf-approvals"],
    },
    {
      id: "inv-qr-documents",
      title: "QR-verified inventory documents",
      summary:
        "Delivery challans, gate passes, GRNs, material issues, process orders and transfers print with a QR code that proves the paper matches the system.",
      content: `## Overview

Paper challans and gate passes can be copied or changed by hand. P7 ERP **signs** each inventory document and prints a **QR code** on it. Scanning the QR opens the document's verification record, so security, the buyer's forwarder or an auditor can check that the paper matches the system.

Documents with QR: **Delivery challan**, **Gate pass**, **GRN**, **Production material issue**, **Process order**, **Warehouse transfer**.

## Before you start

- The verification link opens inside P7 ERP, so the person scanning must be **signed in** to your company.

## Steps

1. Open the document's list (for example **Delivery Challans**).
2. **Actions → Print** (or **Print preview**, or **Print (layout)** on a GRN). A print preview opens.
3. Choose the template (**Standard**, **Compact** or **Audit**) and the number of copies (**1 copy**, 2, 3…), then click **Print / Save PDF**. Copies are labelled (for example *Original*, *Duplicate*, *Triplicate*). Click **Close** to go back.
4. On the paper you see the QR at the top right (**SCAN TO VERIFY**), the signature boxes (*Prepared*, *Checked*, *Security*, *Approved*) and, at the bottom, the **Verification ID** (for example \`VFY-…\`) with the signing time.
5. To check a paper copy, scan the QR with a phone that is signed in to P7 ERP, and compare the code, date, lines and status.

## What happens next

- When a document's status changes (for example a gate pass becomes **RELEASED**), it is signed again so the QR shows the latest status.

## Tips

- Print gate passes **after** they are RELEASED, so the security copy shows the final status.
- The **audit** template adds signatory details for compliance files.

## Common problems

- **Scanning shows a sign-in page or an error.** → The person scanning is not signed in to your company in P7 ERP.
- **"Verification record not found".** → The paper is not from this company, or it was printed before signing was set up — ask an admin to re-sign old documents.`,
      tags: ["QR", "verification", "print", "challan", "gate pass", "GRN", "anti-fraud"],
      keywords: ["QR code", "verify challan", "fake challan", "document verification", "signed document", "print copies", "original duplicate triplicate"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      coverImage: `${S}/inv-dc-print-preview.jpg`,
      images: [
        {
          src: `${S}/inv-dc-print-preview.jpg`,
          alt: "Print preview of a delivery challan with QR code, copy count and template options",
          caption: "Actions → Print opens the preview: choose copies and template, then print.",
        },
      ],
      relatedAppRoutes: ["/app/inventory/delivery-challans", "/app/inventory/enhanced-gate-passes", "/app/inventory/goods-receiving", "/app/inventory/process-orders", "/app/inventory/warehouse-transfers"],
      relatedArticleIds: ["inv-challan-gatepass", "wf-digital-signatures", "inv-grn-deep"],
    },
    {
      id: "inv-planning-tools",
      title: "Planning and analysis tools (MRP, reorder, ABC, EOQ, aging, cycle count…)",
      summary:
        "A short guide to every screen in Inventory → Planning & manufacturing: what it is for and which feature switch turns it on.",
      content: `## Overview

The **Planning & manufacturing** group helps you buy the right quantity at the right time and see slow or risky stock. Most screens are **optional**: they appear only when an admin turns on the matching feature in **Settings → Configuration**. If you open one that is off, it shows a red *"… is disabled. Enable …"* message.

## Before you start

- These tools read your existing data (items, GRNs, issues), so good master data and posted documents matter.

## Steps — what each screen does

**Always available**

- **ABC Analysis** (\`/app/inventory/abc-analysis\`) — groups items by consumption value: **A** ≈ 70%, **B** ≈ 20%, **C** ≈ 10%. Set **Period (months)**, then **Run ABC**. **Export CSV** downloads a file for the selected class. Count A items more often.
- **EOQ** (\`/app/inventory/eoq\`) — suggests the most economical order quantity per item.
- **Stock Aging** (\`/app/inventory/stock-aging\`) — value of batches by age bucket (0–30 … 365+ days); highlights slow-moving stock over 180 days.

**Optional (feature switch in brackets)**

- **MRP Run** (\`mrp_engine_enabled\`) — calculates material needs from orders and BOMs.
- **Reorder Suggestions** (\`auto_reorder_enabled\`) — **Check all stock** lists items below their reorder level (set on the item with **Auto reorder**); **Create POs for selected**.
- **Inter-Dept Transfers** / **Receive IDT** (\`inter_department_transfer_enabled\`) — issue material to a department with a conversion (for example yarn → knitting), and receive it there.
- **Process Loss Report**, **Post-Costing**, **Process Loss Standards** (\`process_loss_tracking_enabled\`) — compare actual process loss with your standards and cost it.
- **GRN Inspection**, **Quality Dashboard**, **Vendor Scorecard** (\`grn_quality_inspection_enabled\`) — QC on receipt and supplier ratings.
- **Cycle Count** (\`cycle_counting_enabled\`) — scheduled partial stock counts.
- **Serial Tracking** (\`serial_tracking_enabled\`), **Kit Builder** (\`kitting_enabled\`), **Consignment Stock** (\`consignment_stock_enabled\`).
- **Stock Items (hierarchy)**, **Godown Stock**, **Batch Stock Transfer** (\`stock_hierarchy_enabled\`).

## What happens next

- Reorder suggestions and MRP can create **DRAFT POs** — they still go through normal PO approval.

## Tips

- Start with **ABC Analysis** and **Stock Aging** — they need no setup and quickly show where money is stuck.

## Common problems

- **Screen says "Auto-reorder is disabled" (or similar).** → Ask an admin to switch on the feature named in the message.
- **ABC shows every item as C with value 0.** → There is no consumption yet in the chosen period; post material issues first or choose a longer period.
- **Stock Aging says "No open batches to age".** → Aging needs batch tracking (**Enable batch tracking** in Settings → Configuration) and receipts made after it was turned on.`,
      tags: ["MRP", "reorder", "ABC analysis", "EOQ", "stock aging", "cycle count", "planning", "feature flags"],
      keywords: ["material requirement planning", "reorder level", "safety stock", "slow moving", "dead stock", "economic order quantity", "inter department transfer", "IDT", "process loss", "consignment", "kitting", "serial number"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      coverImage: `${S}/inventory-abc-analysis.jpg`,
      images: [
        {
          src: `${S}/inventory-abc-analysis.jpg`,
          alt: "ABC Analysis page with period, class filter, Run ABC and distribution",
          caption: "ABC Analysis: choose the period and click Run ABC.",
        },
        {
          src: `${S}/inventory-stock-aging.jpg`,
          alt: "Stock Aging page with value by aging bucket",
          caption: "Stock Aging shows how long stock has been sitting, by value.",
        },
      ],
      relatedAppRoutes: [
        "/app/inventory/mrp",
        "/app/inventory/reorder-suggestions",
        "/app/inventory/idt",
        "/app/inventory/idt-receive",
        "/app/inventory/process-loss-report",
        "/app/inventory/post-costing",
        "/app/inventory/process-loss-settings",
        "/app/inventory/grn-inspection",
        "/app/inventory/quality-dashboard",
        "/app/inventory/vendor-scorecard",
        "/app/inventory/abc-analysis",
        "/app/inventory/eoq",
        "/app/inventory/stock-aging",
        "/app/inventory/cycle-count",
        "/app/inventory/serials",
        "/app/inventory/kits",
        "/app/inventory/consignment",
      ],
      relatedArticleIds: ["inv-overview", "inv-stock-reports", "inv-setup-items-warehouses", "mfg-overview"],
    },
    {
      id: "inv-traceability-certificates",
      title: "Certificates and order traceability for buyers",
      summary:
        "Record GOTS / OEKO-TEX / GRS certificates, note which fabric lots each cut ticket used, and give buyers a traceability report per order.",
      content: `## Overview

Buyers increasingly ask: *which fabric went into this order, who supplied it, and was it certified?* **Inventory → Traceability → Certificates & order trace** (\`/app/inventory/traceability\`) answers that from data you already keep. It has two tabs: **Order traceability** and **Certificates**.

## Before you start

- The feature is on for every company by default; an admin can switch it off in **Settings → Configuration → Traceability & certificates**.
- Fabric lots exist only for fabric received while **Enable batch tracking** is on (**Settings → Configuration**) and the fabric item uses batch tracking. Turn both on **before** receiving fabric you need to trace.

## Steps

1. **Certificates** — open the **Certificates** tab. In **Add a certificate** choose the **Type** (GOTS, OCS, GRS, RCS, OEKO-TEX Standard 100, BCI, FSC, other), type the **Certificate number \\***, **Issued by (certification body)** (for example *Control Union*), choose the **Supplier holding it** and/or the **Material it covers**, set **Valid from** and **Valid until**, and click **+ Add**. The list shows a **Status** of **valid**, **expiring** (30 days or less left) or **expired**.
2. **Fabric lots on cut tickets** — on **Cutting pipeline** (\`/app/production/cutting/pipeline\`), after you create or open a cut ticket, use the **Fabric lots used** panel to pick the received lot (from the goods receipt), the quantity used and the roll numbers.
3. **Order traceability report** — on the **Order traceability** tab, choose the order in **Select an order…**. You see every cut ticket's fabric lots with supplier, goods receipt and the certificates valid **on the receipt date**, plus bundles and packing lists.
4. Check the yellow **gaps** box and fix what it lists, then click **Export CSV for buyer** or **Print**.

## What happens next

- The buyer gets a file that links each order to lots, suppliers and valid certificates.
- **Lot Traceability** (\`/app/inventory/lots\`) traces one lot or batch number from goods receiving through all stock movements: type it in **Lot / batch number** and click **Trace**.

## Tips

- Add certificates as soon as suppliers send them, and watch for **expiring** ones.

## Common problems

- **Gaps: "cut tickets without lots".** → Record the lots in **Fabric lots used** on the cut ticket.
- **Gaps: "lots without certificates" or "certificate expired".** → Add or renew the supplier's certificate; the check uses the certificate valid on the **receipt date**.
- **No lots to choose from.** → Batch tracking was off when the fabric was received.`,
      tags: ["traceability", "certificate", "GOTS", "OEKO-TEX", "GRS", "fabric lot", "roll", "compliance", "buyer"],
      keywords: ["transaction certificate", "scope certificate", "sustainability", "audit", "lot trace", "batch trace", "organic cotton", "recycled"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      coverImage: `${S}/inventory-traceability.jpg`,
      images: [
        {
          src: `${S}/inv-traceability-certificates.jpg`,
          alt: "Certificates tab listing supplier and material certificates with validity status",
          caption: "The Certificates tab keeps every supplier or material certificate with its validity dates.",
        },
        {
          src: `${S}/inventory-lots.jpg`,
          alt: "Lot Traceability page with lot or batch number search",
          caption: "Lot Traceability: type a lot or batch number and click Trace.",
        },
      ],
      relatedAppRoutes: ["/app/inventory/traceability", "/app/inventory/lots", "/app/production/cutting/pipeline"],
      relatedArticleIds: ["inv-overview", "inv-grn-deep", "mfg-overview"],
    },
    {
      id: "inv-supplier-portal",
      title: "Supplier portal: suppliers confirm POs and ship dates themselves",
      summary:
        "Invite people at your suppliers; they see only their own approved purchase orders, confirm or decline, and post ship dates and notes.",
      content: `## Overview

The **supplier portal** lets your fabric, trims and service suppliers answer purchase orders online instead of by phone and email. Buyers see the replies on the PO.

## Before you start

- An **admin** turns the portal on and invites supplier users.
- The supplier's company must exist in **Vendors**, and the POs must be **approved**.

## Steps

1. **Turn it on (admin)** — open **Settings → External access** (\`/app/settings/external-access\`) and click **Enable portal** on the **Supplier portal** card.
2. **Invite** — click **Manage supplier access** (page **Supplier portal access**). In **Invite a supplier user** fill **Email** and **Full name**, tick the vendors under **Vendors this person may see** (use **Search vendors…**), and click **Send invitation**. They receive an email link to set a password. If email is not set up, the page shows a link you can share.
3. **What the supplier sees** — after signing in (sign-in page, role **Supplier portal**, your company code):
   - **Dashboard** — open POs, how many still need their reply, what is due soon or overdue.
   - **Purchase orders** — only **approved** (and later) POs for their linked vendors. Drafts are never shown.
   - **PO detail** — items, prices, what you have received so far, and a **Reply** box: **Confirm order**, **Update ship date**, **Send a note** or **Cannot accept** (with a reason).
4. **See the replies (staff)** — admins and managers get a **bell notification** for every reply. On **Purchase Orders**, **Actions → Receipt progress & vendor bill** shows **Supplier replies (supplier portal)**.

## What happens next

- Use the confirmed ship date to plan receiving; record the delivery with a GRN as usual.

## Tips

- A supplier login only ever sees the vendors you ticked; change them any time with **Actions → Change vendors**.
- Every reply is recorded in **External access → audit log**.

## Common problems

- **The supplier says they see no POs.** → The POs are still **DRAFT**, or the login is not linked to that vendor.
- **Someone left the supplier company.** → **Deactivate** their login; it signs them out everywhere. Turning the portal off blocks all supplier logins at once.`,
      tags: ["supplier", "vendor", "portal", "purchase order", "confirmation", "ship date", "external access"],
      keywords: ["supplier collaboration", "PO acknowledgement", "vendor portal", "supplier login", "PO confirmation", "ETD"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      coverImage: `${S}/inv-supplier-access.jpg`,
      images: [
        {
          src: `${S}/inv-supplier-access.jpg`,
          alt: "Supplier access page in Settings External access for inviting supplier users",
          caption: "Manage supplier access: invite people and choose which vendors each login can see.",
        },
      ],
      relatedAppRoutes: ["/app/settings/external-access", "/app/settings/external-access/suppliers", "/app/inventory/purchase-orders"],
      relatedArticleIds: ["inv-po-deep", "inv-vendors"],
    },
  ],
};

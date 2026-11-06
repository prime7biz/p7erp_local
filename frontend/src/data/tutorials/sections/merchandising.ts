import type { TutorialSection } from "../types";

const S = "/tutorials/screens";
const D = "/tutorials/diagrams/merchandising";

export const merchandisingSection: TutorialSection = {
  id: "merchandising",
  title: "Merchandising",
  description:
    "Buyers, inquiries, quotations and costing, orders, order BOM, TNA follow-up, samples, styles, alerts and the control tower.",
  articles: [
    {
      id: "merch-pipeline",
      title: "Merchandising map: from buyer inquiry to production",
      summary:
        "One-page map of every Merchandising screen and the order you use them in: inquiry → quotation → order → BOM → TNA → samples → POs.",
      content: `## Overview

Merchandising is where a buyer's request becomes a confirmed job for the factory. **Merchandisers** use it every day; **costing**, **purchase** and **planning** staff use parts of it.

The **order** is the centre of everything. Every later document (BOM, purchase order, goods receiving, production, challan, invoice) points back to one order.

## Before you start

- Your role needs access to **Merchandising** (ask your admin if the section is missing from the sidebar).
- Some buttons are controlled by role permissions such as \`merch.bom.approve\` — see **Merchandising roles and permissions**.
- Master data you need first: **Customers**, **Garment Styles** and, for BOM lines, **inventory items** and **vendors**.

## Steps

The happy path, in order:

1. **Customer** — create the buyer once under **Merchandising → Customers** (\`/app/customers\`).
2. **Inquiry** — record the buyer's request: style, quantity, target price (\`/app/inquiries\`). Click **Submit inquiry** when it is complete.
3. **Quotation + costing** — click **Convert to quotation**, build the costing (materials, CM, other costs), then **Submit for review → Approve → Send** (\`/app/quotations\`).
4. **Order** — when the buyer accepts, click **Create Order** on the quotation (\`/app/orders\`). Enter the **Colour / size breakdown**.
5. **Order BOM** — open **View BOM** on the order. **Submit → Approve → Freeze** the materials list (\`/app/bom\`).
6. **Follow-up TNA** — the task calendar for the order: samples, approvals, fabric in-house, shipment (\`/app/followup\`).
7. **Samples** — proto, fit, PP and other samples under **Sample Development** (\`/app/merchandising/samples\`).
8. **Purchase orders** — click **Generate POs from BOM**. From here Inventory, Manufacturing and Commercial take over.

## What happens next

After the order is confirmed, the **order pipeline** moves on by itself as real documents are saved: BOM approved, PO raised, GRN received, production started, challan posted, payment received. You never drag the pipeline forward by hand.

## Tips

- Lost? Open the order and read **Next required action** at the top of the page.
- Use **Control Tower** (\`/app/merchandising/control-tower\`) each morning to see what is late.
- **Document Flow** (\`/app/flow\`) shows the whole chain Inquiry → Quotation → Order → PI on one line per order.
- Every list uses one **Actions** button per row for View, Edit, Print and workflow steps.

## Common problems

- **"Convert to quotation" is missing** → the inquiry is still **Draft**. Click **Submit inquiry** first.
- **"Convert to order" shows "Send first"** → the quotation must be **Sent** before it can become an order.
- **The order is not in "Create BOM from order"** → the order needs a linked quotation, a quantity above zero and no BOM yet.
- **Cannot change price or delivery date** → the record is locked. Raise a **change request** (see **Commercial lock and change requests**).`,
      tags: ["merchandising", "overview", "inquiry", "quotation", "order", "bom", "tna", "workflow"],
      keywords: [
        "module map",
        "order flow",
        "sales flow",
        "merchandiser",
        "buyer order",
        "costing",
        "bill of materials",
        "time and action",
        "order execution",
        "pipeline",
      ],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "merchandiser",
      coverImage: `${D}/merch-module-map.svg`,
      infographics: [
        {
          type: "diagram",
          title: "Merchandising module map",
          caption: "Top row: selling. Middle row: preparing the confirmed order. Bottom: other modules take over.",
          imageSrc: `${D}/merch-module-map.svg`,
          imageAlt:
            "Flow diagram: Customer, Inquiry, Quotation and costing, Order, then Order BOM, Follow-up TNA, Samples and Purchase orders, then GRN, line plan, production, QC, challan and payment",
        },
        {
          type: "flow",
          title: "Open each screen",
          steps: [
            { label: "Customers", href: "/app/customers" },
            { label: "Inquiries", href: "/app/inquiries" },
            { label: "Quotations", href: "/app/quotations" },
            { label: "Orders", href: "/app/orders" },
            { label: "BOM Builder", href: "/app/bom" },
            { label: "Follow-up TNA", href: "/app/followup" },
            { label: "Sample Development", href: "/app/merchandising/samples" },
            { label: "Purchase Orders", href: "/app/inventory/purchase-orders" },
          ],
        },
        {
          type: "highlight",
          title: "Remember",
          body: "The **order** is the hub. Always pick the order when a screen asks for one (BOM, PO, TNA, production, challan). That is how the pipeline knows what happened.",
        },
      ],
      images: [
        {
          src: `${S}/flow.jpg`,
          alt: "Document Flow screen listing each order with its inquiry, quotation and proforma invoice",
          caption: "Document Flow shows the full chain for every order on one row.",
        },
        {
          src: `${S}/merchandising-control-tower.jpg`,
          alt: "Merchandising control tower with cards for inquiries, quotations, BOMs, TNA overdue and samples",
          caption: "Control Tower: one-screen health check of all merchandising work.",
        },
      ],
      relatedAppRoutes: [
        "/app/customers",
        "/app/inquiries",
        "/app/quotations",
        "/app/orders",
        "/app/bom",
        "/app/followup",
        "/app/merchandising/samples",
        "/app/merchandising/styles",
        "/app/merchandising/control-tower",
        "/app/flow",
      ],
      relatedArticleIds: [
        "merch-customers",
        "merch-create-inquiry",
        "merch-quotation-costing",
        "merch-order-detail",
        "merch-order-bom",
        "merch-tna-followup",
        "merch-commercial-lock",
        "gs-row-actions",
      ],
    },
    {
      id: "merch-customers",
      title: "Customers: add and manage buyers",
      summary: "Create a buyer profile once, then reuse it on every inquiry, quotation, order and invoice.",
      content: `## Overview

A **customer** is a buyer you sell to (for example a brand or retailer). Every inquiry, quotation and order starts by picking a customer, so set them up carefully.

## Before you start

- Have the buyer's legal name, main contact, email and billing address ready.
- Search the list first so you do not create a duplicate.

## Steps

1. Open **Merchandising → Customers** (\`/app/customers\`).
2. Search by name, code or contact. If the buyer is not there, click **New customer**.
3. Optional: in **Import Customer Info**, upload a business card, letterhead or company profile. The AI fills the fields it can read. Check each value in **Review extracted fields** and click apply only for correct ones.
4. Fill the required fields (marked **\\*\\***): **Legal Entity Name**, **Primary Contact Name**, **Email Address**, and the **Billing Address** (**Street Address**, **City**, **Country**).
5. Choose **Customer Type**, **Status** (Active / Inactive) and **Preferred quotation currency**.
6. Fill the **Shipping Address**, or turn on **Same as billing**.
7. Click **Save Customer** (or **Save & Add Another** to enter the next buyer).

## What happens next

- The customer gets a code (for example \`LKH-CUST-02\`) and appears in the customer pick list on inquiries, quotations and orders.
- The customer page (\`/app/customers/:id\`) shows the buyer's **Inquiries**, **Quotations**, **Orders** and **Outstanding receivable bills** in one place.

## Tips

- Use **Actions → Edit** on the list to update a buyer; **Actions → Print** gives a one-page profile.
- The **Profile** % and **Dup risk** columns warn about incomplete or duplicate records.
- Set a buyer to **Inactive** instead of deleting it once it has documents.

## Common problems

- **"Possible duplicate customers" warning** → open the existing record instead of creating a new one.
- **Cannot save** → a field marked **\\*\\*** is empty (often billing **City** or **Country**).`,
      tags: ["customer", "buyer", "merchandising", "master data"],
      keywords: ["buyer", "party", "client", "add customer", "new buyer", "customer profile", "brand"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      audience: "merchandiser",
      coverImage: `${S}/customers.jpg`,
      infographics: [
        {
          type: "steps",
          title: "Add a buyer",
          steps: [
            {
              title: "Open Customers and click New customer",
              body: "Search first to avoid duplicates.",
              imageSrc: `${S}/customers.jpg`,
              imageAlt: "Customers list with KPI cards, AI quick filters and the New customer button",
              href: "/app/customers",
            },
            {
              title: "Fill the profile and click Save Customer",
              body: "Fields marked **\\*\\*** are required. Use **Import Customer Info** to auto-fill from a document.",
              imageSrc: `${S}/merch-customer-new-form.jpg`,
              imageAlt: "Customer Profile form with Import Customer Info card and company fields",
              href: "/app/customers/new",
            },
            {
              title: "Open the customer to see all their documents",
              body: "The header strip links to the buyer's inquiries, quotations and orders.",
              imageSrc: `${S}/merch-customer-detail.jpg`,
              imageAlt: "Customer detail page with profile, contact and receivable bills",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/customers", "/app/customers/new"],
      relatedArticleIds: ["merch-pipeline", "merch-create-inquiry", "merch-parties-flow", "gs-row-actions"],
    },
    {
      id: "merch-create-inquiry",
      title: "Create or edit an inquiry",
      summary: "Record a buyer's request (style, quantity, target price, delivery) as an inquiry, then submit it for pricing.",
      content: `## Overview

An **inquiry** is the buyer's first request: "Can you make this style, this many pieces, at this price, by this date?" Merchandisers create it so the costing team has everything needed for a quotation.

## Before you start

- The **customer** must exist (**Merchandising → Customers**).
- A **garment style** helps a lot. You can pick an existing one or create it on the spot with **Quick Add Style**.

## Steps

1. Open **Merchandising → Inquiries** (\`/app/inquiries\`) and click **New Inquiry**.
2. Optional: in **Import Inquiry Info**, upload the buyer's inquiry sheet, email screenshot or tech-pack PDF. Check every suggested value before you accept it.
3. In **Inquiry Header**, type in **Customer \\*\\*** to search and pick the buyer, then choose the **Style \\*\\***. If the style is new, click **Quick add new style** → enter **Style name** → **Create style**.
4. Fill **Season**, **Department** and, if there is no style yet, **Style ref fallback**.
5. In **Intermediary and Commercial Terms**, set **Shipping term**, **Commission mode / type / value** (if an agent is involved), **Expected quantity**, **Target price**, **Document currency**, **Exchange rate** and **Expected delivery date**.
6. In **Garment Items**, click **Add item** for each product line (item name, description, quantity).
7. Click **Save inquiry**. The code (for example \`INQ-0016\`) is created automatically.
8. When everything is complete, open the inquiry again (**Actions → Edit**) and click **Save & submit**, or use **Submit inquiry** on the detail page.

## What happens next

- A **Submitted** inquiry can be turned into a quotation with **Convert to quotation** (see **Inquiry detail: submit and convert**).
- The inquiry shows in **Order Pipeline** under **Inquiry · Draft** or **Inquiry · Submitted**.

## Tips

- The quotation is pre-filled from the inquiry. Fill **Style**, **Quantity**, **Target Price**, **Target Currency** and **Exchange Rate** now so you type less later.
- List colours tell the status: blue = Submitted, green = Converted, amber = Lost, red = Cancelled.

## Common problems

- **Amber labels or borders stay on** → a required field (**\\*\\***) is still empty.
- **Wrong buyer chosen** → fix it before you submit; a converted inquiry can no longer be changed.
- **AI filled a wrong value** → AI suggestions are only suggestions. Correct the field before saving.`,
      tags: ["inquiry", "create", "merchandising", "draft", "buyer request"],
      keywords: ["enquiry", "RFQ", "request for quotation", "new inquiry", "buyer request", "tech pack", "target price"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "merchandiser",
      coverImage: `${S}/merch-inquiry-new-form.jpg`,
      infographics: [
        {
          type: "steps",
          title: "New inquiry in 3 steps",
          steps: [
            {
              title: "Click New Inquiry",
              body: "Merchandising → **Inquiries**.",
              imageSrc: `${S}/inquiries.jpg`,
              imageAlt: "Inquiries list with codes, customers, styles and the New Inquiry button",
              href: "/app/inquiries",
            },
            {
              title: "Fill header, commercial terms and garment items",
              body: "Customer and Style are required. Use **Quick Add Style** for a new style.",
              imageSrc: `${S}/merch-inquiry-new-form.jpg`,
              imageAlt: "New Inquiry form with Import Inquiry Info and Inquiry Header sections",
              href: "/app/inquiries/new",
            },
            {
              title: "Save, then submit",
              body: "Click **Save inquiry**. When complete, use **Save & submit** or **Submit inquiry**.",
            },
          ],
        },
        {
          type: "diagram",
          title: "Inquiry status",
          imageSrc: `${D}/merch-inquiry-status.svg`,
          imageAlt: "Inquiry status diagram: Draft to Submitted to Converted, with Lost and Cancelled as final states",
        },
      ],
      relatedAppRoutes: ["/app/inquiries", "/app/inquiries/new"],
      relatedArticleIds: ["merch-pipeline", "merch-inquiry-detail", "merch-customers", "merch-styles"],
    },
    {
      id: "merch-inquiry-detail",
      title: "Inquiry detail: submit and convert to a quotation",
      summary: "Read an inquiry, submit it, and turn it into a pre-filled Draft quotation with one click.",
      content: `## Overview

The **inquiry detail** page shows one buyer request and the next button you need. It is where an inquiry becomes a **quotation**.

## Before you start

- Open the inquiry from **Merchandising → Inquiries** (\`/app/inquiries\`): click its code, or **Actions → View**.

## Steps

1. Read the header: **Inquiry INQ-xxxx**, created date, customer and **status**.
2. Check the cards: **Summary** (customer, style, department, season), **Commercials** (target price, currency, exchange rate, quantity, expected delivery), **Style & Intermediary**, **Notes** and **Garment items**.
3. If a yellow box says **Missing recommended fields for clean quotation prefill**, click **Back to list → Actions → Edit** and fill them first.
4. If the status is **DRAFT**, click **Submit inquiry**.
5. When the status is **SUBMITTED**, click **Convert to quotation**. The app creates a **Draft** quotation and opens it.
6. If the inquiry was already converted, the button changes to **Open quotation**.

From the list you can do the same with **Actions → Submit inquiry** and **Actions → To quotation**.

## What happens next

- The inquiry becomes **CONVERTED** and is locked.
- Continue on the quotation: build the costing (see **Build the quotation costing sheet**).
- If the buyer drops the request, mark it **Lost** or **Cancelled** with **Move** on the **Order Pipeline** board (\`/app/merchandising/pipeline\`).

## Tips

- **Print / Save PDF** gives a clean copy to share inside the team.
- The **Inquiry AI** card can validate fields, find duplicates and suggest next actions. Its results are advice only; nothing changes until you edit the inquiry.

## Common problems

- **No "Convert to quotation" button** → status is still **DRAFT**: click **Submit inquiry** first. If the status is **LOST** or **CANCELLED**, it can no longer be converted.
- **"Submit the inquiry before converting it to a quotation."** → same cause: submit first.`,
      tags: ["inquiry", "detail", "status", "convert", "submit"],
      keywords: ["enquiry", "convert inquiry", "to quotation", "submit inquiry", "inquiry status", "lost inquiry"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      audience: "merchandiser",
      coverImage: `${S}/merch-inquiry-detail.jpg`,
      videos: [
        {
          src: "/tutorials/videos/merch-inquiry-to-quotation.webm",
          poster: "/tutorials/videos/merch-inquiry-to-quotation-poster.jpg",
          title: "From inquiry to quotation",
          caption: "Open a submitted inquiry, see Convert to quotation, then start a new quotation for the buyer. Nothing is saved.",
          durationSeconds: 60,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "Inquiry status",
          caption: "Converted, Lost and Cancelled are final.",
          imageSrc: `${D}/merch-inquiry-status.svg`,
          imageAlt: "Inquiry status diagram: Draft, Submitted, Converted, Lost and Cancelled",
        },
      ],
      images: [
        {
          src: `${S}/merch-inquiry-detail.jpg`,
          alt: "Inquiry detail page with Back to list, Print / Save PDF and Convert to quotation buttons",
          caption: "A submitted inquiry: the main button is Convert to quotation.",
        },
        {
          src: `${S}/merch-inquiry-row-actions.jpg`,
          alt: "Inquiries list with the Actions menu open showing View, Edit, Print and To quotation",
          caption: "The same steps are in the row Actions menu on the list.",
        },
      ],
      relatedAppRoutes: ["/app/inquiries"],
      relatedArticleIds: ["merch-create-inquiry", "merch-quotation-costing", "merch-quotation-to-order", "merch-pipeline"],
    },
    {
      id: "merch-quotation-costing",
      title: "Build the quotation costing sheet",
      summary: "Enter materials, labour (CM), other costs, margin and commission to reach the FOB and final quoted price.",
      content: `## Overview

A **quotation** is your price offer to the buyer. Behind it sits a **costing sheet**: what each piece costs in materials, making (CM = cut and make) and other costs, plus margin and commission. Costing staff and merchandisers fill it together.

## Before you start

- Usually you start from an inquiry with **Convert to quotation** — header fields are pre-filled.
- To start blank: **Merchandising → Quotations** (\`/app/quotations\`) → **New quotation**.
- Material prices are easier if fabric and trims exist as inventory items.

## Steps

1. In **Quotation Basics**, check **Customer \\*\\***, **Link to inquiry (optional)**, **Style**, **Shipping term**, **Department** and **Projected quantity**.
2. Under **Currencies and FX**, set **Document / quote currency** and **Exchange rate (header FX)**. Note the **Buyer target (reference)** price.
3. Set dates: **Quotation date**, **Projected delivery date**, **Valid until**.
4. Fill **Commission mode / type / value**, **Pack ratio** and **PCS per carton** if they apply. Add **Notes / Assumptions**.
5. Open **Materials**. Add one line per material: **Material Category**, **Item / Description**, **UOM**, **Consumption** (per piece), **Unit Price**, currency and FX. **Subtotal** calculates itself.
6. Open **Labor / CM (Cut and Make)**. Per style part, enter **Machines**, **Prod/hr** and **Cost/machine**. **CM/pc** is calculated (you may override it).
7. Open **Other Commercial Costs (Washing, Overheads, Logistics)**. Add each **Cost head** as **Fixed** or **Percentage**.
8. Open **Size Ratios** and enter the size split if the buyer gave one.
9. Check **Final Commercial Breakdown**: **FOB Cost**, **Factory Margin**, **Agency Commission** and **Final Quoted Price**. Adjust **Markup on factory cost (%)** if needed.
10. Click **Save draft**. To change it later, click **Edit costing**.

## What happens next

When the costing is right, send it for approval: **Submit for review → Approve → Send** (see **Quotation approval and convert to order**).

## Tips

- The dark **Cost Summary** card (Total FOB cost, factory margin) and **Margin & Final Pricing** on the right update as you type.
- Set **Projected quantity** above zero, otherwise material and CM totals show 0.
- **Duplicate as new version** keeps the old quotation and makes a new draft to re-price.
- The **C-ready** column on the list shows costing readiness; open the quotation to fix red or amber scores.
- AI costing and benchmark panels are advice only.

## Common problems

- **Totals look far too high or low** → check **UOM**, **Consumption** per piece (not per order) and the **FX rate** on each line.
- **Fields are grey / cannot edit** → the quotation is **Approved**, **Sent** or **Converted** and locked. Use **Duplicate as new version** or a change request.
- **No Save draft button** → click **Edit costing** first.`,
      tags: ["quotation", "costing", "cost sheet", "fob", "cm", "merchandising"],
      keywords: [
        "costing sheet",
        "cost sheet",
        "price quote",
        "CM",
        "cut and make",
        "FOB",
        "consumption",
        "margin",
        "commission",
        "size ratio",
      ],
      estimatedMinutes: 8,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "merchandiser",
      coverImage: `${S}/merch-quotation-workspace.jpg`,
      videos: [
        {
          src: "/tutorials/videos/merch-inquiry-to-quotation.webm",
          poster: "/tutorials/videos/merch-inquiry-to-quotation-poster.jpg",
          title: "From inquiry to quotation",
          caption: "Where quotations come from, and the first fields to fill on a new quotation.",
          durationSeconds: 60,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Costing sheet sections, top to bottom",
          steps: [
            {
              title: "Quotation Basics",
              body: "Customer, inquiry link, style, currency, FX, dates, commission.",
              imageSrc: `${S}/merch-quotation-new-form.jpg`,
              imageAlt: "New quotation form showing Quotation Basics with customer, inquiry and style fields",
              href: "/app/quotations/new",
            },
            {
              title: "Materials",
              body: "One line per fabric or trim: consumption × unit price.",
              imageSrc: `${S}/merch-quotation-materials.jpg`,
              imageAlt: "Materials table with category, item, UOM, consumption, unit price and subtotal",
            },
            {
              title: "Labor / CM, Other costs, Size Ratios",
              body: "Making cost per piece, washing / overheads / logistics, and the size split.",
            },
            {
              title: "Final Commercial Breakdown",
              body: "FOB Cost + Factory Margin + Agency Commission = **Final Quoted Price**.",
              imageSrc: `${S}/merch-quotation-breakdown.jpg`,
              imageAlt: "Final Commercial Breakdown cards for FOB cost, factory margin, agency commission and final quoted price",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/quotations", "/app/quotations/new"],
      relatedArticleIds: ["merch-quotation-to-order", "merch-inquiry-detail", "merch-commercial-lock", "merch-order-bom"],
    },
    {
      id: "merch-quotation-to-order",
      title: "Quotation approval and convert to order",
      summary: "Move a quotation through Submit, Approve and Send, then turn it into a sales order when the buyer accepts.",
      content: `## Overview

A quotation passes three checks before it can become an order: someone **submits** it, a manager **approves** it, and you mark it **sent** to the buyer. When the buyer accepts, you **convert** it to an order.

## Before you start

- The costing must be complete and saved (see **Build the quotation costing sheet**).
- Agree in your team who checks and approves quotations (usually a manager). The app does not stop the same person from submitting and approving, so follow your company's maker / checker rule.

## Steps

1. Open the quotation (\`/app/quotations\` → click the code).
2. Status **DRAFT** or **NEW**: click **Submit for review** (or list **Actions → Submit**).
3. Status **SUBMITTED**: the approver clicks **Approve**. From now on the commercial fields are **locked**.
4. Status **APPROVED**: on the list, open **Actions → Send** after you email or hand the offer to the buyer.
5. Status **SENT**: when the buyer confirms, click **Create Order** on the quotation (or list **Actions → Convert to order**).
6. The new order opens. Its code looks like \`ORD-0008\`, and the quotation becomes **CONVERTED**.

## What happens next

- The order copies customer, style, quantity, delivery date, shipping term and commission, and stores a **commercial snapshot** of the quotation.
- The order starts as **NEW**. If TNA templates exist, follow-up tasks are created automatically.
- Next: open the order, enter the **Colour / size breakdown**, then create the **Order BOM**.

## Tips

- The list chips **Has inquiry**, **Has style image** and **Ready to convert** help you find work quickly.
- **Needs action** on the list counts Draft, New and Submitted quotations.
- If the buyer asks for a new price after approval, use **Duplicate as new version** rather than editing.

## Common problems

- **Actions menu says "Send first"** → the quotation is not **SENT** yet.
- **"Already converted"** → an order already exists; open it from **Orders**.
- **Error when creating the order** → read the red message; usually the status is not yet **SENT**.`,
      tags: ["quotation", "order", "convert", "approve", "sales"],
      keywords: ["approve quotation", "send quotation", "convert to order", "sales order", "SO", "confirm order", "buyer accepted"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      audience: "merchandiser",
      coverImage: `${S}/quotations.jpg`,
      infographics: [
        {
          type: "diagram",
          title: "Quotation status",
          caption: "From APPROVED onward, price and terms are locked.",
          imageSrc: `${D}/merch-quotation-status.svg`,
          imageAlt:
            "Quotation status diagram: Draft or New, Submitted, Approved, Sent, Converted, with Rejected and Cancelled; Approved to Converted are inside the commercial lock",
        },
        {
          type: "flow",
          title: "Where to click",
          steps: [
            { label: "Quotations list", href: "/app/quotations" },
            { label: "Submit for review" },
            { label: "Approve" },
            { label: "Actions → Send" },
            { label: "Create Order" },
            { label: "Orders", href: "/app/orders" },
          ],
        },
      ],
      images: [
        {
          src: `${S}/merch-quotation-row-actions.jpg`,
          alt: "Quotations list with the row Actions menu open showing View, Print, workflow step, Duplicate, Delete and convert",
          caption: "The row Actions menu offers only the next valid step.",
        },
      ],
      relatedAppRoutes: ["/app/quotations", "/app/orders"],
      relatedArticleIds: [
        "merch-quotation-costing",
        "merch-order-detail",
        "merch-order-color-size",
        "merch-commercial-lock",
        "gs-row-actions",
      ],
    },
    {
      id: "merch-order-detail",
      title: "The order page: pipeline, next action and related records",
      summary: "Read an order like a dashboard: pipeline stage, next required action, colour/size grid and links to every linked document.",
      content: `## Overview

The **order page** (\`/app/orders/:id\`) is the hub of execution. Merchandisers, planners, store and commercial staff all start here to see where a job stands.

## Before you start

- Most orders come from a quotation (**Create Order**). You can also click **New order** on **Merchandising → Orders** for a buyer PO without a quotation; it starts as **Draft**.

## Steps

1. Open **Merchandising → Orders** (\`/app/orders\`) and click the order code.
2. Read **Order pipeline**: the current stage, **RM in-house %** and a row of 12 circles (green = done, blue = current, dashed = N/A).
3. Read **Next required action**. Click its link to go straight to the screen that moves the order forward. The amber **TNA (soft gates)** line lists approval tasks that are still open; it warns you but does not block work.
4. Fill or check **Colour / size breakdown** (see **Colour / size breakdown on an order**).
5. In **Pipeline settings**, choose **export**, **local** or **both**. Tick steps that do not apply (for example **LC Received** for a local order), or click **Apply suggested N/A for type**, then **Save pipeline settings**.
6. Use **Related Records** to jump to **View BOM**, **View POs**, **View Production Plan**, **View Delivery Challan**, **View Invoices**, **View Packing List**, **View Cost Breakdown** and **View TNA Calendar**. The numbers in brackets count the linked documents; a ✓ means one exists. From here you can also **Create Proforma Invoice**, **Create Export Case**, open packing with **Mark as shipped**, and **Generate POs from BOM**.
7. Check **Schedule & Quantity** (order date, delivery date, quantity). The small status box with **Update status** changes the order status only where allowed.
8. Below: **ATP / CTP Promise Check** (can we deliver on time?), **Commercial alignment**, **Cost breakdown**, **Commercial change requests** and **Order AI**.
9. Top buttons: **Create Trade Case**, **Material requirement** (required vs available stock per item) and **Print / Save PDF**.

## What happens next

The pipeline moves by itself: BOM approved → **BOM Created**; PO raised → **PO Issued**; GRN received → **RM Received**; challan posted → **Shipped**; payment posted → **Payment Received** → **Completed**.

## Tips

- Admins see **Admin: force pipeline stage**. Use it only when the pipeline is truly stuck.
- **Generate POs from BOM** (in Related Records) creates draft POs, one per preferred vendor, from the approved / frozen order BOM.
- The **Orders** list shows **Exec AI** readiness and a **Grounding** badge; "blocked" means planning data is missing.

## Common problems

- **Pipeline stuck on "BOM Created"** → no PO has been raised yet. Use **Generate POs from BOM**.
- **Pipeline waits on LC for a local order** → tick **LC Received** as N/A in **Pipeline settings**.
- **Cannot edit delivery date or quantity** → the order is confirmed and locked; use **Propose change**.`,
      tags: ["order", "pipeline", "next action", "related records", "merchandising"],
      keywords: [
        "sales order",
        "order status",
        "order pipeline",
        "next required action",
        "ATP",
        "CTP",
        "material requirement",
        "N/A steps",
        "export order",
        "local order",
      ],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "merchandiser",
      coverImage: `${S}/merch-order-detail.jpg`,
      videos: [
        {
          src: "/tutorials/videos/merch-order-bom.webm",
          poster: "/tutorials/videos/merch-order-bom-poster.jpg",
          title: "Tour of an order page",
          caption: "Pipeline, Next required action, colour / size grid and Related Records, ending in the order BOM.",
          durationSeconds: 52,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "Order status and order pipeline",
          caption: "Status is set by people; the pipeline moves by itself from real documents.",
          imageSrc: `${D}/merch-order-pipeline.svg`,
          imageAlt:
            "Diagram of order statuses Draft, New, Confirmed, In progress, Completed, Cancelled and the 12 pipeline stages from Inquiry to Completed",
        },
        {
          type: "steps",
          title: "Read the order page top to bottom",
          steps: [
            {
              title: "Order pipeline + Next required action",
              body: "Where the job is, and the one thing to do next.",
              imageSrc: `${S}/merch-order-pipeline.jpg`,
              imageAlt: "Order pipeline tracker with stage circles and the Next required action box",
            },
            {
              title: "Related Records",
              body: "One click to BOM, POs, production plan, challans, invoices, packing lists and TNA.",
              imageSrc: `${S}/merch-order-related-records.jpg`,
              imageAlt: "Related Records buttons: View BOM, View POs, View Production Plan, View TNA Calendar and more",
            },
            {
              title: "Commercial change requests",
              body: "How to change a locked delivery date, quantity or commission.",
              imageSrc: `${S}/merch-order-change-requests.jpg`,
              imageAlt: "Commercial change requests panel with the Propose change button",
            },
          ],
        },
      ],
      images: [
        {
          src: `${S}/orders.jpg`,
          alt: "Orders list with code, customer, quotation, style, delivery date, quantity and Exec AI columns",
          caption: "Orders list: click an order code to open the order page.",
        },
        {
          src: `${S}/merch-order-new-form.jpg`,
          alt: "New Order form with customer, linked quotation, style, shipment, commission and timeline sections",
          caption: "New order (without a quotation) starts as Draft.",
        },
      ],
      relatedAppRoutes: ["/app/orders", "/app/orders/new"],
      relatedArticleIds: [
        "merch-order-color-size",
        "merch-order-bom",
        "merch-tna-followup",
        "merch-commercial-lock",
        "merch-quotation-to-order",
        "inv-po-deep",
      ],
    },
    {
      id: "merch-order-color-size",
      title: "Colour / size breakdown on an order",
      summary: "Record pieces per colour and size on the order page; confirmed orders keep their confirmed total.",
      content: `## Overview

Buyers usually order one style in several colours and sizes. The **Colour / size breakdown** grid on the order page records exactly how many pieces of each combination you must make. Cutting, packing and POs use it later.

## Before you start

- The grid is on for every company. An admin can hide it by unticking **Settings → Configuration → Colour / size breakdown on orders** (\`/app/settings/config\`).
- Add colourways and a size scale to the **garment style** first; then the grid can copy them.

## Steps

1. Open the order (\`/app/orders\` → click the order code).
2. In **Colour / size breakdown**, click **Use style colours & sizes** to copy the style's colourways and size scale (or the quotation's size ratio). You can also add colours and sizes yourself.
3. Type the pieces in each cell. Row, column and grand totals update as you type.
4. Keep **Set order quantity to grid total** ticked if the order quantity should follow the grid.
5. Click **Save breakdown**.

## What happens next

- Everyone sees the same breakdown; saving replaces the whole grid.
- If the order quantity changed (draft orders only), the BOM and POs use the new quantity.

## Tips

- Remove a colour or size with the small **×** next to its name before saving.
- Agree the breakdown with the buyer before you create the BOM, so material quantities are right.

## Common problems

- **"Total must equal confirmed quantity"** → the order is **Confirmed**, **In progress** or **Completed**. You can move pieces between colours and sizes, but the grand total must stay the same. To change the total, raise a **commercial change request** for **Quantity**.
- **Use style colours & sizes is missing** → the style has no colourways or size scale yet. Add them on the style's **Production** tab.`,
      tags: ["order", "colour", "color", "size", "breakdown", "matrix", "quantity"],
      keywords: ["size ratio", "colourway", "colorway", "assortment", "size break", "color size", "ratio"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      audience: "merchandiser",
      coverImage: `${S}/merch-order-color-size.jpg`,
      images: [
        {
          src: `${S}/merch-order-color-size.jpg`,
          alt: "Colour / size breakdown grid with colours as rows, sizes as columns and totals",
          caption: "Rows are colours, columns are sizes. Totals update as you type.",
        },
      ],
      relatedAppRoutes: ["/app/orders", "/app/settings/config"],
      relatedArticleIds: ["merch-order-detail", "merch-styles", "merch-commercial-lock", "merch-quotation-to-order"],
    },
    {
      id: "merch-commercial-lock",
      title: "Commercial lock and change requests",
      summary: "Why price, quantity and dates become read-only after approval, and how to change them safely with a change request.",
      content: `## Overview

Once a price is approved or an order is confirmed, the factory and the buyer rely on it. So P7 ERP **locks** the money and date fields. To change one, you raise a **change request** that someone else approves. Every change is recorded on the **Commercial timeline**.

## When is a record locked?

- **Quotation**: status **APPROVED**, **SENT** or **CONVERTED**.
- **Order**: status **CONFIRMED**, **IN PROGRESS** or **COMPLETED**.

Locked fields on an **order**: delivery date, quantity, commission mode / type / value, shipping term.
Locked fields on a **quotation**: target price and currency, exchange rate, quoted price, currency, total amount, shipping term, commission, projected quantity, projected delivery date, valid until.

## Steps

1. Open the order or quotation and scroll to **Commercial change requests**.
2. Click **Propose change**.
3. Pick the field, type the new value, and write a clear reason (for example "Buyer email 05-Nov: delivery moved to 20-Dec").
4. Save. The request shows as **pending approval**. The old value stays in use.
5. An approver opens the same panel and clicks **Approve** or **Reject** (the requester can **Cancel**).
6. After approval, click **Apply**. The new value is saved and the request shows **applied**.

## What happens next

- The change appears on the **Commercial timeline** card.
- **Control Tower** counts **Pending change requests**, so managers see what waits for them.

## Tips

- One request per field keeps approvals simple.
- If a draft record is not locked, the panel says changes are not required: just edit normally.
- For a full re-price of a quotation, **Duplicate as new version** is often easier than many change requests.

## Common problems

- **No Propose change button** → the record is not locked; edit the field directly.
- **Approved but value unchanged** → someone still has to click **Apply**.`,
      tags: ["change request", "commercial lock", "approval", "order", "quotation"],
      keywords: ["CR", "amendment", "locked fields", "change delivery date", "change quantity", "change price", "commercial snapshot"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      audience: "merchandiser",
      coverImage: `${D}/merch-change-request.svg`,
      infographics: [
        {
          type: "diagram",
          title: "Change request flow",
          imageSrc: `${D}/merch-change-request.svg`,
          imageAlt: "Change request flow: locked record, propose change, pending approval, approved, applied; or rejected or cancelled",
        },
      ],
      images: [
        {
          src: `${S}/merch-order-change-requests.jpg`,
          alt: "Commercial change requests panel on an order with the Propose change button",
          caption: "On a confirmed order the panel offers Propose change.",
        },
      ],
      relatedAppRoutes: ["/app/orders", "/app/quotations", "/app/merchandising/control-tower"],
      relatedArticleIds: ["merch-order-detail", "merch-quotation-to-order", "merch-control-tower", "merch-roles-permissions"],
    },
    {
      id: "merch-order-bom",
      title: "Order BOM: create, approve, freeze and raise POs",
      summary: "Turn the order's quotation materials into an approved bill of materials, then generate purchase orders from it.",
      content: `## Overview

The **order BOM** (bill of materials) lists every fabric, trim and accessory needed for **this order**, with consumption, wastage and price. Purchase, store and production all trust it, so it goes through approval.

A **style BOM** (on the style's **BOM** tab) is only a reference for costing. Purchasing needs the **order** BOM.

## Before you start

- The order must have a linked **quotation**, a **quantity** above zero and no BOM yet.
- Approve / reject needs \`merch.bom.approve\`, freeze needs \`merch.bom.freeze\`, generating POs needs \`merch.po.generate\` (see **Merchandising roles and permissions**).
- Lines need an **inventory item** and ideally a **preferred vendor** before POs can be made.

## Steps

1. From the order page click **View BOM**, or open **Merchandising → BOM Builder** (\`/app/bom\`).
2. New BOM: choose the order in **Create BOM from order**. Lines are pre-filled from the quotation materials. (To open an existing BOM by number, type the **Order ID** under **Load existing order BOM** and click **Load**.)
3. Check the header: **Order execution BOM**, order and quotation codes, quantity, currency and the **status** badge.
4. While **DRAFT**: use **Actions → Edit line** to set **Inventory item**, **Net consumption / unit**, **Wastage %**, **Process loss %**, **Expected unit price** and **Preferred vendor**. Use **Add manual line** for extras.
5. Click **Submit**.
6. The approver checks the summary cards (**Quoted material cost** vs **BOM material cost**, **Cost variance**) and clicks **Approve**, or **Reject** with a comment (the BOM goes back to **DRAFT**).
7. Optional: when the buyer has signed off, click **Freeze**. A frozen BOM cannot change.
8. Click **Generate Purchase Orders**. Check quantities and prices in the preview, then click **Create POs**. Draft POs are made, one per vendor. You can also use **Actions → Create PO** on one line.

## What happens next

- Approving or freezing moves the order pipeline to **BOM Created**; creating POs moves it to **PO Issued**.
- POs appear in **Inventory → Purchase Orders** for approval and sending.
- **Reconciliation** (button on the BOM) later compares planned vs actually issued material.

## Tips

- **Δ cons %** and **Δ price %** columns show how far the BOM drifts from the quotation.
- **PO status** per line tells you what is still to buy; **Actions → View POs** lists the POs of a line.
- If your company turned on **Sample approvals gate PO**, POs wait until key sample / approval TNA steps are done.

## Common problems

- **Order not in the "Create BOM from order" list** → no quotation linked, quantity is zero, or a BOM already exists (use **Load**).
- **Create PO is greyed out** → the BOM is not approved yet, or the line has no inventory item ("Link inventory item").
- **"Missing permission: merch.bom.approve"** → ask your admin to allow it on your role.
- **"No procurable lines found."** → no line has both an item and a required quantity.`,
      tags: ["bom", "order bom", "approve", "freeze", "purchase order", "materials"],
      keywords: [
        "bill of materials",
        "BOM approval",
        "freeze BOM",
        "consumption",
        "wastage",
        "trims",
        "fabric",
        "generate PO",
        "material planning",
        "merch.bom.approve",
      ],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "merchandiser",
      coverImage: `${S}/merch-bom-order.jpg`,
      videos: [
        {
          src: "/tutorials/videos/merch-order-bom.webm",
          poster: "/tutorials/videos/merch-order-bom-poster.jpg",
          title: "Open an order and its BOM",
          caption: "Read the order pipeline, then open the order BOM from Related Records. No button is clicked that changes data.",
          durationSeconds: 52,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "Order BOM status",
          caption: "Only DRAFT lines can be edited. POs only from APPROVED or FROZEN.",
          imageSrc: `${D}/merch-bom-status.svg`,
          imageAlt:
            "BOM status diagram: Draft, Submitted, Approved, Frozen, with Reject returning to Draft and the permission keys for approve, freeze and generate POs",
        },
        {
          type: "steps",
          title: "From order to POs",
          steps: [
            {
              title: "Open the order BOM",
              body: "Order page → **View BOM**, or BOM Builder → **Create BOM from order**.",
              imageSrc: `${S}/bom.jpg`,
              imageAlt: "BOM Builder with Create BOM from order dropdown and Load existing order BOM field",
              href: "/app/bom",
            },
            {
              title: "Check lines and submit",
              body: "Edit lines while DRAFT, then click **Submit**.",
              imageSrc: `${S}/merch-bom-lines.jpg`,
              imageAlt: "BOM materials table with consumption, wastage, required quantity, price, PO status and Actions",
            },
            {
              title: "Approve, freeze, generate POs",
              body: "Buttons on the sticky bar change with the status.",
              imageSrc: `${S}/merch-bom-order.jpg`,
              imageAlt: "Order BOM header with status badge, workflow buttons and summary cards",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/bom", "/app/orders", "/app/inventory/purchase-orders"],
      relatedArticleIds: ["merch-order-detail", "merch-roles-permissions", "merch-material-analytics", "inv-po-deep", "merch-styles"],
    },
    {
      id: "merch-tna-followup",
      title: "Follow-up TNA: plan and track order tasks",
      summary: "Generate the time-and-action calendar for an order, then mark tasks submitted, rejected or complete as work happens.",
      content: `## Overview

**TNA** (time and action) is the calendar of everything that must happen for an order to ship on time: lab dips, fit and PP samples, fabric in-house, cutting, inspection, ex-factory. **Merchandising → Follow-up TNA** (\`/app/followup\`, page title **Order Follow-up**) is the main TNA screen.

## Before you start

- The order needs a **delivery date**; task dates are counted back from it.
- TNA templates make generation automatic. Manage them at the bottom of the page under **Manage TNA templates**.
- Changing tasks may need \`merch.tna.manage\` on your role.

## Steps

1. Open **Merchandising → Follow-up TNA**. The cards show **Open**, **Overdue**, **Due this week** (click to filter) and **Rejected**.
2. No tasks yet for an order? Click **Generate TNA**, choose the **Order**, optionally tick **Templates**, then **Generate**. (Orders created from a quotation usually get tasks automatically.)
3. Narrow the list: search, or filter by order, buyer, assigned person, status and phase. Quick buttons: **Due today**, **Due this week**, **Overdue**.
4. On a task, open **Actions**:
   - **Mark submitted** — you sent the sample or document to the buyer.
   - **Mark rejected** — enter the buyer's **Rejection reason** and an optional **Resubmission date**.
   - **Edit** — change **Assigned to**, **Planned date**, **Submission date**, **Approval received date**, **Actual completion date**, **Milestone** and **Remarks**; add comments.
   - **Complete** — the task is done (**Reopen** undoes it).
   - **Timeline** — see all tasks of that order with the next due one.
5. Tick several rows and click **Shift dates** to move them all by some days when the buyer moves the delivery.
6. Switch views with **Table**, **Calendar** and **Kanban**. Use **Export CSV** or **Print list** to share.

## What happens next

- Late tasks raise **Critical Alerts** and count as **TNA overdue** on the **Control Tower**.
- If your admin turned on **TNA event sync**, some tasks tick themselves when the real document is saved (GRN → fabric in-house, approved PP sample → PP approval, posted challan → ex-factory). They show a system badge.

## Tips

- Set the **Milestone** type on key tasks; event sync and gates use it.
- **Unified TNA (Merch + Manufacturing)** at the top also shows manufacturing TNA tasks for the same orders.

## Common problems

- **Generate TNA does nothing / error** → the order has no delivery date. Set it on the order first.
- **Tasks duplicated** → tasks already existed. Delete the extras, or generate with only the missing templates ticked.
- **Too many overdue tasks** → use **Shift dates** after the buyer agrees a new date.`,
      tags: ["tna", "follow-up", "time and action", "calendar", "merchandising"],
      keywords: [
        "TNA",
        "time and action",
        "T&A",
        "critical path",
        "follow up",
        "lab dip",
        "PP sample",
        "ex-factory",
        "milestone",
        "overdue tasks",
      ],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "merchandiser",
      coverImage: `${S}/followup.jpg`,
      videos: [
        {
          src: "/tutorials/videos/merch-tna-followup.webm",
          poster: "/tutorials/videos/merch-tna-followup-poster.jpg",
          title: "Follow up TNA tasks",
          caption: "Read the TNA cards, see Generate TNA, filter by order, open a task's Actions, and switch to Calendar and Kanban.",
          durationSeconds: 55,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Daily TNA routine",
          steps: [
            {
              title: "Check the cards",
              body: "Open, Overdue, Due this week, Rejected.",
              imageSrc: `${S}/followup.jpg`,
              imageAlt: "Order Follow-up page with Open, Overdue, Due this week and Rejected cards and the unified TNA table",
              href: "/app/followup",
            },
            {
              title: "Generate tasks for new orders",
              body: "**Generate TNA** → pick the order → **Generate**.",
              imageSrc: `${S}/merch-followup-generate.jpg`,
              imageAlt: "Generate TNA dialog with Order dropdown and Templates checklist",
            },
            {
              title: "Update each task from Actions",
              body: "Mark submitted, Mark rejected, Edit, Complete.",
              imageSrc: `${S}/merch-followup-row-actions.jpg`,
              imageAlt: "Follow-up table with a row Actions menu open",
            },
            {
              title: "Fix dates and owners in Edit",
              imageSrc: `${S}/merch-followup-edit.jpg`,
              imageAlt: "Edit follow-up action dialog with planned, submission, approval and completion dates",
            },
          ],
        },
        {
          type: "diagram",
          title: "TNA, sample and alert statuses",
          imageSrc: `${D}/merch-followup-statuses.svg`,
          imageAlt: "Status diagram for TNA tasks, sample requests and critical alerts with the buttons that move them",
        },
      ],
      images: [
        {
          src: `${S}/merch-followup-calendar.jpg`,
          alt: "Follow-up calendar view with tasks on planned dates",
          caption: "Calendar view: tasks on their planned dates. Use Prev / Next to change the month.",
        },
        {
          src: `${S}/merch-followup-kanban.jpg`,
          alt: "Follow-up kanban board with one column per phase",
          caption: "Kanban view: one column per phase. Click a card to edit.",
        },
      ],
      relatedAppRoutes: ["/app/followup", "/app/orders"],
      relatedArticleIds: ["merch-samples", "merch-critical-alerts", "merch-order-detail", "merch-control-tower"],
    },
    {
      id: "merch-samples",
      title: "Sample development: request and approve samples",
      summary: "Create proto, fit, PP, size-set and other sample requests, track them to buyer approval, and record cost and tasks.",
      content: `## Overview

**Sample Development** (\`/app/merchandising/samples\`) tracks every sample the factory makes for a buyer: proto, fit, size set, PP (pre-production), SMS, shipping, wash and more. Each sample is linked to a **style** and, when known, to an **inquiry** or **order**.

## Before you start

- The **garment style** must exist.
- Creating and moving samples may need \`merch.sample.manage\` on your role.

## Steps

1. Open **Merchandising → Sample Development** and click **New sample request**.
2. Choose **Style**, **Sample type** (for example \`proto\`, \`fit\`, \`pp\`, \`size_set\`), an optional **Subtype** (buyer ref, colourway), the **Inquiry (optional)** or **Order (optional)**, a **Target date** and **Remarks**. Click **Create**.
3. Open the sample from **Actions → View**.
4. Move it through its steps with the buttons at the top:
   - **Start (in progress)** when the sample room starts.
   - **Mark submitted** when it goes to the buyer.
   - **Approve** or **Reject** with the buyer's answer.
   - **Cancel** if the sample is no longer needed (before it is submitted).
5. Record work in **Tasks**, cost in **Costing lines** and fabric / trims in **Material lines**. Add notes in **Comments**.
6. Optional: **AI plan** creates a suggested task plan. Check the **Preview**, then apply it.

## What happens next

- **Control Tower** counts **Samples pending** and **Samples past target date**.
- With **TNA event sync** on, approving a PP or lab dip sample ticks the matching TNA milestone.
- With **Sample approvals gate PO** on, BOM → PO waits for key sample approvals.

## Tips

- Use the status tabs (**Requested**, **In progress**, **Submitted**, **Approved**, **Rejected**) and the **Type**, **Style** and target date filters.
- A rejected sample is final. Create a new request for the next round so the history stays clear.

## Common problems

- **"Select a style"** → no style chosen; create the style first under **Garment Styles**.
- **Old Manufacturing → Samples screen** → that is the legacy path. Use **Sample Development** under Merchandising.`,
      tags: ["samples", "sample development", "pp sample", "fit sample", "merchandising"],
      keywords: ["proto sample", "fit sample", "PP sample", "pre-production", "size set", "SMS", "lab dip", "sample approval", "sampling"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      audience: "merchandiser",
      coverImage: `${S}/merchandising-samples.jpg`,
      infographics: [
        {
          type: "steps",
          title: "Sample request",
          steps: [
            {
              title: "Click New sample request",
              imageSrc: `${S}/merchandising-samples.jpg`,
              imageAlt: "Sample development list with status tabs and the New sample request button",
              href: "/app/merchandising/samples",
            },
            {
              title: "Fill style, type and target date, then Create",
              imageSrc: `${S}/merch-sample-new-form.jpg`,
              imageAlt: "New sample request dialog with style, sample type, subtype, inquiry, order, target date and remarks",
            },
            {
              title: "Open it and move it: Start → Mark submitted → Approve / Reject",
            },
          ],
        },
        {
          type: "diagram",
          title: "Sample status (middle row)",
          imageSrc: `${D}/merch-followup-statuses.svg`,
          imageAlt: "Status diagram including sample request: requested, in progress, submitted, approved or rejected, cancelled",
        },
      ],
      relatedAppRoutes: ["/app/merchandising/samples"],
      relatedArticleIds: ["merch-tna-followup", "merch-styles", "merch-control-tower", "merch-order-bom"],
    },
    {
      id: "merch-styles",
      title: "Garment styles: master data, colours, sizes and style BOM",
      summary: "Keep one record per garment style with its picture, colourways, size scales, components and reference BOM.",
      content: `## Overview

A **garment style** is the design you sell (for example "LKH-STY-07 Woven shirt"). Inquiries, quotations, orders, samples and BOMs all point to it. **Garment Styles** (\`/app/merchandising/styles\`) is also a small control tower per style.

## Before you start

- Creating or editing styles may need \`merch.style.manage\` on your role.

## Steps

1. Open **Merchandising → Garment Styles**. Search by code, name, buyer ref or product; filter by status, lifecycle, buyer, department or **Critical only**.
2. Click **New style**. **Create New Style** has three steps:
   - **Step 1: Required basics** — **Style name \\*** (leave **Style code** empty to get an automatic code), product type, buyer style ref.
   - **Step 2: Classification** — season, department, lifecycle stage (for example \`INQUIRY\`) and status (\`ACTIVE\`).
   - **Step 3: Risk and priority** — priority, risk level, style image URL. Then click **Save**.
3. Open the style (click its code). The header shows counts: **Inquiry / Quotation / Order**, **Open follow-up**, **Shipped / Pending qty**, **Payment due** and **Style health**.
4. Use the tabs:
   - **Master Data** — edit the main fields.
   - **Production** — add **Components**, **Colorways** and **Size Scales** (for example \`S,M,L,XL\`). The order **Colour / size breakdown** copies these.
   - **BOM** — the **reference** (style) BOM versions used for costing.
   - **Follow-up** — the TNA timeline across orders of this style.
   - **Shipment & Payment** — invoice, received and due amounts.

## What happens next

- New inquiries and quotations can pick the style, and orders inherit it.
- The style's colourways and sizes speed up order breakdowns.

## Tips

- The list columns **Open actions**, **Overdue actions** and **Pending payment** show which styles need attention.
- Use **Set archive flags** on **Master Data** to retire a style instead of deleting it.

## Common problems

- **Style missing from the inquiry dropdown** → it may be **INACTIVE** or not active for new orders.
- **BOM Builder opened with a style but no order** → it shows a note; style BOMs live on the style **BOM** tab.`,
      tags: ["style", "garment style", "colourway", "size scale", "master data"],
      keywords: ["style master", "colorway", "colourway", "size scale", "style BOM", "tech pack", "design", "article"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      audience: "merchandiser",
      coverImage: `${S}/merchandising-styles.jpg`,
      infographics: [
        {
          type: "steps",
          title: "Style screens",
          steps: [
            {
              title: "Find or create the style",
              imageSrc: `${S}/merchandising-styles.jpg`,
              imageAlt: "Garment Styles list with code, name, buyer, lifecycle, open and overdue actions",
              href: "/app/merchandising/styles",
            },
            {
              title: "Open it and read the health strip",
              imageSrc: `${S}/merch-style-detail.jpg`,
              imageAlt: "Style detail header with counts, related records, picture and tabs",
            },
            {
              title: "Production tab: colourways and size scales",
              imageSrc: `${S}/merch-style-production-tab.jpg`,
              imageAlt: "Style Production tab with Components, Colorways and Size Scales lists",
            },
            {
              title: "BOM tab: reference BOM versions",
              imageSrc: `${S}/merch-style-bom-tab.jpg`,
              imageAlt: "Style BOM tab listing style BOM versions",
            },
          ],
        },
      ],
      images: [
        {
          src: `${S}/merch-style-new-form.jpg`,
          alt: "Create New Style form on the Garment Styles page",
          caption: "New style: only the style name is required.",
        },
      ],
      relatedAppRoutes: ["/app/merchandising/styles"],
      relatedArticleIds: ["merch-order-color-size", "merch-create-inquiry", "merch-samples", "merch-order-bom"],
    },
    {
      id: "merch-control-tower",
      title: "Merchandising Control Tower",
      summary: "A one-screen morning check: open inquiries, costing gaps, change requests, BOMs, overdue TNA, samples and delivery risk.",
      content: `## Overview

**Control Tower** (\`/app/merchandising/control-tower\`, page title **Merchandising control tower**) counts the merchandising work that needs attention. Merch managers open it every morning; each card links to the list behind it.

## Steps

1. Open **Merchandising → Control Tower**. Check **Last updated**; click **Refresh** for fresh numbers.
2. Read the cards (amber = needs action, red = urgent):
   - **Inquiries needing action** — open inquiries, oldest date shown.
   - **Quotations incomplete (costing)** — plus how many expire within 14 days.
   - **Orders — commercial drift (scan)** — orders whose values differ from the quotation snapshot.
   - **Pending change requests** — waiting for approval.
   - **BOM — draft / submitted** — with approved and frozen counts.
   - **TNA overdue** — with critical / mandatory count.
   - **Planning risk (delivery ≤ 14d)** — not shipped, due soon.
   - **Samples pending** and **Samples past target date**.
   - **OTD at risk** — on-time delivery risk and overdue deliveries.
3. Click a card to open the matching list, then fix the items there.
4. Use **Quick links** for Inquiries, Quotations, Orders, Alerts, BOM builder, TNA / Follow-up and Pipeline.

## Tips

- Aim to keep red cards at zero before noon.
- For one order across all departments, use the order page's **Control Tower** link (operations control tower), if your company has it.

## Common problems

- **Numbers look old** → click **Refresh**.
- **A card says 0 but you expect work** → check your filters on the target list and that the records are in this company.`,
      tags: ["control tower", "dashboard", "merchandising", "kpi"],
      keywords: ["merch dashboard", "overview", "late orders", "OTD", "on time delivery", "risk", "morning check"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      audience: "manager",
      coverImage: `${S}/merchandising-control-tower.jpg`,
      images: [
        {
          src: `${S}/merchandising-control-tower.jpg`,
          alt: "Merchandising control tower with ten cards and quick links",
          caption: "Each card links to the list behind the number.",
        },
      ],
      relatedAppRoutes: ["/app/merchandising/control-tower"],
      relatedArticleIds: ["merch-critical-alerts", "merch-tna-followup", "merch-commercial-lock", "ops-control-tower"],
    },
    {
      id: "merch-critical-alerts",
      title: "Critical Alerts: act on late and at-risk work",
      summary: "See overdue TNA tasks, LC expiry and other risks, then acknowledge, work on, snooze, escalate or resolve each alert.",
      content: `## Overview

**Critical Alerts** (\`/app/merchandising/alerts\`) lists problems the system found: TNA tasks overdue or due soon, trade LCs close to expiry, and similar risks. A background scan runs about every 15 minutes.

## Before you start

- **Run scan** needs \`merch.alert.scan\`; assigning alerts needs \`merch.alert.assign\`.

## Steps

1. Open **Merchandising → Critical Alerts**. The cards count alerts by severity: **Critical**, **High**, **Medium**, **Low**, **Info** and **Total**.
2. Filter by **Severity** and **Status**. Save a filter you use often with **Save view**; reopen it from **Saved views**.
3. Click **Open** on a row. The **Alert detail** drawer shows the order, **Reason**, **Recommended action** and **Go to related screen**.
4. Under **Update status**:
   - **Acknowledge** — "I have seen it".
   - **In progress** — you are fixing it.
   - **Resolve** — fixed.
   - **Snooze 1 day** — hide it until tomorrow.
5. Use the drawer tabs: **Timeline** (history), **Comments** (type and click **Add**) and **Escalation** (**Escalate alert** to your manager).
6. Click **Run scan** if you just fixed data and want the list refreshed now.

## What happens next

- Fixing the cause (for example completing the TNA task) stops the alert coming back at the next scan.
- Resolved alerts drop off the default view; filter **Status → Resolved** to see them.

## Tips

- Work from **Critical** down.
- Open the alert from the order page link to see only that order's alerts.

## Common problems

- **Alert keeps returning** → the cause is not fixed; update the TNA task or record, not just the alert.
- **"Missing permission: merch.alert.scan"** → wait for the automatic scan or ask your admin.`,
      tags: ["alerts", "critical alerts", "tna overdue", "risk", "merchandising"],
      keywords: ["alert center", "notification", "overdue", "escalation", "snooze", "LC expiry", "late task", "warning"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      audience: "merchandiser",
      coverImage: `${S}/merchandising-alerts.jpg`,
      infographics: [
        {
          type: "steps",
          title: "Work an alert",
          steps: [
            {
              title: "Filter and open",
              body: "Start with **Critical**.",
              imageSrc: `${S}/merchandising-alerts.jpg`,
              imageAlt: "Critical Alerts list with severity cards, filters and Open links",
              href: "/app/merchandising/alerts",
            },
            {
              title: "Read the reason and act",
              body: "**Acknowledge**, **In progress**, **Resolve** or **Snooze 1 day**.",
              imageSrc: `${S}/merch-alert-drawer.jpg`,
              imageAlt: "Alert detail drawer with reason, recommended action and status buttons",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/merchandising/alerts"],
      relatedArticleIds: ["merch-control-tower", "merch-tna-followup", "merch-roles-permissions", "ai-exception-agents"],
    },
    {
      id: "merch-order-pipeline-board",
      title: "Order Pipeline board and Pipeline Analytics",
      summary: "See every inquiry, quotation and order as cards by stage, and the month-wise or quarterly sales picture.",
      content: `## Overview

**Order Pipeline** (\`/app/merchandising/pipeline\`) shows all inquiries, quotations and orders as cards in stage columns (for example **Inquiry · Draft**, **Inquiry · Submitted**, **Quotation · Draft**). Each column shows a win probability %. **Pipeline Analytics** (\`/app/merchandising/pipeline-analytics\`) gives the month-wise and quarterly report for marketing.

## Steps

1. Open **Merchandising → Order Pipeline**. The **Summary** shows counts of inquiries, quotations and orders.
2. Filter by document type (**All**, **Inquiries only**, **Quotations only**, **Orders only**), by customer, or search a code or style.
3. Switch between **Kanban** and **List** with the two icons.
4. To move a card to the next stage, drag it one column to the right, or open the small arrow on the card (**Move** in List view) and pick a status. Only valid next statuses are offered (for example a submitted inquiry can go to Converted, Lost or Cancelled).
5. Click **Month-wise & quarterly report** (or **Analytics → Pipeline Analytics**). Choose **Years back**, then **Month-wise** or **Quarterly**.
6. Read the columns: **Inquiries received**, **Confirmed orders (count)**, **Confirmed orders (qty)**, **Inquiry under processing** and **Potential orders**.

## Tips

- Moving cards changes the real status. Prefer the buttons on the inquiry or quotation page, which check required fields.
- **Potential orders** = quotations sent or approved but not yet converted.

## Common problems

- **"Drag to the next column only (one stage at a time)."** → you skipped a stage; move one column at a time.
- **Order cards cannot move forward** → order stages are driven by real documents, not by dragging.`,
      tags: ["pipeline", "kanban", "analytics", "sales funnel", "merchandising"],
      keywords: ["sales pipeline", "funnel", "kanban", "win rate", "monthly report", "quarterly report", "forecast"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      audience: "manager",
      coverImage: `${S}/merchandising-pipeline.jpg`,
      images: [
        {
          src: `${S}/merchandising-pipeline.jpg`,
          alt: "Order Pipeline kanban with columns Inquiry Draft, Inquiry Submitted, Inquiry Converted and Quotation Draft",
          caption: "Kanban view: cards by stage with win probability per column.",
        },
        {
          src: `${S}/merch-pipeline-list.jpg`,
          alt: "Order Pipeline list view with type, code, stage, customer, quantity and amount",
          caption: "List view of the same pipeline.",
        },
        {
          src: `${S}/merchandising-pipeline-analytics.jpg`,
          alt: "Pipeline Analytics with KPI cards, month-wise chart and table",
          caption: "Pipeline Analytics: month-wise and quarterly report.",
        },
      ],
      relatedAppRoutes: ["/app/merchandising/pipeline", "/app/merchandising/pipeline-analytics"],
      relatedArticleIds: ["merch-pipeline", "merch-inquiry-detail", "merch-quotation-to-order"],
    },
    {
      id: "merch-material-analytics",
      title: "Consumption plans, consumption recon, wastage and order profitability",
      summary: "Compare planned (BOM) material with what was really used, find wastage, and check quoted vs actual margin per order.",
      content: `## Overview

Four screens help costing and management check money after the BOM is approved:

- **Consumption Plans** (\`/app/bom/orders\`) — simple plan of required materials per order.
- **Consumption Recon** (\`/app/merchandising/consumption-reconciliation\`) — BOM planned vs actual material issued.
- **Wastage Report** (\`/app/merchandising/wastage-report\`, page **Wastage & Loss Analysis**) — wastage value by order, item, buyer and month.
- **Order Profitability** (\`/app/merch/profitability\`) — quoted margin vs actual margin from POs and GRNs.

## Before you start

- These screens need an approved order BOM and real stock movements (POs, GRNs, production material issues). New orders show little data.
- Wastage settings may need \`merch.wastage.manage\`.

## Steps

1. **Consumption Recon → Dashboard**: filter by **Buyer**, **Style**, **From / To**, **Material**, **Status** and **Tolerance**. Cards show **On target**, **Minor** and **Exceeds** orders.
2. Switch to **Order detail**, pick an order, and read **Variance at a glance (quoted · BOM · actual)** and the item table. Click a row for **Movement history**.
3. **Wastage Report**: check **Total wastage value**, fabric / trim wastage % and **Orders above threshold**. Use **Filters** then **Apply**; open an order for **BOM vs actual**, **Process-stage breakdown** and **Reason breakdown**. **Export Excel** or **Print / PDF** to share.
4. **Order Profitability**: use the chips **All variance**, **Red only**, **Yellow only**, **Green only** and **Order status**. Click **View** for detail.
5. **Consumption Plans**: search an order, click **New Plan**, select the plan and add required quantities.

## Tips

- Open recon straight from the BOM with the **Reconciliation** button.
- Red rows first: they lose the most money.

## Common problems

- **All zeros** → no production material issues are posted against the order yet.
- **Huge or strange margin %** → quotation or PO prices are missing or in different units; check the quotation costing and PO prices.`,
      tags: ["consumption", "wastage", "profitability", "reconciliation", "analytics"],
      keywords: ["consumption recon", "wastage report", "material variance", "profit margin", "BOM vs actual", "excess consumption", "costing review"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      audience: "costing",
      coverImage: `${S}/merchandising-consumption-reconciliation.jpg`,
      images: [
        {
          src: `${S}/merchandising-consumption-reconciliation.jpg`,
          alt: "Consumption Reconciliation dashboard with filters, on target, minor and exceeds cards",
          caption: "Consumption Recon: planned vs actual per order.",
        },
        {
          src: `${S}/merchandising-wastage-report.jpg`,
          alt: "Wastage & Loss Analysis with total wastage value, management summary and filters",
          caption: "Wastage Report: value, trends and suggested actions.",
        },
        {
          src: `${S}/merch-profitability.jpg`,
          alt: "Order profitability table with quoted margin, actual margin, variance and trend",
          caption: "Order Profitability: quoted vs actual margin.",
        },
        {
          src: `${S}/bom-orders.jpg`,
          alt: "Consumption Plans page with order search, New Plan button, plans and plan items",
          caption: "Consumption Plans: a simple required-material plan per order.",
        },
      ],
      relatedAppRoutes: [
        "/app/bom/orders",
        "/app/merchandising/consumption-reconciliation",
        "/app/merchandising/wastage-report",
        "/app/merch/profitability",
        "/app/merch/order-profitability",
      ],
      relatedArticleIds: ["merch-order-bom", "merch-order-detail", "inv-grn-deep"],
    },
    {
      id: "merch-parties-flow",
      title: "Parties and Document Flow",
      summary: "Manage buying houses, agents and customer links, and trace each order's inquiry → quotation → order → PI chain.",
      content: `## Overview

- **Parties** (\`/app/parties\`) holds the middle-men: **Buying Houses**, **Agents** and **Customer Links** (which agent or buying house works for which customer). The **Intermediary** field on inquiries, quotations and orders comes from here.
- **Document Flow** (\`/app/flow\`) shows, for every order, the chain **INQ → QT → ORD → PI** with codes you can click.

## Steps

1. **Parties**: pick the tab **Buying Houses**, **Agents** or **Customer Links**.
2. In **New party**, enter **Name \\*\\***, contact person, email, phone and **Status**, then click **Create** (or **Clear**).
3. On **Customer Links**, connect a customer to its agent or buying house so the intermediary can be picked on inquiries.
4. **Document Flow**: read the cards (**Inquiries**, **Quotations**, **Orders**, **Proforma Invoices**). Search an order code or style, filter by status and dates.
5. Click any code in the row to open that document. Use **Export CSV** for a report and **Refresh** after big changes.

## Tips

- Document Flow is the fastest way to answer "Which inquiry and quotation did this order come from?" and "Has the PI been made?".

## Common problems

- **Intermediary list empty on an inquiry** → no customer link exists yet; add one on **Parties → Customer Links**.
- **A row has no PI** → create it from the order page: **Create Proforma Invoice**.`,
      tags: ["parties", "agents", "buying house", "document flow", "traceability"],
      keywords: ["intermediary", "agent", "buying house", "commission agent", "document chain", "PI", "proforma", "trace order"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      audience: "merchandiser",
      coverImage: `${S}/flow.jpg`,
      images: [
        {
          src: `${S}/parties.jpg`,
          alt: "Parties page with Buying Houses, Agents and Customer Links tabs and a New party form",
          caption: "Parties: buying houses, agents and customer links.",
        },
        {
          src: `${S}/flow.jpg`,
          alt: "Document Flow table with flow chips, order, customer, inquiry, quotation, status, delivery and proforma columns",
          caption: "Document Flow: one row per order with its whole chain.",
        },
      ],
      relatedAppRoutes: ["/app/parties", "/app/flow"],
      relatedArticleIds: ["merch-customers", "merch-pipeline", "commercial-overview"],
    },
    {
      id: "merch-roles-permissions",
      title: "Merchandising roles and permissions",
      summary: "Which role permission controls each merchandising button (BOM approve, freeze, PO generate, TNA, samples, alerts) and the related company settings.",
      content: `## Overview

Admins can allow or block sensitive merchandising buttons per role. This keeps a "maker" and a "checker" apart, for example the person who prepares a BOM is not the person who approves it.

## How the switches work

- They are set in **Settings → Roles** (\`/app/settings/roles\`).
- If a key is **not set**, the action is **allowed** (so nothing breaks for existing users).
- Set a key to **off / false** to **block** it for that role.
- \`merch.*\` (or \`*\`) set to on allows all merchandising keys.
- Users without access to Merchandising at all do not see the section.

## The keys

- \`merch.bom.approve\` — **Approve** and **Reject** an order BOM.
- \`merch.bom.freeze\` — **Freeze** an approved BOM.
- \`merch.po.generate\` — **Generate Purchase Orders** / **Create PO** from a BOM.
- \`merch.tna.manage\` — manage TNA tasks and templates.
- \`merch.sample.manage\` — create and move sample requests.
- \`merch.style.manage\` — create and change garment styles.
- \`merch.wastage.manage\` — wastage settings.
- \`merch.alert.scan\` — **Run scan** on Critical Alerts.
- \`merch.alert.assign\` — assign alerts to people.
- \`merch.alert.definitions\` — change alert rules.

## Company settings (admin, Settings → Configuration)

All are **off** by default. Ask your admin which are on (\`/app/settings/config\`):

- **TNA event sync** — GRN, sample approval, hourly production and posted challans tick matching TNA tasks.
- **Require order on shop floor** — hourly production must pick an order.
- **Line allocation → TNA sync** — confirming a line booking updates TNA.
- **Sample approvals gate PO** — BOM → PO is blocked until key sample / approval TNA steps are done.
- **Open CAPA blocks challan** — a delivery challan cannot be posted while a CAPA is open on the order.
- **Colour / size breakdown on orders** — shows the grid on orders (on by default).

## Common problems

- **"Missing permission: merch.bom.approve"** (or another key) → your role has that key switched off. Ask an admin to change your role or ask a colleague who has it.`,
      tags: ["permissions", "roles", "rbac", "settings", "merchandising"],
      keywords: ["RBAC", "access rights", "maker checker", "approve permission", "feature flag", "missing permission", "role settings"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      audience: "admin",
      coverImage: `${D}/merch-bom-status.svg`,
      infographics: [
        {
          type: "diagram",
          title: "Where the BOM permission keys apply",
          imageSrc: `${D}/merch-bom-status.svg`,
          imageAlt: "BOM status diagram showing merch.bom.approve, merch.bom.freeze and merch.po.generate on the buttons they control",
        },
      ],
      relatedAppRoutes: ["/app/settings/roles", "/app/settings/config"],
      relatedArticleIds: ["merch-order-bom", "merch-tna-followup", "merch-critical-alerts", "settings-overview"],
    },
  ],
};

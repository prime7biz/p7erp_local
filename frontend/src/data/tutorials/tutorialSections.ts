import type { TutorialSection } from "./types";
import { enrichTutorialSections } from "./tutorialArticleEnrich";

/**
 * In-app help content — aligned with `frontend/src/app/sidebarConfig.tsx` and real routes.
 * When you add/rename/remove sidebar items or change user-facing flows, update the matching article(s).
 */
const tutorialSectionsRaw: TutorialSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "Sign-in, home screen, and how to move around the app.",
    articles: [
      {
        id: "gs-at-a-glance",
        title: "Your first day in Prime7 ERP",
        summary: "See how login, dashboard, merchandising, inventory, and finance connect at a high level.",
        featured: true,
        order: -1,
        coverImage: "/images/hero-factory.svg",
        infographics: [
          {
            type: "flow",
            title: "Typical cross-module flow",
            steps: [
              { label: "Sign in", href: "/login" },
              { label: "Dashboard", href: "/app" },
              { label: "Sales path", href: "/app/inquiries" },
              { label: "Stock & PO", href: "/app/inventory/purchase-orders" },
              { label: "Production", href: "/app/production" },
              { label: "Vouchers", href: "/app/accounts/vouchers" },
            ],
          },
        ],
        content: `## Overview

This overview is for **non-technical users** who need to see how Prime7 ERP fits together before diving into each module.

## What Prime7 does

- **Merchandising** captures buyers, inquiries, quotations, and orders.
- **Inventory** handles purchase orders, receiving, warehouses, and stock movement.
- **Manufacturing** (when your tenant is a manufacturer) plans and records factory work.
- **Finance** records vouchers, approvals, and payments.
- **Settings** controls who sees which menus and how your tenant is configured.

## Tips

- Use the **sidebar** to open each area; your admin controls which sections appear.
- Open **Help & Tutorials** any time from the bottom of the sidebar.`,
        tags: ["overview", "getting started", "workflow"],
        lastUpdated: "2026-04-04",
        relatedAppRoutes: ["/app", "/login", "/app/tutorials"],
        relatedArticleIds: ["gs-login", "gs-sidebar", "merch-pipeline", "inv-overview", "fin-overview"],
        images: [
          {
            src: "/images/hero-factory.svg",
            alt: "Stylized factory illustration representing operations in one place",
            caption: "Operations from sales through production and finance live in one system.",
          },
        ],
      },
      {
        id: "gs-login",
        title: "How to sign in",
        content: `## Overview

Prime7 ERP is **multi-tenant**: your company’s data is isolated. You sign in with your tenant’s **company code** plus your user credentials.

## Steps

1. Open the app and go to the **Login** page (\`/login\`).
2. Enter your **Company code** (your organization’s identifier — often provided by your admin).
3. Enter your **Username** or **Email** and **Password**.
4. Click **Sign in**.

## Tips

- If your organization uses SSO or other login options, follow the prompts shown on the login screen.
- After login you land on the **Dashboard** (\`/app\`).

## If something fails

- Double-check the company code and password.
- Ask your administrator to confirm your user is active and assigned a role.`,
        tags: ["login", "company code", "password", "tenant"],
        lastUpdated: "2026-04-04",
        relatedAppRoutes: ["/login", "/app"],
        relatedArticleIds: ["gs-dashboard", "gs-sidebar", "gs-at-a-glance"],
      },
      {
        id: "gs-dashboard",
        title: "Dashboard",
        content: `## Overview

The **Dashboard** is the home route after login (\`/app\`). It summarizes activity and gives shortcuts into daily work.

## What to do here

- Review summary cards and lists your tenant has enabled.
- Use the **sidebar** to open modules (Merchandising, Inventory, Finance, and so on).

## Tips

- Exact widgets depend on your tenant setup and permissions.`,
        tags: ["dashboard", "home", "overview"],
        lastUpdated: "2026-04-04",
        coverImage: "/images/tech-pattern.svg",
        infographics: [
          {
            type: "highlight",
            title: "Start here each day",
            body: "Open the Dashboard after login, then use the sidebar to jump to your role’s main screens (sales, warehouse, production, or finance).",
          },
        ],
        relatedAppRoutes: ["/app"],
        relatedArticleIds: ["gs-sidebar", "gs-tenant-modes", "gs-at-a-glance"],
      },
      {
        id: "gs-sidebar",
        title: "Sidebar navigation",
        content: `## Overview

The **left sidebar** lists modules. This matches the live menu in the app (see **Merchandising**, **Inventory**, **Manufacturing**, **Finance**, etc.).

## How it behaves

- **Sections** can be expanded or collapsed. Click the section header to open or close it.
- Some sections (for example **Inventory**, **Manufacturing**, **HR**, **Finance**) show **subsection labels** such as “Procurement” or “Transactions” to group related pages.
- When the sidebar is **collapsed** to icons, hover a section to open a **flyout menu** of its links.
- At the bottom, **Help & Tutorials** opens this guide (\`/app/tutorials\`).
- In the **top bar**, use **Portals** (link icon) for **Customer portal** and **Financier portal** sign-in pages — these are separate from staff login. **Manage external access** opens \`/app/settings/external-access\` (invites and feature flags).
- Under **Settings** in the sidebar, **External access** goes to the same administration screen.

## Tips

- Menu items may be **hidden** if your **tenant type** is manufacturer vs buying house, or if a **feature flag** (such as trade) is off for your tenant.`,
        tags: ["navigation", "sidebar", "menu"],
        lastUpdated: "2026-04-04",
        relatedAppRoutes: ["/app/tutorials"],
        relatedArticleIds: ["gs-tenant-modes", "gs-row-actions"],
      },
      {
        id: "gs-tenant-modes",
        title: "Tenant type and visible modules",
        content: `## Overview

Your organization has a **tenant type** (for example manufacturer, buying house, or both). The sidebar only shows modules that apply to that type.

## Examples

- **Manufacturer / both**: You will see **Manufacturing** (production, shop floor, TNA, samples) and related items.
- **Buying house**: **Manufacturing** may be hidden; **Export & Import** and merchandising flows stay in focus.
- **Trade**: Links such as **Trade Cases**, **Trade Control Tower**, and **Logistics** appear when **trade** is enabled for your tenant; otherwise they are hidden.

## Tips

- If you expect a screen but do not see it, ask an admin to check tenant type, optional production units, and feature flags.`,
        tags: ["tenant", "manufacturer", "buying house", "trade"],
        lastUpdated: "2026-04-03",
        relatedAppRoutes: ["/app/settings/tenant", "/app/settings"],
        relatedArticleIds: ["gs-sidebar"],
      },
      {
        id: "gs-row-actions",
        title: "Row Actions in lists",
        content: `## Overview

Many data tables use a single **Actions** control per row (not separate edit/delete icons everywhere).

## Steps

1. Find the **Actions** button on the row you care about.
2. Open the menu and choose **View**, **Edit**, **Delete**, **Print**, or other options your role allows.

## Tips

- Available actions depend on **permissions** and record state.`,
        tags: ["actions", "table", "edit", "delete"],
        lastUpdated: "2026-04-03",
        relatedAppRoutes: ["/app/customers", "/app/inquiries", "/app/quotations", "/app/orders"],
        relatedArticleIds: ["merch-pipeline"],
      },
    ],
  },
  {
    id: "support",
    title: "Support",
    description: "Working with the in-app support ticket workflow.",
    articles: [
      {
        id: "sup-tickets",
        title: "Support tickets",
        content: `## Overview

Use **Support** in the sidebar to reach the operations team (billing, access, technical issues).

## Where to go

- **My tickets** — \`/app/support/tickets\`
- **New ticket** — \`/app/support/tickets/new\`

## Typical flow

1. Open **New ticket** and describe the issue.
2. Track status under **My tickets**.
3. Open a ticket to read updates and reply if the UI allows.

## Tips

- Include your **company code** and what you were trying to do when the problem happened.`,
        tags: ["support", "tickets", "help"],
        lastUpdated: "2026-04-03",
        relatedAppRoutes: ["/app/support/tickets", "/app/support/tickets/new"],
        relatedArticleIds: ["sup-create-ticket"],
      },
      {
        id: "sup-create-ticket",
        title: "Step-by-step: create a support ticket",
        content: `## Overview

Use this when you need help from the P7 team (access, billing, bugs, or how-to questions).

## Before you start

- Know your **company code** and the screen or action where the issue happened.

## Steps

1. Open **Support → New ticket** (\`/app/support/tickets/new\`).
2. Fill in the **subject** and **description** so someone can reproduce or route the ticket.
3. Add any **attachments** or references your process allows.
4. Submit the form and note the ticket reference if one is shown.
5. Track progress under **My tickets** (\`/app/support/tickets\`). Open the ticket to read replies.

## Common mistakes

- One ticket mixing several unrelated issues (harder to close).
- Missing **company code**, URL, or exact error text so support cannot reproduce.

## What to do next

- Watch **My tickets** for replies; add detail in the ticket thread if asked.

## Tips

- One problem per ticket keeps resolution faster.`,
        tags: ["support", "ticket", "how-to"],
        lastUpdated: "2026-04-04",
        featured: true,
        infographics: [
          {
            type: "flow",
            title: "Ticket lifecycle",
            steps: [
              { label: "New ticket", href: "/app/support/tickets/new" },
              { label: "My tickets", href: "/app/support/tickets" },
            ],
          },
        ],
        relatedAppRoutes: ["/app/support/tickets/new", "/app/support/tickets"],
        relatedArticleIds: ["sup-tickets"],
      },
    ],
  },
  {
    id: "merchandising",
    title: "Merchandising",
    description: "Customers through orders, styles, BOM, pipeline, and alerts.",
    articles: [
      {
        id: "merch-pipeline",
        title: "Sales workflow: inquiry → quotation → order",
        content: `## Overview

The core merchandising path is:

**Customers → Inquiries → Quotations → Orders**

Each step has its own list and detail screens under \`/app/customers\`, \`/app/inquiries\`, \`/app/quotations\`, and \`/app/orders\`.

## Suggested flow

1. **Customers** — maintain buyer accounts you sell to.
2. **Inquiries** — capture demand, styles, and follow-up; convert when ready.
3. **Quotations** — formal pricing and terms; send or print as your process requires.
4. **Orders** — confirmed sales; drives downstream planning and execution.

## Related areas

- **Garment Styles** — \`/app/merchandising/styles\`
- **BOM Governance** — \`/app/bom\`
- **Consumption Plans** — \`/app/bom/orders\`
- **Order Pipeline** / **Pipeline Analytics** — \`/app/merchandising/pipeline\`, \`/app/merchandising/pipeline-analytics\`
- **Critical Alerts**, **Wastage**, **Consumption Recon** — merchandising operations views
- **Follow-up & Unified TNA**, **Parties**, **Document Flow** — coordination and documents

## Tips

- Use **Actions** on each list row for view/edit/print where enabled.`,
        tags: ["inquiry", "quotation", "order", "customer", "merchandising"],
        lastUpdated: "2026-04-04",
        featured: true,
        infographics: [
          {
            type: "flow",
            title: "Merchandising sales path",
            steps: [
              { label: "Customers", href: "/app/customers" },
              { label: "Inquiries", href: "/app/inquiries" },
              { label: "Quotations", href: "/app/quotations" },
              { label: "Orders", href: "/app/orders" },
            ],
          },
        ],
        relatedAppRoutes: [
          "/app/customers",
          "/app/inquiries",
          "/app/quotations",
          "/app/orders",
          "/app/merchandising/styles",
          "/app/bom",
          "/app/bom/orders",
          "/app/merchandising/pipeline",
          "/app/merchandising/pipeline-analytics",
        ],
        relatedArticleIds: [
          "gs-row-actions",
          "commercial-overview",
          "merch-create-inquiry",
          "merch-inquiry-detail",
          "merch-quotation-to-order",
        ],
      },
      {
        id: "merch-create-inquiry",
        title: "Step-by-step: create or edit an inquiry",
        content: `## Overview

**Inquiries** capture buyer interest before a formal quotation. Create them from **Inquiries** in the sidebar.

## Where to go

- New inquiry: \`/app/inquiries/new\`
- Edit existing: \`/app/inquiries/:id/edit\` (use **Actions → Edit** on the list, or open the detail first)

## Steps

1. Open **Merchandising → Inquiries** and click to start a **new** inquiry (or edit a **Draft**).
2. Choose the **customer** (buyer). Create or fix customers under **Customers** if needed.
3. Optionally link a **garment style** and fill **season**, **department**, **quantity**, **pricing**, **currency**, and **expected delivery**.
4. Add **line items** (name/description per line) so the team knows what was requested.
5. Optional: upload a **style image** or documents; optional **AI extract** panels may suggest fields — review before saving.
6. Save as **Draft** or move the workflow to **Submitted** when your process allows (only valid transitions are offered).

## After saving

- Open the inquiry **detail** (\`/app/inquiries/:id\`) to review status, linked style, and next actions such as conversion to quotation.

## Common mistakes

- Wrong **customer** selected (check buyer name and code before save).
- **AI-suggested** fields accepted without review (always verify against the source document).
- Submitting before required commercial or line fields are complete (save errors or blocked transitions).

## What to do next

- Open **Inquiry detail** to submit or convert; then use **Quotation** guides when creating pricing.

## Tips

- **Submitted** inquiries can progress toward **Converted** when you create a quotation from them (see the quotation guide).`,
        tags: ["inquiry", "create", "merchandising", "draft"],
        lastUpdated: "2026-04-04",
        featured: true,
        coverImage: "/images/tech-pattern.svg",
        images: [
          {
            src: "/images/tech-pattern.svg",
            alt: "Abstract pattern suggesting structured data entry",
            caption: "The inquiry form groups customer, style, commercial terms, and line items — complete each block before submit.",
          },
        ],
        relatedAppRoutes: ["/app/inquiries", "/app/inquiries/new"],
        relatedArticleIds: ["merch-pipeline", "merch-inquiry-detail", "merch-quotation-to-order"],
      },
      {
        id: "merch-inquiry-detail",
        title: "Step-by-step: inquiry detail and next actions",
        content: `## Overview

The **inquiry detail** page shows one record and what you can do next (status, style, lines, print, AI assist if enabled).

## Open a record

1. Go to **Inquiries** (\`/app/inquiries\`).
2. Use **Actions → View** on a row, or click the inquiry code/link.

## What to check

- **Status** (e.g. Draft, Submitted, Converted) and whether further edits are allowed.
- **Customer**, **style**, **commercial** fields (shipping terms, commission) and **line items**.
- Any **linked** records or workflow hints shown on the page header or side panels.

## Typical next steps

- **Edit** (if allowed) via **Actions** or the edit route.
- **Print** when your team needs a PDF/paper copy.
- When status is **Submitted** and policy allows, **convert to quotation** from the detail workflow (exact button label may vary by screen version).

## Common mistakes

- Expecting **convert** while status is still **Draft** (submit first if your process requires it).
- Editing after **Converted** when the screen no longer allows changes.

## What to do next

- After conversion, continue in **Quotations** (\`/app/quotations\`) or **Orders** per your SOP.

## Tips

- If **Convert to quotation** is missing, the inquiry may still be **Draft** or already **Converted** — check status on the list.`,
        tags: ["inquiry", "detail", "status", "convert"],
        lastUpdated: "2026-04-03",
        relatedAppRoutes: ["/app/inquiries"],
        relatedArticleIds: ["merch-create-inquiry", "merch-quotation-to-order", "merch-pipeline"],
      },
      {
        id: "merch-quotation-to-order",
        title: "Step-by-step: quotation to sales order",
        content: `## Overview

**Quotations** formalize price and terms. When accepted, you convert to a **sales order** for execution.

## Where to go

- Quotations list: \`/app/quotations\`
- New quotation: \`/app/quotations/new\`
- Existing: \`/app/quotations/:id\`
- Orders: \`/app/orders\`, new order \`/app/orders/new\`

## Quotation lifecycle (high level)

Statuses follow a chain such as **Draft → Submitted → Approved → Sent → Converted** (exact labels depend on your data). Only certain transitions are valid at each step.

## Steps — new quotation

1. Open **Quotations** and start **new** (or duplicate from an inquiry if your flow provides that).
2. Fill header fields (customer, dates, currency, terms as shown on the form).
3. Add **lines** with style/SKU, quantities, and prices.
4. Save and advance status per your approval rules (**Submit**, **Approve**, **Sent**, etc.) using buttons or **Actions** on the list.

## Convert to order

1. Open the quotation when it is in a status that allows **conversion** (commonly after **Sent** / approval — the app only offers valid next statuses).
2. Use the **convert to order** (or equivalent) action the UI shows.
3. Complete the **order** on \`/app/orders/new\` or the order detail screen, then confirm **order** status with your team.

## Common mistakes

- Trying to convert while quotation is still **Draft** or not yet **Sent** / approved per your rules.
- Skipping line **quantities** or **prices** then wondering why totals or approval fail.

## What to do next

- Open **Orders** (\`/app/orders\`) for confirmation, planning, and links to **BOM** / **pipeline** as your tenant uses them.

## Tips

- Use **Actions** on list rows for **View**, **Edit**, and **Print** where enabled.
- If conversion is blocked, check **quotation status** and role permissions.`,
        tags: ["quotation", "order", "convert", "sales"],
        lastUpdated: "2026-04-03",
        relatedAppRoutes: ["/app/quotations", "/app/quotations/new", "/app/orders", "/app/orders/new"],
        relatedArticleIds: ["merch-pipeline", "merch-inquiry-detail", "gs-row-actions"],
      },
    ],
  },
  {
    id: "export-import",
    title: "Export & Import",
    description: "Commercial, export cases, contracts, proforma invoices, BTB LCs, and trade or logistics when enabled.",
    articles: [
      {
        id: "commercial-overview",
        title: "Export & Import (commercial)",
        content: `## Overview

Under **Export & Import** you manage export selling room workflows: commercial records, cases, contracts, proforma invoices, and BTB LCs.

## Main routes

- **Commercial** — \`/app/commercial\`
- **Export Cases** — \`/app/commercial/export-cases\`
- **Master Contracts** — \`/app/commercial/master-contracts\`
- **Proforma Invoices** — \`/app/commercial/proforma-invoices\`
- **BTB LCs** — \`/app/commercial/btb-lcs\`

## Trade and logistics (when enabled)

If **trade** is enabled for your tenant:

- **Trade Cases** — \`/app/trade/cases\`
- **Trade Control Tower** — \`/app/trade/dashboard\`
- **Logistics** — \`/app/logistics\`

## Tips

- If these links are missing, trade may be disabled for your tenant.`,
        tags: ["commercial", "LC", "proforma", "export", "trade"],
        lastUpdated: "2026-04-04",
        coverImage: "/images/hero-factory.svg",
        infographics: [
          {
            type: "diagram",
            title: "Export & import at a glance",
            caption: "Commercial documents and LCs link forward to trade and logistics when your tenant enables them.",
            imageSrc: "/images/hero-factory.svg",
            imageAlt: "Illustration representing export and factory operations",
          },
        ],
        relatedAppRoutes: [
          "/app/commercial",
          "/app/commercial/export-cases",
          "/app/commercial/master-contracts",
          "/app/commercial/proforma-invoices",
          "/app/commercial/btb-lcs",
          "/app/trade/cases",
          "/app/trade/dashboard",
          "/app/logistics",
        ],
        relatedArticleIds: ["merch-pipeline"],
      },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    description: "Stock master, procurement, control, reports, outbound, traceability.",
    articles: [
      {
        id: "inv-overview",
        title: "Inventory module map",
        content: `## Overview

**Inventory** is grouped in the sidebar into master/setup, procurement, stock control, reports, outbound, and traceability.

## Master and setup

- **Stock Master** — \`/app/inventory\` (items, warehouses, and related masters as tabs allow)
- **Stock Groups** — \`/app/inventory/stock-groups\`
- **Vendors** — \`/app/inventory/vendors\`

## Procurement

- **Purchase Orders** — \`/app/inventory/purchase-orders\`
- **Goods Receiving** — \`/app/inventory/goods-receiving\`
- **Process Orders** — \`/app/inventory/process-orders\`

## Stock control

- **Transfers** — \`/app/inventory/warehouse-transfers\`
- **Adjustments** — \`/app/inventory/stock-adjustments\`
- **Consumption Control** — \`/app/inventory/consumption-control\`
- **Reconciliation** — \`/app/inventory/reconciliation\`

## Reports and analytics

Stock summary, FIFO summary, dashboard, ledger, valuation — all under \`/app/inventory/...\` as listed in the sidebar.

## Outbound

- **Delivery Challans** — \`/app/inventory/delivery-challans\`
- **Gate Passes** — \`/app/inventory/enhanced-gate-passes\`

## Traceability

- **Lot Traceability** — \`/app/inventory/lots\`

## Tips

- Manufacturing orders for production are under **Manufacturing** (\`/app/production/manufacturing-orders\`), not inside Inventory.`,
        tags: ["inventory", "PO", "GRN", "stock", "warehouse"],
        lastUpdated: "2026-04-04",
        infographics: [
          {
            type: "flow",
            title: "Procurement into stock",
            steps: [
              { label: "Purchase order", href: "/app/inventory/purchase-orders" },
              { label: "Goods receiving", href: "/app/inventory/goods-receiving" },
              { label: "Stock master / reports", href: "/app/inventory" },
            ],
          },
        ],
        relatedAppRoutes: ["/app/inventory", "/app/inventory/purchase-orders", "/app/inventory/goods-receiving"],
        relatedArticleIds: ["mfg-overview", "inv-po-deep", "inv-grn-deep", "inv-transfer-adjust"],
      },
      {
        id: "inv-po-deep",
        title: "Step-by-step: create a purchase order",
        content: `## Overview

**Purchase Orders** commit you to buy stock from a supplier. They live under **Inventory → Procurement → Purchase Orders** (\`/app/inventory/purchase-orders\`).

## Before you start

- **Stock master** items and **warehouses** should exist (\`/app/inventory\`).
- **Vendors** should be set up (\`/app/inventory/vendors\`) if you link a formal vendor record.

## Steps

1. Open **Purchase Orders**.
2. In the form, set **supplier** details: link a **vendor** from the master where possible (fields marked ** are mandatory per the page).
3. Set **currency** and **exchange rate** if buying in foreign currency.
4. Add lines: pick **item**, **warehouse** (if required), **quantity**, and **unit price**.
5. Click **Add Line** for each additional SKU.
6. Click **Create Purchase Order** to save (usually starts as **DRAFT** until your approval flow advances it).

## After creation

- Use **Actions** on the list row to open, edit, or progress status as your role allows.
- When goods arrive, record them under **Goods Receiving** (see the GRN guide).

## Common mistakes

- **Create Purchase Order** with **no lines** (the page requires at least one item line).
- Wrong **warehouse** or **unit price** copied from an old PO (always verify for the current shipment).

## What to do next

- Use **Goods Receiving** when material arrives; follow up in **Purchase & AP** if finance ties POs to bills.

## Tips

- The page description notes that POs link vendors from the supplier master and receive into stock via **Goods Receiving**.`,
        tags: ["purchase order", "PO", "procurement", "vendor"],
        lastUpdated: "2026-04-04",
        featured: true,
        coverImage: "/images/hero-bg.svg",
        images: [
          {
            src: "/images/hero-bg.svg",
            alt: "Calm background suggesting a focused procurement workspace",
            caption: "Use vendor master, line items, and **Create Purchase Order** — then receive via Goods Receiving.",
          },
        ],
        relatedAppRoutes: ["/app/inventory/purchase-orders", "/app/inventory/vendors", "/app/inventory"],
        relatedArticleIds: ["inv-overview", "inv-grn-deep", "gs-row-actions"],
      },
      {
        id: "inv-grn-deep",
        title: "Step-by-step: goods receiving (GRN)",
        content: `## Overview

**Goods Receiving** records stock coming in against purchase orders (and related AP messaging when shown).

## Where to go

\`/app/inventory/goods-receiving\`

## Steps

1. Open **Goods Receiving**.
2. Choose the **purchase order** you are receiving against (list loads open POs for selection).
3. Enter **quantities** and lines to match what physically arrived (adjust per line as the form allows).
4. Set **status** (e.g. **DRAFT** while checking, then finalize when your process says to post).
5. Save. Resolve any **error** or **AP** messages shown at the top of the page.

## After posting

- Confirm stock on **Stock Master** or **Stock Summary** reports if needed.
- Use **Actions** on the GRN list for follow-up tasks your tenant enables.

## Common mistakes

- Receiving **more than the PO** allows without adjustment or approval (watch validation and messages).
- Leaving GRN in **DRAFT** so stock never updates (finalize when counts are confirmed).

## What to do next

- Check **Stock Master** or **Stock Summary**; finance users may continue in **Outstanding bills** / **Purchase & AP**.

## Tips

- Filter by **status** using the page controls if the list is long.`,
        tags: ["GRN", "receiving", "stock", "PO"],
        lastUpdated: "2026-04-03",
        relatedAppRoutes: ["/app/inventory/goods-receiving", "/app/inventory/purchase-orders"],
        relatedArticleIds: ["inv-po-deep", "inv-overview"],
      },
      {
        id: "inv-transfer-adjust",
        title: "Step-by-step: transfers and stock adjustments",
        content: `## Overview

Use **Transfers** to move stock between warehouses and **Adjustments** to correct quantities (damage, count differences, etc.).

## Transfers

1. Open **Transfers** — \`/app/inventory/warehouse-transfers\`.
2. Create a transfer with **from** and **to** warehouses (exact fields follow the form).
3. Add **lines** with item and quantity.
4. Submit/save per your workflow; use **Actions** on the list for status changes.

## Adjustments

1. Open **Adjustments** — \`/app/inventory/stock-adjustments\` (or **new** route if your app uses it).
2. Choose **reason** and **warehouse** as prompted.
3. Enter **positive or negative** quantities per item as the UI allows.
4. Save and complete any approval step your tenant requires.

## Common mistakes

- **From** and **to** warehouse reversed on a transfer.
- Adjustment **sign** wrong (positive vs negative) so stock moves the opposite direction.

## What to do next

- Reconcile using **Inventory reconciliation** or reports if counts still do not match physical stock.

## Tips

- For consumption vs production issues, your team may also use **Consumption Control** or manufacturing screens — see the inventory map article.`,
        tags: ["transfer", "adjustment", "warehouse", "stock"],
        lastUpdated: "2026-04-03",
        relatedAppRoutes: ["/app/inventory/warehouse-transfers", "/app/inventory/stock-adjustments"],
        relatedArticleIds: ["inv-overview", "gs-row-actions"],
      },
    ],
  },
  {
    id: "manufacturing",
    title: "Manufacturing",
    description: "Production overview, planning, IE, shop floor, optional units, TNA.",
    articles: [
      {
        id: "mfg-overview",
        title: "Manufacturing overview",
        content: `## Overview

**Manufacturing** covers planning, IE (methods), shop-floor execution, optional units (knitting, dyeing, etc.), costing, samples, and TNA.

## Entry points

- **Production Overview** — \`/app/production\`
- **Manufacturing Orders** — \`/app/production/manufacturing-orders\`
- **Production setup** — \`/app/production/setup\`
- **Factory calendar** — \`/app/production/calendar\`
- **Line plan board** — \`/app/production/line-plan\`
- **Planning** — \`/app/production/planning\` (pipeline, MRP-style planning, history)

## Shop floor

Cutting, sewing, finishing, hourly boards, crew sheets, roster, QC — routes under \`/app/production/...\` as shown in the sidebar.

## Optional units

Knitting, dyeing, printing, AOP, embroidery, elastic, washing (and hourly variants) appear when your tenant enables those **optional production units** in settings.

## Samples & TNA

- **Samples** — \`/app/samples/requests\`
- **TNA Dashboard / Templates / Plans** — \`/app/tna/dashboard\`, \`/app/tna/templates\`, \`/app/tna/plans\`

## Cost

- **Cost & CM** — \`/app/production/costs\``,
        tags: ["production", "planning", "shop floor", "TNA"],
        lastUpdated: "2026-04-04",
        infographics: [
          {
            type: "flow",
            title: "Plan then execute",
            steps: [
              { label: "Planning", href: "/app/production/planning" },
              { label: "Manufacturing orders", href: "/app/production/manufacturing-orders" },
              { label: "Shop floor / hourly", href: "/app/production/cutting" },
            ],
          },
        ],
        relatedAppRoutes: ["/app/production", "/app/production/planning", "/app/production/manufacturing-orders"],
        relatedArticleIds: ["inv-overview", "mfg-planning-deep", "mfg-mo-deep", "mfg-hourly-deep"],
      },
      {
        id: "mfg-planning-deep",
        title: "Step-by-step: production planning",
        content: `## Overview

**Planning** (\`/app/production/planning\`) supports pipeline visibility, what-if / MRP-style planning, and **plan history** (tabs on the page).

## Steps

1. Open **Manufacturing → Planning**.
2. Review the **Pipeline** tab for current manufacturing orders and bottlenecks (widgets depend on your data).
3. Use **What-if / MRP** (or similarly named tab) to run scenarios when your tenant has AI or planning features enabled.
4. Open **Plan history** to compare past runs and decisions.
5. Optional: check **tenant AI settings** for production planning if your admin configured Gemini or overrides.

## Common mistakes

- Expecting **MRP / AI** tabs to show data when no manufacturing orders or settings exist yet.
- Confusing this screen with **Line plan board** or **Manufacturing orders** — each has a different purpose.

## What to do next

- Open **Manufacturing orders** or **Shop floor** screens to execute what you planned.

## Tips

- Legacy URL \`/app/production/advanced-planning\` redirects here — bookmark **Planning** instead.`,
        tags: ["planning", "MRP", "pipeline", "manufacturing"],
        lastUpdated: "2026-04-04",
        featured: true,
        coverImage: "/images/hero-factory.svg",
        relatedAppRoutes: ["/app/production/planning", "/app/production"],
        relatedArticleIds: ["mfg-overview", "mfg-mo-deep"],
      },
      {
        id: "mfg-mo-deep",
        title: "Step-by-step: manufacturing orders",
        content: `## Overview

**Manufacturing Orders** (\`/app/production/manufacturing-orders\`) drive what the factory should produce.

## Steps

1. Open **Manufacturing Orders** from the sidebar.
2. Use filters or search to find an order by style, MO number, or date (controls on the page).
3. Open a row with **Actions → View** (or equivalent) to see operations, quantities, and status.
4. Update status or quantities only through buttons your role allows — follow shop-floor discipline.

## Links

- **Production Overview** (\`/app/production\`) for a higher-level snapshot.
- **Shop floor** pages (cutting, sewing, finishing) for execution.

## Common mistakes

- Changing quantities without checking **shop-floor discipline** or role (some fields are restricted).
- Searching with the wrong **date** or filter so the MO looks “missing”.

## What to do next

- Record output on **Hourly** boards or department shop-floor pages linked from the sidebar.

## Tips

- Optional units (knitting, dyeing, etc.) appear only when enabled for your tenant.`,
        tags: ["manufacturing order", "MO", "production"],
        lastUpdated: "2026-04-04",
        featured: true,
        coverImage: "/images/hero-factory.svg",
        infographics: [
          {
            type: "highlight",
            title: "MO → shop floor",
            body: "Open the MO list for **what** to make; record output on **shop floor** and **hourly** screens.",
          },
        ],
        relatedAppRoutes: ["/app/production/manufacturing-orders", "/app/production"],
        relatedArticleIds: ["mfg-overview", "mfg-hourly-deep", "mfg-planning-deep"],
      },
      {
        id: "mfg-hourly-deep",
        title: "Step-by-step: hourly production (shop floor)",
        content: `## Overview

**Hourly** screens capture output by department for a shift-style view. Routes look like \`/app/production/hourly/cutting\`, \`/app/production/hourly/sewing\`, \`/app/production/hourly/finishing\`, and optional units (knitting, dyeing, etc.) when enabled.

## Steps

1. Open the **Hourly — [Department]** link from **Manufacturing → Shop floor** (sidebar).
2. Pick **date** and **line** (or filters the page shows).
3. Enter **quantities** or **pieces** per hour bucket as your process defines.
4. Save. Repeat for each department that reports hourly.

## Related

- **Daily crew sheet** and **Weekly crew roster** for people planning.
- **Shop-floor QC** for quality holds.

## Common mistakes

- Wrong **date** or **line** selected (hourly buckets tie to shift reporting).
- Entering totals in the wrong **hour column** (double-check the grid before save).

## What to do next

- Supervisors can compare **Production overview** or **Hourly** reports for the same date.

## Tips

- If a department link is missing, your tenant may not have that **optional production unit** enabled.`,
        tags: ["hourly", "shop floor", "cutting", "sewing"],
        lastUpdated: "2026-04-04",
        featured: true,
        infographics: [
          {
            type: "flow",
            title: "Hourly reporting",
            steps: [
              { label: "Cutting hourly", href: "/app/production/hourly/cutting" },
              { label: "Sewing hourly", href: "/app/production/hourly/sewing" },
              { label: "Finishing hourly", href: "/app/production/hourly/finishing" },
            ],
          },
        ],
        relatedAppRoutes: ["/app/production/hourly/cutting", "/app/production/hourly/sewing", "/app/production/hourly/finishing"],
        relatedArticleIds: ["mfg-overview", "mfg-mo-deep"],
      },
    ],
  },
  {
    id: "quality",
    title: "Quality",
    description: "QC dashboard, inspections, lab tests, CAPA, returns, and legacy QC.",
    articles: [
      {
        id: "quality-overview",
        title: "Quality module",
        content: `## Overview

**Quality** includes dashboard, inspections, lab tests, CAPA, returns, and a legacy QC entry point.

## Routes

- **QC Dashboard** — \`/app/quality/dashboard\`
- **Inspections** — \`/app/quality/inspections\`
- **Lab Tests** — \`/app/quality/lab-tests\`
- **CAPA** — \`/app/quality/capa\`
- **Returns** — \`/app/quality/returns\`
- **Quality (Legacy)** — \`/app/quality/qc\``,
        tags: ["quality", "QC", "inspection"],
        lastUpdated: "2026-04-04",
        coverImage: "/images/tech-pattern.svg",
        infographics: [
          {
            type: "highlight",
            title: "Quality in one line",
            body: "Record inspections and issues, then drive corrective actions (CAPA) and returns as your process requires.",
          },
        ],
        relatedAppRoutes: [
          "/app/quality/dashboard",
          "/app/quality/inspections",
          "/app/quality/lab-tests",
          "/app/quality/capa",
          "/app/quality/returns",
          "/app/quality/qc",
        ],
        relatedArticleIds: [],
      },
    ],
  },
  {
    id: "ai-tools",
    title: "AI Tools",
    description: "Assistant, automation, predictions, and weekly AI reports.",
    articles: [
      {
        id: "ai-tools-overview",
        title: "AI Tools",
        content: `## Overview

**AI Tools** groups assistant, automation, predictions, and weekly reports.

## Routes

- **AI Assistant** — \`/app/ai/assistant\`
- **AI Automation** — \`/app/ai/automation\`
- **AI Predictions** — \`/app/ai/predictions\`
- **Weekly AI reports** — \`/app/ai/weekly-reports\`

## Tips

- Availability and behavior depend on tenant configuration and backend features.`,
        tags: ["AI", "assistant", "automation"],
        lastUpdated: "2026-04-04",
        coverImage: "/images/ai-brain.svg",
        infographics: [
          {
            type: "diagram",
            title: "AI tools surface",
            caption: "Assistant and automation are primary entry points; predictions and weekly reports extend insights.",
            imageSrc: "/images/ai-brain.svg",
            imageAlt: "Stylized AI brain icon representing AI tools",
          },
        ],
        relatedAppRoutes: [
          "/app/ai/assistant",
          "/app/ai/automation",
          "/app/ai/predictions",
          "/app/ai/weekly-reports",
        ],
        relatedArticleIds: [],
      },
    ],
  },
  {
    id: "hr",
    title: "HR",
    description: "Core HR, attendance, leave, payroll, talent, self-service, and analytics.",
    articles: [
      {
        id: "hr-overview",
        title: "HR module map",
        content: `## Overview

**HR** is organized into dashboard, core HR, time & attendance, leave, payroll, talent, self-service (ESS), and analytics.

## Examples

- **HR Dashboard** — \`/app/hr\`
- **Employees** — \`/app/hr/employees\`
- **Attendance** — routes under \`/app/hr/attendance/...\`
- **Leave** — \`/app/hr/leave/...\`
- **Payroll** — \`/app/hr/payroll/...\`
- **ESS** — \`/app/hr/ess/...\`

Use the sidebar subsection labels to find the exact screen.`,
        tags: ["HR", "payroll", "attendance", "leave"],
        lastUpdated: "2026-04-04",
        coverImage: "/images/hero-bg.svg",
        infographics: [
          {
            type: "highlight",
            title: "HR areas",
            body: "Core HR and attendance feed leave and payroll; ESS gives employees self-service access.",
          },
        ],
        relatedAppRoutes: ["/app/hr", "/app/hr/employees"],
        relatedArticleIds: [],
      },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    description: "Accounts setup, vouchers, banking, and reports.",
    articles: [
      {
        id: "fin-overview",
        title: "Finance module map",
        content: `## Overview

**Finance** covers accounting setup, transactions, banking, and reports (plus planning screens linked from the sidebar).

## Setup

Chart of accounts, groups, cost centers, currency, periods, advance options — under \`/app/accounts/...\`.

## Transactions

- **Vouchers** — \`/app/accounts/vouchers\`
- **Voucher Print** — \`/app/accounts/vouchers/print\`
- **Voucher Approvals** — \`/app/accounts/vouchers/approval-queue\`
- **Bills** and **Purchase & AP** — \`/app/accounts/outstanding-bills\`, \`/app/accounts/purchase-workflow\`

## Banking

Bank accounts, reconciliation, payment runs, advice, settlement audit — \`/app/banking/...\` and **FX Receipts** under \`/app/finance/fx-receipts\`.

## Reports and planning

Financial statements, trial balance, day book, analytics, budgets, cash forecast, and related planning pages — see sidebar entries under **Reports** and **Planning**.`,
        tags: ["finance", "vouchers", "accounts", "banking"],
        lastUpdated: "2026-04-04",
        infographics: [
          {
            type: "flow",
            title: "Finance voucher lifecycle",
            steps: [
              { label: "Voucher entry", href: "/app/accounts/vouchers" },
              { label: "Approval queue", href: "/app/accounts/vouchers/approval-queue" },
              { label: "Post & reports", href: "/app/accounts/reports/day-book" },
            ],
          },
        ],
        relatedAppRoutes: ["/app/accounts", "/app/accounts/vouchers", "/app/banking/accounts"],
        relatedArticleIds: [
          "wf-approvals",
          "fin-voucher-entry",
          "fin-voucher-approval-queue",
          "fin-bills-ap",
        ],
      },
      {
        id: "fin-voucher-entry",
        title: "Step-by-step: voucher entry (journal lines)",
        content: `## Overview

**Vouchers** (\`/app/accounts/vouchers\`) are accounting entries with multiple **debit** and **credit** lines. The page supports **multi-currency**, **cost centers**, **bill-wise** accounts, and workflow through to **posting**.

## Open the editor

1. Go to **Finance → Transactions → Vouchers**.
2. Click **+ New Voucher** (top right). To edit an existing voucher, use **Actions → Edit** on a row (if allowed).

## Header — voucher information

1. Choose **Voucher Type** (e.g. **JOURNAL** or types loaded for your tenant).
2. Set **Voucher Date**. Watch the **accounting period** banner: a **locked** period blocks posting until the date or period is fixed.
3. Optional: **Reference** (e.g. invoice number).
4. **Narration** is **required** — the form validates it for audit.
5. Optional: link **Trade case** or **BTB LC** when your finance process ties vouchers to those records.

## Multi-currency (optional)

1. In **Multi-Currency Entry**, check **Enable Multi-Currency**.
2. Pick **Transaction currency** and **Base currency**.
3. Enter **Exchange rate** manually or click **Live Rate** (fetches from open.er-api.com when available).
4. Line amounts are interpreted in the transaction currency when multi-currency is on.

## Lines

1. For each row, pick a **Chart of Accounts** account (search control).
2. Set **Debit** or **Credit** and the **amount** (must be greater than zero).
3. Optional: **cost center**, **notes / narration** per line, bill-wise fields when the account requires them.
4. Use **Add line**, **copy line**, or **remove line** as needed.
5. Totals must **balance** (debits = credits). Use **Auto balance** if the page offers it to insert a balancing line.

## Save

- **Save Draft** — creates or updates without forcing submit workflow.
- **Save & Submit** — saves and moves status to **SUBMITTED** in one step.
- After save, the form closes and the voucher appears in the list.

## List workflow (after draft)

From **Actions** on a row you may see **Submit**, **Check**, **Recommend**, **Approve**, **Post**, **Reject**, **Reverse**, etc., depending on status and role. Some actions ask for a **reason** in a modal.

## Common mistakes

- **Unbalanced** debits and credits (totals must match before save).
- Empty **Narration** (required) or **zero** line amounts (each line must be greater than zero).
- **Locked accounting period** for the voucher date (change date or ask finance to open the period).

## What to do next

- After **Save & Submit**, reviewers work from **Voucher Approvals** or **Actions** on the list until **Post**.

## Tips

- Use **Approval queue** in the page header to jump to \`/app/accounts/vouchers/approval-queue\`.
- **Analytics** link goes to voucher analytics report.`,
        tags: ["voucher", "journal", "debit", "credit", "posting"],
        lastUpdated: "2026-04-04",
        featured: true,
        coverImage: "/images/logo.svg",
        infographics: [
          {
            type: "highlight",
            title: "Before you save",
            body: "Check narration, balanced debits/credits, accounting period banner, then **Save Draft** or **Save & Submit**.",
          },
        ],
        images: [
          {
            src: "/images/logo.svg",
            alt: "Prime7 brand mark as a visual anchor for the finance workspace",
            caption: "Voucher entry is form-heavy: complete header, lines, and totals before workflow actions.",
          },
        ],
        relatedAppRoutes: ["/app/accounts/vouchers", "/app/accounts/vouchers/approval-queue"],
        relatedArticleIds: ["fin-overview", "fin-voucher-approval-queue", "gs-row-actions"],
      },
      {
        id: "fin-voucher-approval-queue",
        title: "Step-by-step: voucher approval queue",
        content: `## Overview

The **Voucher Approvals** page (\`/app/accounts/vouchers/approval-queue\`) lists vouchers in approval-related statuses (e.g. **SUBMITTED**, **CHECKED**, **RECOMMENDED**, **APPROVED**) so reviewers can act in one place.

## Steps

1. Open **Finance → Transactions → Voucher Approvals** (or click **Approval queue** from the Vouchers page).
2. Adjust **date range** and **status** filters to narrow the list.
3. Use **search** to find by reference, narration, or amount (debounced search).
4. Open **Actions** on a voucher and choose the next workflow step (**Check**, **Recommend**, **Approve**, **Reject**, **Post**, etc.).
5. If the app prompts for a **reason** (reject, cancel, reverse, cancel posting), enter a short explanation — it helps reviewers and audit.

## After approval

- **Post** moves amounts into the ledger when controls pass; watch for **control warnings** after posting.
- Return to **Vouchers** for full edit history on draft lines.

## Common mistakes

- **Date range** too narrow (vouchers “disappear” from the queue).
- **Reject** or **Reverse** without a clear **reason** when the modal asks for one.

## What to do next

- After **Post**, use **Day book** / **Ledger** reports under **Finance → Reports** to verify entries.

## Tips

- You can export or print from the queue if those toolbar actions are visible for your role.`,
        tags: ["voucher", "approval", "finance", "workflow"],
        lastUpdated: "2026-04-04",
        featured: true,
        coverImage: "/images/tech-pattern.svg",
        relatedAppRoutes: ["/app/accounts/vouchers/approval-queue", "/app/accounts/vouchers"],
        relatedArticleIds: ["fin-voucher-entry", "wf-approvals", "fin-overview"],
      },
      {
        id: "fin-bills-ap",
        title: "Step-by-step: outstanding bills and purchase & AP",
        content: `## Overview

**Bills** and **Purchase & AP** help accounts payable teams track what you owe suppliers and tie purchases to payment.

## Where to go

- **Bills** — \`/app/accounts/outstanding-bills\`
- **Purchase & AP** — \`/app/accounts/purchase-workflow\`

## Typical flow

1. Open **Outstanding bills** to see supplier invoices waiting for booking or payment.
2. Use filters and row **Actions** to open a bill, allocate to accounts, or mark progress as the UI allows.
3. Open **Purchase & AP** for the wider purchase-to-pay checklist (GRN linkage, approvals, payment batching — exact steps follow on-page labels).

## Common mistakes

- Booking a bill before **GRN** or PO linkage is correct (amounts will not match operations).
- Ignoring **Actions** on a row (many AP steps are behind the combined **Actions** menu).

## What to do next

- When ready to pay, continue to **Banking → Payment runs** or **Payment advice** per your process.

## Tips

- Inventory **Goods Receiving** often feeds quantities; finance screens finalize liability and payment.`,
        tags: ["AP", "bills", "payable", "supplier"],
        lastUpdated: "2026-04-03",
        relatedAppRoutes: ["/app/accounts/outstanding-bills", "/app/accounts/purchase-workflow"],
        relatedArticleIds: ["fin-overview", "inv-grn-deep"],
      },
    ],
  },
  {
    id: "workflow",
    title: "Workflow",
    description: "Cross-module approvals and review queues.",
    articles: [
      {
        id: "wf-approvals",
        title: "All Approvals",
        content: `## Overview

**Workflow → All Approvals** (\`/app/approvals\`) is the central place to see items waiting for approval across modules (exact types depend on your tenant and role).

## Tips

- Finance voucher approvals also have a dedicated queue at \`/app/accounts/vouchers/approval-queue\`.`,
        tags: ["approvals", "workflow"],
        lastUpdated: "2026-04-04",
        infographics: [
          {
            type: "flow",
            title: "Where approvals happen",
            steps: [
              { label: "All Approvals", href: "/app/approvals" },
              { label: "Voucher queue", href: "/app/accounts/vouchers/approval-queue" },
            ],
          },
        ],
        relatedAppRoutes: ["/app/approvals", "/app/accounts/vouchers/approval-queue"],
        relatedArticleIds: ["fin-overview", "fin-voucher-approval-queue"],
      },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    description: "Operational and analytics reports hub.",
    articles: [
      {
        id: "reports-overview",
        title: "Reports hub",
        content: `## Overview

**Reports** (\`/app/reports\`) links to analytics and operational reports: merchandising, orders, inventory, finance, production, HR, shipments, exceptions, and more.

## Tips

- **Trade overview** appears only when trade is enabled for your tenant.`,
        tags: ["reports", "analytics"],
        lastUpdated: "2026-04-04",
        infographics: [
          {
            type: "highlight",
            title: "Using reports",
            body: "Start from the hub, pick a domain (merch, inventory, finance), then drill into the report your role needs.",
          },
        ],
        relatedAppRoutes: ["/app/reports", "/app/reports/merchandising"],
        relatedArticleIds: [],
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    description: "Configuration, users, roles, tenant, and system tools.",
    articles: [
      {
        id: "settings-overview",
        title: "Settings and administration",
        content: `## Overview

**Settings** covers configuration, users, roles, tenant profile, pricing, activity logs, currency, backup, cheque templates, and **external access** (customer / financier portals). The same **External access** link appears under **Settings** in the left sidebar; the **Portals** menu in the **top bar** jumps to stakeholder login pages.

## Common routes

- **Settings** — \`/app/settings\`
- **Configuration** — \`/app/settings/config\`
- **User Mgmt** — \`/app/settings/users\`
- **Roles** — \`/app/settings/roles\`
- **Tenant** — \`/app/settings/tenant\`
- **External access** — \`/app/settings/external-access\` (feature flags, invites, audit). Customer and financier users sign in at \`/portal/customer/login\` and \`/portal/financier/login\` (separate from staff login). Staff can open those URLs from **Portals** in the app header.

## Tips

- Changes here can affect **who sees which sidebar items** and **feature flags** for the whole tenant.`,
        tags: ["settings", "users", "roles", "admin"],
        lastUpdated: "2026-04-04",
        infographics: [
          {
            type: "highlight",
            title: "Sensitive changes",
            body: "User, role, and tenant settings affect security and visibility — coordinate with your administrator.",
          },
        ],
        relatedAppRoutes: [
          "/app/settings",
          "/app/settings/config",
          "/app/settings/users",
          "/app/settings/roles",
          "/app/settings/tenant",
          "/app/settings/external-access",
          "/app/settings/external-access/customers",
          "/app/settings/external-access/financiers",
          "/app/settings/external-access/audit",
        ],
        relatedArticleIds: ["gs-tenant-modes"],
      },
    ],
  },
];

export const tutorialSections: TutorialSection[] = enrichTutorialSections(tutorialSectionsRaw);

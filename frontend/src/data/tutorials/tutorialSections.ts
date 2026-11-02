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
- Ask your administrator to confirm your user is active and assigned a role.

## Forgot your password?

- On the login screen, use **Forgot password?** to open \`/forgot-password\`.
- Enter your **company code** and **email**. If the account exists, you will receive an email with a link to \`/reset-password\` to choose a new password.`,
        tags: ["login", "company code", "password", "tenant"],
        lastUpdated: "2026-04-05",
        relatedAppRoutes: ["/login", "/forgot-password", "/reset-password", "/app"],
        relatedArticleIds: ["gs-dashboard", "gs-sidebar", "gs-at-a-glance"],
      },
      {
        id: "gs-dashboard",
        title: "Dashboard",
        content: `## Overview

The **Dashboard** is the home route after login (\`/app\`). It shows what needs your attention first, then trusted summary numbers and shortcuts into daily work.

## What to do here

- Check **Needs attention** for approvals, overdue TNA, critical alerts, and order risks. When everything is clear, you see a green **All systems clear** banner.
- Review **Key metrics** cards (active orders, quoted this month, pending approvals, inventory items, customers). Each card has a teal **View details** link in the footer.
- Role-specific blocks (merch health, promise risks, control tower) appear above the pipeline based on your role.
- Use the **Order Pipeline** donut chart and the **AI daily brief** (headings and bullet lists are formatted for readability).
- Use the **Quick actions** grid to start inquiries, quotations, or other work your role allows.
- Expand **ERP AI phases (advanced)** only when you need the deeper AI tooling section.

## Tips

- **Quoted this month** comes from quotations, not posted finance (GL) revenue.
- Exact widgets depend on your tenant setup, role, and permissions.`,
        tags: ["dashboard", "home", "overview", "attention", "kpi"],
        lastUpdated: "2026-07-18",
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
- **Merchandising** is grouped into subsections: **Sales**, **Planning**, **Analytics**, and **Operations**.
- Other sections (for example **Inventory**, **Manufacturing**, **HR**, **Finance**) also show **subsection labels** such as “Procurement” or “Transactions” to group related pages.
- Older “legacy” labels on Manufacturing TNA / samples / IE and Quality classic QC have been cleaned up to plain names (for example **TNA Dashboard**, **Sample Requests**, **QC (Classic)**).
- The **active page** shows a short orange **pill** on the left of the link (not a full-height border).
- When the sidebar is **collapsed** to icons, hover a section to open a **flyout menu** of its links. Custom dark tooltips show the page name.
- **Favorites** and **Recents** appear at the top when you have starred pages (from search) or visited routes recently. In collapsed mode they remain as icon shortcuts with tooltips.
- A **breadcrumb** strip under the top bar always shows Home → module → page for the current route.
- At the bottom, **Help & Tutorials** opens this guide (\`/app/tutorials\`).

## Top bar

- **Search** opens the command palette (**Ctrl+K** or **Cmd+K**). Type a page name to jump to it, or type two or more letters of a customer, order code, PO code, voucher number, item, vendor or employee to open that record directly. The top of the list also offers **Create** shortcuts (new customer, order, quotation…).
- **New** is a role-aware create menu (inquiry, quotation, order, voucher, and more).
- **AI** (sparkle icon) opens the Prime7 AI assistant panel.
- **Bell** opens a panel with two parts: **Needs attention** (pending approvals, critical alerts, overdue TNA, late orders, post-dated vouchers due — each links to its queue) and **For you** (personal notifications, e.g. when your voucher is approved or rejected, or your payroll run is sent back). Click a notification to open the record; use **Mark all read** to clear the badge.
- **Keyboard** icon (or press **?**) shows all keyboard shortcuts.
- **Breadcrumbs** under the top bar show where you are, including the record you have open (e.g. an order code or voucher number).
- **Get started** card on the dashboard (admins and managers) lists setup steps — team, first buyer, supplier, items, order, voucher, employees — and ticks each off automatically. Hide it with **×** once you no longer need it.
- **Portals** links to customer and financier portal sign-in and external access settings.

## Tips

- Menu items may be **hidden** if your **tenant type** is manufacturer vs buying house, or if a **feature flag** (such as trade) is off for your tenant.`,
        tags: ["navigation", "sidebar", "menu", "search", "command palette"],
        lastUpdated: "2026-11-01",
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

- Available actions depend on **permissions** and record state.
- Deleting asks for confirmation in a dialog; results appear as a short message in the top-right corner.`,
        tags: ["actions", "table", "edit", "delete"],
        lastUpdated: "2026-10-31",
        relatedAppRoutes: ["/app/customers", "/app/inquiries", "/app/quotations", "/app/orders"],
        relatedArticleIds: ["merch-pipeline", "gs-list-tools"],
      },
      {
        id: "gs-list-tools",
        title: "List tools: columns, saved views, export and bulk actions",
        summary: "Hide columns, switch row density, save filter setups as named views, export to Excel/CSV and act on many rows at once.",
        content: `## Overview

**Customers**, **Orders** and **Purchase orders** share one list toolbar above the table (more lists will follow).

## Toolbar

1. **Views** — save the current filters, sort, visible columns and density under a name. Tick **Share with everyone in my company** to let colleagues use it. Pick a view from the list to apply it again; only the person who saved a view can update or delete it.
2. **Columns** — show or hide columns. Your choice is remembered on this browser.
3. **Compact / Comfortable** — switch row height to fit more rows on screen.
4. **Export** — download the rows you see as **Excel (.xlsx)** or **CSV**. If you ticked some rows, only those are exported.

## Sorting

Click a column header to sort the rows on the current page; click again to reverse, a third time to clear.

## Bulk actions

Tick the boxes at the left of each row (or the header box for the whole page). A bar appears with actions for the selection:

- **Customers:** Mark active / Mark inactive.
- **Purchase orders:** Approve / Close / Cancel. Orders whose status does not allow the change are skipped and reported.

Selections clear when you change page or filters, so a bulk action never touches rows you cannot see.`,
        tags: ["table", "list", "export", "excel", "csv", "saved views", "bulk", "columns"],
        keywords: ["filter", "density", "select", "share view"],
        lastUpdated: "2026-10-31",
        relatedAppRoutes: ["/app/customers", "/app/orders", "/app/inventory/purchase-orders"],
        relatedArticleIds: ["gs-row-actions"],
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

Merchandising sidebar subsections:

- **Sales** — Customers, Inquiries, Quotations, Orders
- **Planning** — Consumption Plans (\`/app/bom/orders\`), BOM Builder (\`/app/bom\`), Order Pipeline, Consumption Recon
- **Analytics** — Pipeline Analytics, Order Profitability (\`/app/merch/profitability\`), Critical Alerts, Wastage Report
- **Operations** — Garment Styles, Sample Development, Control Tower (\`/app/merchandising/control-tower\`), Follow-up TNA (\`/app/followup\`), Parties, Document Flow

## Tips

- Use **Actions** on each list row for view/edit/print where enabled.`,
        tags: ["inquiry", "quotation", "order", "customer", "merchandising"],
        lastUpdated: "2026-07-25",
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
          "/app/merchandising/control-tower",
          "/app/merchandising/pipeline",
          "/app/merchandising/pipeline-analytics",
          "/app/merch/profitability",
          "/app/merch/order-profitability",
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
- On the **quotation workspace**, **Quotation AI** may include **Import from document** (PDF/image) to suggest header fields — always review before applying; locked commercial fields still follow change-request rules.
- If conversion is blocked, check **quotation status** and role permissions.`,
        tags: ["quotation", "order", "convert", "sales"],
        lastUpdated: "2026-04-10",
        relatedAppRoutes: ["/app/quotations", "/app/quotations/new", "/app/orders", "/app/orders/new"],
        relatedArticleIds: ["merch-pipeline", "merch-inquiry-detail", "gs-row-actions", "merch-order-color-size"],
      },
      {
        id: "merch-order-color-size",
        title: "Colour / size breakdown on an order",
        summary: "Record pieces per colour and size on the order page; confirmed orders keep their confirmed total.",
        content: `## Overview

Buyers usually order one style in several colours and sizes. The **Colour / size breakdown** grid on the order page records exactly how many pieces of each combination you must make.

This grid appears only when an admin turns on **Settings → Configuration → Colour / size breakdown on orders**.

## Steps

1. Open the order (\`/app/orders/:id\`).
2. In **Colour / size breakdown**, click **Use style colours & sizes** to copy the style's colourways and size scale (or the quotation's size ratio), or add colours and sizes yourself.
3. Type the pieces in each cell. Row, column and grand totals update as you type.
4. Keep **Set order quantity to grid total** ticked if the order quantity should follow the grid, then click **Save breakdown**.

## Confirmed orders

Once an order is **Confirmed**, **In progress** or **Completed**, its quantity is a commercial term. You can still move pieces between colours and sizes, but the grid total must equal the confirmed quantity. To change the total, raise a **commercial change request**.

## Tips

- Remove a colour or size with the small **×** next to its name before saving.
- Saving replaces the whole grid, so everyone sees the same breakdown.`,
        tags: ["order", "colour", "color", "size", "breakdown", "matrix", "quantity"],
        keywords: ["size ratio", "colourway", "assortment"],
        lastUpdated: "2026-11-01",
        relatedAppRoutes: ["/app/orders"],
        relatedArticleIds: ["merch-quotation-to-order"],
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
- **Export Cases** — \`/app/commercial/export-cases\` (create at \`/app/commercial/export-cases/new\`; can prefill \`order_id\` from an order)
- **Master Contracts** — \`/app/commercial/master-contracts\`
- **Proforma Invoices** — \`/app/commercial/proforma-invoices\`
- **Commercial Invoices** — \`/app/commercial/invoices\` (from posted delivery challans)
- **BTB LCs** — \`/app/commercial/btb-lcs\`

## Trade and logistics (when enabled)

If **trade** is enabled for your tenant:

- **Trade Cases** — \`/app/trade/cases\`
- **Trade Control Tower** — \`/app/trade/dashboard\`
- **Logistics** — \`/app/logistics\`

## Tips

- From an **Order** detail page you can open related BOM, POs, production planning, commercial invoices, or create an export case with the order prefilled.
- Create a commercial invoice from a **posted** delivery challan (Create Invoice), then **Issue** to raise a draft AR voucher.
- If these links are missing, trade may be disabled for your tenant.`,
        tags: ["commercial", "LC", "proforma", "export", "trade", "invoice"],
        lastUpdated: "2026-07-25",
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
          "/app/commercial/export-cases/new",
          "/app/commercial/master-contracts",
          "/app/commercial/proforma-invoices",
          "/app/commercial/invoices",
          "/app/commercial/btb-lcs",
          "/app/trade/cases",
          "/app/trade/dashboard",
          "/app/logistics",
        ],
        relatedArticleIds: ["merch-pipeline", "commercial-commission"],
      },
      {
        id: "commercial-commission",
        title: "Commission: earned from factories/buyers and paid to agents",
        summary: "Record each shipment's FOB value; commission in both directions is calculated, grouped into statements and turned into draft vouchers.",
        content: `## Overview

**Export & Import → Commission** (\`/app/commercial/commission\`) handles two kinds of commission on every shipment:

- **We earn** — commission a factory or buyer pays your buying house.
- **We pay** — commission you owe an agent linked to the order.

An admin turns it on in **Settings → Configuration → Commission engine**.

## 1. Set rules, tax and accounts (Rules & settings tab)

1. Add rules: **Direction**, **Applies to** (everyone, one factory, one buyer or one agent), **Rate type** (% of shipped FOB value, or a fixed amount per piece) and **Rate**. The most specific rule wins.
2. Commission terms typed on an **order** override rules. They count as agent commission when the order has an agent, otherwise as commission you earn. An agent's default rate on the buyer–agent link is used next.
3. Enter **TDS / AIT %** and **VDS %** (0 until you set them) and choose the accounts used for vouchers.

## 2. Record shipments (Shipments tab)

Pick the order, the factory (if the factory pays you), the shipment or invoice reference, date, **shipped FOB value**, currency and **rate to BDT**. Commission lines are calculated immediately. If you change rules later, use **Actions → Recalculate** on shipments not yet on a statement.

## 3. Statements (Statements tab)

1. **Pending commission** groups lines by party and currency. Click **Create statement**.
2. **Actions → Issue** creates a **DRAFT journal voucher** in BDT for accounts to review and post (commission receivable/income, or expense/payable, with TDS and VDS lines).
3. **Actions → Cancel** returns the lines to pending. A draft voucher is cancelled automatically; a posted voucher must be reversed in Accounts first.

## Tips

- One shipment reference can be recorded once per order.
- A shipment on a statement cannot be deleted or recalculated until its statement is cancelled.`,
        tags: ["commission", "buying house", "agent", "TDS", "VDS", "AIT", "statement", "shipment"],
        keywords: ["brokerage", "commission invoice", "agent commission"],
        lastUpdated: "2026-11-01",
        relatedAppRoutes: ["/app/commercial/commission"],
        relatedArticleIds: ["commercial-overview"],
      },
      {
        id: "commercial-bd-registers",
        title: "Bond & VAT registers: UD utilization, bond register, Mushak 6.1 / 6.2",
        summary: "Record each UD and its permitted imports, track imports and consumption in bond, and export monthly purchase and sales VAT registers.",
        content: `## Overview

**Export & Import → Bond & VAT registers** (\`/app/commercial/bd-compliance\`) keeps the registers a Bangladesh bonded exporter needs between audits. An admin turns it on in **Settings → Configuration → Bangladesh bond & VAT registers**.

These are **working registers** — exports are spreadsheets (CSV / Excel from each table's **Export** menu), not the official e-UD, CBMS or NBR upload files. Check figures before filing.

## 1. UD register

1. Click **New UD**. Enter the **UD number**, **amendment no.** (0 for the original), **issuer** (BGMEA, BKMEA, BEPZA), UD date, export LC / contract, buyer, export value and **expiry date**.
2. Under **Permitted imports**, add each raw material on the UD with its **entitled quantity** (and value if you track it).
3. Save, then **Actions → Approve**. Approved UDs are locked; use **Back to draft** to correct them, or record an amendment as a new UD with the next amendment number.
4. **Actions → Close UD** when the export is complete.

## 2. Record bond movements

Open a UD (**Actions → View utilization**). Under **Record bond movement**, choose the import line and:

- **Import into bond** — material received against the UD (bill of entry, invoice).
- **Consumed / exported** — material used in shipped garments.

The table shows **imported**, **consumed**, **in bond**, **remaining entitlement** and **% used**. Warnings appear when imports exceed the entitlement, consumption exceeds imports, or the UD expires within 30 days.

## 3. Bond register

The **Bond register** tab lists every movement in date order with a running balance per item, and the opening balance before the chosen start date. Filter by UD number.

## 4. Mushak 6.1 and 6.2

- **Mushak 6.1 (purchases)** — recorded vendor bills for the month (drafts and cancelled bills are left out), with supplier BIN from the vendor's tax ID, taxable value and VAT in your base currency.
- **Mushak 6.2 (sales)** — issued and posted commercial invoices, treated as **zero-rated exports**. Add local sales manually.

## Tips

- Use the same item description on the UD and in bond entries; linking movements to a UD line keeps utilization exact.
- Mushak tabs need finance access; UD and bond tabs need Export & Import access.`,
        tags: ["UD", "utilization declaration", "bond", "bonded warehouse", "Mushak", "VAT", "BGMEA", "BKMEA", "customs"],
        keywords: ["Mushak 6.1", "Mushak 6.2", "purchase register", "sales register", "bond licence", "UP"],
        lastUpdated: "2026-11-02",
        relatedAppRoutes: ["/app/commercial/bd-compliance"],
        relatedArticleIds: ["commercial-overview"],
      },
      {
        id: "logistics-packing-cartons",
        title: "Packing lists: carton detail by colour and size",
        summary: "Enter carton ranges with colour, size and pieces per carton; totals, weights, CBM and the order's left-to-pack balance are calculated.",
        content: `## Overview

Open a packing list from **Logistics → Packing lists** (\`/app/logistics\`). When an admin turns on **Settings → Configuration → Carton detail on packing lists**, a **Carton detail** section appears.

## Steps

1. Click **Add carton range** and enter **carton from / to** (e.g. 1–40), **colour**, **size** and **pcs per carton**.
2. Enter **net / gross kg per carton** and the carton **L × W × H** in cm to get total weights and **CBM**.
3. **Assorted cartons** (several sizes in one carton): click the **copy** button on a row to add another size for the **same carton range**. Weights and dimensions are taken from the first row of each range.
4. Click **Save cartons**. The packing list's **total cartons**, **gross** and **net weight** are updated from the detail.

## Ordered vs packed

If the order has a **colour / size breakdown**, the table under the cartons shows, for each colour and size, what is in this list, what all packing lists for the order contain, the ordered quantity and **left to pack**. Over-packing is shown in red.

## Rules

- Different carton ranges may not overlap (1–10 and 8–12 is refused).
- A packing list that is **Finalized** is read-only.`,
        tags: ["packing list", "carton", "CBM", "weight", "assortment", "ratio", "shipment"],
        keywords: ["packing detail", "solid pack", "assorted pack", "carton marks"],
        lastUpdated: "2026-11-02",
        relatedAppRoutes: ["/app/logistics"],
        relatedArticleIds: ["commercial-overview", "merch-order-color-size"],
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

## Planning and manufacturing (feature-flagged)

Enable tenant flags as needed: \`mrp_engine_enabled\`, \`auto_reorder_enabled\`, \`inter_department_transfer_enabled\`, \`process_loss_tracking_enabled\`, \`grn_quality_inspection_enabled\`.

- **MRP Run** — \`/app/inventory/mrp\`
- **Reorder Suggestions** — \`/app/inventory/reorder-suggestions\`
- **Inter-Dept Transfers** — \`/app/inventory/idt\`
- **Receive IDT** — \`/app/inventory/idt-receive\`
- **Process Loss Report** — \`/app/inventory/process-loss-report\`
- **Post-Costing** — \`/app/inventory/post-costing\`
- **Process Loss Standards** — \`/app/inventory/process-loss-settings\`
- **GRN Inspection** — \`/app/inventory/grn-inspection\` (quarantine accept/reject/hold)
- **Quality Dashboard** — \`/app/inventory/quality-dashboard\`
- **Vendor Scorecard** — \`/app/inventory/vendor-scorecard\`
- **ABC Analysis** — \`/app/inventory/abc-analysis\`
- **EOQ** — \`/app/inventory/eoq\`
- **Stock Aging** — \`/app/inventory/stock-aging\`
- **Cycle Count** — \`/app/inventory/cycle-count\` (flag \`cycle_counting_enabled\`)
- **Serial Tracking** — \`/app/inventory/serials\` (flag \`serial_tracking_enabled\`)
- **Kit Builder** — \`/app/inventory/kits\` (flag \`kitting_enabled\`)
- **Consignment Stock** — \`/app/inventory/consignment\` (flag \`consignment_stock_enabled\`)

Item planning (auto reorder, safety stock, lead time) is on Stock Item detail → **Planning** tab, and on Stock Master create.

## Stock control

- **Transfers** — \`/app/inventory/warehouse-transfers\`
- **Adjustments** — \`/app/inventory/stock-adjustments\`
- **Consumption Control** — \`/app/inventory/consumption-control\`
- **Reconciliation** — \`/app/inventory/reconciliation\`

## Reports and analytics

Stock summary, FIFO summary, dashboard, ledger, valuation — all under \`/app/inventory/...\` as listed in the sidebar.

## Outbound

- **Delivery Challans** — \`/app/inventory/delivery-challans\` (new challans start as **DRAFT**; **POSTED** is final because stock has already gone out — fix mistakes with a stock adjustment, not by re-posting). From an order, **Delivery challans** opens the list filtered to that order and **New challan** pre-links the order.
- **Gate Passes** — \`/app/inventory/enhanced-gate-passes\`

Purchase orders and GRNs have a **Print** action that opens a printable document in a new tab.

## Traceability

- **Lot Traceability** — \`/app/inventory/lots\`

## Tips

- Manufacturing orders for production are under **Manufacturing** (\`/app/production/manufacturing-orders\`), not inside Inventory.`,
        tags: ["inventory", "PO", "GRN", "stock", "warehouse", "QC", "ABC", "EOQ"],
        lastUpdated: "2026-10-31",
        infographics: [
          {
            type: "flow",
            title: "Procurement into stock",
            steps: [
              { label: "Purchase order", href: "/app/inventory/purchase-orders" },
              { label: "Goods receiving", href: "/app/inventory/goods-receiving" },
              { label: "GRN QC (when enabled)", href: "/app/inventory/grn-inspection" },
              { label: "Stock master / reports", href: "/app/inventory" },
            ],
          },
        ],
        relatedAppRoutes: [
          "/app/inventory",
          "/app/inventory/purchase-orders",
          "/app/inventory/goods-receiving",
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

## Colour / size breakdown (optional)

When an admin turns on **Settings → Configuration → Colour / size breakdown on purchase orders**, open **Actions → Receipt progress & vendor bill** on a PO and use **Colour / size breakdown** to split each line by colour and size (for example trims per garment colour). **Use order colours & sizes** copies the linked order's grid. The breakdown never changes the PO quantity; once a PO is past **DRAFT**, a saved grid must total the line quantity, and closed or cancelled POs are read-only.

## Tips

- The page description notes that POs link vendors from the supplier master and receive into stock via **Goods Receiving**.`,
        tags: ["purchase order", "PO", "procurement", "vendor", "colour size breakdown"],
        lastUpdated: "2026-11-02",
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

1. Open **Adjustments** — \`/app/inventory/stock-adjustments\`.
2. Choose **reason** and **warehouse**, then search and pick the **item** (type a code or name).
3. Enter a **positive** quantity to add stock or a **negative** quantity to remove it.
4. Save — the adjustment starts as **DRAFT**. Open **Actions → Post to stock** on the row to apply the movement.

List rows show each item's **code and name**, so you can confirm the right item before posting.

## Common mistakes

- **From** and **to** warehouse reversed on a transfer.
- Adjustment **sign** wrong (positive vs negative) so stock moves the opposite direction.

## What to do next

- Reconcile using **Inventory reconciliation** or reports if counts still do not match physical stock.

## Tips

- For consumption vs production issues, your team may also use **Consumption Control** or manufacturing screens — see the inventory map article.`,
        tags: ["transfer", "adjustment", "warehouse", "stock"],
        lastUpdated: "2026-10-31",
        relatedAppRoutes: ["/app/inventory/warehouse-transfers", "/app/inventory/stock-adjustments"],
        relatedArticleIds: ["inv-overview", "gs-row-actions"],
      },
      {
        id: "inv-traceability-certificates",
        title: "Certificates and order traceability for buyers",
        summary: "Record GOTS / OEKO-TEX / GRS certificates, note which fabric lots each cut ticket used, and give buyers a traceability report per order.",
        content: `## Overview

Buyers increasingly ask: *which fabric went into this order, who supplied it, and was it certified?* **Inventory → Certificates & order trace** (\`/app/inventory/traceability\`) answers that from data you already keep.

An admin turns it on in **Settings → Configuration → Traceability & certificates**.

## 1. Certificates

On the **Certificates** tab add each certificate: **type** (GOTS, OCS, GRS, RCS, OEKO-TEX Standard 100, BCI, FSC, other), **number**, **issuing body**, the **supplier** that holds it and/or the **material** it covers, and the **validity dates**. Status shows **valid**, **expiring** (30 days or less left) or **expired**.

## 2. Fabric lots on cut tickets

On the **Cutting pipeline** page (\`/app/production/cutting/pipeline\`), after you create or enter a cut ticket, the **Fabric lots used** panel lets you pick the received lot (from the goods receipt), the quantity used and the roll numbers.

Lots exist only for fabric received while **Enable batch tracking** is on (**Settings → Configuration**) and the fabric item has batch tracking ticked. Turn both on before receiving fabric you need to trace.

## 3. Order traceability report

On **Order traceability**, pick an order. You see every cut ticket's fabric lots with supplier, goods receipt and the certificates valid **on the receipt date**, plus bundles and packing lists.

The yellow **gaps** box lists what to fix before sending: cut tickets without lots, lots without certificates, or certificates that had expired when the fabric arrived. Use **Export CSV for buyer** or **Print**.`,
        tags: ["traceability", "certificate", "GOTS", "OEKO-TEX", "GRS", "fabric lot", "roll", "compliance", "buyer"],
        keywords: ["transaction certificate", "scope certificate", "sustainability", "audit"],
        lastUpdated: "2026-11-01",
        relatedAppRoutes: ["/app/inventory/traceability", "/app/production/cutting/pipeline"],
        relatedArticleIds: ["inv-overview"],
      },
      {
        id: "inv-supplier-portal",
        title: "Supplier portal: suppliers confirm POs and ship dates themselves",
        summary: "Invite people at your suppliers; they see only their own approved purchase orders, confirm or decline, and post ship dates and notes.",
        content: `## Overview

The **supplier portal** lets your fabric, trims and service suppliers answer purchase orders online instead of by phone and email.

## 1. Turn it on and invite (admin)

1. Open **Settings → External access** (\`/app/settings/external-access\`) and click **Enable portal** on the **Supplier portal** card.
2. Click **Manage supplier access**, enter the person's **email** and **name**, tick the **vendors** they work for, and click **Send invitation**.
3. They receive an email link to set a password. If email is not configured, the page shows a link you can share.

## 2. What the supplier sees

After signing in (sign-in page, role **Supplier portal**, your company code):

- **Dashboard** — open POs, how many still need their reply, and what is due soon or overdue.
- **Purchase orders** — only **approved** (and later) POs for their linked vendors. Drafts are never shown.
- **PO detail** — items, prices, what you have received so far, and a **Reply** box: **Confirm order**, **Update ship date**, **Send a note** or **Cannot accept** (with a reason).

## 3. Seeing replies (staff)

- Admins and managers get a **bell notification** for every supplier reply.
- On **Purchase orders**, open **Actions → Receipt progress & vendor bill** to see the **Supplier replies** history.

## Safety

- A supplier login only ever sees the vendors you ticked; change them any time with **Actions → Change vendors**.
- **Deactivate** a login to sign that person out everywhere. Turning the portal off blocks all supplier logins at once.
- Every reply is recorded in **External access → audit log**.`,
        tags: ["supplier", "vendor", "portal", "purchase order", "confirmation", "ship date", "external access"],
        keywords: ["supplier collaboration", "PO acknowledgement", "vendor portal"],
        lastUpdated: "2026-11-02",
        relatedAppRoutes: ["/app/settings/external-access", "/app/inventory/purchase-orders"],
        relatedArticleIds: ["inv-po-deep"],
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
- **Operations Control Tower** — \`/app/operations/control-tower\` (optional; enable in **Settings → Configuration**)

## Shop floor

Cutting, sewing, finishing, hourly boards, crew sheets, roster, QC — routes under \`/app/production/...\` as shown in the sidebar.

## Optional units

Knitting, dyeing, printing, AOP, embroidery, elastic, washing (and hourly variants) appear when your tenant enables those **optional production units** in **Production setup**.

The **Knitting hub** (\`/app/production/knitting\`) also needs **knitting_enabled** under **Settings → Configuration** (tenant feature flag).

## Samples & TNA

- **Sample development (merchandising)** — \`/app/merchandising/samples\` — style-linked sample types (proto, fit, PP, SMS, shipping, etc.), tasks, costing lines, materials, metrics, and **AI plan proposal → apply** for schedules.
- **Manufacturing sample requests** (shop floor) — \`/app/samples/requests\` when enabled for your tenant.
- **TNA Dashboard / Templates / Plans** — \`/app/tna/dashboard\`, \`/app/tna/templates\`, \`/app/tna/plans\`

## Cost

- **Cost & CM** — \`/app/production/costs\``,
        tags: ["production", "planning", "shop floor", "TNA"],
        lastUpdated: "2026-05-04",
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
        relatedAppRoutes: [
          "/app/production",
          "/app/production/planning",
          "/app/production/manufacturing-orders",
          "/app/production/knitting",
          "/app/operations/control-tower",
        ],
        relatedArticleIds: ["inv-overview", "mfg-planning-deep", "mfg-mo-deep", "mfg-hourly-deep", "ops-control-tower"],
      },
      {
        id: "ops-control-tower",
        title: "Operations Control Tower",
        summary:
          "Optional read-only screen that combines orders, master LC, capacity load, merchandising alerts, and finance (by role).",
        content: `## Overview

The **Control Tower** lives at \`/app/operations/control-tower\`. It is **read-only**: it does not replace orders, inventory, production, or finance entry screens.

## Enablement

Your administrator turns it on under **Settings → Configuration** using the **Enable Operations Control Tower** checkbox (\`control_tower_enabled\`).

## What you see (depends on role)

- **Order grid** — delivery window, pipeline stage, material readiness (actual), line and **reservation** status, planned end (projected).
- **Master LC ladder** — pick a master contract linked to orders in the window; see reference, status, BTB count, linked orders.
- **Capacity heatmap** — projected SMV-minute load by line and day (firm + soft bookings).
- **Alerts** — open merchandising alerts with shortcuts.
- **Finance snapshot** — funded vs non-funded BTB exposure and maturity tranches for the selected master LC (finance / management roles).

## Tips

- Use **Actions** on a row to open the order or line plan board.
- From an order, open **Control Tower** in the workflow strip when the feature is enabled.
- *Projected* labels are estimates; *actual* values come from posted transactions and stock.`,
        tags: ["operations", "control tower", "planning", "master lc"],
        lastUpdated: "2026-10-31",
        relatedAppRoutes: ["/app/operations/control-tower", "/app/settings/config", "/app/orders"],
        relatedArticleIds: ["mfg-overview", "mfg-planning-deep", "gs-sidebar"],
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

- Optional units (dyeing, printing, washing, …) appear when marked optional in Production setup for your tenant. The **Knitting hub** (/app/production/knitting — charge rates, work orders, process-order hand-off) also requires **knitting_enabled** under Settings → Configuration.`,
        tags: ["manufacturing order", "MO", "production"],
        lastUpdated: "2026-05-04",
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
        relatedArticleIds: ["mfg-overview", "mfg-mo-deep", "mfg-scan-station"],
      },
      {
        id: "mfg-scan-station",
        title: "Scan station: count bundles per operation on a tablet",
        summary: "Scan each bundle as an operation finishes; output and earned minutes update by hour, and scans are kept on the device when Wi-Fi drops.",
        content: `## Overview

The **Scan station** (\`/app/production/scan-station\`) turns a tablet or PC with a barcode scanner into a line counter. Every bundle barcode printed on the **Cutting pipeline** page can be scanned once per operation.

An admin turns it on in **Settings → Configuration → Shop-floor scan station**. The order's style needs an **operation bulletin** (IE) so operations and SMV are known.

## Set up the station (once per shift)

1. Choose the **line**, the **order** and the **operation** this station counts (from the order's operation bulletin).
2. Enter the **operator ID** (change it when the operator changes).

## Scan

- Scan the bundle barcode (or type it and press **Enter**). The message shows the bundle and operation.
- **Offline?** The top bar says so and the scan is kept on this device. It is sent automatically when the connection returns (or press **Send now**).
- A bundle is counted **once per operation**. Scanning it again — on this or another station — is reported as already counted, never added twice.

## Rejected scans

Unknown barcodes, operations that are not in the order's bulletin, or a wrong device clock are listed under **rejected scans** for the supervisor.

## Today's figures

**Today by hour** shows pieces and **earned minutes** (pieces × SMV) for the line, plus **top operators**.

## Tips

- Use the **English / বাংলা** switch at the top for operators who prefer Bangla.
- Keep the page open on the station; the queue survives a page reload on the same device.
- Correct the tablet's date and time — scans older than 7 days or in the future are refused.`,
        tags: ["scan", "barcode", "bundle", "operation", "SMV", "earned minutes", "shop floor", "offline", "line output"],
        keywords: ["bundle tracking", "piece rate", "WIP", "operator efficiency"],
        lastUpdated: "2026-11-02",
        relatedAppRoutes: ["/app/production/scan-station", "/app/production/cutting/pipeline"],
        relatedArticleIds: ["mfg-hourly-deep"],
      },
      {
        id: "mfg-line-plan-board",
        title: "Line plan board: several factories and planning conflicts",
        summary: "See every sewing line by factory unit, drag plans to reschedule, and fix overlaps and late-delivery warnings before they reach the floor.",
        content: `## Overview

The **Line plan board** (\`/app/production/line-plan\`) shows each sewing line as a row and each plan as a block across the dates you choose (up to 62 days). Drag the grip (⋮) on a block to move it to another line or start date.

## Several factories or units

1. In **Production setup → Sewing lines**, fill **Factory / unit** for each line (for example "Unit 2 — Gazipur"). Leave it blank for the main factory.
2. On the board, lines are grouped under their unit. When there is more than one unit, a **Factory** filter and a card per unit appear, with line count, plans and pieces done vs planned. Click a card to show only that unit.

## Planning conflicts

A red **Planning conflicts** panel lists problems in the chosen range, and affected blocks get a red outline (hover a block to read why):

- **Line overlap** — two active plans on the same line share dates.
- **Late vs delivery** — a plan finishes sewing after the order's delivery date.
- **Inactive line** — a plan is still booked on a line marked inactive.

Completed and cancelled plans are ignored. Move or shorten the plan, then **Refresh**.

## Tips

- The **Assignments** table shows each order's code and due date.
- Readiness dots and AI suggestions work as before; conflicts are plain rules and need no AI.`,
        tags: ["line plan", "planning board", "multi-factory", "unit", "capacity", "overlap", "delivery date", "sewing line"],
        keywords: ["production planning", "line loading", "factory unit", "late order"],
        lastUpdated: "2026-11-02",
        relatedAppRoutes: ["/app/production/line-plan", "/app/production/setup"],
        relatedArticleIds: ["mfg-overview", "mfg-scan-station"],
      },
    ],
  },
  {
    id: "quality",
    title: "Quality",
    description: "QC dashboard, inspections, lab tests, CAPA, returns, and QC (Classic).",
    articles: [
      {
        id: "quality-overview",
        title: "Quality module",
        content: `## Overview

**Quality** includes dashboard, inspections, lab tests, CAPA, returns, and a **QC (Classic)** entry point.

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
- **Exception agents** — \`/app/ai/agents\` (optional; see the guide below)

## Ask about the record on screen

Open the assistant (✦ in the top bar) while an **order, customer, style, voucher or employee** page is open. A chip shows **Asking about …** — questions such as "when is this due?" then use that record, and the answer shows a **Source** link back to it. Click × on the chip to ask without it. The assistant only sees records your role can open.

## Tips

- **AI Predictions** includes forecast templates, KPI summary, filters, run history with charts, a detail drawer (copy JSON), soft-delete for old runs, profitability narrative, and recent anomaly alerts with links to related modules.
- Availability and behavior depend on tenant configuration and backend features.`,
        tags: ["AI", "assistant", "automation", "context", "citation"],
        lastUpdated: "2026-11-02",
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
        relatedArticleIds: ["ai-exception-agents", "ai-ask-a-figure"],
      },
      {
        id: "ai-exception-agents",
        title: "Exception agents: find problems, confirm who to tell",
        summary: "Agents flag overdue TNA actions, expiring LCs and BOM materials not on PO, and prepare an owner brief. A manager confirms before anything is sent.",
        content: `## Overview

**AI Tools → Exception agents** (\`/app/ai/agents\`) runs three checks every time you open it or click **Run agents**:

- **TNA delay** — follow-up / TNA actions past their planned date (critical after 7 days).
- **LC expiry** — trade cases whose LC or master contract expires within 14 days.
- **BOM shortfall** — orders due within 45 days whose BOM materials are not fully covered by purchase orders.

An admin turns it on in **Settings → Configuration → AI exception agents**. You only see agents for modules your role can open.

## Human confirmation

Agents **never send anything on their own**. For each finding, **Actions** offers:

- **Notify the assignee… / Notify managers…** — add an optional note, then **Confirm & send**. The person gets it in their bell inbox with a link to the record.
- **Dismiss for 7 days** — hide a finding you have handled another way.

Only admins, managers or roles with the **ai.agents.confirm** permission can confirm. Every decision is stored and written to the AI audit log. Findings you acted on are hidden for a few days and come back if the problem is still open.

## Owner brief

**Generate** builds a short morning brief from today's figures and open findings (written by AI when available, otherwise from rules). **Send to managers** asks for confirmation, then delivers it to admins and managers.`,
        tags: ["AI", "agents", "exceptions", "TNA", "LC expiry", "BOM", "shortage", "owner brief", "governance"],
        keywords: ["alerts", "human in the loop", "approval", "morning brief"],
        lastUpdated: "2026-11-02",
        relatedAppRoutes: ["/app/ai/agents"],
        relatedArticleIds: ["ai-tools-overview"],
      },
      {
        id: "ai-ask-a-figure",
        title: "Ask a figure: pin answers to your dashboard",
        summary: "Type a question like “late orders” on the dashboard; the answer comes from a fixed list of figures and can be pinned as a card.",
        content: `## Overview

When **Settings → Configuration → Ask-a-metric dashboard cards** is on, the dashboard shows **Ask a figure**.

1. Type a question, e.g. *How many orders are late?*, *open orders by buyer* or *LCs expiring*.
2. The answer shows one figure with a link to the matching list. **Pin card** keeps it on your dashboard (up to 8; only you see your cards).
3. Remove a card with ×.

## What it can answer

Answers come only from a fixed list: open orders, open quantity, orders due in 14 days, late orders, open orders by buyer, overdue TNA actions, open purchase orders, BTB LCs expiring in 30 days, vouchers awaiting approval and active employees. If a question doesn't match, you get suggestions instead of a guess. AI may help pick the figure, but it never writes queries, and you only see figures for modules your role can open.`,
        tags: ["AI", "dashboard", "metric", "KPI", "question", "pin"],
        keywords: ["natural language", "ask", "cards"],
        lastUpdated: "2026-11-02",
        relatedAppRoutes: ["/app"],
        relatedArticleIds: ["ai-exception-agents"],
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
- **AI employee onboarding** — \`/app/hr/employees/ai-onboard\` (OCR CV / NID / medical; feature flags)
- **Attendance** — routes under \`/app/hr/attendance/...\`
- **Leave** — \`/app/hr/leave/...\`
- **Payroll** — \`/app/hr/payroll/...\` (components, structures, **structure assignments**, periods, runs with optional auto-calculate)
- **Compliance (BSCI/WRAP/SEDEX)** — \`/app/hr/compliance\`
- **AI Insights** — \`/app/hr/ai-insights\`
- **ESS** — \`/app/hr/ess/...\`

Use the sidebar subsection labels to find the exact screen.

**বাংলা / Bangla** — **My Leave**, **My Attendance** and **My Payslips**, the **Scan station** and **Hourly production** screens have an **English / বাংলা** switch at the top. The choice is remembered on that device. Other screens stay in English for now.

**Payroll auto-calculate** (feature flag \`payroll_auto_calculate_enabled\`, default off): assign a structure under \`/app/hr/payroll/assignments\`, then on a DRAFT run use **Auto-calculate** → preview → apply.

**Payroll rules worth knowing**

- Each period allows **one active payroll run**. To redo a run, **Reject** it first (Payroll Approvals), then create a new one.
- **Payroll Approvals** — \`/app/hr/payroll/approvals\` lists **FINALIZED** runs waiting for a manager; use **Actions → Approve** or **Reject** (with a reason). Posted runs cannot be approved or rejected again.
- **Payslips** — managers see everyone's payslips; other staff see only their own (their user must be linked to an employee record). Downloads are PDF files.
- **Late** attendance counts as a worked day for salary; late penalties are calculated separately.

**Leave balances** — submitting a request reserves the days immediately (pending); approval moves them to used, rejection releases them. When an allocation is set for the leave type, requests beyond the remaining balance are blocked.

**Sprint H1 compliance** (flags default off): enable \`compliance_tracking_enabled\`, \`age_verification_required\`, and \`medical_certificate_tracking_enabled\` on the tenant, then activate BSCI/WRAP/SEDEX templates on the Compliance page. See \`docs/HR_COMPLIANCE_H1.md\`.`,
        tags: ["HR", "payroll", "attendance", "leave", "compliance", "Bangla", "বাংলা", "language"],
        lastUpdated: "2026-11-02",
        coverImage: "/images/hero-bg.svg",
        infographics: [
          {
            type: "highlight",
            title: "HR areas",
            body: "Core HR and attendance feed leave and payroll; ESS gives employees self-service access. Compliance and AI Insights support buyer audits.",
          },
        ],
        relatedAppRoutes: [
          "/app/hr",
          "/app/hr/employees",
          "/app/hr/employees/ai-onboard",
          "/app/hr/compliance",
          "/app/hr/ai-insights",
          "/app/hr/payroll/assignments",
          "/app/hr/payroll/runs",
        ],
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
- **Bills**, **Vendor bills (GRN)**, and **Purchase & AP** — \`/app/accounts/outstanding-bills\`, \`/app/accounts/vendor-bills\`, \`/app/accounts/purchase-workflow\`

## Banking

Bank accounts, reconciliation, payment runs, advice, settlement audit — \`/app/banking/...\` and **FX Receipts** under \`/app/finance/fx-receipts\`.

## Reports and planning

Financial statements, trial balance, day book, analytics, budgets, cash forecast, **Loans & facilities**, **Business overview**, and related planning pages — see sidebar entries under **Reports** and **Planning**.`,
        tags: ["finance", "vouchers", "accounts", "banking"],
        lastUpdated: "2026-04-07",
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
        relatedAppRoutes: ["/app/accounts", "/app/accounts/vouchers", "/app/accounts/vendor-bills", "/app/banking/accounts"],
        relatedArticleIds: [
          "wf-approvals",
          "fin-voucher-entry",
          "fin-voucher-approval-queue",
          "fin-bills-ap",
          "fin-loans-facilities",
        ],
      },
      {
        id: "fin-loans-facilities",
        title: "Loans & facilities (credit lines)",
        content: `## Overview

Manage bank / lender **facilities**, **drawdown utilizations**, repayment **schedules**, and tie disbursements to **vouchers**.

## Where to open

- **Finance → Planning → Loans & facilities → Facilities dashboard** — \`/app/finance/facilities/dashboard\`
- **All facilities** — \`/app/finance/facilities\`
- **Business overview** — \`/app/finance/business-overview\`

## Typical flow

1. Create a **draft facility** with type, sanction, and GL accounts.
2. Add a **utilization** (principal, rate, tenure). Use the live **EMI preview** on the form.
3. **Activate** the utilization to create a **disbursement draft voucher**; post it from **Vouchers** to record drawdown.
4. Use **record payment** / schedule tools from the internal facility APIs as your team enables them; repayments also flow through **vouchers** when posted.`,
        tags: ["finance", "facility", "loans", "emi"],
        lastUpdated: "2026-04-06",
        relatedAppRoutes: [
          "/app/finance/facilities",
          "/app/finance/facilities/dashboard",
          "/app/finance/business-overview",
        ],
        relatedArticleIds: ["fin-overview", "fin-voucher-entry"],
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

- **Post** moves amounts into the ledger when controls pass; watch for **control warnings** after posting. Posting the same voucher twice is blocked.
- A **posted** voucher can only leave **POSTED** through **Reverse** (creates a mirror voucher dated today — today must be in an open accounting period) or **Cancel posting** (its own date must be in an open period).
- **Reverse** is not available for memorandum / optional / post-dated vouchers that never hit the books — use **Cancel posting** instead.
- Vouchers that created a **loan / facility** drawdown or repayment must be reversed from **Facilities**, not from the voucher list.
- Return to **Vouchers** for full edit history on draft lines.

## Who can do what

- **Check**, **Recommend**, **Approve**, **Post**, **Reject**, **Reverse** and **Cancel posting** need a **manager** or **admin** role.
- A user may **Cancel** their **own draft**; cancelling someone else's draft needs a manager.

## Common mistakes

- **Date range** too narrow (vouchers “disappear” from the queue).
- **Reject** or **Reverse** without a clear **reason** when the modal asks for one.
- Trying to reverse while **today's** accounting period is closed — ask finance to open it first.

## What to do next

- After **Post**, use **Day book** / **Ledger** reports under **Finance → Reports** to verify entries.

## Tips

- You can export or print from the queue if those toolbar actions are visible for your role.`,
        tags: ["voucher", "approval", "finance", "workflow"],
        lastUpdated: "2026-10-31",
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
- **Vendor bills (GRN)** — \`/app/accounts/vendor-bills\` (draft from GRN accepted qty, then post AP / clear GRNI)

## Typical flow

1. Open **Outstanding bills** to see supplier invoices waiting for booking or payment.
2. Use filters and row **Actions** to open a bill, allocate to accounts, or mark progress as the UI allows.
3. Open **Vendor bills (GRN)** when you want finance-owned bills tied to a received GRN (invoice ref + post).
4. Open **Purchase & AP** for the wider purchase-to-pay checklist (GRN linkage, approvals, payment batching — exact steps follow on-page labels).

## Common mistakes

- Booking a bill before **GRN** or PO linkage is correct (amounts will not match operations).
- Ignoring **Actions** on a row (many AP steps are behind the combined **Actions** menu).

## What to do next

- When ready to pay, continue to **Banking → Payment runs** or **Payment advice** per your process.

## Tips

- Inventory **Goods Receiving** often feeds quantities; finance screens finalize liability and payment.`,
        tags: ["AP", "bills", "payable", "supplier"],
        lastUpdated: "2026-04-07",
        relatedAppRoutes: ["/app/accounts/outstanding-bills", "/app/accounts/vendor-bills", "/app/accounts/purchase-workflow"],
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

**Merchandising overview** (\`/app/reports/merchandising\`) combines a tenant snapshot with a **Merch control tower** summary and shortcut tiles into operational merchandising screens (pipeline, analytics, **sample development** with tasks/costing/AI planning, wastage, consumption reconciliation, alerts).

## Tips

- **Trade overview** appears only when trade is enabled for your tenant.`,
        tags: ["reports", "analytics"],
        lastUpdated: "2026-04-16",
        infographics: [
          {
            type: "highlight",
            title: "Using reports",
            body: "Start from the hub, pick a domain (merch, inventory, finance), then drill into the report your role needs.",
          },
        ],
        relatedAppRoutes: [
          "/app/reports",
          "/app/reports/merchandising",
          "/app/merchandising/control-tower",
          "/app/merchandising/pipeline",
          "/app/merchandising/samples",
        ],
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

**Settings** covers configuration, users, roles, tenant profile, pricing, activity logs, currency, backup, **statutory compliance** (Bangladesh VAT/VDS/TDS, bonded warehouse, payroll statutory), **data import** (CSV migration), **bulk tenant onboarding**, cheque templates, and **external access** (customer / financier portals). The same **External access** link appears under **Settings** in the left sidebar; the **Portals** menu in the **top bar** jumps to stakeholder login pages.

## Common routes

- **Settings** — \`/app/settings\`
- **Configuration** — \`/app/settings/config\`
- **User Mgmt** — \`/app/settings/users\`
- **Roles** — \`/app/settings/roles\`
- **Tenant** — \`/app/settings/tenant\`
- **Statutory compliance** — \`/app/settings/statutory-compliance\` (VAT/VDS/TDS rates, bonded warehouse UD/UP register, payroll statutory calculator)
- **Data import** — \`/app/settings/data-import\` (CSV dry-run then commit for customers, vendors, items, chart of accounts)
- **Bulk tenant onboarding** — \`/app/settings/bulk-tenant-onboarding\` (platform-admin batch tenant creation with generated company codes)
- **External access** — \`/app/settings/external-access\` (feature flags, invites, audit). **Customer portal** invites: open **Invite customer**, pick the **customer** from the dropdown (email and name pre-fill from the customer master; you can edit), choose **portal role**, then create the invite. Invites are sent by email with secure activation links (\`/portal/customer/accept-invite\`, \`/portal/financier/accept-invite\`), then users sign in on the **unified login** page (\`/login\`) choosing **Customer portal** or **Financier portal** (bookmark \`/login?role=customer\` or \`/login?role=financier\`; older \`/portal/*/login\` URLs redirect there). **Staff invitations** use \`/accept-invite?token=…\`. **Forgot password** for portals: \`/forgot-password?role=customer\` or \`/forgot-password?role=financier\` (legacy \`/portal/*/forgot-password\` redirects). Reset links still open \`/portal/*/reset-password\`. Staff can open portal shortcuts from **Portals** in the app header.
- **Financier portal (credit monitoring scope)** — after sign-in, the top nav can include lender-focused views such as **Contracts** (\`/portal/financier/contracts\` — master contract command center: OTD, BTB maturity, cash/CM ladder, **Production** tab per contract, optional AI brief), **Credit lines** (\`/portal/financier/credit-lines\`), **Stock / collateral** (\`/portal/financier/stock-collateral\`), **BTB liabilities** (\`/portal/financier/btb-liabilities\`), **Inventory** (\`/portal/financier/inventory\`), **Order finance** (\`/portal/financier/order-finance\`), **Recovery outlook** (\`/portal/financier/recovery-outlook\` — coverage ratio and recovery band per financed order), **Raw materials** (\`/portal/financier/raw-materials\`), **Production** (\`/portal/financier/production\`), **Export finance** (\`/portal/financier/financial-visibility\`), **Business health**, **AI confidence**, **Reports** (\`/portal/financier/reports\` — JSON snapshots for recovery, production status, and bank portfolio summary), plus **Alerts** and **Risk panel** (includes **Recovery** signals). **Order book** (\`/portal/financier/order-book\`) lists **financed orders only** when you have credit monitoring scope; open an order for tabs: **Overview** (pipeline ribbon, export path), **Production** (floor % and 14-day sewing trend), **Finance & recovery**, **Materials**. Visibility depends on **financier access scope** and linked party / BTB data.

## Tips

- Changes here can affect **who sees which sidebar items** and **feature flags** for the whole tenant.`,
        tags: ["settings", "users", "roles", "admin"],
        lastUpdated: "2026-06-28",
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
          "/app/settings/statutory-compliance",
          "/app/settings/data-import",
          "/app/settings/bulk-tenant-onboarding",
          "/app/settings/external-access",
          "/app/settings/external-access/customers",
          "/app/settings/external-access/financiers",
          "/app/settings/external-access/audit",
          "/login",
          "/forgot-password",
          "/accept-invite",
          "/portal/financier",
          "/portal/financier/contracts",
          "/portal/financier/credit-lines",
          "/portal/financier/stock-collateral",
          "/portal/financier/btb-liabilities",
          "/portal/financier/inventory",
          "/portal/financier/order-book",
          "/portal/financier/orders",
          "/portal/financier/order-finance",
          "/portal/financier/recovery-outlook",
          "/portal/financier/raw-materials",
          "/portal/financier/production",
          "/portal/financier/reports",
          "/portal/financier/financial-visibility",
          "/portal/financier/business-health",
          "/portal/financier/ai-confidence",
          "/portal/financier/risk-panel",
        ],
        relatedArticleIds: ["gs-tenant-modes"],
      },
    ],
  },
];

export const tutorialSections: TutorialSection[] = enrichTutorialSections(tutorialSectionsRaw);

import type { TutorialSection } from "../types";

export const reportsSection: TutorialSection = {
  id: "reports",
  title: "Reports",
  description:
    "The Reports hub and every report family: merchandising, orders and purchasing, commercial and LC, production and QC, HR, inventory and outbound, exceptions and reconciliation.",
  articles: [
    {
      id: "reports-overview",
      title: "Reports hub: find the right report",
      summary:
        "Open Reports → Analytics to see a company snapshot and one tile per report, grouped by family; this page tells you which report answers which question.",
      content: `## Overview

The **Reports** menu in the sidebar collects read-only reports from every module. Start at **Reports → Analytics** (\`/app/reports\`). The page shows a small company snapshot (**Customers**, **Orders**, **Tenant**, **Report tiles**, **Top Order Status**) and then one tile per report, grouped as **Merchandising**, **Operations**, **Commercial**, **Manufacturing**, **HR**, **Inventory** and **Cross-check**. Click **Open →** on a tile.

Who uses it: owners and managers for a quick look; merchandisers, store, commercial and HR staff for their own area.

## Before you start

- Your role needs **Reports** access (permission key \`reports.access\`; \`reports.all.export\` for exports). Each report also needs access to its own module data.
- **Trade overview** appears only for buying-house or "both" companies with the Trade module switched on.
- Reports only **read** data. Nothing you do on a report changes records.

## Steps: which report answers my question?

1. *"How are my styles doing — follow-up, overdue, payments?"* → **Style 360** (\`/app/reports/style-360\`).
2. *"Which sales orders are due and how many pieces?"* → **Sales Orders** (\`/app/reports/sales-orders\`).
3. *"Which POs are open, which GRNs came in?"* → **Purchase Orders**, **GRN Summary**.
4. *"How much export LC / contract value is left for BTB?"* → **LC Outstanding**. *"Which BTB LCs mature soon?"* → **BTB LC Maturity**.
5. *"Where are my shipments?"* → **Shipment Tracking**; trade stage counts → **Trade overview**.
6. *"How is the floor and quality doing?"* → **Production Efficiency**, **QC Summary**.
7. *"Headcount, attendance, payroll totals?"* → **Employee Summary**, **Payroll Summary**.
8. *"What went out of the gate / which challans are open?"* → **Gate Pass Register**, **Delivery Challans**.
9. *"Do my books, stock and bank agree? What is still open?"* → **Data Reconciliation**, **Exceptions**.
10. Finance statements (Trial Balance, P&L, Balance Sheet, aging) and MIS are under **Finance → Reports** — see *Finance and MIS reports*.

## What happens next

Most report rows link to the real record (style, order, BTB LC, trade case). Open the record to fix what the report shows.

## Tips

- **Exporting:** **Gate Pass Register** has **Export CSV**. Screens built on the newer table (for example **Exception agents**, **Orders**) have **Columns**, **Comfortable** and **Export** buttons above the table. For the other reports, use the browser's **Print** (Ctrl+P → *Save as PDF*) or copy the table into Excel.
- **Filters:** many reports have a **Status** box — type the exact status word shown in the table (for example \`OPEN\`, \`ISSUED\`, \`APPROVED\`).
- Star (★) the reports you open often in **Ctrl+K** search; they appear under **Favorites** at the top of the sidebar.

## Common problems

- **A tile opens an empty page** → there is no data yet for that area (for example no payroll runs).
- **"You do not have access"** → ask your admin to tick **Reports → Access** and the module's **Read** on your role.
- **Numbers differ from the dashboard** → the dashboard uses the date range you picked; most reports show all current records.`,
      tags: ["reports", "analytics", "hub", "export", "filters"],
      keywords: [
        "report list",
        "MIS",
        "analytics",
        "where is the report",
        "export CSV",
        "print report",
        "PDF",
        "Excel",
        "LC",
        "BTB",
        "challan",
        "gate pass",
      ],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      featured: true,
      coverImage: "/tutorials/screens/reports.jpg",
      infographics: [
        {
          type: "diagram",
          title: "Report families",
          caption: "Every report lives under Reports → Analytics, grouped by family. Finance statements and MIS are under Finance → Reports.",
          imageSrc: "/tutorials/diagrams/reports/reports-map.svg",
          imageAlt: "Map of report families around the Reports hub: merchandising, orders, commercial, manufacturing, HR, inventory, cross-check",
        },
        {
          type: "flow",
          title: "Open a report",
          steps: [
            { label: "Reports → Analytics", href: "/app/reports" },
            { label: "Pick a tile (Open →)" },
            { label: "Filter / read" },
            { label: "Open the record to act" },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/reports.jpg",
          alt: "Reports hub with Customers, Orders, Tenant and Report tiles counters and Merchandising and Operations tiles",
          caption: "Reports → Analytics: the snapshot at the top and report tiles grouped by family.",
        },
      ],
      relatedAppRoutes: [
        "/app/reports",
        "/app/reports/merchandising",
        "/app/reports/style-360",
        "/app/reports/sales-orders",
        "/app/reports/exceptions",
      ],
      relatedArticleIds: [
        "reports-merchandising",
        "reports-orders-purchasing",
        "reports-commercial-lc",
        "reports-production-qc",
        "reports-hr",
        "reports-inventory-outbound",
        "reports-exceptions-reconciliation",
        "reports-finance-mis",
      ],
    },
    {
      id: "reports-merchandising",
      title: "Merchandising reports and Style 360",
      summary:
        "Use the Merchandising reports page for control-tower KPIs and shortcuts, and Style 360 to see open follow-up, overdue milestones and money due per style.",
      content: `## Overview

Two report screens help merchandisers and their managers:

- **Reports → Merchandising** (\`/app/reports/merchandising\`, page title **Merchandising reports**) — a **Merch control tower snapshot** (**Inquiries (action)**, **Quotations at risk (signals)**, **Samples pending**, **TNA overdue**), shortcut cards to the working screens, a **Tenant snapshot**, **Orders by status** and **Customer performance**.
- **Reports → Style 360** (\`/app/reports/style-360\`, page title **Style 360 Report**) — one row per style with **Lifecycle**, **Open actions**, **Overdue**, **Invoice**, **Received**, **Due**, **Next due** and **Last event**.

## Before you start

- Merchandising read access on your role.
- Keep TNA / follow-up dates and invoices up to date — Style 360 counts them.

## Steps: Style 360

1. Open **Reports → Style 360**.
2. Type part of a style code or name in **Search style code/name**.
3. Choose a **lifecycle** (for example \`DEVELOPMENT\`, \`ORDERED\`, \`IN_PRODUCTION\`) or keep **All lifecycle**.
4. Choose a saved view: **Critical styles**, **Shipment due this week** or **Payment overdue**. Or tick **Critical only**.
5. Click **Refresh** if you changed data in another tab.
6. Read the red **Due** column for money still to collect and **Overdue** for late milestones.
7. Click the style name to open the style and fix the problem. Use **Next** / **Per page** at the bottom to page through.

## Steps: Merchandising reports page

1. Open **Reports → Merchandising**.
2. Read the four snapshot numbers at the top.
3. Click **Open in app →** on a card (**Merch control tower**, **Merch pipeline**, **Pipeline analytics**, **Style summary report**, **Wastage report**, **Consumption reconciliation**, **Critical alerts**, **Sample development**) to go to the working screen.

## What happens next

A link such as \`/app/reports/style-360?styleId=…\` (used by other screens) shows only that style. Click **Show full report** to see all styles again.

## Tips

- Review **Payment overdue** every Monday with the commercial team.
- **TNA overdue** here matches the **TNA delay** agent in **AI Tools → Exception agents**.

## Common problems

- **"No rows found."** → clear the search, set **All lifecycle** and **No saved view**.
- **Invoice and Received are 0.00** → no commercial invoice or receipt is linked to that style yet.`,
      tags: ["reports", "merchandising", "style 360", "TNA", "follow-up", "control tower"],
      keywords: ["style report", "buyer", "overdue milestones", "payment due", "lifecycle", "critical styles", "merch KPI"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/reports-style-360.jpg",
      images: [
        {
          src: "/tutorials/screens/reports-style-360.jpg",
          alt: "Style 360 Report with search, lifecycle, saved view, Critical only and Refresh filters above a table of styles",
          caption: "Style 360: filters at the top, money and milestones per style.",
        },
        {
          src: "/tutorials/screens/reports-style-360-filters.jpg",
          alt: "Style 360 Report filtered with the Critical styles saved view",
          caption: "Saved view Critical styles narrows the list to styles that need attention.",
        },
        {
          src: "/tutorials/screens/reports-merchandising.jpg",
          alt: "Merchandising reports page with control tower snapshot numbers and shortcut cards",
          caption: "Reports → Merchandising: KPIs and shortcuts to the working screens.",
        },
      ],
      relatedAppRoutes: [
        "/app/reports/merchandising",
        "/app/reports/style-360",
        "/app/merchandising/control-tower",
        "/app/merchandising/pipeline",
        "/app/merchandising/samples",
      ],
      relatedArticleIds: ["reports-overview", "merch-pipeline", "ai-exception-agents"],
    },
    {
      id: "reports-orders-purchasing",
      title: "Sales Orders, Purchase Orders and GRN Summary reports",
      summary:
        "Quick lists of sales orders with delivery dates, purchase orders with expected dates, and goods receipts — read them to chase late deliveries and receipts.",
      content: `## Overview

Three simple list reports under **Reports**:

- **Sales Orders** (\`/app/reports/sales-orders\`) — **Order Code**, **Customer**, **Style**, **Order Date**, **Delivery**, **Qty**, **Status**, **Created**.
- **Purchase Orders** (\`/app/reports/purchase-orders\`) — **PO Code**, **Supplier**, **Order Date**, **Expected**, **Status**, **Created**.
- **GRN Summary** (\`/app/reports/grn\`) — **GRN Code**, **PO ID**, **Received Date**, **Status**, **Created**.

Merchandisers use Sales Orders for shipment planning; store and purchase staff use Purchase Orders and GRN Summary to chase suppliers.

## Before you start

- Read access to Merchandising (sales orders) or Inventory (POs, GRNs).

## Steps

1. Open **Reports → Sales Orders**. Look at the **Delivery** column: anything in the past and not shipped needs action.
2. Open **Reports → Purchase Orders**. Compare **Expected** with today's date; call the supplier for late, still-open POs.
3. Open **Reports → GRN Summary** to confirm what was received and when. **RECEIVED** means stock is in; **POSTED** means it is also in the accounts.
4. To act on a row, open the same record from the working screen (**Merchandising → Orders**, **Inventory → Purchase Orders**, **Inventory → Goods Receiving**).

## What happens next

These reports update immediately when orders, POs or GRNs are saved.

## Tips

- For searching, column choice and **Export**, use the working list screens (\`/app/orders\`, \`/app/inventory/purchase-orders\`) — they have the full table toolbar.
- **PO ID** on GRN Summary is the internal PO number; search it on the Purchase Orders screen.

## Common problems

- **A GRN shows no Received Date** → it was saved without a date; open it and complete it.
- **Order missing** → cancelled or deleted orders may not appear; check the Orders list filters.`,
      tags: ["reports", "sales orders", "purchase orders", "GRN", "delivery", "supplier"],
      keywords: ["order report", "PO report", "goods receipt report", "late delivery", "expected date", "receiving"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/reports-sales-orders.jpg",
      images: [
        {
          src: "/tutorials/screens/reports-sales-orders.jpg",
          alt: "Sales Orders Report table with order code, customer, style, dates, quantity and status",
          caption: "Reports → Sales Orders.",
        },
        {
          src: "/tutorials/screens/reports-purchase-orders.jpg",
          alt: "Purchase Orders Report table with PO code, supplier, order date, expected date and status",
          caption: "Reports → Purchase Orders: compare Expected with today.",
        },
        {
          src: "/tutorials/screens/reports-grn.jpg",
          alt: "GRN Summary table with GRN code, PO ID, received date and status",
          caption: "Reports → GRN Summary.",
        },
      ],
      relatedAppRoutes: [
        "/app/reports/sales-orders",
        "/app/reports/purchase-orders",
        "/app/reports/grn",
        "/app/orders",
        "/app/inventory/purchase-orders",
      ],
      relatedArticleIds: ["reports-overview", "inv-po-deep", "inv-grn-deep"],
    },
    {
      id: "reports-commercial-lc",
      title: "LC Outstanding, BTB LC Maturity, shipments and trade overview",
      summary:
        "See how much export LC / contract value is used by BTB LCs, which BTB LCs mature in the next 30/60/90 days, where shipments are, and trade cases by stage.",
      content: `## Overview

Commercial and finance staff use four reports to manage bank exposure and shipments:

- **LC Outstanding** (\`/app/reports/lc-outstanding\`, page title **LC / Master Contract Exposure**) — export LCs and sales contracts with **Amount**, BTB **Utilized**, **%** and **Expiry**. Totals at the top: **Total contract amount**, **BTB utilized**, **Remaining (approx.)**.
- **BTB LC Maturity** (\`/app/reports/btb-maturity\`) — back-to-back LCs grouped into buckets **0–30 days**, **31–60 days**, **61–90 days**, **90+ days** and **Overdue**, with **Accounting** status.
- **Shipment Tracking** (\`/app/reports/shipments\`) — shipments linked to trade cases: **Carrier**, **Booking**, **BL/AWB**, **ETD**, **ETA**, **Origin → Dest**.
- **Trade overview** (\`/app/reports/trade-overview\`) — **Trade cases by stage** (count and sum) and **Shipments by status**. Buying house / both companies only.

## Before you start

- Trade / commercial read access. Master contracts and BTB LCs must be entered under **Export & Import**.

## Steps

1. Open **Reports → LC Outstanding**. Check **Remaining (approx.)** before opening a new BTB LC.
2. Optional: type a status (for example \`OPEN\`) in **Status** to filter.
3. Open **Reports → BTB LC Maturity**. Look first at **Overdue** and **0–30 days** — these need payment arrangements.
4. Click a BTB reference, or **Open BTB LCs**, to work on the LC.
5. Open **Reports → Shipment Tracking** to see ETD / ETA; click **Logistics hub** to update a shipment.
6. Buying houses: open **Reports → Trade overview** and click **Refresh** for current counts.

## What happens next

Accepting BTB documents or paying a BTB LC changes its **Accounting** status (for example \`DOCUMENTS_ACCEPTED\`, \`REALIZED\`) and moves it out of the overdue bucket.

## Tips

- Bucket days are counted from today to the **Maturity** date; negative days mean overdue.
- The **AI Tools → Exception agents → LC expiry** agent warns 14 days before an LC or contract expires.

## Common problems

- **Vendor column shows a number like "#51"** → the supplier name is not loaded on this report; open the BTB LC to see the full supplier.
- **Utilized looks wrong** → check that each BTB LC is linked to the right master contract.`,
      tags: ["reports", "LC", "BTB", "maturity", "master contract", "shipment", "trade"],
      keywords: [
        "back to back LC",
        "export LC",
        "sales contract",
        "LC exposure",
        "BTB due",
        "maturity bucket",
        "ETD",
        "ETA",
        "BL",
        "AWB",
        "UD",
      ],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/reports-btb-maturity.jpg",
      images: [
        {
          src: "/tutorials/screens/reports-lc-outstanding.jpg",
          alt: "LC / Master Contract Exposure report with totals and a table of export LCs and sales contracts",
          caption: "LC Outstanding: total contract value, BTB used, and what is left.",
        },
        {
          src: "/tutorials/screens/reports-btb-maturity.jpg",
          alt: "BTB LC Maturity report with day buckets and a table of BTB LCs with maturity dates",
          caption: "BTB LC Maturity: start with Overdue and 0–30 days.",
        },
        {
          src: "/tutorials/screens/reports-shipments.jpg",
          alt: "Shipment Tracking report listing shipments with carrier, booking, BL/AWB, ETD and ETA",
          caption: "Shipment Tracking.",
        },
        {
          src: "/tutorials/screens/reports-trade-overview.jpg",
          alt: "Trade overview with trade cases by stage and shipments by status",
          caption: "Trade overview (buying house / both).",
        },
      ],
      relatedAppRoutes: [
        "/app/reports/lc-outstanding",
        "/app/reports/btb-maturity",
        "/app/reports/shipments",
        "/app/reports/trade-overview",
        "/app/commercial/btb-lcs",
        "/app/commercial/master-contracts",
        "/app/logistics",
      ],
      relatedArticleIds: ["reports-overview", "commercial-overview", "ai-exception-agents"],
    },
    {
      id: "reports-production-qc",
      title: "Production Efficiency and QC Summary reports",
      summary:
        "Check work-order completion, operations, downtime by reason, pass rate, NCR and CAPA counts in two read-only dashboards.",
      content: `## Overview

- **Production Efficiency** (\`/app/reports/production-efficiency\`) — cards **OEE-like %**, **Work orders** (completed / total), **Operations**, **Downtime (min)**, then **Downtime by reason** and **Downtime trend (recent)**.
- **QC Summary** (\`/app/reports/qc-summary\`) — cards **Pass rate**, **NCR**, **CAPA**, **Failed inspections**, then **By check type** and **Defect distribution**.

Production managers, IE and QA managers read them daily.

## Before you start

- Production / quality read access.
- Data comes from manufacturing work orders, downtime entries and inspections. If the floor does not record them, the cards show 0.

## Steps

1. Open **Reports → Production Efficiency**.
2. Read **Downtime by reason**: the reason with most **Minutes** is your first improvement target.
3. Check **Downtime trend (recent)** for bad days.
4. Open **Reports → QC Summary**. A low **Pass rate** or many **Failed inspections** means a line needs attention.
5. Use **Defect distribution** to see the most common defect codes, then open CAPA under **Quality**.

## What happens next

Closing a downtime event or a CAPA updates these numbers the next time you open the report.

## Tips

- For hour-by-hour line output use **Manufacturing → Hourly production**; for line plans use **Manufacturing → Planning**.
- Compare OEE-like % only between weeks with similar order mix.

## Common problems

- **Everything shows 0 / 0** → no work orders, operations or inspections were recorded yet.
- **Downtime still "Open"** → someone did not close the downtime event on the floor screen.`,
      tags: ["reports", "production", "efficiency", "OEE", "downtime", "QC", "quality", "NCR", "CAPA"],
      keywords: ["line efficiency", "machine downtime", "pass rate", "defects", "inspection report", "quality report"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/reports-production-efficiency.jpg",
      images: [
        {
          src: "/tutorials/screens/reports-production-efficiency.jpg",
          alt: "Production Efficiency report with OEE-like percent, work orders, operations and downtime cards",
          caption: "Production Efficiency.",
        },
        {
          src: "/tutorials/screens/reports-qc-summary.jpg",
          alt: "QC Summary report with pass rate, NCR, CAPA and failed inspections cards",
          caption: "QC Summary.",
        },
      ],
      relatedAppRoutes: ["/app/reports/production-efficiency", "/app/reports/qc-summary", "/app/production/planning"],
      relatedArticleIds: ["reports-overview", "mfg-overview", "mfg-hourly-deep", "quality-overview"],
    },
    {
      id: "reports-hr",
      title: "Employee Summary and Payroll Summary reports",
      summary:
        "Pick a month for headcount, attendance rate and pending leave; pick a year for payroll gross, deductions and net per period.",
      content: `## Overview

- **Employee Summary** (\`/app/reports/employee\`) — cards **Employees**, **Attendance rate**, **Pending leave**, and **Attendance by employee** (**Present**, **Absent**, **Leave**) for one month.
- **Payroll Summary** (\`/app/reports/payroll\`) — payroll runs by period for one year, with totals **Gross (listed runs)**, **Deductions** and **Net**.

HR officers and factory managers use them for monthly review and buyer audits. More HR reports are on **HR → Reports & Insights → HR reports** (\`/app/hr/insights?tab=reports\`).

## Before you start

- HR read access. Payroll figures may be restricted to HR managers.
- Attendance must be entered (daily entry or biometric upload) for the attendance rate to mean anything.

## Steps

1. Open **Reports → Employee Summary**.
2. Pick the **Month** at the top right. The cards and table reload.
3. Scan **Absent** and **Leave** per employee; open the employee in **HR → Employees** if something looks wrong.
4. Open **Reports → Payroll Summary** and type the **Year**.
5. Compare **Gross**, **Deductions** and **Net** per **Period**.

## What happens next

Approving leave or posting a payroll run changes these numbers immediately.

## Tips

- Run Employee Summary after the month's attendance is complete, before payroll.
- Use **HR → Reports & Insights → HR reports** for department-wise and statutory views.

## Common problems

- **Attendance rate 0.0%** → no attendance entries for that month yet.
- **"No payroll runs"** → no run exists for that year, or you do not have payroll access.`,
      tags: ["reports", "HR", "employee", "attendance", "payroll", "headcount"],
      keywords: ["staff report", "worker report", "salary report", "monthly attendance", "leave report", "payroll total"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/reports-employee.jpg",
      images: [
        {
          src: "/tutorials/screens/reports-employee.jpg",
          alt: "Employee Summary report for November 2026 with employees, attendance rate and pending leave cards",
          caption: "Employee Summary: change the Month at the top right.",
        },
        {
          src: "/tutorials/screens/reports-payroll.jpg",
          alt: "Payroll Summary report with Year box and gross, deductions and net cards",
          caption: "Payroll Summary: type the Year.",
        },
        {
          src: "/tutorials/screens/reports-hr-dashboard.jpg",
          alt: "HR Reports dashboard in the HR module",
          caption: "More HR reports: HR → Reports & Insights → HR reports.",
        },
      ],
      relatedAppRoutes: ["/app/reports/employee", "/app/reports/payroll", "/app/hr/reports"],
      relatedArticleIds: ["reports-overview", "hr-overview"],
    },
    {
      id: "reports-inventory-outbound",
      title: "Gate Pass Register, Delivery Challans and stock reports",
      summary:
        "List gate passes (with Export CSV) and delivery challans, and find the stock summary, ledger and valuation reports under Inventory.",
      content: `## Overview

- **Gate Pass Register** (\`/app/reports/gate-passes\`) — every gate pass with **Code**, **Status**, **Purpose**, **Destination**, **Vehicle**. Has **Status filter** and **Export CSV**.
- **Delivery Challans** (\`/app/reports/challans\`, page title **Delivery Challans Report**) — cards **Total**, **Posted**, **Other / draft** and a table with **Code**, **Customer**, **Delivery**, **Status**, **Lines**.
- Stock reports live in **Inventory → Reports and analytics**: **Stock Summary**, **Inventory Summary (FIFO)**, **Dashboard**, **Ledger**, **Valuation**.

Store keepers, security and accounts use them to check what left the factory.

## Before you start

- Inventory read access.

## Steps

1. Open **Reports → Gate Pass Register**.
2. Type a status (for example \`DRAFT\` or \`APPROVED\`) in **Status filter**, or leave it empty for all.
3. Click **Export CSV** to download the list (\`gate-passes-<date>.csv\`) for the security office.
4. Open **Reports → Delivery Challans**. **Other / draft** shows challans not yet posted — follow them up.
5. For stock quantities and values, open **Inventory → Reports and analytics → Stock Summary** or **Valuation**.

## What happens next

Posting a challan moves it from **Other / draft** to **Posted** and reduces stock.

## Tips

- Export the gate pass register daily and match it with the gate logbook.
- Gate passes and challans are created under **Inventory → Outbound**.

## Common problems

- **The last column of the gate pass table says Yes / No** → it shows whether the guard acknowledged the pass (the header reads "Created"); the CSV calls it \`guard_ack\`.
- **Challan not in the list** → filter is set; clear **Status**.`,
      tags: ["reports", "gate pass", "delivery challan", "inventory", "stock", "outbound", "export CSV"],
      keywords: ["challan report", "gate pass register", "security gate", "goods out", "stock report", "stock ledger", "valuation"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/reports-gate-passes.jpg",
      images: [
        {
          src: "/tutorials/screens/reports-gate-passes.jpg",
          alt: "Gate Pass Register with Status filter and Export CSV button",
          caption: "Gate Pass Register: Export CSV downloads the list.",
        },
        {
          src: "/tutorials/screens/reports-challans.jpg",
          alt: "Delivery Challans Report with Total, Posted and Other / draft cards",
          caption: "Delivery Challans: follow up Other / draft.",
        },
        {
          src: "/tutorials/screens/reports-inventory-stock-summary.jpg",
          alt: "Inventory Stock Summary screen",
          caption: "Stock reports: Inventory → Reports and analytics.",
        },
      ],
      relatedAppRoutes: [
        "/app/reports/gate-passes",
        "/app/reports/challans",
        "/app/inventory/stock-summary",
        "/app/inventory/stock-ledger",
        "/app/inventory/stock-valuation",
      ],
      relatedArticleIds: ["reports-overview", "inv-overview"],
    },
    {
      id: "reports-exceptions-reconciliation",
      title: "Exceptions and Data Reconciliation: cross-checks",
      summary:
        "See open merchandising alerts and open trade cases in one place, and check that the trial balance, stock valuation and bank reconciliations agree.",
      content: `## Overview

- **Exceptions** (\`/app/reports/exceptions\`, page title **Exceptions & Open Items**) — **Merch alerts (open)** with **Severity**, **Title**, **Type**, **Order**, **SLA**; and **Trade cases (open)** with **Reference**, **Stage**, **ETD** and a **View** link.
- **Data Reconciliation** (\`/app/reports/reconciliation\`) — three checks: **General ledger (trial balance)** (debit must equal credit → **Balanced** or **Mismatch — review TB**), **Inventory valuation (FIFO)** total, and **Bank reconciliation** open sessions.

Managers and accountants use them weekly and at month-end.

## Before you start

- Merchandising and trade read access for Exceptions; finance and inventory read access for Reconciliation.

## Steps

1. Open **Reports → Exceptions**. Click an **Order** link or **View** on a trade case to act on it.
2. Open **Reports → Data Reconciliation**.
3. If the trial balance card is amber with **Mismatch — review TB**, click **Trial balance** at the top and find the unbalanced entries with your accountant.
4. Compare the **Inventory valuation (FIFO)** figure with the stock accounts in the chart of accounts (**Stock valuation** link).
5. If **Open / non-finalized sessions** is above 0, click **Open bank reconciliation** and finish them.

## What happens next

When all three cards are clean, month-end closing is much easier.

## Tips

- For a fuller, AI-assisted list of late TNA, LC expiry and BOM gaps, use **AI Tools → Exception agents**.
- Finance-specific exception reports (for example vouchers without narration) are under **Finance → Reports → Exception Reports**.

## Common problems

- **Mismatch — review TB** → usually a voucher posted on one side only or an opening balance difference. Ask your accountant.
- **No open alerts** while the dashboard shows critical alerts → this page lists only alerts with status OPEN; critical alerts on the dashboard may come from other rules.`,
      tags: ["reports", "exceptions", "reconciliation", "trial balance", "bank reconciliation", "alerts", "month-end"],
      keywords: ["open items", "TB mismatch", "cross check", "audit", "month end close", "unreconciled", "trade case"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/reports-reconciliation.jpg",
      images: [
        {
          src: "/tutorials/screens/reports-exceptions.jpg",
          alt: "Exceptions and Open Items report with merch alerts and open trade cases tables",
          caption: "Exceptions & Open Items.",
        },
        {
          src: "/tutorials/screens/reports-reconciliation.jpg",
          alt: "Data Reconciliation with trial balance, inventory valuation and bank reconciliation cards",
          caption: "Data Reconciliation: amber card means the trial balance does not balance.",
        },
      ],
      relatedAppRoutes: [
        "/app/reports/exceptions",
        "/app/reports/reconciliation",
        "/app/accounts/reports/trial-balance",
        "/app/banking/reconciliation",
        "/app/accounts/reports/exceptions",
      ],
      relatedArticleIds: ["reports-overview", "ai-exception-agents", "fin-overview"],
    },
    {
      id: "reports-finance-mis",
      title: "Finance and MIS reports: where to find them",
      summary:
        "Trial Balance, Financial Statements, Cash Flow, AR/AP Aging and the MIS dashboards are in Finance → Reports, not in the Reports menu.",
      content: `## Overview

Accounting reports have their own menu: **Finance → Reports**. They are explained in the Finance guides. This page is a signpost so you do not search the wrong menu.

## Before you start

- Finance read access. MIS screens can be switched off by an admin (**Settings → Configuration → Enable MIS reports**).

## Steps: open the right finance report

1. **Day Book** — \`/app/accounts/reports/day-book\`.
2. **Trial Balance** — \`/app/accounts/reports/trial-balance\`.
3. **Financial Statements** (P&L, Balance Sheet) — \`/app/accounts/reports/financial-statements\`.
4. **Cash Flow** — \`/app/accounts/reports/cash-flow\`.
5. **AR/AP Aging** — \`/app/accounts/reports/ar-ap-aging\`.
6. **Ledger Activity**, **Exception Reports**, **Voucher Analytics**, **Group Summary**, **Ratio Analysis** — under the same menu.
7. **MIS**: **Financial MIS Dashboard** (\`/app/finance/mis\`), **Fund Flow**, **MIS Ratios**, **Comparative**, **Cash Scenarios**.

## What happens next

Finance reports follow the **financial year** set in **Settings → Configuration** (for Bangladesh usually July–June).

## Tips

- Use **Reports → Data Reconciliation** for a quick yes/no on whether the trial balance balances.
- Weekly management summaries: **AI Tools → Weekly AI reports**.

## Common problems

- **MIS links missing from the sidebar** → **Enable MIS reports** is switched off in Configuration.`,
      tags: ["reports", "finance", "MIS", "trial balance", "P&L", "balance sheet", "aging"],
      keywords: ["accounts report", "profit and loss", "balance sheet", "fund flow", "ratio", "cash flow statement", "day book"],
      estimatedMinutes: 2,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/reports-finance-mis.jpg",
      infographics: [
        {
          type: "flow",
          title: "Finance reports menu",
          steps: [
            { label: "Day Book", href: "/app/accounts/reports/day-book" },
            { label: "Trial Balance", href: "/app/accounts/reports/trial-balance" },
            { label: "Financial Statements", href: "/app/accounts/reports/financial-statements" },
            { label: "AR/AP Aging", href: "/app/accounts/reports/ar-ap-aging" },
            { label: "MIS Dashboard", href: "/app/finance/mis" },
          ],
        },
      ],
      relatedAppRoutes: [
        "/app/accounts/reports/trial-balance",
        "/app/accounts/reports/financial-statements",
        "/app/accounts/reports/cash-flow",
        "/app/accounts/reports/ar-ap-aging",
        "/app/finance/mis",
      ],
      relatedArticleIds: ["reports-overview", "fin-overview", "settings-configuration"],
    },
  ],
};

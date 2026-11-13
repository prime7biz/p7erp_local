import type { TutorialSection } from "../types";

export const manufacturingSection: TutorialSection = {
  id: "manufacturing",
  title: "Manufacturing",
  description:
    "Operations Control Tower, production setup, planning, line plan board, cutting, sewing, finishing, hourly output, scan station, crew and efficiency.",
  articles: [
    {
      id: "mfg-overview",
      title: "Manufacturing overview: the shop-floor map",
      summary:
        "One-page map of the Manufacturing and Operations menus: what each screen is for, in which order to use them, and how an order moves from plan to challan.",
      content: `## Overview

**Manufacturing** is where the factory turns a confirmed order into finished, checked and packed garments. It is used by **planners**, **IE (industrial engineering)**, **line supervisors**, **cutting / sewing / finishing in-charges** and **production managers**.

The menu follows the real work order:

1. **Set up** the factory once (lines, shifts, calendar, operation bulletins).
2. **Plan** which order runs on which sewing line and when.
3. **Execute** every day: cutting, sewing, finishing, hourly output, bundle scans, crew sheets.
4. **Check quality** (see the **Quality** section of Help).
5. **Measure** output, efficiency and cost.

## Before you start

- The **Manufacturing** menu shows only for companies of type **manufacturer** or **both**. A buying-house-only company does not see it.
- **Operations → Control Tower** and **Scan station** can be switched on or off by an admin in **Settings → Configuration**.
- **Units (optional)** links (Knitting, Dyeing, Printing, AOP, Embroidery, Elastic, Washing and their hourly pages) appear only after they are ticked in **Production setup → Optional units**.
- Production needs master data from other modules: a confirmed **order** with style and quantity, an approved **order BOM**, and materials received through **GRN**.

## Steps — where to click for each job

1. **First-time setup:** open **Manufacturing → Production setup** (\`/app/production/setup\`) and add shifts and sewing lines. Then mark weekends and holidays in **Factory calendar** (\`/app/production/calendar\`).
2. **IE data:** add operations in **Operations library** and an **Operation bulletin** (OB) with SMV for each style (\`/app/production/ie/bulletins\`).
3. **Check readiness:** open **Planning** (\`/app/production/planning\`). The **Pipeline** tab shows each order's readiness chain (Style, OB, Approval, Materials, Line).
4. **Book lines:** open **Line plan board** (\`/app/production/line-plan\`) to see which order sits on which line and fix **Planning conflicts**.
5. **Cut:** **Cutting pipeline** (\`/app/production/cutting/pipeline\`) — marker → lay → cut ticket → bundles and barcode PDF.
6. **Sew and finish:** count bundles on the **Scan station** and enter output on **Hourly — Cutting / Sewing / Iron / Finishing**. Work-order operations are started and completed on **Cutting / Sewing / Finishing (shop floor)**.
7. **Check quality:** **Shop-floor QC** (\`/app/production/quality\`) for hourly inline checks; **Quality → Inspections** and **CAPA** for formal checks.
8. **Measure:** **Production Overview** (\`/app/production\`) for today's output and efficiency per line; **Cost & CM** for costs.

## What happens next

- Released work orders appear in the shop-floor operation queue.
- Hourly entries feed **Production Overview**, the **AI efficiency forecast** on Planning and the line-balance hints on shop-floor pages.
- When production is complete, the store raises the **Delivery Challan** in Inventory. If your admin turned on **Open CAPA blocks challan**, an open CAPA for the order stops that challan from posting.

## Tips

- Star (★) your shop-floor screens in **Ctrl+K** search so they sit under **Favorites** at the top of the sidebar — handy on the shop floor.
- Most shop-floor screens work on a tablet. Hourly and Scan station screens have an **English / বাংলা** switch.
- Manufacturing **TNA** (\`/app/tna/dashboard\`) and **Sample Requests** are secondary; the main TNA calendar is **Merchandising → Follow-up**.

## Common problems

- **"I can't see Manufacturing in the sidebar."** → Your company type is buying house. Ask an admin to check the tenant type.
- **"Knitting / Dyeing links are missing."** → Tick the unit in **Production setup → Optional units**. Knitting also needs **Enable Knitting module** in **Settings → Configuration**.
- **"Line status table says: No sewing lines yet — add lines in setup."** → Add sewing lines in **Production setup → Sewing lines**.`,
      tags: ["manufacturing", "production", "shop floor", "planning", "overview"],
      keywords: [
        "production",
        "factory",
        "garments production",
        "RMG",
        "sewing",
        "cutting",
        "finishing",
        "line",
        "floor",
        "kaj",
        "production flow",
        "module map",
      ],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      audience: "production",
      coverImage: "/tutorials/screens/production.jpg",
      infographics: [
        {
          type: "diagram",
          title: "Manufacturing module map",
          caption: "Set up once, plan, execute every day, check quality, then measure.",
          imageSrc: "/tutorials/diagrams/manufacturing/module-map.svg",
          imageAlt:
            "Five columns: Set up (Production setup, Factory calendar, IE), Plan (Planning, Line plan board, Manufacturing Orders, Control Tower), Execute (Cutting pipeline, shop floor, Scan station, Hourly, crew), Check quality, Measure.",
        },
        {
          type: "diagram",
          title: "Shop-floor flow for one order",
          caption: "Order → Plan → Line allocation → Cutting → Sewing → Finishing → QC → Packing / Challan.",
          imageSrc: "/tutorials/diagrams/manufacturing/shop-floor-flow.svg",
          imageAlt:
            "Eight-step flow from confirmed order to planning, line allocation, cutting, sewing, finishing, QC and delivery challan, with the screen used at each step.",
        },
        {
          type: "flow",
          title: "Open the screens in order",
          steps: [
            { label: "Production setup", href: "/app/production/setup" },
            { label: "Planning", href: "/app/production/planning" },
            { label: "Line plan board", href: "/app/production/line-plan" },
            { label: "Cutting pipeline", href: "/app/production/cutting/pipeline" },
            { label: "Hourly — Sewing", href: "/app/production/hourly/sewing" },
            { label: "Shop-floor QC", href: "/app/production/quality" },
            { label: "Delivery Challans", href: "/app/inventory/delivery-challans" },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/production.jpg",
          alt: "Production overview with date picker, KPI cards, line status table, quick actions and WIP journal vouchers.",
          caption: "Production Overview: today's output, efficiency, crew fill rate, CM alerts and cutting bundles.",
        },
      ],
      relatedAppRoutes: [
        "/app/production",
        "/app/production/setup",
        "/app/production/planning",
        "/app/production/line-plan",
        "/app/production/manufacturing-orders",
        "/app/operations/control-tower",
      ],
      relatedArticleIds: [
        "mfg-setup",
        "mfg-planning-deep",
        "mfg-line-plan-board",
        "mfg-cutting-pipeline",
        "mfg-hourly-deep",
        "quality-overview",
        "ops-control-tower",
      ],
    },
    {
      id: "ops-control-tower",
      title: "Operations Control Tower: one read-only view of every order",
      summary:
        "Read-only screen that joins orders, material readiness, line bookings, capacity load, master LC, alerts and finance exposure for a delivery window.",
      content: `## Overview

The **Control Tower** (\`/app/operations/control-tower\`, sidebar **Operations → Control Tower**) gives managers one screen to see how every order in a delivery window is doing. It is **read-only** — you cannot change orders, stock, plans or vouchers here. Use it in the morning meeting to spot late or blocked orders, then open the real screen to fix them.

## Before you start

- An admin must tick **Enable Operations Control Tower** in **Settings → Configuration**. Until then the page says *"Control Tower is disabled for this tenant."*
- What you see depends on your role:
  - **Admin, owner, manager:** everything.
  - **Merchandiser:** order grid, **Master LC ladder**, alerts.
  - **Planner, supervisor, operator:** order grid, **Capacity heatmap**, alerts.
  - **Finance:** order grid, master LC, **Finance snapshot**, alerts.
- The heatmap and finance panels are hidden on a phone-size screen; use a desktop for them.

## Steps

1. Open **Operations → Control Tower**.
2. Set **Delivery from** and **Delivery to**. The window can be at most **180 days**.
3. Click **Refresh**.
4. Read the four cards: **Orders in range**, **Avg material ready** *(actual)*, **Peak SMV load** *(projected)* and **BTB exposure row**.
5. In **Order execution**, check each order's **Pipeline** stage, **LC status**, material readiness, **Line** and **Reservation** (DRAFT, SOFT BOOKED, FIRM BOOKED…).
6. Use the row's **Actions** to open the order, the **Line plan board** for its delivery date, or **Master contracts**.
7. Open **Capacity heatmap** (click the heading to expand) to see SMV-minutes booked per line and day — firm and soft bookings together.
8. Open **Master LC ladder**, pick a master contract, and read its BTB count and linked orders.
9. Read **Alert center** for open merchandising alerts and **Finance snapshot** for funded vs non-funded BTB exposure.

## What happens next

Nothing changes from this screen. To act, open the linked screen: the order (\`/app/orders\`), **Line plan board** (\`/app/production/line-plan\`) or **Master contracts**.

## Tips

- Labels in *italics* matter: *actual* figures come from posted documents and stock; *projected* figures are estimates from plans.
- From an order page you can open the Control Tower focused on that order (the link adds \`?focus_order=\`).
- **Auto-propose line bookings** in **Settings → Configuration** lets the system create DRAFT bookings as orders move; they then show in the Reservation column.

## Common problems

- **"Orders in range: 0"** → Your window does not contain any delivery dates. Widen **Delivery from / to** (max 180 days) and click **Refresh**.
- **"No master contracts linked to orders in this window."** → Orders are not yet linked to a master LC in Commercial.
- **Heatmap or finance panel missing** → Your role does not include it, or the screen is too narrow.

## Manufacturing intelligence panels

An admin can tick **Manufacturing intelligence (read-only)** in **Settings → Configuration → More features**. A **Manufacturing intelligence** section then appears on the Control Tower for admin, owner, manager and planning roles. It is read-only and shows no finance data. It has its own **Window from / to** (max 180 days, default today + 89 days) and an optional **Factory unit**.

- **Capacity: legacy vs corrected preview** — *Legacy (current formula)* is what the planning screens use today. *Corrected preview* is shift operator-minutes × efficiency ÷ SMV. The difference column shows how far apart they are. Turn on **Corrected planning maths preview** to see corrected values.
- **Line loading by day** — one row per sewing line, one cell per day. Letters and colours: **O** overloaded, **L** loaded, **I** idle, **–** closed day, **?** unknown. A dashed **s** cell means only soft bookings. Hover a cell for firm / soft minutes and utilization. Bookings without an SMV are listed under the grid.
- **Order readiness** — pick an order to see its checks (commercial, technical approval, materials, capacity, finance, full readiness). **Blockers** name the department that must act; **Information** lists notes only. Material lines show required, available and short quantities; stock is not yet shared out between orders, so two orders can look covered by the same stock. Turn on **Readiness uses the order BOM** to judge materials from the order's own BOM.
- **Delivery risk** — counts of orders **On track**, **At risk**, **Late**, **Complete** and **Unknown**, and for the picked order the **Ex-factory target** (the order's delivery date) with optimistic, likely and pessimistic finish dates.

**UNKNOWN** means a needed input is missing (for example SMV, operators, a firm line plan or the corrected maths switch). It does not mean "fine". The grey or amber chips next to it say exactly what is missing.

## Planning tabs (Phase 2)

More switches in **Settings → Configuration → More features** add tabs next to **Overview** in the Manufacturing intelligence section. Each one needs **Manufacturing intelligence (read-only)** on first.

- **Material allocation (hold stock for orders)** adds **Materials** — see *Materials tab: hold stock and link purchase orders*.
- **Integrated planning** adds **Plan changes**, **Tentative demand** and **People & machines** — see the matching articles. On **Overview** a picked order then also shows its **Outside processes (route)** and, when the order has a style, the style's **Standard SMV**.
- **Four-eyes approval for plan changes** stops the person who proposed a plan change from approving it. Settings refuses it with fewer than 2 active users who can approve plans.
- **Order cost at completion** and **Cash requirement forecast** add a **Cost & cash** tab with read-only money estimates (never posted). Only admin / manager or roles with finance access and the MIS report view see it — see *Cost & cash: order cost at completion and the factory cash requirement*.
- **Predictions** adds a **Predictions** tab: likely / safe / worst-case delivery dates, line efficiency from your own history, supplier lateness, unusual production and daily bottleneck recommendations. They are statistics and never change plans — see *Predictions: delivery forecasts, bottlenecks and recommendations*. Alert links open \`/app/control-tower?tab=predictions&finding=…\`, which goes straight to the finding.
- **Forward plan** adds a **Forward plan** tab: capacity against confirmed, booked, tentative and forecast work for 90-180 days, what-if scenarios, a finance-limited view and (with Integrated planning) a scheduler whose proposals go to **Plan changes** for approval — see *Forward plan: capacity vs demand, scenarios and the scheduler*. Link: \`/app/control-tower?tab=forward-plan\`.

Row actions on these tabs use the single **Actions** menu; risky actions (release, cancel, deactivate) always ask you to confirm.`,
      tags: ["operations", "control tower", "planning", "master lc", "dashboard"],
      keywords: [
        "control tower",
        "order status",
        "OTD",
        "on-time delivery",
        "capacity",
        "heatmap",
        "BTB",
        "LC",
        "master LC",
        "morning meeting",
        "reservation",
      ],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-13",
      audience: "management",
      coverImage: "/tutorials/screens/ops-control-tower-orders.jpg",
      infographics: [
        {
          type: "steps",
          title: "Read the Control Tower in four steps",
          steps: [
            {
              title: "Pick a delivery window",
              body: "Set **Delivery from** / **Delivery to** (max 180 days) and click **Refresh**.",
              imageSrc: "/tutorials/screens/operations-control-tower.jpg",
              imageAlt: "Control Tower date filter with Delivery from, Delivery to and Refresh button.",
              href: "/app/operations/control-tower",
            },
            {
              title: "Scan the order grid",
              body: "Each row shows pipeline stage, LC status, material readiness, line and reservation. Use **Actions** to open the order or line plan.",
              imageSrc: "/tutorials/screens/ops-control-tower-orders.jpg",
              imageAlt:
                "Control Tower for 01/01/2026 to 29/06/2026: 4 orders, 64% average material ready, and the order grid with pipeline, LC status, material %, line, reservation and planned end.",
            },
            {
              title: "Check capacity",
              body: "**Capacity heatmap**: SMV-minutes per line per day (firm + soft). Dark cells mean a busy line.",
            },
            {
              title: "Check money and alerts",
              body: "**Master LC ladder**, **Alert center** and **Finance snapshot** (by role).",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/operations/control-tower", "/app/settings/config", "/app/orders"],
      relatedArticleIds: [
        "mfg-overview",
        "mfg-planning-deep",
        "mfg-line-plan-board",
        "gs-sidebar",
        "mfg-intel-materials",
        "mfg-intel-plan-changes",
        "mfg-intel-tentative-demand",
        "mfg-intel-people-machines",
        "mfg-intel-cost-cash",
        "mfg-intel-predictions",
        "mfg-intel-forward-plan",
      ],
    },
    {
      id: "mfg-intel-materials",
      title: "Materials tab: hold stock and link purchase orders to an order",
      summary:
        "Preview and confirm stock holds and purchase-order links for an order, release or move them, and fix allocation problems.",
      content: `## Overview

The **Materials** tab (Control Tower → Manufacturing intelligence → **Materials**) shares stock between orders. A **hold** keeps usable stock for one order; a **link** reserves quantity on an open purchase order (PO) so you know when the rest arrives. With this switched on, **Order readiness** counts a material line as ready only when issued stock plus the order's own hard holds cover it.

Holds are advisory: they never post stock movements, valuation or vouchers, and the store can still issue material.

## Before you start

- An admin ticks **Material allocation (hold stock for orders)** in **Settings → Configuration → More features** (Manufacturing intelligence must be on).
- The order needs an **approved (or frozen) order BOM**.
- **Hard holds** are for confirmed orders (New, Confirmed, In progress). **Tentative holds** are for draft orders, need an expiry date (at most 180 days) and never count as ready.

## Steps

1. Open **Operations → Control Tower**, scroll to **Manufacturing intelligence** and click the **Materials** tab.
2. Pick the **Order**. The table shows Required, Issued, Held, Tentative held, Linked to PO and **Still short** per item.
3. Choose the **Kind of hold** and click **Preview allocation**. Nothing is saved yet: the preview lists what would be held from stock, which PO quantities would be linked (with expected dates) and what stays short.
4. Click **Confirm allocation**. If stock or demand changed in the meantime, the screen says so, refreshes the preview and asks you to confirm again.
5. Use a hold's or link's **Actions** menu to **Check item stock**, **Release** it, or (admin / manager) **Move to another order**.
6. Open **Allocation run** to preview and confirm many orders at once (in priority order: in production, then by plan start, then by delivery date).
7. Check **Allocation problems** for holds or links that no longer fit (order cancelled, BOM line removed, more held than needed, PO quantity gone).

## Who can do what

- Releasing a **hard** hold or link of a **confirmed** order, and moving held material between orders, is for **admin / manager** only and needs a reason of at least 10 characters. Other users see **Release (manager only)** greyed out.
- Tentative and expired holds can be released by planners with approval rights.

## Common problems

- **"The Order BOM must be approved or frozen first"** → Approve the order BOM in Merchandising, then preview again.
- **"Hard allocation is only for confirmed orders"** → Confirm the order, or use a tentative hold for a draft order.
- **"You are not allowed to do this"** → Your role lacks the permission; ask an admin.`,
      tags: ["materials", "allocation", "reservation", "hold", "purchase order", "control tower", "manufacturing intelligence"],
      keywords: ["material hold", "stock reservation", "peg", "pegging", "ATP", "available to promise", "allocation run", "release hold"],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-12",
      audience: "planning",
      infographics: [
        {
          type: "steps",
          title: "Allocate materials safely",
          steps: [
            { title: "Pick the order", body: "Materials tab → **Order**. Check **Still short**." },
            { title: "Preview", body: "Choose hard or tentative and click **Preview allocation**. Nothing is saved." },
            { title: "Confirm", body: "Click **Confirm allocation**. A stale preview is refreshed automatically." },
            { title: "Review", body: "Use **Actions** on holds and links; check **Allocation problems**." },
          ],
        },
      ],
      relatedAppRoutes: ["/app/operations/control-tower", "/app/settings/config"],
      relatedArticleIds: ["ops-control-tower", "mfg-intel-plan-changes", "inv-overview"],
    },
    {
      id: "mfg-intel-plan-changes",
      title: "Plan changes: propose, preview and approve line booking changes",
      summary:
        "Collect line booking changes, see the delivery / overload / material impact before saving, and let an approver apply them.",
      content: `## Overview

The **Plan changes** tab turns line booking changes into a **proposal** that someone with approval rights applies. Before you send it you see the expected impact: each affected order's likely finish date and delivery band (before → after), extra overloaded days per line, and material warnings when a firm booking starts before materials are ready. The impact is an estimate; nothing moves until the proposal is approved.

## Before you start

- An admin ticks **Integrated planning** in **Settings → Configuration → More features**.
- Proposing needs the plan write permission; approving and rejecting need plan approval.
- **Firm booked** is only allowed for confirmed orders. A booking that is already in progress cannot be cancelled.

## Steps

1. Open the **Plan changes** tab. Set **From / To** (max 180 days) and optionally a **Sewing line**.
2. In **Line bookings**, open a row's **Actions** → **Change booking…** to change the line, dates, quantity, status, operators or efficiency, then **Add to proposal**. Only the fields you change are sent. Or choose **Cancel booking**.
3. Click **Add booking** to add a new booking for an order.
4. In **Your proposed change**, check the list (max 50 items) and click **Preview impact**. The panel says *Preview only - nothing is saved yet*.
5. Write a **Reason** (at least 5 characters), optionally a title, and click **Propose for approval**. The button unlocks only after **Preview impact** for the current list. A double click never creates two proposals.
6. An approver opens **Proposed and past changes**, uses **Actions** → **View details**, then **Approve & apply** (optional note; the dialog shows the impact calculated at proposal time) or **Reject** (note required). The proposer can **Cancel proposal** while it waits.

Users without planning write access see the bookings but not **Add booking** or the booking **Actions**.

## Common problems

- **"This change or the line plan changed since you opened it; the list was reloaded - review it again"** → Someone changed the bookings or the proposal. Nothing was written; the list reloads, so review it again (and propose a new change if the plan moved).
- **"Four-eyes rule: someone other than the proposer must approve this change"** → Four-eyes approval is on; ask another approver.
- **"only a confirmed order can have a FIRM_BOOKED row"** → Confirm the order first or use Soft booked.
- **"A scheduler booking in this change now starts inside the frozen zone, so nothing was applied"** → A scheduler proposal (title *Scheduler proposal …*) waited past the frozen zone. Run the scheduler preview again on the **Forward plan** tab and send a new proposal — see *Forward plan: capacity vs demand, scenarios and the scheduler*.`,
      tags: ["planning", "line plan", "plan revision", "approval", "four-eyes", "control tower", "manufacturing intelligence"],
      keywords: ["what-if", "impact", "reschedule", "line booking", "propose", "approve plan"],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-13",
      audience: "planning",
      infographics: [
        {
          type: "steps",
          title: "From idea to applied plan",
          steps: [
            { title: "Collect", body: "Use booking **Actions** or **Add booking** to build the proposal." },
            { title: "Preview impact", body: "See delivery, overload and material warnings. Nothing is saved." },
            { title: "Propose", body: "Add a reason and click **Propose for approval**." },
            { title: "Approve", body: "An approver uses **Approve & apply** or **Reject**." },
          ],
        },
      ],
      relatedAppRoutes: ["/app/operations/control-tower", "/app/production/line-plan", "/app/settings/config"],
      relatedArticleIds: ["ops-control-tower", "mfg-line-plan-board", "mfg-intel-tentative-demand", "mfg-planning-deep", "mfg-intel-forward-plan"],
    },
    {
      id: "mfg-intel-tentative-demand",
      title: "Tentative demand: book inquiries and quotations as soft load",
      summary:
        "Put likely inquiry / quotation work on a sewing line as soft load with a confidence %, without reducing firm capacity.",
      content: `## Overview

The **Tentative demand** tab lets planners show work that may come (an inquiry or a quotation) on a sewing line. It is **soft load**: line loading shows it as soft minutes, weighted by your confidence %, but it **never reduces firm capacity or promise dates**. When an order is created from the inquiry or quotation, the order's own booking counts and the tentative one stops counting.

## Before you start

- An admin ticks **Integrated planning** in **Settings → Configuration → More features**.
- Each booking needs a confidence % (0-100) unless a default is set for its stage in **Planning settings**.
- A booking expires after the default number of days (or the date you choose, at most 180 days ahead).

## Steps

1. Open the **Tentative demand** tab. The top cards show how many bookings are **counted** and their SMV minutes (plain and weighted by confidence).
2. Click **Add tentative booking**. Choose **Quotation** or **Inquiry** and search for it, then the **Sewing line**, dates, **Planned quantity**, **Confidence %** and optionally **Expires on**. Click **Add booking**.
3. Use a row's **Actions** → **Edit** to change it, or **Cancel booking** (asks to confirm).
4. The **Counted?** column says why a booking is not counted: expired, an order now exists, a quotation booking already covers the inquiry, or a newer quotation replaced it.
5. Approvers can change **Planning settings**: default confidence for inquiries and quotations, default expiry (1-180 days) and the receipt buffer (0-60 days added after purchase-order expected dates). When a **Cost & cash** switch is on, a **Cost & cash timing** box adds export document / usance days, BTB usance days and a cost per minute override (changing them also needs finance access).

## Common problems

- **"An order already exists for this inquiry / quotation; book the order instead"** → Use **Plan changes** to book the order.
- **"No SMV: minutes unknown"** → Approve a standard SMV for the style on **People & machines**, or link an approved operation bulletin.`,
      tags: ["planning", "tentative", "inquiry", "quotation", "soft booking", "capacity", "manufacturing intelligence"],
      keywords: ["forecast", "pipeline demand", "confidence", "probability", "soft load"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-13",
      audience: "planning",
      relatedAppRoutes: ["/app/operations/control-tower", "/app/settings/config"],
      relatedArticleIds: ["ops-control-tower", "mfg-intel-plan-changes", "mfg-intel-people-machines", "mfg-intel-cost-cash"],
    },
    {
      id: "mfg-intel-people-machines",
      title: "People & machines: assign operators and machines to sewing lines",
      summary:
        "Dated line assignments for people and machines, used by capacity instead of the line default; plus style standard SMV.",
      content: `## Overview

The **People & machines** tab records who works on which sewing line, and which machine stands on it, from a first day (and a last day when known). Capacity then counts **operators from assignments** (and from today's attendance when it is recorded) instead of the line's default operator count. Hover a line-loading cell on **Overview** to see the assigned operators and machines for that day.

People are shown by code and name only.

## Before you start

- An admin ticks **Integrated planning** in **Settings → Configuration → More features**.
- One person or machine can have only one active assignment for the same dates.
- Picking a person searches active employees by code or name (planning write access is enough; no HR access needed).

## Steps

1. Open the **People & machines** tab and choose **People** or **Machines**.
2. Filter by **Sewing line** and **Working on** date (empty = any date). Tick **Show deactivated** to see old entries.
3. Click **Assign a person** (or **Assign a machine**). Pick the person / machine, the **Sewing line**, the **Role** and optional **Shift** for people, the **First day** and optional **Last day**. Click **Assign**.
4. Use a row's **Actions** → **Edit**, **End assignment** (choose the last day) or **Deactivate** (for a wrong entry; asks to confirm).
5. In **Style standard SMV**, search a style to see its approved minutes per piece. Approvers can enter the SMV, where it comes from, a confidence and a reason, then click **Approve SMV**.

## Common problems

- **"This assignment changed since you opened it; the list was reloaded"** → Someone else edited it; the list reloads, try again.
- **Overlap error** → The person or machine already has an active assignment for those dates; end the old one first.
- **"The sewing line is not active" / "The employee is not active"** → Activate it in Production setup / HR first.`,
      tags: ["planning", "operators", "machines", "line assignment", "SMV", "capacity", "manufacturing intelligence"],
      keywords: ["manpower", "line balancing", "operator allocation", "machine allocation", "standard SMV"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-13",
      audience: "planning",
      relatedAppRoutes: ["/app/operations/control-tower", "/app/production/setup"],
      relatedArticleIds: ["ops-control-tower", "mfg-setup", "mfg-ie-bulletins", "mfg-intel-tentative-demand"],
    },
    {
      id: "mfg-intel-cost-cash",
      title: "Cost & cash: order cost at completion and the factory cash requirement",
      summary:
        "Read-only estimates of what each confirmed order will cost and earn, and a weekly forecast of the cash the factory needs, with the financing gap.",
      content: `## Overview

The **Cost & cash** tab (Control Tower → Manufacturing intelligence → **Cost & cash**) answers two questions:

- **What will this order cost when it is finished, and what margin is left?** (*Order cost at completion*)
- **How much cash does the factory need in the coming weeks, and when does it run short?** (*Cash requirement*)

Everything on this tab is an **estimate or forecast**. The tab says so at the top: *Estimate / forecast - not posted to the accounts*. Nothing here creates a voucher or changes the books.

## Who can see it

- An admin ticks **Order cost at completion** and / or **Cash requirement forecast** in **Settings → Configuration → More features** (Manufacturing intelligence must be on). Each switch adds its own card.
- Money is shown only to **admin / manager** users, or to roles that have **finance access** and the **MIS report view**. Other planners do not see the tab at all; they still see quantities and dates on the other tabs.

## Value classes: what each label means

Every amount carries a small label so different kinds of numbers are never mixed:

- **Actual** - posted in the accounts (the ledger).
- **Committed** - ordered on purchase orders but not billed yet.
- **Estimate** - calculated by the system, for example the material still to buy or the conversion cost.
- **Forecast** - an expected cash movement on a future date.

## Order cost at completion

1. Open the **Cost & cash** tab. The **Order cost at completion** card lists confirmed orders (New, Confirmed, In progress), earliest ex-factory date first, 50 per page.
2. Read each row: **Net revenue** (contract value less buying commission), **Cost at completion** (material + conversion + other cost), **Margin** and margin %, and **Progress** (sewing good pieces ÷ order quantity).
3. The **Data** column says *Complete data*, *Partial data* or *Unknown*. Partial or unknown rows have missing inputs (for example no cost per minute, no budget or no exchange rate); unknown rows are left out of the totals.
4. Use the row's **Actions** → **View details** to open the breakdown: revenue, **Budget vs cost at completion** per bucket (material, conversion, other), material bought on purchase orders vs still to buy, progress, and the **cost per minute (CPM)** detail.
5. The section **From the ledger - for information, not part of the estimate** shows what the accounts already hold for the order. It is never added to the estimate.
6. Click **Open order profitability in Finance** to see the posted figures in Finance.

## Cash requirement

1. In the **Cash requirement** card choose **Week 1 starts on** and the **Horizon (days)** (1-180, default 90) and click **Show forecast**.
2. **Net cash (after drawn overdraft)** is the starting point: cash in hand + bank - bank overdraft already used. The breakdown shows each part.
3. The **Week by week** table shows opening, cash in, cash out, net and closing for each week. Weeks that end **below zero** are shaded red. Click **Show … categories** to see what makes up the week (BTB LC payments, loan repayments, supplier bills, payroll, export receipts, orders not invoiced yet).
4. A red **Financing gap** banner names the first week where net cash goes below zero and the **shortfall** to cover. Arrange financing or move payments before that week.
5. **Available financing (memo, not cash)** shows unused facility limits. It is never added to the cash balance.
6. **Items behind the figures** lists every source row with its due date, confidence (*Contract date*, *Scheduled* or *Estimated*) and an **Overdue** chip for items already past due (they are counted in week 1). When there are very many items only the first ones are listed, but the weekly totals still include all of them.

## Notes you may see

- **Old unpaid supplier bills left out (STALE_PAYABLES)** - posted supplier bills more than 90 days past due whose payment status is unknown are not counted as cash due now. Review them in accounts payable.
- **Left out: no exchange rate** - foreign-currency items without a stored rate are listed by currency and not added to the totals.
- **Only the first orders were counted** - the forecast reads a limited number of confirmed orders.

## Planning settings used here

With integrated planning on, approvers who also have finance access can change **Cost & cash timing** in **Tentative demand → Planning settings**: export document days (0-60), export usance days (0-365, 0 = at sight), BTB usance days (0-365) and a finance-approved **cost per minute override**. Other users see the values read-only; the CPM override stays hidden without finance access.

## Common problems

- **"… is switched off for your company"** → An admin must tick the switch in **Settings → Configuration**.
- **"Money figures are only for admin / manager or users whose role has finance access and the MIS report view"** → Ask an admin to grant finance access and the MIS report view to your role.
- **Cost per minute unknown** → The last three accounting periods are not locked yet, or no factory cost is posted; finance can set a CPM override.`,
      tags: ["cost", "margin", "cash flow", "financing", "control tower", "manufacturing intelligence", "finance"],
      keywords: [
        "estimate at completion",
        "EAC",
        "cost at completion",
        "order margin",
        "cash requirement",
        "cash forecast",
        "financing gap",
        "overdraft",
        "BTB maturity",
        "CPM",
        "cost per minute",
        "stale payables",
      ],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-13",
      audience: "management",
      infographics: [
        {
          type: "steps",
          title: "Read cost and cash in four steps",
          steps: [
            { title: "Check the labels", body: "**Actual**, **Committed**, **Estimate**, **Forecast**. Nothing here is posted." },
            { title: "Scan order margins", body: "**Order cost at completion**: net revenue, cost at completion and margin per order." },
            { title: "Open the details", body: "**Actions** → **View details** for budget vs estimate, CPM and the ledger figures (information only)." },
            { title: "Find the cash gap", body: "**Cash requirement**: weekly net cash, the **Financing gap** week and the shortfall." },
          ],
        },
      ],
      relatedAppRoutes: ["/app/operations/control-tower", "/app/settings/config"],
      relatedArticleIds: ["ops-control-tower", "mfg-intel-tentative-demand", "mfg-intel-materials"],
    },
    {
      id: "mfg-intel-predictions",
      title: "Predictions: delivery forecasts, bottlenecks and recommendations",
      summary:
        "Statistics from your own history: likely, safe and worst-case delivery dates, line efficiency, supplier lateness, unusual production and daily recommendations you can accept or reject. Nothing here changes a plan.",
      content: `## Overview

The **Predictions** tab (Control Tower → Manufacturing intelligence → **Predictions**) answers *"What is likely to go wrong, and what should we look at first?"* Every number is a **statistical estimate from your own history** (recorded output, line plans and supplier receipts). The tab says so at the top: *Statistical estimate from your own history - never changes plans.* There is no money on this tab.

## Before you start

- An admin ticks **Predictions (delivery forecasts, line efficiency, bottlenecks)** in **Settings → Configuration → More features**. Manufacturing intelligence must be on first.
- Optional: **AI explanations for predictions** adds an **Explain** button. It sends an anonymised summary (codes, dates and percentages; no buyer, employee or supplier names) to your company's approved AI provider. The numbers always come from the statistics.
- Recommendations are found once a day (at night). A new company sees few results until some history exists.

## Bottlenecks and recommendations

1. The first card lists findings, highest priority first: **Delivery risk**, **Late material**, **Line overloaded**, **Line idle**, **Output drop** and **Rejection spike**. Each row shows the severity (*Critical*, *High*, *Medium*), the order or line, the **Deadline**, the confidence and the impact.
2. Use **Show** (open, cleared or all findings) and **Kind** to filter.
3. Open a row's **Actions** → **View details** to see the recommendation, supporting data, key dates, assumptions, alternatives, the **Responsible department** and the **Approval needed**.
4. **Accept…** or **Reject…** records your decision. Both ask you to confirm; **Reject** needs a note (at least 5 characters, at most 500). **Accepting only records the decision** - it never changes plans, purchase orders or stock. Use **Open …** (for example *Open Line plan* or *Open Plan changes*) to act on the normal screen, where the usual approvals apply.
5. A finding has one decision. Sending it again (a double click, or a second person) shows the stored decision and records nothing new.
6. **Delivery forecast** in the Actions menu shows the order's forecast below.

Recording a decision needs **admin / manager** or the permission to confirm AI agent actions. **Late material** findings are shown only to users with inventory read access.

## Delivery forecast

1. Pick the **Order**. The card shows the **Ex-factory target**, **Likely finish (P50)**, **Safe date (P80)** - 8 in 10 similar orders finish by it - and **Worst case (P90)**.
2. **On-time probability** is the chance of finishing by the target. With fewer than 10 production days of history the card says *Not enough history for a probability yet* and uses fixed safety bands.
3. The **Uncalibrated** label stays until at least 30 finished orders have been compared with their forecasts (see *Forecast accuracy* below).
4. **What moves the date** names the biggest drivers: material arrival, line efficiency or line load. **Material readiness** shows when material is likely to be ready from the purchase orders and the supplier's history.

## Line efficiency, suppliers, anomalies

- **Line efficiency: history vs plan** - per sewing line, the **Planned** efficiency, the efficiency **From history** and the one **Used** for forecasts, with the source (*From history*, *History + plan*, *Plan only*), the confidence and the sample size. Fewer than 10 production days = planned efficiency only. Tick **Show style families** for per-family values.
- **Supplier lateness** - how many days after the promised purchase-order date material arrives in full: likely (P50), safe (P80), worst case (P90) and the on-time share, by supplier, material category or both. Only users with inventory read access see it.
- **Unusual production (anomalies)** - days or hours far from the line's usual result (output, efficiency, rejections). Choose **From / To** (at most 31 days).

## Forecast accuracy (calibration)

The last card compares past forecasts with the real ex-factory date of finished orders. Until 30 orders have been compared it says *Not enough finished orders yet*. Then it shows the **Brier score** (lower is better) and how often orders finished by the safe and worst-case dates. Results are shown only; nothing is recalibrated automatically.

## Common problems

- **"Predictions are switched off for your company"** → An admin must tick the switch in **Settings → Configuration**.
- **"You are not allowed to record this decision"** → Ask an admin / manager, or for the permission to confirm AI agent actions.
- **"This recommendation is no longer open. Refresh the list."** → The condition cleared in the meantime; the list reloads.
- **"The linked finding was not found"** → The alert link points at a finding that was removed, or one you cannot see.`,
      tags: ["predictions", "forecast", "bottleneck", "recommendation", "control tower", "manufacturing intelligence"],
      keywords: [
        "delivery forecast",
        "P50",
        "P80",
        "P90",
        "on-time probability",
        "line efficiency",
        "supplier lateness",
        "anomaly",
        "calibration",
        "bottleneck",
        "accept recommendation",
      ],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-13",
      audience: "planning",
      infographics: [
        {
          type: "steps",
          title: "Use predictions in four steps",
          steps: [
            { title: "Scan the findings", body: "**Bottlenecks and recommendations**, highest priority first." },
            { title: "Read the details", body: "**Actions** → **View details**: data, dates, alternatives, approval needed." },
            { title: "Decide", body: "**Accept…** or **Reject…** (note required). This only records the decision." },
            { title: "Act on the real screen", body: "Use **Open …** to change the plan or the purchase order with the normal approvals." },
          ],
        },
      ],
      relatedAppRoutes: ["/app/operations/control-tower", "/app/settings/config"],
      relatedArticleIds: ["ops-control-tower", "mfg-intel-plan-changes", "mfg-intel-materials", "mfg-efficiency-reports"],
    },
    {
      id: "mfg-intel-forward-plan",
      title: "Forward plan: capacity vs demand, scenarios and the scheduler",
      summary:
        "Look 90-180 days ahead: sewing capacity against confirmed, booked, tentative and forecast work, what-if scenarios, a finance-limited view and a scheduler that proposes line bookings for approval.",
      content: `## Overview

The **Forward plan** tab (Control Tower → Manufacturing intelligence → **Forward plan**) answers *"Do we have enough sewing capacity for the next months, and what if things change?"* It shows estimates only. Nothing on this tab changes an order or a line plan; a scheduler proposal changes nothing until someone approves it in **Plan changes**.

Deep link: \`/app/control-tower?tab=forward-plan\`.

## Before you start

- An admin ticks **Forward plan (capacity vs demand, scenarios, scheduler)** in **Settings → Configuration → More features**. Manufacturing intelligence must be on first.
- The **Scheduler** view also needs **Integrated planning**. The **Finance** view needs **Cash requirement forecast** and is shown only to admin / manager or roles with finance access plus the MIS report view.
- At the top choose the **Horizon** (90, 120, 150 or 180 days), **Group by** (Week or Month) and, optionally, a **Factory unit**, then click **Apply**. With many sewing lines the screen asks you to pick a factory unit.

## Capacity vs demand

1. Each row is a week or a month. The bar stacks the demand layers; the thin black line is the capacity.
2. Layers, bottom to top: **Confirmed - firm booked**, **Confirmed - soft booked**, **Overdue booked work**, **Unconfirmed orders (booked)**, **Bookings without an order**, **Confirmed - not yet booked**, **Overdue - not yet booked**, tentative bookings and **Forecast (not yet ordered)**. The legend lists only the layers in the bar.
3. **Tentative bookings** can be shown **Weighted by confidence** or at **Full quantity**. These are two views of the same bookings and are never added together.
4. **Partial** means some line-days have unknown capacity (no shift, operators or efficiency), so the real capacity is higher and no use % is shown. **Part month** marks the first or last month that is cut by the horizon. **Overloaded** means demand is above capacity.
5. Notes under the table list work due after the horizon, work pushed past it, and the assumptions used. Unconfirmed orders without bookings are not counted as demand.

## Scenarios

1. Open **Scenarios** and pick a **Preset**: **Base (most likely)**, **Optimistic**, **Conservative** (every tentative booking at full quantity plus the forecast) or **Capacity-limited** (work above a week's capacity moves to the next week).
2. Optionally change **Efficiency**, **Overtime %** (0-25), **Absence %** (0-30, only with *Planned efficiency* because efficiency from history already includes absence), **Extra operators %** (-30 to 30) and **Extra (virtual) lines** (0-5).
3. **Use in Capacity vs demand** shows the result. **Save my parameters** remembers them in this browser for you only.
4. Tick up to 4 presets and click **Compare** to see capacity, demand, free / short minutes and overloaded periods side by side.
5. **Demand forecast** shows per style family whether there is enough order history (at least 12 months for the company and 6 months with orders for the family).

## Finance

The **Finance** view shows, week by week, the cash forecast from **Cost & cash**, then after confirmed material still to buy, then after the tentative bookings that are kept, and finally with the facility headroom. Confirmed orders are never cut; tentative bookings the cash cannot carry are cut, lowest confidence first; forecast demand is never funded. A red message says when even confirmed work needs financing. Amounts are estimates and are never posted.

## Scheduler

1. Open **Scheduler**, optionally enter a **Material delay** or **BTB LC delay** (0-60 days, what-if), and click **Run preview**.
2. The banner says *Proposal only - needs approval*. **Now** and **With proposal** compare late jobs, days late, style changeovers, jobs not placed and overtime.
3. The scheduler moves only soft-booked rows of confirmed orders that start after the **frozen zone** and have not started, and places confirmed work that is not yet booked. **Firm bookings never move**; late ones are listed *for information* so you can change them by hand.
4. Each job row has one **Actions** menu: **Why this line** explains the choice and why the other lines lost (finish on time first, then smallest style change, shortest idle gap, least overtime, line code). **Exclude** keeps a job where it is and runs the preview again; **Include** brings it back.
5. *Overtime could recover the delay* is information only: proposals never add overtime.
6. Click **Create plan revision**, write a note for the approver (5-500 characters) and confirm. The whole proposal is sent to **Plan changes** as one proposed revision. Clicking twice never creates two revisions. Then use **Open Plan changes**; an approver applies it there with the normal approval (and four-eyes rule when it is on).

**Scheduler settings** at the bottom of the tab set the **Frozen zone (days)** (14-60) and the **Changeover loss %** (0-100 of the first day's minutes). Changing them needs plan approval rights.

## Common problems

- **"Too many sewing lines to calculate at once. Type a factory unit and try again."** → Enter a **Factory unit** and click **Apply** (or **Run preview again**).
- **"This took too long. Try again, choose a factory unit or a shorter horizon."** → Pick a factory unit or 90 days.
- **"Absence % can be used only with Planned efficiency"** → Set **Efficiency** to *Planned efficiency* or set absence to 0.
- **"The line plan changed since this preview. The preview was run again"** → Someone changed the plan; check the new proposal and create the revision again.
- **Approving says the booking now starts inside the frozen zone** → The proposal waited too long. Nothing was applied; run the scheduler preview again and send a new proposal.`,
      tags: ["forward plan", "capacity", "scenario", "scheduler", "control tower", "manufacturing intelligence"],
      keywords: [
        "rough-cut capacity",
        "RCCP",
        "capacity vs demand",
        "what-if",
        "scenario",
        "frozen zone",
        "changeover",
        "auto schedule",
        "line loading",
        "forecast demand",
        "finance constrained",
      ],
      estimatedMinutes: 8,
      lastUpdated: "2026-11-13",
      audience: "planning",
      infographics: [
        {
          type: "steps",
          title: "Plan ahead in four steps",
          steps: [
            { title: "Check capacity vs demand", body: "Pick the **Horizon** and look for **Overloaded** and **Partial** periods." },
            { title: "Try scenarios", body: "Change a preset or overtime, then **Compare** up to 4." },
            { title: "Run the scheduler", body: "**Run preview**, read **Why this line**, **Exclude** jobs that must stay." },
            { title: "Send for approval", body: "**Create plan revision** with a note, then approve it in **Plan changes**." },
          ],
        },
      ],
      relatedAppRoutes: ["/app/operations/control-tower", "/app/settings/config"],
      relatedArticleIds: ["ops-control-tower", "mfg-intel-plan-changes", "mfg-intel-tentative-demand", "mfg-intel-cost-cash", "mfg-intel-predictions"],
    },
    {
      id: "mfg-setup",
      title: "Production setup: lines, factory units, shifts, optional units and calendar",
      summary:
        "Do this once before planning: choose a factory profile, set weekends, tick optional units, add sewing lines with their factory unit, add shifts and crew roles.",
      content: `## Overview

**Production setup** (\`/app/production/setup\`) holds the factory master data that every other production screen reads: sewing lines, shifts, weekend days, optional units and crew roles. It is usually filled by the **production manager** or **IE** once, then updated when a line or shift changes.

The **Factory calendar** (\`/app/production/calendar\`) holds holidays and working-day overrides, so planned end dates skip days off.

## Before you start

- You need a manager or admin role to change settings.
- For the **Supervisor (Line Incharge)** list and named crew roles, employees should already exist in **HR**.
- Have ready: line codes, machine and operator counts per line, shift times, and which units (knitting, dyeing, washing…) you run in-house.

## Steps

1. Open **Manufacturing → Production setup**.
2. **Factory profile:** pick a **Profile** and click **Apply profile** for a quick preset of optional units and related switches. You can change everything below afterwards.
3. **Weekend days & CM alerts:** tick your weekly off days (for example **friday**). Set **CM alert threshold (%)** and click **Save threshold** — CM variance alerts use it.
4. **Optional units:** tick the units you run — **Knitting**, **Dyeing**, **Printing**, **All over print (AOP)**, **Embroidery**, **Elastic**, **Washing**. Each ticked unit gets a card with **Hourly production** and **Department page** links, and its links appear in the sidebar under **Units (optional)**.
5. **Sewing lines:** click **Add line** and fill:
   - **Line code \\*** (short, for example \`LKH-L03\`) and **Name \\***.
   - **Factory / unit** — for example \`Unit 2 — Gazipur\`. Leave blank for the main factory.
   - **Total machines**, **Running machines**, **Operators**, **Helpers**.
   - **Supervisor (Line Incharge) — optional**.
   Click **Save line**. Use the row's **Actions** menu to edit a line later.
6. **Line-wise default crew list:** pick a line and set the default count per crew role (used by **Pre-fill from template** on the Daily crew sheet).
7. **Shifts:** click **Add shift**, fill **Shift code \\***, **Name \\***, **Start time \\***, **End time \\*** and **Break (minutes)**, then **Save shift**.
8. **Crew roles:** choose the department (Sewing, Knitting, …), fill **Role key**, **Role name**, optional **HR designation (preferred)**, tick **Named role** if one specific person fills it (for example Line Incharge), then **Add role**.
9. Open **Factory calendar**. Use **Prev / Next** to move months, click a day to **Add override** (Holiday or Working day override), or **Import public holidays** when your country code is set in tenant settings.

## What happens next

- **Line plan board**, **Planning**, **Hourly — Sewing**, **Scan station** and **Shop-floor QC** list the lines you added.
- The **Factory** filter and unit cards on the Line plan board appear as soon as two different **Factory / unit** values exist.
- Planned end dates skip weekends and calendar holidays.

## Tips

- Keep **Running machines** up to date — capacity and line-balance hints use it.
- Mark a closed line inactive instead of deleting it; the board then warns about any plan still booked on it (**Inactive line** conflict).
- The factory calendar is separate from HR attendance holidays unless you sync them.

## Common problems

- **Line not shown on Hourly or Line plan board** → It is inactive, or you saved it with a different company. Check the line in the table.
- **Knitting is ticked but the Knitting hub link is missing** → Also tick **Enable Knitting module** in **Settings → Configuration**.
- **"Line code" error on save** → Codes must be unique and up to 32 characters.`,
      tags: ["production setup", "sewing line", "shift", "factory unit", "optional units", "calendar"],
      keywords: [
        "line setup",
        "add line",
        "shift setup",
        "weekend",
        "holiday",
        "factory calendar",
        "multi-factory",
        "unit",
        "knitting",
        "dyeing",
        "washing",
        "printing",
        "crew role",
        "line incharge",
      ],
      estimatedMinutes: 8,
      lastUpdated: "2026-11-06",
      audience: "production",
      coverImage: "/tutorials/screens/production-setup.jpg",
      infographics: [
        {
          type: "steps",
          title: "Setup checklist",
          steps: [
            {
              title: "Profile, weekend and optional units",
              body: "Apply a **Factory profile**, tick weekend days, then tick the **Optional units** you run.",
              imageSrc: "/tutorials/screens/production-setup.jpg",
              imageAlt: "Production setup page with Factory profile, Weekend days and Optional units sections.",
              href: "/app/production/setup",
            },
            {
              title: "Add sewing lines",
              body: "**Add line** → Line code, Name, **Factory / unit**, machines, operators, helpers → **Save line**.",
              imageSrc: "/tutorials/screens/mfg-setup-line-form.jpg",
              imageAlt: "Sewing lines section with the Add line form filled for line LKH-L03 in Unit 1 - Gazipur.",
            },
            {
              title: "Add shifts",
              body: "**Add shift** → code, name, start and end time, break minutes → **Save shift**.",
              imageSrc: "/tutorials/screens/mfg-setup-shifts.jpg",
              imageAlt: "Shifts section listing shift code, name, start, end and break minutes.",
            },
            {
              title: "Mark holidays",
              body: "Open **Factory calendar** and add holidays or working-day overrides.",
              imageSrc: "/tutorials/screens/production-calendar.jpg",
              imageAlt: "Factory calendar month view with working days in green and weekends in orange.",
              href: "/app/production/calendar",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/production/setup", "/app/production/calendar", "/app/settings/config"],
      relatedArticleIds: ["mfg-overview", "mfg-line-plan-board", "mfg-crew-sheet", "mfg-optional-units"],
    },
    {
      id: "mfg-ie-bulletins",
      title: "IE basics: operations library, operation bulletins and SMV",
      summary:
        "Create sewing operations with SMV, build an operation bulletin (OB) per style, and why planning, line booking and the scan station need it.",
      content: `## Overview

**IE (industrial engineering)** data tells the system how long each sewing operation takes. **SMV** (standard minute value) is the minutes one operation should take for one piece. An **operation bulletin (OB)** is the list of operations, in order, for one style with their SMV.

The OB is used by **Planning** (the **OB** pill in the readiness chain), **line bookings** (total SMV), the **Scan station** (the **Operation** list and earned minutes) and **Line balancing**.

## Before you start

- The **style** must exist (Merchandising → Styles); you need its **Style ID**.
- IE or a production manager usually maintains these screens.

## Steps

1. Open **Manufacturing → IE → Operations library** (\`/app/production/ie/operations\`). Under **Add operation**, enter code, name, category and SMV, then add it.
2. Open **Operation bulletins** (\`/app/production/ie/bulletins\`). Under **Create OB (single operation row)** fill **Style ID**, **OB code**, **Seq**, **Operation** (for example *Join shoulder*) and **SMV**, then click **Create**.
3. Check the list below: each bulletin shows **OB**, **Style**, total **SMV** and **Status**.
4. Open **Line balancing** (\`/app/production/ie/line-balance\`) to compare operator load against the OB.
5. **IE & Efficiency** (\`/app/production/ie\`) holds the **Operation master** for work-order routings: **Create Operation** (code such as \`CUT-10\`, name, area, **Std Cycle (min)**) and **Operation Area Mapping** (Cutting / Sewing / Finishing / General).

## What happens next

- The **OB** pill on **Planning → Pipeline** turns green for orders whose style has a bulletin.
- The **Scan station** lists the OB's operations with their SMV, and **Today by hour** shows earned minutes = pieces × SMV.

## Tips

- Keep one current OB per style; line booking uses the newest version.
- Use clear operation names that operators know — they see them on the scan tablet.

## Common problems

- **Scan station says "No operation bulletin for this order"** → The order's style has no OB yet. Create one on **Operation bulletins**.
- **"No bulletins yet."** → Nothing created for this company; start with step 2.`,
      tags: ["IE", "operation bulletin", "SMV", "line balancing", "operations"],
      keywords: ["OB", "SMV", "standard minute", "industrial engineering", "operation breakdown", "line balance", "work study"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      audience: "production",
      coverImage: "/tutorials/screens/production-ie-bulletins.jpg",
      images: [
        {
          src: "/tutorials/screens/production-ie-bulletins.jpg",
          alt: "IE operation bulletins page with Create OB form (Style ID, OB code, Seq, Operation, SMV) and the bulletin list.",
          caption: "Operation bulletins: one OB per style with its operations and total SMV.",
        },
        {
          src: "/tutorials/screens/production-ie-operations.jpg",
          alt: "IE operations library with an Add operation form and a table of code, name, category and SMV.",
          caption: "Operations library: reusable sewing operations with SMV.",
        },
      ],
      relatedAppRoutes: [
        "/app/production/ie/operations",
        "/app/production/ie/bulletins",
        "/app/production/ie/line-balance",
        "/app/production/ie",
      ],
      relatedArticleIds: ["mfg-scan-station", "mfg-planning-deep", "mfg-setup"],
    },
    {
      id: "mfg-planning-deep",
      title: "Step-by-step: production planning (Pipeline, What-if / MRP, Plan history)",
      summary:
        "Use the Planning screen to check each order's readiness chain, ask Gemini AI for advice, run what-if and MRP, and release item plans to the shop floor.",
      content: `## Overview

**Production Planning** (\`/app/production/planning\`, sidebar **Manufacturing → Planning**) answers one question: *which orders are ready to go on a line, and what is still missing?* Planners and production managers use it daily.

It has three tabs:

- **Pipeline** — one row per order with its readiness chain, plus AI insight cards.
- **What-if / MRP** — move prediction, capacity view and an MRP run.
- **Plan history** — item-based production plans, work-order generation and **Release to Shop Floor**.

All AI output is **advice only**. Bookings and releases always need a person to confirm.

## Before you start

- Orders must be confirmed and linked to a style.
- AI cards need the company's Gemini key and recent hourly data; without them the cards stay empty — the rest of the page still works.
- Old bookmark \`/app/production/advanced-planning\` opens this same page.

## Steps

### Pipeline tab

1. Open **Manufacturing → Planning**. The **Pipeline** tab opens first.
2. Choose **By order** (table) or **By style** (orders grouped under each style).
3. Filter with **Status** (**All**, **Overall ready**, **Warning**, **Blocked**, **Line allocated**), the search box *Search style / order…*, and **Delivery from / to**.
4. Read the **Chain** pills for each order:
   - **Style** — the order is linked to a style.
   - **OB** — the style has an operation bulletin.
   - **Approval** — buyer approvals (lab dip, PP sample…) are done.
   - **Materials** — fabric and trims are in house.
   - **Line** — a sewing line is allocated.
   Green = ready, amber = warning, red = blocked, grey = not started. **Overall** shows the combined status.
5. Click **Details** on a row, then click a pill (for example **Materials**) to see exactly what is missing.
6. Click **AI allocate** to get a suggested **Line** and **Start** date with a reason. Click **Open line plan board** in that window to book it, or **Close**.
7. Optional: click **Refresh analysis** on **AI insights (Gemini)**, **Refresh** on **Predictive manufacturing (heuristic)** and on **AI efficiency forecast (Gemini)**.

### What-if / MRP tab

8. **AI move prediction:** enter the **Config id** (the booking id from the Line plan board), choose **Target line** and **Start date**, click **Predict**.
9. **Capacity (manufacturing):** read the load per line.
10. **MRP run:** optional **Plan ID**, horizon start and end dates, then **Run MRP**. The table lists **Item**, **Type**, **Suggested Qty**, **Due** and **Reason**.

### Plan history tab

11. **Create production plan (items / WOs):** period start and end, optional plan code; add lines (item, **Planned qty**, due date, priority) with **Add Line**, then **Create Plan**.
12. In the plan list, click **Generate WOs** to create work orders.
13. Click **Release to Shop Floor**. A box asks *"Release to Shop Floor?"* and shows how many work orders will be released. Click **Confirm release** only when you are sure, or **Cancel**.

## What happens next

- Released work orders appear in the operation queue on **Cutting / Sewing / Finishing (shop floor)**.
- Line bookings are made and moved on the **Line plan board**.
- MRP suggestions do **not** create purchase orders — buyers still raise POs in Inventory.

## Tips

- Start the day with **Status = Blocked** to chase problems first.
- Open Planning from an order with \`?order_id=\` in the address to jump straight to that order.
- **Release Status** in Plan history: **Not Ready**, **Ready to Release**, **Released**.

## Common problems

- **"No orders in pipeline for this filter."** → Clear **Status**, search and delivery dates, then click **Reload pipeline**.
- **AI window says "No AI suggestion available (check GEMINI_API_KEY or try again)."** → AI is not configured; plan manually on the Line plan board.
- **"Please set period dates and add at least one line."** → In Plan history, click **Add Line** before **Create Plan**.
- **Predict says "Set plan config id (from line plan board) and line."** → Fill **Config id** first.`,
      tags: ["planning", "MRP", "pipeline", "readiness", "AI", "Gemini", "manufacturing"],
      keywords: [
        "production planning",
        "readiness",
        "line allocation",
        "AI allocate",
        "what-if",
        "MRP",
        "plan history",
        "release to shop floor",
        "work order",
        "WO",
        "Gemini",
        "capacity",
        "pipeline",
      ],
      estimatedMinutes: 9,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "planning",
      coverImage: "/tutorials/screens/production-planning.jpg",
      videos: [
        {
          src: "/tutorials/videos/mfg-planning-tour.webm",
          poster: "/tutorials/videos/mfg-planning-tour-poster.jpg",
          title: "Production planning tour",
          caption:
            "Read the readiness chain, open Details, see AI allocate, the What-if / MRP tab and Plan history, then jump to the Line plan board. Nothing is saved.",
          durationSeconds: 68,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Planning in five steps",
          steps: [
            {
              title: "Filter the pipeline",
              body: "Choose **By order**, set **Status** and **Delivery from / to**.",
              imageSrc: "/tutorials/screens/production-planning.jpg",
              imageAlt: "Planning Pipeline tab with AI cards, filters and order table with chain pills.",
              href: "/app/production/planning",
            },
            {
              title: "Find what is missing",
              body: "Click **Details**, then a pill such as **Materials**, to read the blocking items.",
              imageSrc: "/tutorials/screens/mfg-planning-details.jpg",
              imageAlt:
                "Order ORD-0001 expanded with the Materials pill selected: a Materials (BOM vs stock) table listing item, required, on hand and OK.",
            },
            {
              title: "Ask AI (optional)",
              body: "**AI allocate** suggests a line and start date. It is advice only.",
            },
            {
              title: "What-if and MRP",
              body: "Predict a move, read capacity, **Run MRP** for a horizon.",
              imageSrc: "/tutorials/screens/mfg-planning-whatif.jpg",
              imageAlt: "What-if / MRP tab with AI move prediction, capacity table and MRP run form.",
            },
            {
              title: "Release item plans",
              body: "**Plan history** → **Generate WOs** → **Release to Shop Floor** → **Confirm release**.",
              imageSrc: "/tutorials/screens/mfg-planning-history.jpg",
              imageAlt: "Plan history tab with Create production plan form and the plan list with release buttons.",
            },
          ],
        },
        {
          type: "flow",
          title: "From plan to floor",
          steps: [
            { label: "Planning", href: "/app/production/planning" },
            { label: "Line plan board", href: "/app/production/line-plan" },
            { label: "Cutting pipeline", href: "/app/production/cutting/pipeline" },
            { label: "Sewing (shop floor)", href: "/app/production/sewing" },
          ],
        },
      ],
      relatedAppRoutes: ["/app/production/planning", "/app/production/line-plan", "/app/production"],
      relatedArticleIds: ["mfg-line-plan-board", "mfg-mo-deep", "mfg-ie-bulletins", "mfg-overview", "ops-control-tower"],
    },
    {
      id: "mfg-line-plan-board",
      title: "Line plan board: book lines, several factories and planning conflicts",
      summary:
        "See every sewing line by factory unit, read booking status on each block, drag to reschedule with an AI check, and fix overlap, late-delivery and inactive-line conflicts.",
      content: `## Overview

The **Line plan board** (\`/app/production/line-plan\`) shows each sewing line as a row and each booking as a coloured block across the dates you choose. Planners use it to decide *which order sews on which line, from when to when*, and to catch problems before they reach the floor.

## Before you start

- Sewing lines must exist in **Production setup**. Fill **Factory / unit** on each line if you have more than one factory.
- Bookings come from line allocation (AI suggestion, **Auto-propose line bookings**, or the planning team). The board shows and moves them.
- Holidays from the **Factory calendar** are shaded on the timeline.

## Steps

1. Open **Manufacturing → Line plan board**.
2. Set **From** and **To** (at most **62 days**) and click **Refresh**.
3. If you have several units, use the **Factory** filter or click a unit card (lines, plans, pieces done vs planned). Click the card again to show all.
4. Read each block:
   - Colour = plan status: blue **planned**, green **active**, amber **on hold**, grey **completed**.
   - Small tag = booking status: **DRAFT**, **SOFT BOOKED**, **FIRM BOOKED**, **IN PROGRESS**, **COMPLETED**.
   - Dot = order readiness (green ready, amber warning, red blocked).
   - **Red outline** = a conflict or blocked readiness. Hover the block to read why.
5. Read the red **Planning conflicts** panel:
   - **Line overlap** — two active plans on the same line share dates.
   - **Late vs delivery** — sewing finishes after the order's delivery date.
   - **Inactive line** — a plan is booked on a line marked inactive.
6. To move a booking, drag the grip **⋮** on the left of the block to another line or start date. A **Confirm move** box shows the AI prediction. Click **Apply move** or **Cancel**.
7. Click **Suggest plan** for rule-based suggestions; use **AI detail** on a suggestion for the AI reason.
8. Check the **Assignments** table: line, order (with due date), style, start, end, status, reservation, readiness and **Progress** (done / planned).
9. The **AI & risks** panel on the right has **AI optimize (preview)** and **Refresh risk alerts**. **Hide** closes the panel; **Show AI panel** brings it back.

## What happens next

- A FIRM booking holds capacity. Firm booking is refused while the order's material readiness is below the company threshold (default **80%**).
- When **Line allocation → TNA sync** (\`line_allocation_confirm_enabled\`) and **TNA event sync** are on, confirming a firm booking also completes the related TNA milestone.
- Hourly sewing output fills the **Progress** column.

## Tips

- Completed and cancelled plans are ignored by conflict checks.
- A shorter date range makes blocks wider and easier to drag.
- **Utilization (rough)** is a quick gauge, not a capacity report.

## Common problems

- **"Choose a range of at most 62 days…"** → Shorten **From / To**.
- **"Could not move assignment. Try again."** → Refresh and try again; the booking may have changed.
- **"No sewing lines yet. Add lines under Production setup."** → Add lines first.
- **"+N more — narrow the date range."** → More than 20 conflicts; shorten the range.`,
      tags: ["line plan", "planning board", "multi-factory", "unit", "capacity", "overlap", "delivery date", "sewing line"],
      keywords: [
        "line loading",
        "line booking",
        "reservation",
        "soft booked",
        "firm booked",
        "factory unit",
        "late order",
        "conflict",
        "reschedule",
        "drag and drop",
        "gantt",
      ],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-06",
      audience: "planning",
      coverImage: "/tutorials/screens/production-line-plan.jpg",
      infographics: [
        {
          type: "diagram",
          title: "What the block colours and tags mean",
          caption: "DRAFT → SOFT BOOKED → FIRM BOOKED → IN PROGRESS → COMPLETED.",
          imageSrc: "/tutorials/diagrams/manufacturing/line-booking-lifecycle.svg",
          imageAlt:
            "Booking lifecycle from DRAFT to SOFT BOOKED, FIRM BOOKED (needs 80% materials), IN PROGRESS and COMPLETED, with block colour legend.",
        },
      ],
      images: [
        {
          src: "/tutorials/screens/production-line-plan.jpg",
          alt: "Line plan board with From/To dates, Factory filter, two unit cards, a Late vs delivery conflict and a FIRM BOOKED block.",
          caption: "Two factory units, one conflict, and a firm-booked block outlined in red.",
        },
        {
          src: "/tutorials/screens/mfg-line-plan-full.jpg",
          alt: "Full line plan board page including the Assignments table with progress per booking.",
          caption: "Scroll down for the Assignments table and Suggestions.",
        },
      ],
      relatedAppRoutes: ["/app/production/line-plan", "/app/production/setup", "/app/production/calendar"],
      relatedArticleIds: ["mfg-planning-deep", "mfg-setup", "ops-control-tower", "mfg-scan-station"],
    },
    {
      id: "mfg-mo-deep",
      title: "Step-by-step: manufacturing orders",
      summary:
        "Create a manufacturing order for a finished item, move it through Start, Hold, Resume and Complete, track stages, and open a delivery challan when done.",
      content: `## Overview

**Manufacturing Orders** (\`/app/production/manufacturing-orders\`) are item-based production orders: *make N pieces of this finished item*. Each MO has stages (for example cutting, sewing, finishing) that you start and complete. The top cards show related inventory pressure: **Open PO**, **Open GRN**, **Pending CR** (consumption changes) and **Low Stock Items**.

For order-based garment planning, use **Planning** and the **Line plan board**; MOs are useful for simple item production and for stock-driven work.

## Before you start

- The finished item must exist in the stock master (Inventory).
- Raw materials should be in stock or on order.

## Steps

1. Open **Manufacturing → Manufacturing Orders**.
2. Under **Create Manufacturing Order**, type in *Search finished item (code or name)…* and pick the item.
3. Enter **Planned quantity** and optional **Notes**, then click **Create**.
4. Find the MO card (newest on top). Its status badge starts as **draft** or **planned**.
5. Open the card's **Actions** menu:
   - **View** scrolls to the card.
   - **Start** (draft / planned) → status **in_progress**.
   - **Hold** (in progress) and **Resume** (on hold).
   - **Complete** finishes the MO.
   - **Create Delivery Challan** appears after completion and opens the challan screen with item and quantity filled in.
6. Inside the card, each stage box has **Start**, **Complete** and **Skip** buttons.
7. Use the page controls at the bottom to move between pages.

## What happens next

- A completed MO can be shipped through **Inventory → Delivery Challans**.
- Click **Production planning** (top right) to go back to the readiness pipeline.

## Tips

- Skip only stages that really do not apply (for example no washing for this item).
- *Low stock* is a sample from the first page of the stock summary — check Inventory for the full list.

## Common problems

- **"No manufacturing orders yet"** → Create the first one with the form above.
- **Finished item not found in search** → Create it in the stock master first, or type part of its code.`,
      tags: ["manufacturing order", "MO", "production", "stages"],
      keywords: ["MO", "production order", "job order", "work order", "stage", "finished goods", "challan"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      audience: "production",
      coverImage: "/tutorials/screens/production-manufacturing-orders.jpg",
      infographics: [
        {
          type: "flow",
          title: "MO life cycle",
          steps: [
            { label: "Create MO", href: "/app/production/manufacturing-orders" },
            { label: "Start" },
            { label: "Stages: Start / Complete / Skip" },
            { label: "Complete" },
            { label: "Create Delivery Challan", href: "/app/inventory/delivery-challans" },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/production-manufacturing-orders.jpg",
          alt: "Manufacturing Orders page with KPI cards (Open PO, Open GRN, Pending CR, Low Stock Items) and the Create Manufacturing Order form.",
          caption: "Create an MO from a finished item and planned quantity.",
        },
      ],
      relatedAppRoutes: ["/app/production/manufacturing-orders", "/app/production/planning", "/app/inventory/delivery-challans"],
      relatedArticleIds: ["mfg-planning-deep", "mfg-shop-floor-execution", "gs-row-actions", "inv-overview"],
    },
    {
      id: "mfg-cutting-pipeline",
      title: "Cutting pipeline: marker, lay plan, cut ticket and bundle barcodes",
      summary:
        "Create a marker plan for an order, add a lay plan and cut ticket, generate bundles, print the barcode PDF and look up any bundle label.",
      content: `## Overview

The **Cutting pipeline** (\`/app/production/cutting/pipeline\`) turns an order into **bundles** — tied packs of cut pieces, each with a barcode label. The labels travel with the bundles to the sewing line, where the **Scan station** counts them operation by operation. The cutting in-charge or cutting master uses this screen.

## Before you start

- Know the **Order ID** (the number in the order's address, for example \`/app/orders/8\` → 8).
- Fabric should be received (GRN) and issued to cutting.
- When **Traceability & certificates** is on, you can link fabric lots to the cut ticket.

## Steps

1. Open **Manufacturing → Shop floor → Cutting pipeline**.
2. **Marker plans:** enter **Marker code** and **Order ID**, click **Create**. The list shows each marker as *code — status (id N)*. Note the id.
3. **Lay plan:** enter the **Marker plan ID** and a **Lay code** (for example \`LAY-1\`), click **Create lay**. The page shows **Last lay plan id**.
4. **Cut ticket:** the **Lay plan ID** is filled from the last step; enter a **Ticket code** (for example \`CT-1\`) and click **Create ticket**. The **Cut ticket ID** box fills in.
5. Click **Generate bundles** to create the bundles for that cut ticket.
6. Click **Download barcode PDF** and print the labels. Tie one label to each bundle.
7. Optional (traceability on): add the fabric lots used on this cut ticket in the fabric-lot panel that appears.
8. **Bundle scan:** scan or type a **Barcode** and click **Lookup** to see the bundle's details.

## What happens next

- **Production Overview** shows **Cutting bundles — Pending / Issued**.
- Sewing scans each bundle on the **Scan station**. Cutting output per hour goes in **Hourly — Cutting**.

## Tips

- Use a code pattern your team understands, for example \`<order>-M1\`, \`LAY-1\`, \`CT-1\`.
- Print labels on sticker paper; a smudged barcode becomes a *rejected scan* on the line.

## Common problems

- **Nothing happens on Create ticket** → The **Lay plan ID** box is empty. Create the lay plan first or type its id.
- **Generate bundles / Download barcode PDF does nothing** → Fill **Cut ticket ID**.
- **Lookup shows nothing** → The barcode does not belong to this company or was mistyped.`,
      tags: ["cutting", "marker", "lay plan", "cut ticket", "bundle", "barcode"],
      keywords: ["cutting", "marker", "lay", "cut ticket", "bundle card", "bundle tag", "barcode", "cutting section", "katai"],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      audience: "production",
      coverImage: "/tutorials/screens/production-cutting-pipeline.jpg",
      infographics: [
        {
          type: "diagram",
          title: "From marker to scan station",
          caption: "Each step gives an ID that the next step needs.",
          imageSrc: "/tutorials/diagrams/manufacturing/cutting-to-scan.svg",
          imageAlt: "Marker plan, lay plan, cut ticket, bundles and barcode PDF, then scan station; with notes on bundles and operation bulletins.",
        },
      ],
      images: [
        {
          src: "/tutorials/screens/production-cutting-pipeline.jpg",
          alt: "Cutting pipeline page with Marker plans (three approved markers listed), Lay plan, Cut ticket and Bundle scan sections.",
          caption: "Work top to bottom: Marker plans → Lay plan → Cut ticket → Bundle scan.",
        },
      ],
      relatedAppRoutes: ["/app/production/cutting/pipeline", "/app/production/hourly/cutting", "/app/production/scan-station"],
      relatedArticleIds: ["mfg-scan-station", "mfg-shop-floor-execution", "mfg-hourly-deep", "inv-traceability-certificates"],
    },
    {
      id: "mfg-shop-floor-execution",
      title: "Cutting, sewing and finishing shop-floor screens: start, hold and complete operations",
      summary:
        "Run the work-order operation queue for each department: Start, Hold, Resume and Complete with in/out/scrap quantities, assign operators and log downtime.",
      content: `## Overview

**Cutting (shop floor)** (\`/app/production/cutting\`), **Sewing (shop floor)** (\`/app/production/sewing\`) and **Finishing (shop floor)** (\`/app/production/finishing-packing\`) are the same screen filtered by department. They list the **operations of released work orders** — one row per step — so supervisors can start and finish them, assign people and record machine stops (downtime).

## Before you start

- Work orders must be **released** (Planning → **Plan history** → **Release to Shop Floor**).
- Roles matter:
  - **Admin, manager, supervisor** can **Assign** operators and **Close** downtime.
  - The **quality** role cannot start, hold or complete operations or log downtime.

## Steps

1. Open the department page under **Manufacturing → Shop floor**, for example **Sewing (shop floor)**.
2. Read the cards: **Active WOs**, **Completed Ops**, **Downtime (min)**, **OEE-like %**.
3. Filter the queue with **All Status / Pending / In Progress / On Hold / Completed**.
4. In the queue table (**MO**, **Step**, **Operation**, **Work Center**, **Status**, **Assigned**, **Downtime**), use the row buttons:
   - **Start** for pending (or on-hold) steps.
   - **Hold** and **Resume**.
   - For an in-progress step, type **In**, **Out** and **Scrap** quantities, then **Complete**.
5. **Assign Operator:** pick **Select operation**, **Select user**, the role (**Operator**, **Supervisor**, **Quality**) and click **Assign**.
6. **Log downtime:** choose the operation in *Select operation for downtime*, the reason (**Machine**, **Power**, **Material**, **Manpower**) and click **Log Downtime**.
7. When the problem is fixed, a supervisor clicks **Close** on the row in **Open Downtime Events**.
8. Review **Downtime Trend (Daily)** and **Downtime By Reason** (use the date boxes and **Clear Range**).
9. If an **AI Suggestions** box appears (line-balance hints), discuss it with the supervisor. **Apply** is advisory only — move people from crew screens.

## What happens next

- Completed operations count in **Completed Ops** and in **Reports → Production Efficiency**.
- Downtime minutes reduce the **OEE-like %**.

## Tips

- Log downtime when the stop starts, not at the end of the shift — minutes are counted from the start time.
- Use **Hourly** pages for piece counts per hour; use this screen for operation status.

## Common problems

- **"No operations found for current filter."** → No released work orders for this department, or the status filter hides them. Choose **All Status**.
- **Assign button greyed out** → Your role is not supervisor, manager or admin.
- **Log Downtime greyed out** → Pick an operation first (or your role is quality).`,
      tags: ["shop floor", "cutting", "sewing", "finishing", "operation", "downtime", "work order"],
      keywords: [
        "operation queue",
        "start operation",
        "complete",
        "scrap",
        "downtime",
        "machine breakdown",
        "power cut",
        "OEE",
        "packing",
        "finishing",
        "iron",
        "WO",
      ],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-06",
      audience: "production",
      coverImage: "/tutorials/screens/production-sewing.jpg",
      infographics: [
        {
          type: "diagram",
          title: "Operation status",
          caption: "pending → in_progress ⇄ on_hold → completed. Downtime is logged separately.",
          imageSrc: "/tutorials/diagrams/manufacturing/operation-status.svg",
          imageAlt: "Operation status diagram: Start, Hold, Resume, Complete with In/Out/Scrap, plus a downtime note.",
        },
      ],
      images: [
        {
          src: "/tutorials/screens/production-cutting.jpg",
          alt: "Shop Floor - Cutting page with KPI cards, status filter, Log Downtime, Assign Operator panel and downtime trend.",
          caption: "Shop Floor - Cutting: the same layout is used for Sewing and Finishing.",
        },
        {
          src: "/tutorials/screens/mfg-sewing-queue.jpg",
          alt: "Full Shop Floor - Sewing page including the operation queue table and Open Downtime Events.",
          caption: "Scroll down for the operation queue and open downtime events.",
        },
        {
          src: "/tutorials/screens/production-finishing-packing.jpg",
          alt: "Shop Floor - Finishing page with the same cards and panels.",
          caption: "Finishing (shop floor) covers finishing and packing operations.",
        },
      ],
      relatedAppRoutes: ["/app/production/cutting", "/app/production/sewing", "/app/production/finishing-packing"],
      relatedArticleIds: ["mfg-planning-deep", "mfg-hourly-deep", "mfg-efficiency-reports", "qc-inspections"],
    },
    {
      id: "mfg-hourly-deep",
      title: "Step-by-step: hourly production entry (cutting, sewing, iron, finishing)",
      summary:
        "Enter good and reject pieces for each hour slot by date, shift and sewing line or machine — one Save per hour — with an English / Bangla switch.",
      content: `## Overview

**Hourly production** pages record how many good and rejected pieces were made in each hour of the shift. Supervisors or line recorders fill them during the day; managers see the totals on **Production Overview**.

Pages (sidebar **Manufacturing → Shop floor**):

- **Hourly — Cutting** \`/app/production/hourly/cutting\`
- **Hourly — Sewing** \`/app/production/hourly/sewing\`
- **Hourly — Iron** \`/app/production/hourly/iron\`
- **Hourly — Finishing** \`/app/production/hourly/finishing\`
- Optional units (Knitting, Dyeing, Printing, AOP, Embroidery, Elastic, Washing) get their own hourly page when enabled.

## Before you start

- Shifts and sewing lines exist in **Production setup** (other departments use machines instead of lines).
- If an admin turned on **Require order on shop floor** (\`require_order_id_on_shop_floor\`), every hourly entry must carry an order. Ask your admin how your team records the order before you start.

## Steps

1. Open the hourly page for your department, for example **Hourly — Sewing**.
2. Check **Date** (today by default) and **Shift**.
3. Choose your **Sewing line** (or **Machine** on non-sewing pages). Hours already saved for that date load automatically.
4. Find the hour row: **H1** is the first working hour of the shift, **H2** the second, up to **H12**.
5. Type **Good** (pieces passed) and **Reject** (pieces rejected) for that hour.
6. Click **Save** on the same row. Each hour row saves separately.
7. At the bottom, **Saved rows: N** shows how many hours are saved.
8. Click **Refresh** to reload what is saved (useful when two people share a line).
9. Optional: switch the language at the top right from **English** to **বাংলা**.

## What happens next

- **Production Overview** shows **Output (good qty)** and **Eff. %** per line for the date.
- Planning's **AI efficiency forecast** uses the last 30 days of hourly data.
- With **TNA event sync** on, the first cutting or sewing hourly entry for an order can complete the *cutting start* / *sewing start* TNA milestone.

## Tips

- Enter each hour soon after it ends — it is easier than remembering at 5 pm.
- Saving the same hour again replaces that hour's figures.
- Reject means pieces that failed and need repair or are scrapped; record the defect reason on **Shop-floor QC**.

## Common problems

- **"Could not load hourly sheet."** → Check the internet connection and click **Refresh**.
- **Figures disappear after changing line** → You changed line or date before clicking **Save**. Each row must be saved before you switch.
- **Error about order_id when saving** → **Require order on shop floor** is on for your company; ask your admin.
- **Department link missing** → That optional unit is not ticked in **Production setup**.`,
      tags: ["hourly", "shop floor", "cutting", "sewing", "finishing", "iron", "output"],
      keywords: [
        "hourly production",
        "hourly report",
        "hour wise",
        "ghonta",
        "good",
        "reject",
        "line output",
        "target",
        "production entry",
        "Bangla",
        "বাংলা",
      ],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "supervisor",
      coverImage: "/tutorials/screens/production-hourly-sewing.jpg",
      videos: [
        {
          src: "/tutorials/videos/mfg-hourly-entry.webm",
          poster: "/tutorials/videos/mfg-hourly-entry-poster.jpg",
          title: "Enter hourly sewing output",
          caption: "Pick date, shift and line, type Good and Reject for H1 and H2, then see the Bangla switch. Save is not clicked.",
          durationSeconds: 49,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "One hour, three actions",
          steps: [
            {
              title: "Pick date, shift and line",
              body: "Top bar: **Date**, **Shift**, **Sewing line** (or **Machine**).",
              imageSrc: "/tutorials/screens/production-hourly-sewing.jpg",
              imageAlt: "Hourly production — Sewing with Date, Shift and Sewing line selectors and hour rows H1 to H7.",
              href: "/app/production/hourly/sewing",
            },
            {
              title: "Type Good and Reject",
              body: "On the hour row (**H1**, **H2**…).",
              imageSrc: "/tutorials/screens/mfg-hourly-sewing-filled.jpg",
              imageAlt: "Hourly sewing page with H1 good 120 reject 3 and H2 good 135 reject 2 typed in.",
            },
            {
              title: "Click Save on that row",
              body: "Each hour saves on its own. **Saved rows** counts them.",
            },
          ],
        },
        {
          type: "flow",
          title: "Hourly pages by department",
          steps: [
            { label: "Hourly — Cutting", href: "/app/production/hourly/cutting" },
            { label: "Hourly — Sewing", href: "/app/production/hourly/sewing" },
            { label: "Hourly — Iron", href: "/app/production/hourly/iron" },
            { label: "Hourly — Finishing", href: "/app/production/hourly/finishing" },
          ],
        },
      ],
      relatedAppRoutes: [
        "/app/production/hourly/cutting",
        "/app/production/hourly/sewing",
        "/app/production/hourly/iron",
        "/app/production/hourly/finishing",
      ],
      relatedArticleIds: ["mfg-supervisor-tablet", "mfg-scan-station", "qc-shop-floor-inline", "mfg-efficiency-reports"],
    },
    {
      id: "mfg-scan-station",
      title: "Scan station: count bundles per operation on a tablet",
      summary:
        "Set the line, order, operation and operator once, then scan each bundle barcode; output and earned minutes update by hour, and scans wait on the device when Wi-Fi drops.",
      content: `## Overview

The **Scan station** (\`/app/production/scan-station\`) turns a tablet or PC with a barcode scanner into a counter for one sewing operation. Each bundle label printed on the **Cutting pipeline** is scanned once when that operation is done. The screen shows pieces and **earned minutes** (pieces × SMV) per hour and the top operators.

## Before you start

- **Shop-floor scan station** is on for every company by default. An admin can switch it off in **Settings → Configuration** (section **Order execution spine**). When off, the page says the screen is turned off.
- The order's style needs an **operation bulletin** (IE) so operations and SMV are known.
- Bundles and labels come from **Cutting pipeline → Generate bundles → Download barcode PDF**.
- Set the tablet's date and time correctly.

## Steps

### Set up the station (once per shift)

1. Open **Manufacturing → Shop floor → Scan station**.
2. Choose **Line**, then **Order**, then **Operation** (the list shows *sequence. operation name (SMV min)*).
3. Type the **Operator ID**, for example \`EMP-0142\`. Change it whenever the operator changes.
4. The big box now says **Scan bundle barcode**.

### Scan

5. Scan the bundle label (or type the code and press **Enter**). A green message says *"Bundle … · … recorded"*.
6. The top bar shows **Online** and **N waiting to send**. Scans are sent automatically; press **Send now** to push them at once.

### Offline and problems

7. If Wi-Fi drops, the bar says **Offline — scans are kept on this device** and the message turns amber. Keep scanning; they are sent when the connection returns (checked every 15 seconds).
8. Rejected scans are listed in a red box with time, barcode and reason. Show them to the supervisor, then click **Clear**.

### Today's figures

9. **Today by hour** shows pieces and earned minutes for the line; **Top operators today** ranks operator IDs.

## What happens next

- A bundle counts **once per operation**. Scanning it again — on this or another station — is reported as already counted, never added twice.
- Earned minutes help supervisors compare operators and lines.

## Tips

- Keep this page open all shift; the setup and the waiting queue survive a page reload on the same device.
- Waiting scans belong to the person signed in. On a shared tablet, another login does not see or send them. If you click **Logout** while scans are still waiting, P7 ERP asks first; the scans stay on the tablet and are sent the next time you sign in there and open the scan station.
- Use the **English / বাংলা** switch at the top for operators who prefer Bangla.
- Mount the tablet where the operator can see the green / red message.

## Common problems

- **Operation list says "No operation bulletin for this order"** → Ask IE to create the OB for the style.
- **Scan box is greyed: "Choose line, order and operation first"** → Fill all three.
- **"Device queue is full — connect to the network to send scans"** → Reconnect Wi-Fi and press **Send now**.
- **Rejected: unknown barcode / operation not in bulletin / bad time** → Wrong label, wrong operation chosen, or the tablet clock is wrong. Scans older than 7 days or in the future are refused.`,
      tags: ["scan", "barcode", "bundle", "operation", "SMV", "earned minutes", "shop floor", "offline", "line output"],
      keywords: [
        "bundle tracking",
        "bundle scan",
        "piece rate",
        "WIP",
        "operator efficiency",
        "tablet",
        "scanner",
        "offline",
        "earned minutes",
        "Bangla",
        "বাংলা",
      ],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-11",
      audience: "supervisor",
      coverImage: "/tutorials/screens/production-scan-station.jpg",
      infographics: [
        {
          type: "steps",
          title: "Scan station in three steps",
          steps: [
            {
              title: "Set up the station",
              body: "Choose **Line**, **Order**, **Operation** and type **Operator ID**. In this demo the order has no OB yet, so the Operation list says *No operation bulletin for this order* and the scan box stays grey.",
              imageSrc: "/tutorials/screens/mfg-scan-station-setup.jpg",
              imageAlt:
                "Scan station on a tablet-size screen: line LKH-L01 and order ORD-0007 chosen, operator ID EMP-0142, and the Operation list saying No operation bulletin for this order.",
              href: "/app/production/scan-station",
            },
            {
              title: "Scan each bundle",
              body: "Scan the label or type it and press **Enter**. Green = recorded, amber = saved offline, red = rejected.",
              imageSrc: "/tutorials/screens/production-scan-station.jpg",
              imageAlt: "Scan station with the large scan box, Online status, waiting count and Send now button.",
            },
            {
              title: "Watch today's figures",
              body: "**Today by hour** and **Top operators today** update after each send.",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/production/scan-station", "/app/production/cutting/pipeline", "/app/production/ie/bulletins"],
      relatedArticleIds: ["mfg-supervisor-tablet", "mfg-cutting-pipeline", "mfg-ie-bulletins", "mfg-hourly-deep"],
    },
    {
      id: "mfg-supervisor-tablet",
      title: "For line supervisors on a tablet (Bangla notes / বাংলা নির্দেশনা)",
      summary:
        "A simple daily routine for supervisors using a tablet: scan station, hourly entry and inline QC, with the Bangla words you will see on screen.",
      content: `## Overview

This guide is for **line supervisors, line recorders and QC checkers** who use a **tablet or phone** on the floor. Three screens cover most of the day:

1. **Scan station** — count bundles per operation.
2. **Hourly — Sewing** (or your department) — good and reject pieces per hour.
3. **Shop-floor QC** — hourly inline checks.

The Scan station and Hourly pages have a language switch at the top right: **English** or **বাংলা**. Your choice is remembered on that tablet.

## Before you start

- Log in with your own user. One user can be signed in on **one device** at a time — logging in on a second tablet signs out the first.
- Add the screens to the tablet's home screen or star them (★ in **Ctrl+K** search) so they appear under **Favorites** in the sidebar.
- Ask your manager which **line** and **shift** you report for.

## Steps — daily routine

1. **Start of shift:** open **Scan station**, choose **লাইন (Line)**, **অর্ডার (Order)**, **অপারেশন (Operation)** and type **অপারেটর আইডি (Operator ID)**.
2. **During the shift:** scan each finished bundle. Watch the message: green = recorded, amber = **অফলাইন** (saved on the tablet), red = rejected.
3. **After each hour:** open **Hourly — Sewing**, check **তারিখ (Date)**, **শিফট (Shift)**, **সেলাই লাইন (Sewing line)**, type **ভালো (Good)** and **বাতিল (Reject)** on the hour row, then press **সংরক্ষণ (Save)** on that row.
4. **Inline QC every hour:** open **Shop-floor QC**, choose line and **Hour slot**, type **Total checked**, **Pass qty** and **Fail qty**, press **Save check**. (This page is in English only.)
5. **End of shift:** on the Scan station check **এখনই পাঠান (Send now)** shows **0টি পাঠানোর অপেক্ষায়** (0 waiting) before you close the app.

## Bangla words on screen

- **স্ক্যান স্টেশন** — *Scan station* (bundle counter)
- **অনলাইন / অফলাইন** — *Online / Offline* (Wi-Fi status)
- **বান্ডেল বারকোড স্ক্যান করুন** — *Scan bundle barcode* (ready to scan)
- **আগে লাইন, অর্ডার ও অপারেশন বাছাই করুন** — *Choose line, order and operation first* (setup not finished)
- **এই অর্ডারের অপারেশন বুলেটিন নেই** — *No operation bulletin for this order* (ask IE)
- **আজ ঘণ্টা অনুযায়ী** — *Today by hour* (hourly totals)
- **অর্জিত মিনিট** — *Earned minutes* (pieces × SMV)
- **ঘণ্টাভিত্তিক উৎপাদন** — *Hourly production* (hourly page title)
- **ভালো / বাতিল** — *Good / Reject* (piece counts)
- **সংরক্ষণ** — *Save* (save this hour)
- **রিফ্রেশ** — *Refresh* (reload saved hours)

> **Tip:** The Bangla switch changes only the words. Numbers, codes and operator IDs stay the same.

## What happens next

Your scans and hourly figures appear on **Production Overview** for the manager, and inline QC results feed the **Defect Pareto** and QC dashboards.

## Tips

- Keep the tablet charged and on the factory Wi-Fi; the scan station keeps working offline but hourly **Save** needs the network.
- Hold the tablet in landscape for the scan station — the scan box is larger.
- If the language looks wrong, use the switch at the top right of the page.

## Common problems

- **Signed out suddenly** → Someone logged in with your user on another device. Log in again and tell your manager.
- **Hourly Save does nothing offline** → Wait for Wi-Fi, then **Save** again.
- **Numbers vanished after changing line** → Save each hour before switching line or date.`,
      tags: ["tablet", "supervisor", "Bangla", "scan station", "hourly", "shop floor", "QC"],
      keywords: [
        "বাংলা",
        "Bangla",
        "Bengali",
        "supervisor",
        "line chief",
        "line incharge",
        "tablet",
        "mobile",
        "daily routine",
        "ঘণ্টাভিত্তিক",
        "স্ক্যান",
      ],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "supervisor",
      coverImage: "/tutorials/screens/mfg-scan-station-bn.jpg",
      videos: [
        {
          src: "/tutorials/videos/mfg-hourly-entry.webm",
          poster: "/tutorials/videos/mfg-hourly-entry-poster.jpg",
          title: "Hourly entry with the Bangla switch",
          caption: "Fill Good and Reject for an hour, then switch the page to বাংলা. Save is not clicked.",
          durationSeconds: 49,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Your shift on one tablet",
          steps: [
            {
              title: "Scan station (বাংলা)",
              body: "Choose লাইন, অর্ডার, অপারেশন and অপারেটর আইডি, then scan bundles.",
              imageSrc: "/tutorials/screens/mfg-scan-station-bn.jpg",
              imageAlt: "Scan station shown in Bangla with line, order, operation and operator ID fields.",
              href: "/app/production/scan-station",
            },
            {
              title: "Hourly entry (বাংলা)",
              body: "ভালো (Good) and বাতিল (Reject) per hour, then সংরক্ষণ (Save) on that row.",
              imageSrc: "/tutorials/screens/mfg-hourly-sewing-bn.jpg",
              imageAlt: "Hourly sewing page in Bangla with H1 good and reject typed in.",
              href: "/app/production/hourly/sewing",
            },
            {
              title: "Inline QC",
              body: "**Total checked**, **Pass qty**, **Fail qty** → **Save check**.",
              imageSrc: "/tutorials/screens/qc-shopfloor-inline-form.jpg",
              imageAlt: "Shop-floor QC form with 50 checked, 47 pass, 3 fail.",
              href: "/app/production/quality",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/production/scan-station", "/app/production/hourly/sewing", "/app/production/quality"],
      relatedArticleIds: ["mfg-scan-station", "mfg-hourly-deep", "qc-shop-floor-inline", "gs-login"],
    },
    {
      id: "mfg-crew-sheet",
      title: "Daily crew sheet and weekly crew roster",
      summary:
        "Plan manpower per line and shift: pre-fill from the line template, sync attendance, find substitutes for people on leave, then submit, approve and lock the sheet.",
      content: `## Overview

The **Daily crew sheet** (\`/app/production/crew-daily\`) compares planned and actual people per crew role on a line (or optional unit) for one date and shift. The **Weekly crew roster** (\`/app/production/crew-roster\`) plans Monday–Sunday and pushes a day into the daily sheet. Line chiefs, floor managers and HR use them together.

## Before you start

- Crew roles and line-wise default crew lists are set in **Production setup**.
- Attendance comes from **HR**; **Sync attendance** reads it.

## Steps

### Daily crew sheet

1. Open **Manufacturing → Shop floor → Daily crew sheet**.
2. Choose **Date**, **Shift**, **Mode** (**Sewing line** or **Optional unit**) and the **Line** (or **Unit** and optional **Machine ID**).
3. Click **Pre-fill from template** to load the default roles and counts.
4. Click **Sync attendance** to fill **Actual** from HR attendance.
5. Click **Check leave & substitutes** to see people on approved leave and suggested substitutes.
6. Adjust **Planned**, **Actual**, **Employee** and **Notes** per role. **Shortfall** shows the gap.
7. Click **Save**.
8. Move the sheet through **Submit sheet** → **Approve** → **Lock**. **Reopen** unlocks it if a correction is needed. The line shows *Crew sheet status* (for example **draft**).

### Weekly crew roster

9. Open **Weekly crew roster**, pick **Week start (Monday)**, **Shift** and **Line**, and plan employee numbers per role per day.
10. To create a day's sheet, choose **Push roster → daily date** and click **Generate daily crew**.

## What happens next

- **Crew fill rate** on **Production Overview** uses these sheets.
- Approved or locked sheets cannot be edited until reopened.

## Tips

- Pre-fill and sync first, then only fix the differences.
- Use **Notes** for reasons such as *operator moved to line 2*.

## Common problems

- **"— editing is blocked."** next to the status → The sheet is approved or locked. A manager clicks **Reopen**.
- **Empty table** → Click **Pre-fill from template**, or set the line's default crew list in Production setup.`,
      tags: ["crew", "manpower", "roster", "attendance", "line"],
      keywords: ["manpower", "crew sheet", "roster", "absent", "leave", "substitute", "operator", "helper", "headcount"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      audience: "supervisor",
      coverImage: "/tutorials/screens/production-crew-daily.jpg",
      images: [
        {
          src: "/tutorials/screens/production-crew-daily.jpg",
          alt: "Daily Crew Sheet with Date, Shift, Mode and Line selectors, action buttons and status draft.",
          caption: "Pre-fill, sync attendance, check substitutes, then Save and Submit.",
        },
        {
          src: "/tutorials/screens/production-crew-roster.jpg",
          alt: "Weekly crew roster with week start, shift and line, and a role by day grid.",
          caption: "Weekly crew roster: plan the week and generate a daily sheet.",
        },
      ],
      relatedAppRoutes: ["/app/production/crew-daily", "/app/production/crew-roster", "/app/production/setup"],
      relatedArticleIds: ["mfg-setup", "hr-overview", "mfg-efficiency-reports"],
    },
    {
      id: "mfg-optional-units",
      title: "Optional units: knitting hub, dyeing and other department pages",
      summary:
        "Turn on knitting, dyeing, printing, AOP, embroidery, elastic or washing, then use their department pages and hourly pages.",
      content: `## Overview

Many RMG factories run extra in-house units before or after sewing. P7 ERP calls these **optional units**. Each unit you enable gets a **department page** and an **Hourly** page under **Manufacturing → Units (optional)**.

- **Knitting** — **Knitting hub** \`/app/production/knitting\` · hourly \`/app/production/hourly/knitting\`
- **Dyeing** — \`/app/production/dyeing\` · hourly \`/app/production/hourly/dyeing\`
- **Printing** — \`/app/production/dept/printing\` · hourly \`/app/production/hourly/printing\`
- **AOP (all over print)** — \`/app/production/dept/aop\` · hourly \`/app/production/hourly/aop\`
- **Embroidery** — \`/app/production/dept/embroidery\` · hourly \`/app/production/hourly/embroidery\`
- **Elastic** — \`/app/production/dept/elastic\` · hourly \`/app/production/hourly/elastic\`
- **Washing** — \`/app/production/dept/washing\` · hourly \`/app/production/hourly/washing\`

## Before you start

- Tick the unit in **Production setup → Optional units**.
- **Knitting hub** also needs **Enable Knitting module** in **Settings → Configuration**.
- Non-sewing hourly pages pick a **Machine**, so add the unit's machines first.

## Steps

1. **Knitting hub:** tabs **Overview**, **Plans**, **Charge rates** and **Work orders**. Create a plan (machine, yarn item, target kg, fabric type, gauge); set effective-dated **charge rates** per kg for outsourced jobs; create **work orders** as **In-house**, **Customer job (AR)** or **Subcontract (AP)**; link a work order to its delivery challan or gate pass.
2. **Dyeing:** create **Recipes** (recipe code, color name) and a **New batch** (batch code, recipe ID); batches show on a board grouped by status.
3. **Printing, AOP, Embroidery, Elastic, Washing:** the department page adds simple machine/day plans — **Target**, **UOM** (default \`pcs\`), optional **Order ID** — with **Add plan**.
4. Record output per hour on the unit's **Hourly** page (same steps as hourly sewing, but with **Machine**).

## What happens next

- Knitting subcontract charges accrue to WIP / AP at greige receipt; customer job-work fees post as AR / revenue (see the **Finance & documents** note on the hub).
- Unit hourly output appears in hourly reports and crew sheets (Mode **Optional unit**).

## Tips

- Use the unit cards in Production setup — each has **Hourly production** and **Department page** links.

## Common problems

- **Link missing from the sidebar** → Unit not ticked, or (knitting) the Knitting module is off.
- **Knitting hub opens Production Overview instead** → **Enable Knitting module** is off for your company.`,
      tags: ["knitting", "dyeing", "printing", "washing", "embroidery", "optional units", "department"],
      keywords: ["knitting", "dyeing", "AOP", "all over print", "embroidery", "elastic", "washing", "greige", "subcontract", "job work", "recipe", "batch"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      audience: "production",
      coverImage: "/tutorials/screens/production-setup.jpg",
      images: [
        {
          src: "/tutorials/screens/production-setup.jpg",
          alt: "Production setup Optional units checkboxes: Knitting, Dyeing, Printing, All over print (AOP), Embroidery, Elastic, Washing.",
          caption: "Tick a unit under Optional units to show its pages in the sidebar.",
        },
      ],
      relatedAppRoutes: ["/app/production/setup", "/app/production/knitting", "/app/production/dyeing", "/app/settings/config"],
      relatedArticleIds: ["mfg-setup", "mfg-hourly-deep", "settings-overview"],
    },
    {
      id: "mfg-efficiency-reports",
      title: "Measure production: overview KPIs, efficiency report, WIP and Cost & CM",
      summary:
        "Read today's output and efficiency per line, downtime and OEE-like figures, WIP journal vouchers and CM analysis.",
      content: `## Overview

Four screens tell managers how production is going:

- **Production Overview** (\`/app/production\`) — today's **Output (good qty)**, **Efficiency**, **Crew fill rate**, **CM alerts**, **Cutting bundles**, a **Line status** table and **WIP Journal Vouchers**.
- **Reports → Production Efficiency** (\`/app/reports/production-efficiency\`) — **OEE-like %**, work orders, operations, downtime by reason and the downtime trend.
- **Cost & CM** (\`/app/production/costs\`) — daily cost input, CM overhead config, WIP journal, CM analysis and **Orders over CM budget**.
- **IE & Efficiency** (\`/app/production/ie\`) — operation master per area.

## Before you start

- Figures come from hourly entries, shop-floor operations, downtime logs and inventory issues. Empty screens usually mean nothing was recorded yet.
- **Auto-post WIP journals** is set in **Settings → Configuration**; the Production Overview shows **On** or **Off**.

## Steps

1. Open **Production Overview**. Choose a **Date** and click **Refresh KPIs**.
2. In **Line status**, compare **Good qty** with **Target** and **Eff. %** for each line.
3. If a machine shows a breakdown-risk warning at the top, click **Open setup** to plan maintenance.
4. Scroll to **WIP Journal Vouchers** to see value moved between departments, with links to the order and the voucher.
5. Open **Reports → Production Efficiency** for downtime by reason and the daily trend.
6. Open **Cost & CM**: pick the **Date**, click **Refresh**, enter **Daily cost (simplified)** per department, and click **CM recalc** to refresh the CM analysis. Map overhead categories to GL accounts in **CM overhead config** and click **Save overhead config**.

## What happens next

- CM variance above the **CM alert threshold (%)** (Production setup) raises **CM alerts**.
- WIP journals post to accounts when auto-post is on (Finance sees them as vouchers).

## Tips

- Review **Line status** at mid-day, not only at shift end, so you can still move operators.
- *OEE-like %* is a simple availability × output measure — use it for trends, not as an audited OEE.

## Common problems

- **Efficiency "—"** → No target or no hourly output for that line and date.
- **"No WIP journals yet. Issues / FG receipts create them when auto-post is on."** → Normal until materials are issued or finished goods received.`,
      tags: ["efficiency", "KPI", "WIP", "CM", "OEE", "downtime", "reports"],
      keywords: ["efficiency", "line efficiency", "output", "OEE", "downtime", "WIP", "work in progress", "CM", "cost of making", "target vs actual", "KPI"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      audience: "management",
      coverImage: "/tutorials/screens/production.jpg",
      images: [
        {
          src: "/tutorials/screens/production.jpg",
          alt: "Production overview with KPI cards, line status table and WIP journal vouchers.",
          caption: "Production Overview: pick a date and click Refresh KPIs.",
        },
        {
          src: "/tutorials/screens/reports-production-efficiency.jpg",
          alt: "Production Efficiency report with OEE-like %, work orders, operations, downtime and trend tables.",
          caption: "Reports → Production Efficiency.",
        },
        {
          src: "/tutorials/screens/production-costs.jpg",
          alt: "Cost & CM page with Period, CM overhead config and Daily cost sections.",
          caption: "Cost & CM: daily cost input, CM recalc and overhead mapping.",
        },
      ],
      relatedAppRoutes: ["/app/production", "/app/reports/production-efficiency", "/app/production/costs", "/app/production/ie"],
      relatedArticleIds: ["mfg-overview", "mfg-hourly-deep", "mfg-shop-floor-execution", "reports-overview"],
    },
  ],
};

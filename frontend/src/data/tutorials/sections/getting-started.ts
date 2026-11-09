import type { TutorialSection } from "../types";

export const gettingStartedSection: TutorialSection = {
  id: "getting-started",
  title: "Getting started",
  description: "Sign in, read the dashboard, find any screen, and use lists, search and menus like a pro.",
  articles: [
    {
      id: "gs-at-a-glance",
      title: "Your first day in Prime7 ERP",
      summary:
        "A short map of the whole system: how to get access, what you see after sign-in, and the 8 habits that make daily work easy.",
      featured: true,
      order: -1,
      estimatedMinutes: 6,
      audience: "everyone",
      coverImage: "/tutorials/screens/dashboard.jpg",
      videos: [
        {
          src: "/tutorials/videos/gs-tour-app-shell.webm",
          poster: "/tutorials/videos/gs-tour-app-shell-poster.jpg",
          title: "Tour of the P7 ERP screen",
          caption: "Dashboard, sidebar, Ctrl+K search, the + New menu, the bell and Help & Tutorials in about a minute.",
          durationSeconds: 69,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "Your first day, step by step",
          caption: "Steps 1–4 are done once. Steps 5–8 are the normal daily routine.",
          imageSrc: "/tutorials/diagrams/getting-started/first-day-flow.svg",
          imageAlt:
            "Eight-step flow: get access, sign in, set signature, learn the screen, then daily open dashboard, do your work, approve and follow up, get help",
        },
        {
          type: "flow",
          title: "How the main modules connect",
          steps: [
            { label: "Customers & inquiries", href: "/app/inquiries" },
            { label: "Quotations", href: "/app/quotations" },
            { label: "Orders", href: "/app/orders" },
            { label: "Purchase orders", href: "/app/inventory/purchase-orders" },
            { label: "Goods receiving (GRN)", href: "/app/inventory/goods-receiving" },
            { label: "Production", href: "/app/production" },
            { label: "Delivery challan", href: "/app/inventory/delivery-challans" },
            { label: "Vouchers", href: "/app/accounts/vouchers" },
          ],
        },
      ],
      content: `## Overview

Prime7 ERP (P7 ERP) is one system for a garment business: **merchandising** (buyers, inquiries, quotations, orders), **inventory** (purchase orders, GRN, stock, challans, gate passes), **manufacturing** (planning, cutting, sewing, QC), **commercial** (PI, LC, BTB, export), **HR & payroll** and **finance** (vouchers, ledgers, reports).

This page is for **everyone on their first day** — merchandisers, store keepers, accountants, HR officers and managers. Read it once, watch the 1-minute video, then open the guide for your own job.

## Before you start

- Your admin must create a user for you (**Settings → User Mgmt**). You will get either an **invitation email** or your **Company Code**, **Email** and a first **password**.
- Use a modern browser (Chrome or Edge). The app also works on a phone.
- One user = one person. Do not share a login: signing in on a second device signs the first one out.

## Steps

1. **Get access.** Open the invitation link from your email and click **Activate account**, or ask your admin for your company code and password. See *How to sign in*.
2. **Sign in** at \`/login\` with **Company Code**, **Login as** (**Staff**, or **Tenant admin** for admin accounts), **Email** and **Password**, then click **Sign In**.
3. **Set your signature.** Click your name (top right) → **My Signature**. Type your **Designation** and upload a signature image. It prints on every document you approve.
4. **Learn the screen** (about 10 minutes): the **sidebar** on the left, **Search** (**Ctrl+K**), the **+ New** menu, the **bell** and the **Actions** button on every list row. See *Find your way*.
5. **Every morning, open the Dashboard** (\`/app\`). Look at **Needs attention** first: pending approvals, overdue TNA tasks, critical alerts and late orders. Click a tile to open that list.
6. **Do your work** from your module in the sidebar (or from **Favorites** at the top of the sidebar). Create new records with **+ New**; open, edit or print existing ones with **Actions**.
7. **Approve and follow up.** The **bell** shows your notifications. **Workflow → All Approvals** lists everything waiting for your decision.
8. **Get help.** **Help & Tutorials** (bottom of the sidebar) has a guide for every module. For problems, use **Support → New ticket**.

## What happens next

Most documents move along a chain. One step creates the next one, and the record keeps links back to where it came from:

- Inquiry → quotation → **order** → purchase orders → **GRN** (goods received) → production → **delivery challan** → commercial invoice.
- Money side: purchase bills, payments and receipts all become **vouchers** in Finance and feed the ledgers and reports.

Open any record and look for its *Linked records* / *Document flow* area to jump up or down the chain.

## Tips

- **Ctrl+K** is the fastest way to open anything: type part of a page name or an order / PO / voucher number.
- Star (★) the pages you use daily in the Ctrl+K list. They appear under **Favorites** at the top of the sidebar.
- Every guide has *Related screens in the app* links. Click them to jump straight to the right page.

## Common problems

- **I cannot see a module my colleague sees** → menus depend on your company type, switched-on features and your role. See *What decides the menus you see* and ask your admin.
- **I was signed out suddenly** → someone used your login on another device, or your session expired. See *Signed out: "signed in on another device"*.
- **A page shows "no access"** → your role does not include that module. Ask your admin to update your role in **Settings → Roles**.`,
      tags: ["overview", "getting started", "first day", "workflow", "beginner"],
      keywords: ["start", "new user", "how to use", "introduction", "orientation", "basics", "training", "onboarding", "ki vabe", "shuru"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app", "/app/tutorials", "/app/my-signature", "/app/approvals"],
      relatedArticleIds: [
        "gs-login",
        "gs-dashboard",
        "gs-sidebar",
        "gs-global-search-and-new-menu",
        "gs-profile-and-signature",
        "gs-tenant-modes",
        "sup-create-ticket",
      ],
    },
    {
      id: "gs-login",
      title: "How to sign in (and reset your password)",
      summary:
        "Sign in with Company Code, Login as, Email and Password; activate an invitation; reset a forgotten password; understand login error messages.",
      estimatedMinutes: 4,
      audience: "everyone",
      coverImage: "/tutorials/screens/gs-login-form.jpg",
      infographics: [
        {
          type: "diagram",
          title: "One sign-in page, five ways in",
          caption: "The Login as choice decides where you land. Staff and Tenant admin open the ERP; the portal options open the customer, financier or supplier portal.",
          imageSrc: "/tutorials/diagrams/getting-started/login-options.svg",
          imageAlt: "Login form with Company Code, Login as, Email, Password, and arrows to Staff, Tenant admin, Customer portal, Financier portal and Supplier portal",
        },
        {
          type: "steps",
          title: "Sign in",
          steps: [
            {
              title: "Type your Company Code",
              body: "Capital letters, for example **LAKH806201**. Click outside the box: the line **Organization: …** confirms the company name.",
              imageSrc: "/tutorials/screens/gs-login-form.jpg",
              imageAlt: "Sign-in page with company code filled and organization name shown below it",
            },
            {
              title: "Choose Login as",
              body: "**Staff** for normal users. **Tenant admin** only if your account has the admin role. Portal options are for buyers, banks and suppliers.",
            },
            {
              title: "Email and Password, then Sign In",
              body: "Use the eye icon to check what you typed. After sign-in you land on the **Dashboard** (`/app`).",
              href: "/app",
            },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/gs-forgot-password.jpg",
          alt: "Forgot password page with Company code, Login as and Email fields and a Send reset link button",
          caption: "Forgot password: enter the same Company code, Login as and Email you use to sign in, then click Send reset link.",
        },
      ],
      content: `## Overview

Prime7 ERP is **multi-tenant**: many companies use the same system, and each company's data is kept separate. That is why you always sign in with your company's **Company Code** plus your own **Email** and **Password**.

Everyone signs in on the same page: \`/login\`.

## Before you start

- Get your **Company Code** from your admin (it is also shown under your name in the sidebar after you sign in).
- Your admin creates your user in **Settings → User Mgmt** and gives you a password, or sends you an **invitation email**.
- Fields marked with **\\*\\*** on the sign-in page are mandatory.

## Steps

### Sign in

1. Open \`/login\` (or click **Login** on the website).
2. Type your **Company Code** (letters are changed to capitals automatically). When you leave the box, the page shows **Organization: your company name** — if it does not, the code is wrong.
3. Choose **Login as**:
   - **Staff** — normal users (merchandiser, store, accounts, HR, production…).
   - **Tenant admin** — only for accounts with the **admin** role. Admin accounts *must* use this option.
   - **Customer portal**, **Financier portal**, **Supplier portal** — for outside users your company has invited. They land in their own portal, not in the ERP.
4. Type your **Email** and **Password**. Click the eye icon to show the password if you are unsure.
5. Click **Sign In**. You land on the **Dashboard** (\`/app\`). If you were sent to the login page from a link, you go back to that page instead.

### First time: accept an invitation

1. Open the link in the invitation email. It opens **Accept staff invitation → Create your password** (\`/accept-invite\`).
2. Check your **First name** and **Last name**.
3. Type a **Password** (at least 8 characters) and the same again in **Confirm password**.
4. Click **Activate account**. You are signed in straight away.

### Forgot your password

1. On the sign-in page click **Forgot password?** (next to the Password label).
2. Enter your **Company code**, the same **Login as** choice and your **Email**, then click **Send reset link**.
3. You see **Check your inbox**. Open the email and click the link. It opens **Set a new password** (\`/reset-password\`).
4. Type the **New password** twice (at least 8 characters) and click **Update password**. You are sent back to sign in.

## What happens next

- The company code is remembered on this computer, so next time it is already filled in.
- Your session ends when you click **Logout** (your name, top right), when it expires, or when the same account signs in on another device.
- **One session per browser:** signing in (as staff, or to the customer / financier / supplier portal) signs out any other Prime7 session that was open in the same browser, including other tabs. Use a separate browser profile if you really need two accounts at once.

## Tips

- Sign in on the website address your admin gave you (for example \`https://prime7erp.com/login\`). Never type your password into a link that came from an unknown email.
- The reset link works only for a short time. If it has expired, ask for a new one.
- The **Portals** menu in the top bar opens the same sign-in page with **Customer portal** or **Financier portal** already chosen.

## Common problems

| Message | What it means | Fix |
|---|---|---|
| **Company code, email and password are required** | A box is empty | Fill all three and try again |
| **Invalid credentials** | Wrong company code, email or password (or the user is inactive) | Check the Organization line, retype the password, or use **Forgot password?** |
| **Admin accounts must use the Tenant admin login option** | You have the admin role | Change **Login as** to **Tenant admin** |
| **This account does not have admin privileges** | You chose Tenant admin but are not an admin | Change **Login as** to **Staff** |
| **Account temporarily locked due to failed login attempts** | Too many wrong passwords | Wait a while, then try again, or ask your admin |
| **Missing invitation token** / **This page needs a valid invite link** | The invite page was opened without the email link | Open the link from the email again or ask the admin to resend it |
| **Passwords do not match** / **Password must be at least 8 characters** | Typing mistake on invite or reset | Retype both boxes the same, 8+ characters |
| **A new version is available** | Prime7 ERP was updated while your tab was open | Click **Reload** (the app normally reloads by itself once). Unsaved form entries on that screen are lost, so save drafts before long breaks |`,
      tags: ["login", "sign in", "company code", "password", "tenant", "invite"],
      keywords: [
        "log in",
        "signin",
        "forgot password",
        "reset password",
        "tenant admin",
        "invitation",
        "activate account",
        "locked",
        "invalid credentials",
        "customer portal login",
        "financier portal login",
        "supplier portal",
      ],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/login", "/forgot-password", "/reset-password", "/accept-invite", "/app"],
      relatedArticleIds: ["gs-session-replaced", "gs-dashboard", "gs-at-a-glance", "gs-profile-and-signature"],
    },
    {
      id: "gs-session-replaced",
      title: "Signed out: \"this account signed in on another device\"",
      summary:
        "Why P7 ERP allows one active device per user, what the sign-out message means, and what to do if you did not sign in elsewhere.",
      estimatedMinutes: 2,
      audience: "everyone",
      coverImage: "/tutorials/screens/gs-login-session-replaced.jpg",
      infographics: [
        {
          type: "diagram",
          title: "The newest sign-in wins",
          caption: "Signing in on a second device ends the session on the first device.",
          imageSrc: "/tutorials/diagrams/getting-started/one-device-session.svg",
          imageAlt: "Four steps: office PC signed in, same account signs in on phone, office PC sent to sign-in page with a message, sign in again returns to the same page",
        },
      ],
      content: `## Overview

For security, **one user can be signed in on only one device at a time**. When the same account signs in on another computer, phone or browser, the older one is signed out the next time it talks to the server.

The older screen then shows the sign-in page with this note above the form:

> **You were logged out because this account signed in on another device.**

This is different from:

> **Your session expired. Please sign in again to continue.** — you were inactive for too long.

## Before you start

- Nothing to set up. This rule is on for every company by default.

## Steps

1. Read the message on the sign-in page to see which case it is (*another device* or *session expired*).
2. Sign in again with your **Company Code**, **Login as**, **Email** and **Password**.
3. You are taken back to the page you were on. Anything you had typed but **not saved** is lost — type it again and save.
4. If you did **not** sign in anywhere else, someone else may know your password:
   - Click **Forgot password?** and set a new password at once.
   - Tell your admin (or raise **Support → New ticket**, category **Access / users**).

## What happens next

- The other device is now signed out instead. Only your latest sign-in stays active.

## Tips

- Use **one browser** for P7 ERP. Opening it in a second browser (for example Chrome and Edge) also counts as a second device.
- Several tabs in the **same** browser are fine — they share one session.
- Shared office PC? Click your name → **Logout** when you leave, so the next person signs in as themselves.

## Common problems

- **I keep getting signed out every few minutes** → two people are using the same login. Ask your admin to create a separate user for each person (**Settings → User Mgmt**).
- **Signed out on my phone after using my laptop** → expected. Sign in on the device you are using now.`,
      tags: ["login", "session", "security", "signed out", "device"],
      keywords: ["logged out", "kicked out", "session replaced", "another device", "single session", "session expired", "auto logout"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/login", "/forgot-password", "/app/settings/users"],
      relatedArticleIds: ["gs-login", "sup-create-ticket"],
    },
    {
      id: "gs-dashboard",
      title: "Dashboard: what to check every morning",
      summary:
        "Read the Needs attention tiles, key metrics, date range, pipeline, AI daily brief and quick actions on your home screen.",
      estimatedMinutes: 5,
      audience: "everyone",
      coverImage: "/tutorials/screens/dashboard.jpg",
      infographics: [
        {
          type: "steps",
          title: "Read the dashboard from top to bottom",
          steps: [
            {
              title: "Greeting, date range and Refresh",
              body: "Pick **This week**, **This month** or **Last 90 days**. Click **Refresh** to reload the numbers.",
              imageSrc: "/tutorials/screens/dashboard.jpg",
              imageAlt: "Dashboard header with greeting, three summary numbers and date range buttons",
            },
            {
              title: "Needs attention",
              body: "Each tile counts work waiting: **Pending approvals**, **TNA overdue**, **Critical alerts**, **Promise blocked**, **Commercial pending**, **Post-dated due**. Click a tile to open that list.",
              imageSrc: "/tutorials/screens/gs-dashboard-attention.jpg",
              imageAlt: "Needs attention tiles with counts for pending approvals, TNA overdue, critical alerts and promise blocked",
            },
            {
              title: "Key Metrics",
              body: "Active orders, quoted this month, pending approvals, inventory items and customers. **View details** opens the list behind each number.",
              imageSrc: "/tutorials/screens/gs-dashboard-kpis.jpg",
              imageAlt: "Key Metrics cards with View details links",
            },
            {
              title: "Pipeline & brief",
              body: "The **Order Pipeline** chart, the **AI daily brief** (click **Generate Brief**) and the **Cash Flow AI Brief**.",
              imageSrc: "/tutorials/screens/gs-dashboard-brief.jpg",
              imageAlt: "Order pipeline chart next to AI daily brief and Cash Flow AI Brief cards",
            },
            {
              title: "Quick Actions",
              body: "Shortcuts for your role: new inquiry, new quotation, follow-up TNA, critical alerts, stock and more.",
              imageSrc: "/tutorials/screens/gs-dashboard-quick-actions.jpg",
              imageAlt: "Quick Actions grid with buttons such as New Inquiry and New Quotation",
            },
          ],
        },
      ],
      content: `## Overview

The **Dashboard** (\`/app\`) is the first screen after sign-in and the **Dashboard** link at the top of the sidebar. It answers two questions every morning: *what needs me today?* and *how is the business doing?*

Managers, merchandisers and accountants all use it; the blocks you see depend on your role.

## Before you start

- No setup needed. The numbers come from the records your team has entered.
- Admins and managers may first see a **Get started with Prime7 ERP** card with setup steps (team, first buyer, supplier, items, order, voucher, employees). Each step ticks itself off when the data exists. Click **×** to hide it.

## Steps

1. **Check the header.** You see a greeting, today's date and **Last updated**. Three small numbers on the right show **Active orders**, **Shipped (status)** and **On-time est.**
2. **Pick a Date range**: **This week**, **This month** or **Last 90 days**. Click **Refresh** if you want the latest figures now.
3. **Work through Needs attention.** Orange or red tiles have work waiting:
   - **Pending approvals** → opens **All Approvals**.
   - **TNA overdue** → follow-up / TNA tasks past their date.
   - **Critical alerts** → merchandising alerts (price, material, delay risks).
   - **Promise blocked** → orders at risk of missing the delivery date.
   - **Commercial pending** → commercial change requests waiting.
   - **Post-dated due** → post-dated cheques/vouchers due today.

   When nothing is waiting you see a green **All systems clear — no items need attention.**
4. **Read alert strips** below the tiles if shown (for example **Pending price verification** for orders whose real cost differs from the costing). Click a line to open the order, or **Dismiss all** to hide them on this browser.
5. **Look at Key Metrics.** Each card has a **View details** link to the list behind the number.
6. **Ask a figure.** Type a question such as *How many orders are late?* and click **Ask**. If the answer is useful, click **Pin card** to keep it on your dashboard.
7. **Pipeline & brief.**
   - **Order Pipeline** shows how many orders sit at each stage — **Inquiry**, **Quote**, **Order**, **BOM**, **PO**, **GRN**, **Cut**, **Sew** — plus a donut by status.
   - **AI daily brief**: click **Generate Brief** (later **Refresh**) for a short written summary of the figures.
   - **Cash Flow AI Brief**: click **Generate** for a 30/60/90-day cash view; **Open Finance Forecast** opens AI Predictions.
   - **Financial health** (managers and finance): net profit, cash and runway, with **Open MIS dashboard**.
8. **Recent activity** lists the latest orders and tasks.
9. **Quick Actions** at the bottom start common jobs for your role (for example **New Inquiry**, **New Quotation**, **Follow-up & Unified TNA**, **Critical Alerts**, **Inventory FIFO**).

## What happens next

- Every tile, card and link opens the real list, so you can act straight away (approve, update a TNA task, fix an alert).
- The same "needs attention" counts also appear in the **bell** in the top bar.

## Tips

- **Quoted this month** comes from quotations, not from posted finance revenue.
- On a phone, pull the dashboard down to refresh it.
- Expand **ERP AI phases (advanced)** at the very bottom only when you need the advanced AI tools.

## Common problems

- **All numbers are zero** → the date range may be too short; choose **Last 90 days**. A new company with no data also shows zeros.
- **AI daily brief does not generate** → AI may not be set up for your company. The rest of the dashboard still works.
- **A block my manager sees is missing** → blocks are chosen by role (merchandiser, finance, planning, manager).`,
      tags: ["dashboard", "home", "overview", "attention", "kpi", "ai brief"],
      keywords: [
        "home page",
        "needs attention",
        "pending approvals",
        "tna overdue",
        "critical alerts",
        "key metrics",
        "quick actions",
        "daily brief",
        "ask a figure",
        "pin card",
        "get started checklist",
      ],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app"],
      relatedArticleIds: ["gs-sidebar", "wf-approvals", "gs-bell-and-ai-assistant", "gs-at-a-glance"],
    },
    {
      id: "gs-sidebar",
      title: "Find your way: sidebar, top bar and breadcrumbs",
      summary:
        "Every part of the P7 ERP frame explained: sidebar sections, Favorites, collapse mode, the top bar buttons, breadcrumbs and the status footer.",
      estimatedMinutes: 5,
      audience: "everyone",
      coverImage: "/tutorials/screens/gs-sidebar-merch-open.jpg",
      videos: [
        {
          src: "/tutorials/videos/gs-tour-app-shell.webm",
          poster: "/tutorials/videos/gs-tour-app-shell-poster.jpg",
          title: "Tour of the P7 ERP screen",
          caption: "Sidebar, search, + New, bell and Help & Tutorials.",
          durationSeconds: 69,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "Map of the screen",
          caption: "Find the number on the picture, then read what it does on the right.",
          imageSrc: "/tutorials/diagrams/getting-started/app-shell-map.svg",
          imageAlt: "Annotated drawing of the P7 ERP screen with 16 numbered callouts for sidebar, top bar, list toolbar, row Actions and footer",
        },
      ],
      images: [
        {
          src: "/tutorials/screens/gs-sidebar-collapsed.jpg",
          alt: "Sidebar collapsed to a narrow strip of section icons, giving the page more width",
          caption: "Collapsed sidebar: icons only. Hover an icon to see its pages; click › at the top to open the full sidebar again.",
        },
        {
          src: "/tutorials/screens/gs-portals-menu.jpg",
          alt: "Portals menu open in the top bar with Customer portal, Financier portal and Manage external access",
          caption: "Portals: sign-in links for buyers and banks, plus Manage external access for admins.",
        },
      ],
      content: `## Overview

Every page in P7 ERP sits inside the same frame: the **sidebar** on the left, the **top bar** above, **breadcrumbs** under it, the page in the middle and a thin **status footer** at the bottom. Once you know the frame, every module feels familiar.

## Before you start

- You only see the sections your company and role allow. See *What decides the menus you see*.

## Steps

### Sidebar (left)

1. **Logo** — click it to go to the Dashboard. The **‹** button next to it collapses the sidebar to icons; **›** opens it again. The choice is remembered.
2. **Your card** — your name, your company and **Code:** (your company code).
3. **Favorites** — pages you starred (★ in Ctrl+K search). One click jumps back. Until you star a page it shows a short hint instead.
4. **Sections** — **Dashboard**, **Support**, **Merchandising**, **Export & Import**, **Operations**, **Inventory**, **Manufacturing**, **Quality**, **AI Tools**, **HR**, **Finance**, **Workflow**, **Reports**, **Settings**. Click a section name to open it; click again to close. Only one section is open at a time, and the last one you opened is remembered on this browser. While you scroll a long section, its name stays pinned at the top of the sidebar.
5. Big sections are split into **sub-groups** (for example Merchandising → **Sales**, **Planning**, **Analytics**, **Operations**).
6. The page you are on has a short **orange bar** on its left.
7. **Help & Tutorials** at the very bottom opens these guides (\`/app/tutorials\`).
8. **Collapsed mode:** hover a section icon to open a **flyout** with its pages. Dark tooltips show the names.

### Top bar

1. **Search pages, orders, customers…** (or **Ctrl+K**) — find any page or record. See *Search (Ctrl+K) and the + New menu*.
2. **+ New** — start a new inquiry, quotation, order, customer, PO, challan or voucher.
3. **Portals** — sign-in links for the **Customer portal** and **Financier portal**, plus **Manage external access** (admins).
4. **✦ (Prime7 AI)** — opens the AI assistant panel.
5. **Keyboard icon** — list of keyboard shortcuts (or press **?**).
6. **Bell** — work waiting and your notifications.
7. **Your name** — **My Profile**, **My Signature**, **Settings**, **Logout**.

### Under and below the page

- **Breadcrumbs** (for example *Home › Merchandising › Customers*) show where you are, including the record you opened. Click any part to go back up.
- **Status footer** shows *Prime7 ERP*, the date and time. Admins and managers also see **System:** status and the version.
- A yellow **Demo Mode** banner appears only on demo companies; blue or yellow notices at the top are announcements from the P7 team.

## What happens next

- Starred pages stay in **Favorites** on this browser until you un-star them.

## Tips

- Short on screen space? Collapse the sidebar with **‹** and use **Ctrl+K** to jump around.
- Press **Esc** to close search, the bell panel, dialogs and row menus. Top-bar menus (**+ New**, **Portals**, your name) close when you click anywhere else.

## Common problems

- **A section disappeared** → your admin changed your role or switched off a feature. See *What decides the menus you see*.
- **The sidebar is missing** → the window is narrow (tablet / phone). Use the bottom bar and **More** instead. See *Using P7 ERP on a phone*.`,
      tags: ["navigation", "sidebar", "menu", "top bar", "breadcrumbs", "favorites"],
      keywords: ["left menu", "collapse sidebar", "where is", "find page", "help and tutorials", "footer", "portals menu"],
      lastUpdated: "2026-11-09",
      relatedAppRoutes: ["/app", "/app/tutorials"],
      relatedArticleIds: [
        "gs-global-search-and-new-menu",
        "gs-bell-and-ai-assistant",
        "gs-profile-and-signature",
        "gs-tenant-modes",
        "gs-mobile-use",
      ],
    },
    {
      id: "gs-global-search-and-new-menu",
      title: "Search (Ctrl+K) and the + New menu",
      summary:
        "Open any page or record in two keystrokes, star favorite pages, and start new documents from the + New menu or keyboard shortcuts.",
      estimatedMinutes: 3,
      audience: "everyone",
      coverImage: "/tutorials/screens/gs-search-records.jpg",
      infographics: [
        {
          type: "steps",
          title: "Find anything with Ctrl+K",
          steps: [
            {
              title: "Press Ctrl+K (or click the search box)",
              body: "On a Mac use **Cmd+K**. You can also press **/** when you are not typing in a field.",
              imageSrc: "/tutorials/screens/gs-search-palette.jpg",
              imageAlt: "Search window showing Create shortcuts and a list of pages",
            },
            {
              title: "Type 2 or more letters",
              body: "Pages match by name. **Records** (customers, orders, POs, vouchers, items, vendors, employees) match by code or name.",
              imageSrc: "/tutorials/screens/gs-search-records.jpg",
              imageAlt: "Search window with ORD typed and matching order records listed",
            },
            {
              title: "Press Enter or click",
              body: "Use **↑ ↓** to move. Click the **★** next to a page to add it to Favorites.",
            },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/gs-new-menu.jpg",
          alt: "The + New menu open in the top bar with New inquiry, New quotation, New order, New customer, New PO, New challan, Items and New voucher",
          caption: "+ New lists only the documents your role can create.",
        },
        {
          src: "/tutorials/screens/gs-shortcuts-sheet.jpg",
          alt: "Keyboard shortcuts window listing Ctrl+K, slash, question mark, arrows, Enter, Esc and voucher shortcuts F4 to F7",
          caption: "Press ? (or click the keyboard icon) to see every shortcut.",
        },
      ],
      content: `## Overview

You do not need to click through menus to reach a screen. **Search** (Ctrl+K) opens any page or record, and **+ New** starts a new document from anywhere.

## Before you start

- Search shows only pages your role can open. Record search covers **customers, orders, purchase orders, vouchers, items, vendors and employees** of your own company.

## Steps

### Search for a page or record

1. Press **Ctrl+K** (Mac: **Cmd+K**) or click **Search pages, orders, customers…** in the top bar. Pressing **/** also works when you are not typing in a box.
2. With an empty box you see three groups: **Create** (quick new-document links), **Pages**, and later **Records**.
3. Type part of what you want:
   - a page name — *challan*, *trial balance*, *leave*;
   - a code — *ORD-0012*, *PO-00045*, a voucher number;
   - a name — a buyer, supplier, item or employee.
4. After **2 letters** the **Records** group fills in (a spinner shows while it searches).
5. Use **↑ / ↓** and press **Enter**, or click the line. **Esc** closes the search.
6. To keep a page handy, click the **★** on its line. It appears under **Favorites** in the sidebar. Click the ★ again to remove it.

### Start a new document

1. Click **+ New** in the top bar.
2. Pick what to create. Depending on your role you may see **New inquiry**, **New quotation**, **New order**, **New customer**, **New PO**, **New challan**, **Items** and **New voucher**.
3. The form opens. Fill it in and save as usual.

Accountants can also type *payment*, *receipt*, *journal* or *contra* in Ctrl+K to open **New payment voucher**, **New receipt voucher**, **New journal voucher** or **New contra voucher** directly.

### Keyboard shortcuts

Press **?** (or click the keyboard icon) to see the list:

| Keys | Does |
|---|---|
| **Ctrl+K** | Search pages and records |
| **/** | Open search when not typing in a field |
| **?** | Show the shortcut list |
| **↑ ↓**, **Enter**, **Esc** | Move, open, close |
| **F4 / F5 / F6 / F7** (or **Alt+4…7**) | Vouchers page: new Contra / Payment / Receipt / Journal |
| **Ctrl+Enter** | Voucher form: save draft |
| **Ctrl+Shift+Enter** | Voucher form: save and submit |

## What happens next

- Pages you star (★) in search are added to **Favorites** in the sidebar.

## Tips

- Search is not case-sensitive: *ord-12* finds *ORD-0012*.
- On a phone the **+ New** button is the round orange **+** above the bottom bar.

## Common problems

- **"No results"** → check the spelling, or type fewer letters. The record may belong to another company or module you cannot access.
- **+ New does not show New voucher** → only finance roles, admins and managers can create vouchers.`,
      tags: ["search", "command palette", "ctrl+k", "new", "create", "shortcuts", "favorites"],
      keywords: ["find", "quick search", "global search", "keyboard", "hotkey", "new menu", "create new", "star", "f5 payment", "f6 receipt"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app", "/app/inquiries/new", "/app/orders/new", "/app/accounts/vouchers"],
      relatedArticleIds: ["gs-sidebar", "gs-row-actions", "gs-mobile-use"],
    },
    {
      id: "gs-bell-and-ai-assistant",
      title: "Notifications bell and the AI assistant",
      summary:
        "See team work waiting and your personal notifications in the bell, and ask the Prime7 AI assistant questions from any page.",
      estimatedMinutes: 3,
      audience: "everyone",
      coverImage: "/tutorials/screens/gs-bell-panel.jpg",
      images: [
        {
          src: "/tutorials/screens/gs-bell-panel.jpg",
          alt: "Bell panel open with a Needs attention list and a For you list of notifications",
          caption: "Top: work waiting for the team. Bottom: notifications just for you.",
        },
        {
          src: "/tutorials/screens/gs-ai-drawer.jpg",
          alt: "Prime7 AI Assistant panel open on the right side of the screen",
          caption: "The ✦ button opens the Prime7 AI Assistant on any page.",
        },
      ],
      content: `## Overview

Two buttons in the top bar help you stay on top of work:

- The **bell** shows *work waiting for the team* and *notifications for you*.
- The **✦** button opens the **Prime7 AI Assistant**, which answers questions about your data and the screen you are on.

## Before you start

- The bell works for everyone. Its red number adds your **unread notifications** plus pending approvals, critical alerts and overdue TNA tasks.
- AI features must be set up for your company. If the assistant does not answer, ask your admin.

## Steps

### Use the bell

1. Click the **bell**. A red number on it means something needs attention.
2. **Needs attention** (top part) lists counts such as **Pending approvals**, **Critical alerts**, **Overdue TNA tasks**, **Orders past delivery date**, **Commercial change requests** and **Post-dated vouchers due**. Click a line to open that list. If nothing is waiting you see *Nothing waiting. Nice work.*
3. **For you** (bottom part) lists personal notifications — for example when your voucher is approved or rejected, or your payroll run is sent back. Unread ones are **bold** with an orange dot.
4. Click a notification to open the record. It is marked as read.
5. Click **Mark all read** to clear the unread count.
6. Click **Open all approvals** at the bottom to go to **Workflow → All Approvals**.

### Ask the AI assistant

1. Click **✦** (title **Prime7 AI**) in the top bar.
2. The **Prime7 AI Assistant** panel opens on the right (*Available from any app page*). Earlier messages show under **Conversation**.
3. Type a question in plain English in the box at the bottom, for example *Which orders ship this week?* or *Explain this order*, and click **Send**.
4. On a record page a chip such as **Asking about this order** appears above the box — the assistant uses that screen as context. Click its **×** for a general answer instead.
5. While it works you see *Local AI is thinking...*. Some questions offer a cloud AI step that you must approve first.
6. Click **+ New** for a fresh conversation, and **×** to close the panel. A full-page assistant is in **AI Tools → AI Assistant**.

## What happens next

- The bell checks for new notifications about once a minute while the page is open.
- AI answers are suggestions. Any change to data still needs a person to confirm it.

## Tips

- Notifications are the fastest way to know a document you submitted was approved — no need to keep checking the list.
- Do not paste passwords or bank details into the AI assistant.

## Common problems

- **The red number does not go away** → it also counts pending approvals and alerts. Clear those in their lists; **Mark all read** only clears notifications.
- **AI says it is thinking for a long time** → the local AI may be busy. Try again later or ask a shorter question.`,
      tags: ["notifications", "bell", "alerts", "ai", "assistant", "chat"],
      keywords: ["notification", "unread", "mark all read", "ai chat", "prime7 ai", "ask ai", "copilot", "what is waiting"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app", "/app/approvals", "/app/ai/assistant"],
      relatedArticleIds: ["wf-approvals", "gs-dashboard", "gs-sidebar"],
    },
    {
      id: "gs-profile-and-signature",
      title: "Your menu: profile, signature and logout",
      summary:
        "Use the menu under your name to open My Profile, set your designation and signature image, and sign out safely.",
      estimatedMinutes: 3,
      audience: "everyone",
      coverImage: "/tutorials/screens/gs-user-menu.jpg",
      images: [
        {
          src: "/tutorials/screens/my-signature.jpg",
          alt: "My Signature page with Name, Designation, Save designation and Signature image upload area",
          caption: "My Signature: your designation and signature image print on documents you approve.",
        },
      ],
      infographics: [
        {
          type: "flow",
          title: "Set up once",
          steps: [
            { label: "Your name (top right)" },
            { label: "My Signature", href: "/app/my-signature" },
            { label: "Save designation" },
            { label: "Upload image" },
          ],
        },
      ],
      content: `## Overview

Click **your name** at the top right of any page. The menu shows your name, email, company and **Company code**, and these links:

| Item | What it does |
|---|---|
| **My Profile** | Your employee self-service profile (\`/app/hr/ess/profile\`) |
| **My Signature** | Designation + signature image for printed documents (\`/app/my-signature\`) |
| **Settings** | Company settings (admins and users with settings access) |
| **Logout** | Signs you out |

## Before you start

- **My Profile** is part of HR self-service. If your company does not use HR, it may show *no access* — that is normal.
- For the signature image, sign on white paper, scan or photograph it and crop it tightly.

## Steps

### Set your designation and signature (once)

1. Click your name → **My Signature**.
2. Check **Name** (it comes from your user account; ask the admin to fix spelling).
3. Type your **Designation**, for example *Store Officer* or *Finance Manager*, and click **Save designation**. You see **Designation saved.**
4. Under **Signature image** click **Upload image** and pick a **PNG, JPG or WEBP** file up to **2 MB**. A PNG with a transparent background looks best. You see **Signature image uploaded.** and a preview.
5. Later you can click **Replace image** or **Remove image**.

### Sign out

1. Click your name → **Logout** (red). Always do this on shared computers.

### Language (English / বাংলা)

Some shop-floor and self-service screens have a small **English / বাংলা** switch at the top: **Scan station**, **Hourly production**, and the HR self-service pages (**My attendance**, **My leave**, **My payslips**). The choice is remembered on this device. Other screens are in English.

## What happens next

- From now on your name, designation, date/time and signature image print in the signature block of every voucher, challan, gate pass, GRN and other document you approve. See *Digital signatures on approved documents*.

## Tips

- If the upload says **Image is too large (max 2 MB).**, crop the picture or save it as a smaller JPG.
- Documents you approved earlier show the new image the next time they are printed.

## Common problems

- **My Profile shows no access** → your role has no HR access. Ask your admin if you need it.
- **Settings is missing or empty** → only admins (and roles with settings access) can change company settings.
- **Looking for dark mode?** → P7 ERP always uses the light colours, even when your phone or computer is set to dark. This keeps every page and printout readable.`,
      tags: ["profile", "signature", "designation", "logout", "language", "bangla"],
      keywords: ["my profile", "my signature", "upload signature", "e-signature", "theme", "dark mode", "night mode", "sign out", "log out", "bengali", "bangla language"],
      lastUpdated: "2026-11-09",
      relatedAppRoutes: ["/app/my-signature", "/app/hr/ess/profile", "/app/settings"],
      relatedArticleIds: ["wf-digital-signatures", "gs-sidebar", "gs-login"],
    },
    {
      id: "gs-mobile-use",
      title: "Using P7 ERP on a phone",
      summary:
        "Bottom bar tabs, the More menu, quick-create + button, mobile shortcuts and pull-to-refresh for people who work from the floor or the road.",
      estimatedMinutes: 3,
      audience: "everyone",
      coverImage: "/tutorials/screens/gs-mobile-home.jpg",
      infographics: [
        {
          type: "steps",
          title: "Phone layout",
          steps: [
            {
              title: "Bottom bar",
              body: "**Home**, **Sales**, **Stock**, **Finance** and **More** — always at the bottom.",
              imageSrc: "/tutorials/screens/gs-mobile-home.jpg",
              imageAlt: "Dashboard on a phone with the bottom navigation bar and round plus button",
            },
            {
              title: "More → All Modules",
              body: "The same sections as the computer sidebar, a **Filter modules and pages…** box, **Mobile shortcuts** and **Stakeholder portals**.",
              imageSrc: "/tutorials/screens/gs-mobile-more.jpg",
              imageAlt: "All Modules drawer on a phone with a filter box and mobile shortcuts",
            },
            {
              title: "Round + button",
              body: "Quick create: new inquiry, quotation, order, customer, PO, challan or voucher.",
              imageSrc: "/tutorials/screens/gs-mobile-quick-create.jpg",
              imageAlt: "Quick create menu opened from the round orange plus button on a phone",
            },
          ],
        },
      ],
      content: `## Overview

P7 ERP works in the phone's browser — no app to install. On small screens the sidebar is replaced by a **bottom bar**, and **+ New** becomes a round orange **+** button. Store keepers, supervisors and merchandisers on the move use it most.

## Before you start

- Open the same address you use on the computer and sign in normally.
- Remember: signing in on the phone signs you out on the computer (one user, one device).

## Steps

1. **Bottom bar tabs:**
   - **Home** — the Dashboard.
   - **Sales** — Orders (also lights up for inquiries, quotations, customers, commercial and trade pages).
   - **Stock** — Inventory stock master.
   - **Finance** — the Chart of Accounts and other finance pages.
   - **More** — opens **All Modules**.
   Tabs for modules your role cannot open (for example **Finance**) are not shown.
2. **More → All Modules:** it lists exactly the same sections and pages as the sidebar on a computer. Type in **Filter modules and pages…** to find a page by name (only the matching pages stay), or scroll the sections. Close it with **×**, by tapping outside, or by opening a page. With the filter empty, the top shows:
   - **Mobile shortcuts** — **Scan barcode / stock**, **Quick clock-in** (your attendance), **Report defect** (production quality). A shortcut only appears when you can open its module.
   - **Stakeholder portals** — **Customer portal login**, **Financier portal login**, **Manage external access** (only with Settings access).
3. **Round + button** (above the bottom bar, right side) — opens a quick-create menu. Tap again (**×**) to close. It is hidden on *new* and *edit* forms and on shop-floor entry screens (**Hourly production**, **Scan station**, **Gate scan**) so it never covers a **Save** button.
4. **Search** — tap the search box at the top; it works the same as **Ctrl+K** on a computer. The **bell** and **Help** panels open full width on a phone.
5. **Refresh the dashboard** — pull the page down until it says **Release to refresh**.
6. **Wide tables** scroll sideways; some inventory lists offer a **Cards** view that is easier to read on a phone.
7. **Print or save as PDF** — tap **Print** / **Print / Save PDF** on the page. The phone's print screen opens with only the document (no menus); choose a printer or **Save as PDF**. The whole document prints, not just the part you see on screen.
8. **Export / Download** (CSV, Excel, PDF) — on Android the file goes to **Downloads**. On iPhone and iPad the **share sheet** opens: tap **Save to Files** (or send it by mail or WhatsApp).

> **Tip:** P7 ERP always uses its light colours, even when the phone is in dark mode, so screens and printouts stay readable.

## What happens next

- Everything you save on the phone is saved in the same system. Colleagues see it immediately.

## Tips

- Turn the phone sideways for wide tables and forms.
- Shop-floor screens such as **Scan station** have an **English / বাংলা** switch.
- Add the sign-in page to your phone's home screen for one-tap access.

## Common problems

- **I signed in on the phone and my PC logged out** → expected; only one device can be active per user.
- **A button is hidden off the screen** → scroll the table sideways or turn the phone to landscape.
- **Nothing happens when I tap Download on iPhone** → look for the share sheet at the bottom of the screen; if you closed it, tap **Download** again.
- **The print shows only one page** → refresh the page so the phone loads the latest version of P7 ERP, then print again.`,
      tags: ["mobile", "phone", "tablet", "bottom navigation", "quick create", "print", "download"],
      keywords: ["android", "iphone", "smartphone", "mobile app", "bottom bar", "more menu", "scan barcode", "clock in", "report defect", "pull to refresh", "save pdf", "export csv", "share sheet", "save to files", "dark mode"],
      lastUpdated: "2026-11-09",
      relatedAppRoutes: ["/app", "/app/inventory/stock-inventory-summary", "/app/hr/ess/attendance", "/app/production/quality"],
      relatedArticleIds: ["gs-sidebar", "gs-global-search-and-new-menu", "gs-session-replaced"],
    },
    {
      id: "gs-tenant-modes",
      title: "What decides the menus you see (company type and features)",
      summary:
        "Company type (manufacturer, buying house, both), feature switches, production units and your role together decide which menus appear.",
      estimatedMinutes: 4,
      audience: "admin",
      coverImage: "/tutorials/screens/settings-tenant.jpg",
      infographics: [
        {
          type: "diagram",
          title: "Four filters for every menu link",
          caption: "A link appears only when it passes all four filters.",
          imageSrc: "/tutorials/diagrams/getting-started/what-decides-your-menu.svg",
          imageAlt: "Four boxes: company type, feature switches, production units and your role, leading to the menus you see",
        },
      ],
      content: `## Overview

Two people in two companies — or even in the same company — can see different menus. Four things decide what appears in the sidebar, the phone **More** menu and **Ctrl+K** search:

1. **Company type** (set in **Settings → Tenant** and **Settings → Configuration**).
2. **Feature switches** (**Settings → Configuration**).
3. **Optional production units** (**Manufacturing → Production setup**).
4. **Your role** (**Settings → Roles**).

## Before you start

- Only admins can change company type, feature switches and roles.

## Steps

### 1. Company type

| Company type | You see | You do not see |
|---|---|---|
| **Manufacturer** (factory) | **Manufacturing** (production, shop floor, IE, cutting, sewing…) | **Trade Cases**, **Trade Control Tower**, **Logistics**, **Trade overview** report |
| **Buying House** (sourcing office) | Merchandising, **Export & Import** incl. **Trade Cases**, **Trade Control Tower**, **Logistics** | **Manufacturing** section |
| **Both** | Everything for both kinds of work | — |

Admins: **Settings → Tenant** → **Tenant type** → save.

### 2. Feature switches

**Settings → Configuration** lists switches under **Show company features** (**Essential**, **More features**, **All features**). When a switch is off, its menu link is hidden. Examples:

- **Enable Trade module** — off hides Trade Cases, Trade Control Tower, Logistics.
- **Enable Operations Control Tower** — shows **Operations → Control Tower**.
- Commission engine → **Export & Import → Commission**; Bond / VAT compliance → **Bond & VAT registers**.
- Finance extras — post-dated vouchers, recurring vouchers, credit/debit notes, TDS, cost classes.
- Inventory extras — stock hierarchy, cycle counting, kitting, serial tracking, consignment.
- **Enable Knitting module** — shows **Knitting** in Manufacturing.

Click **Save configuration**, then refresh the browser (**F5**) so the menu reloads.

### 3. Production units

In **Manufacturing → Production setup**, optional units such as **Knitting**, **Dyeing**, **Printing**, **AOP**, **Embroidery**, **Elastic** and **Washing** are switched on only if your factory has them. Their pages and hourly-production screens appear only then.

### 4. Your role

When your company enforces access control, a whole section (Merchandising, Inventory, Manufacturing, AI Tools, HR, Finance, Reports, Settings) is hidden if your role has no access to it. Buttons such as **Approve**, **Post** or **Delete** also depend on the role.

## What happens next

- A changed menu applies to everyone in the company after they refresh. Data is never deleted when a menu is hidden; switching the feature back on shows it again.

## Tips

- Before asking for a new feature, try **Ctrl+K** — the page may simply be in another section.
- Keep switches you do not use **off**; fewer menus make training easier.

## Common problems

- **I switched a feature on but the menu did not change** → refresh the page (F5). Some switches also need your role to allow that module.
- **A screen opens but says no access** → the menu is visible but your role lacks permission. Update the role in **Settings → Roles**.`,
      tags: ["tenant", "manufacturer", "buying house", "both", "feature flags", "menus", "roles"],
      keywords: ["company type", "tenant type", "feature switch", "configuration", "hidden menu", "missing menu", "trade module", "knitting", "permissions", "access"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app/settings/tenant", "/app/settings/config", "/app/settings/roles", "/app/production/setup"],
      relatedArticleIds: ["gs-sidebar", "gs-at-a-glance"],
    },
    {
      id: "gs-row-actions",
      title: "The Actions button on every list row",
      summary:
        "Open, edit, print, approve or delete a record from the single Actions menu at the end of each table row.",
      estimatedMinutes: 2,
      audience: "everyone",
      coverImage: "/tutorials/screens/gs-row-actions-open.jpg",
      infographics: [
        {
          type: "steps",
          title: "Use row Actions",
          steps: [
            {
              title: "Find the row",
              body: "Use the list's search or filters to narrow it down.",
            },
            {
              title: "Click Actions",
              body: "A small menu opens with what you may do for **this** record now.",
              imageSrc: "/tutorials/screens/gs-row-actions-open.jpg",
              imageAlt: "Customers list with the Actions menu open showing View, Edit, Print and Delete",
            },
            {
              title: "Pick an item",
              body: "Red items (**Delete**, **Cancel**, **Reject**) always ask you to confirm.",
            },
          ],
        },
      ],
      content: `## Overview

Every list in P7 ERP (customers, orders, POs, challans, vouchers, approvals…) has **one Actions button** at the end of each row instead of many small icons. It keeps the table clean and shows only what you are allowed to do.

## Before you start

- What appears in the menu depends on your **role** and the record's **status** (for example, a posted voucher cannot be edited).

## Steps

1. Find the record in the list (use search, filters or the page numbers).
2. Click **Actions** on that row.
3. Choose an item, for example:
   - **View** / **Open** — open the record's detail page.
   - **Edit** — change it (only while the status allows it).
   - **Print** — print or save as PDF.
   - Status steps such as **Approve**, **Close (pre-close)**, **Cancel**, **Reject**.
   - Shortcuts such as **Goods receiving (this PO)**.
   - **Delete** (red) — remove a draft record.
4. If a confirmation or reason box appears, read it, fill the reason if asked, and confirm.
5. A short message appears at the top-right (green = done, red = problem).

## What happens next

- The list refreshes with the new status. Status changes are saved in the record's history with your name.

## Tips

- Press **Esc** or click anywhere else to close the menu.
- Only one row's menu is open at a time.

## Common problems

- **Edit or Delete is missing** → the record is past draft (submitted, approved, posted) or your role cannot do it. Use the status action (for example **Set Draft** or **Cancel**) if allowed.
- **Nothing happens after Delete** → the record is linked to other documents. Read the red message; cancel it instead of deleting.`,
      tags: ["actions", "table", "edit", "delete", "print", "row menu"],
      keywords: ["three dots", "row actions", "options menu", "view record", "edit record", "remove", "cancel"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app/customers", "/app/inquiries", "/app/quotations", "/app/orders", "/app/inventory/purchase-orders"],
      relatedArticleIds: ["gs-list-tools", "merch-pipeline", "wf-approvals"],
    },
    {
      id: "gs-list-tools",
      title: "List tools: columns, saved views, export, bulk actions and pages",
      summary:
        "Hide columns, switch row density, save filter setups as named views, export to Excel/CSV, act on many rows at once and move between pages.",
      estimatedMinutes: 4,
      audience: "everyone",
      coverImage: "/tutorials/screens/gs-list-columns.jpg",
      infographics: [
        {
          type: "steps",
          title: "The list toolbar",
          steps: [
            {
              title: "Views",
              body: "Save the current filters, sort, columns and density under a name; tick **Share with everyone in my company** to share.",
              imageSrc: "/tutorials/screens/gs-list-views.jpg",
              imageAlt: "Views menu open above the customers table",
            },
            {
              title: "Columns",
              body: "Tick or untick columns. Your choice is remembered on this browser.",
              imageSrc: "/tutorials/screens/gs-list-columns.jpg",
              imageAlt: "Columns menu with checkboxes for each column",
            },
            {
              title: "Export",
              body: "**CSV** or **Excel .xlsx** of the current view — or only the ticked rows.",
              imageSrc: "/tutorials/screens/gs-list-export.jpg",
              imageAlt: "Export menu with CSV and Excel options",
            },
            {
              title: "Bulk actions",
              body: "Tick rows; a bar shows **N selected** and the actions for them.",
              imageSrc: "/tutorials/screens/gs-list-bulk.jpg",
              imageAlt: "Two customer rows ticked with a bulk action bar showing Mark active and Mark inactive",
            },
          ],
        },
      ],
      content: `## Overview

Big lists — **Customers**, **Orders**, **Purchase orders** and several commercial and inventory registers — share one toolbar above the table. Other lists have simpler search boxes, filters and an **Export** or **Print** button.

## Before you start

- Saved views and column choices are per user. Shared views are visible to everyone in your company.

## Steps

### Toolbar (top right of the table)

1. **Views** — set up the filters, sort and columns you like, then open **Views**. Under **Save current filters & columns as** type a name (for example *Active buyers in Bangladesh*) and click **Save**. Tick **Share with everyone in my company** to let colleagues use it. Pick a view later to apply it again; the button then shows **View: name**. Only the person who saved a view can update or delete it.
2. **Columns** — show or hide columns.
3. **Compact / Comfortable** — switch the row height to fit more rows on screen.
4. **Export** — download **CSV** or **Excel .xlsx**. With no rows ticked it exports the *current view*; with rows ticked it exports only the selection.

### Sorting

Click a column header to sort the rows on the current page; click again to reverse, a third time to clear.

### Bulk actions

1. Tick the box at the left of each row (or the header box for the whole page).
2. A bar appears: **N selected** plus the actions for that list:
   - **Customers:** **Mark active** / **Mark inactive**.
   - **Purchase orders:** **Approve** / **Close** / **Cancel**. Orders whose status does not allow the change are skipped and reported.
3. Click **Clear** to untick everything.

Selections clear when you change page or filters, so a bulk action never touches rows you cannot see.

### Pages

At the bottom: **Showing 1 to 20 of 54**, **Per page** (10, 20, 50 or 100), **Previous**, page numbers and **Next**. Some long lists show **Showing rows 1–20 (next/prev for more)** when the total is not known.

## What happens next

- Exports open in Excel with the same column headers you see on screen.

## Tips

- Make a shared view such as *My open orders* or *This month's POs* for your team.
- Some lists (for example **Customers**) also have **AI quick filters** and a **Natural language → filters** box: type *active customers in Bangladesh* and click **Apply AI filters**. **Reset** clears all filters.
- For reports, export to Excel instead of copying the screen.

## Common problems

- **Export is greyed out** → the list is empty with the current filters.
- **A column I added is gone on another PC** → column choices are saved per browser; save a **View** to carry them everywhere.`,
      tags: ["table", "list", "export", "excel", "csv", "saved views", "bulk", "columns", "pagination"],
      keywords: ["filter", "density", "select all", "share view", "download", "xlsx", "per page", "next page", "sort"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app/customers", "/app/orders", "/app/inventory/purchase-orders"],
      relatedArticleIds: ["gs-row-actions", "gs-global-search-and-new-menu"],
    },
  ],
};

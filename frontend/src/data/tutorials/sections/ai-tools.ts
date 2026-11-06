import type { TutorialSection } from "../types";

export const aiToolsSection: TutorialSection = {
  id: "ai-tools",
  title: "AI Tools",
  description:
    "AI assistant, exception agents, dashboard figures and briefs, document autofill, automation drafts, predictions and weekly AI reports. AI suggests; a person decides.",
  articles: [
    {
      id: "ai-tools-overview",
      title: "AI Tools: what the AI can do for you (map)",
      summary:
        "A plain-English map of every AI feature in P7 ERP, what each one can and cannot do, and why a person always confirms before anything changes.",
      content: `## Overview

P7 ERP has several **AI helpers**. They read your company's ERP data, find problems, write short summaries and suggest form values. They are **helpers, not decision makers**: nothing is saved, sent, posted or approved until **a person clicks the final button**.

Who uses it: owners and managers (briefs, exception agents), merchandisers (order questions, inquiry autofill), commercial staff (LC alerts), finance (forecasts) and admins (switching features on/off).

## Before you start

- Your role needs **AI tools** access (permission key \`ai.access\`) to open the **AI Tools** menu screens. The ✦ drawer and the dashboard cards follow your normal module permissions.
- Some features are company switches in **Settings → Configuration** (choose **More features** at the top): **AI exception agents** and **Ask-a-metric dashboard cards** are on by default; an admin can switch them off.
- AI text (briefs, weekly reports, chat answers) needs an AI service set up on the server. When it is not set up, rule-based parts still work and AI parts show a clear notice.

## Steps: where each AI feature lives

1. **Ask a question about any screen** — click the **✦ (Prime7 AI)** button in the top bar. See *Ask the AI assistant*.
2. **Full assistant workspace** — **AI Tools → AI Assistant** (\`/app/ai/assistant\`): sessions, **Quick Actions**, forecasts, knowledge questions.
3. **Find problems automatically** — **AI Tools → Exception agents** (\`/app/ai/agents\`): late TNA, expiring LCs, BOM gaps. A manager confirms who to tell.
4. **Quick figures on the dashboard** — **Ask a figure** and **AI daily brief** on the **Dashboard** (\`/app\`).
5. **Read a document into a form** — **Import Customer Info** on **New customer** and **Import Inquiry Info** on **New inquiry**.
6. **Draft actions with a safety token** — **AI Tools → AI Automation** (\`/app/ai/automation\`).
7. **Forecasts** — **AI Tools → AI Predictions** (\`/app/ai/predictions\`).
8. **Weekly management summary** — **AI Tools → Weekly AI reports** (\`/app/ai/weekly-reports\`).
9. **AI inside other modules** — production planning insights on **Manufacturing → Planning** (\`/app/production/planning\`), HR **AI Insights** and **AI employee onboarding**, the voucher entry assistant in Finance.

## What happens next

Every AI question, suggestion, confirmation and dismissal is written to the **AI audit log** with who and when. Findings you act on disappear for a few days and come back if the problem is still open.

## Tips

- **AI can:** summarise figures, find late or risky items, draft text, read a document and suggest field values, link you to the record it used.
- **AI cannot:** save, post, approve or delete on its own; see modules your role cannot open; see other companies' data.
- Treat AI numbers like a colleague's quick answer: check the linked record before you act on a big decision.

## Common problems

- **"Rate limit exceeded… please retry shortly"** → the AI service limits how many requests one user can send per minute. Wait 30–60 seconds and click **Refresh**.
- **Exception agents says "turned off for this company"** → an admin must tick **AI exception agents** in **Settings → Configuration → More features** and click **Save configuration**.
- **"Gemini is not configured"** on Weekly AI reports → the server has no AI key yet. Ask your system administrator; old reports still open.`,
      tags: ["AI", "assistant", "automation", "agents", "predictions", "weekly report", "governance", "human in the loop"],
      keywords: [
        "artificial intelligence",
        "chatbot",
        "chat",
        "Gemini",
        "OpenRouter",
        "Ollama",
        "copilot",
        "AI help",
        "what can AI do",
        "AI safe",
      ],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      featured: true,
      coverImage: "/tutorials/screens/ai-assistant.jpg",
      infographics: [
        {
          type: "diagram",
          title: "AI suggests, a person decides",
          caption:
            "Every AI feature follows the same four steps. Only step 4, done by a person, changes data. Cancel or Dismiss leaves everything as it was.",
          imageSrc: "/tutorials/diagrams/ai-tools/ai-human-in-the-loop.svg",
          imageAlt:
            "Diagram: you ask, AI reads and drafts, a person reviews, then a person confirms; everything is written to the AI audit log",
        },
        {
          type: "flow",
          title: "AI screens in the sidebar",
          steps: [
            { label: "AI Assistant", href: "/app/ai/assistant" },
            { label: "AI Automation", href: "/app/ai/automation" },
            { label: "AI Predictions", href: "/app/ai/predictions" },
            { label: "Weekly AI reports", href: "/app/ai/weekly-reports" },
            { label: "Exception agents", href: "/app/ai/agents" },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/ai-assistant.jpg",
          alt: "AI Tool page with AI Sessions on the left, Conversation in the middle and Quick Actions on the right",
          caption: "AI Tools → AI Assistant: sessions, the conversation and one-click Quick Actions.",
        },
        {
          src: "/tutorials/screens/ai-agents.jpg",
          alt: "Exception agents page listing critical LC expiry findings with an Actions button per row",
          caption: "AI Tools → Exception agents: findings sorted by severity. Nothing is sent until a manager confirms.",
        },
      ],
      relatedAppRoutes: [
        "/app/ai/assistant",
        "/app/ai/automation",
        "/app/ai/predictions",
        "/app/ai/weekly-reports",
        "/app/ai/agents",
      ],
      relatedArticleIds: [
        "ai-assistant-drawer",
        "ai-exception-agents",
        "ai-ask-a-figure",
        "ai-document-autofill",
        "ai-privacy-data",
        "mfg-planning-deep",
      ],
    },
    {
      id: "ai-privacy-data",
      title: "AI and your data: privacy in simple words",
      summary:
        "What the AI can see, where your question goes, what is stored, and what you should never type into an AI box.",
      content: `## Overview

Many people worry: *"Will the AI leak our buyer prices?"* This page explains, in plain words, how P7 ERP protects your data when you use AI features. Everyone who uses the ✦ assistant or uploads documents for autofill should read it once.

## Before you start

- Your **company admin** decides which AI features are on (**Settings → Configuration**).
- Your **role** decides which modules you can open — the AI follows the same rules (**Settings → Roles**).

## Steps: how your data is handled

1. **Only your company.** Every AI request carries your company (tenant). The AI can never read another company's records.
2. **Only what your role can open.** If you cannot open Finance, the AI cannot answer Finance questions for you. The *Asking about …* chip only appears for records you are allowed to see.
3. **Rules first, AI second.** Exception agents and **Ask a figure** use fixed, tested database queries. AI only helps pick the figure or write the wording; it never writes its own database queries.
4. **Where the question goes.** Your question plus the few figures needed to answer it are sent to the AI service your company set up — a model on your own server, or a cloud provider (such as OpenRouter or Google Gemini). Heavier requests show **Paid processing required**; nothing goes to the paid cloud tool until you click **Approve Paid Processing**.
5. **Uploaded documents are not kept.** Files used for **Extract data** (business cards, inquiry sheets, PDFs) are read in memory and thrown away. Only the values you **Apply** and then **Save** are stored.
6. **Everything is logged.** Questions, AI suggestions, confirmations and dismissals go to the AI audit log with your name and the time.

## What happens next

If something looks wrong, an admin can switch a feature off in **Settings → Configuration** at any time. The rest of the ERP keeps working without AI.

## Tips

- **Never type** passwords, bank PINs, OTP codes or full card numbers into any AI box.
- Prefer record links over copy-paste: open the order, then ask "When is this due?" — the AI reads the record itself.
- AI text can be wrong. Check the **Source** link or the figure on the real screen before sending numbers to a buyer or bank.

## Common problems

- **"The AI does not know about my order"** → open the order first so the *Asking about …* chip appears, or type the order code.
- **"Why did it ask for paid processing?"** → the question needs the larger cloud tool. Click **Cancel** if you do not want it sent; ask a simpler question instead.`,
      tags: ["AI", "privacy", "security", "data protection", "tenant", "audit"],
      keywords: ["confidential", "is AI safe", "data leak", "GDPR", "secret", "cloud", "paid processing", "who sees my data"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/ai-drawer-order-context.jpg",
      infographics: [
        {
          type: "highlight",
          title: "Three rules to remember",
          body: "1) AI sees only your company and only what your role can open. 2) Nothing changes until a person clicks the final button. 3) Never type passwords, PINs or OTPs into an AI box.",
        },
        {
          type: "diagram",
          title: "Human in the loop",
          caption: "The AI reads and drafts; a person reviews and confirms; every step is audited.",
          imageSrc: "/tutorials/diagrams/ai-tools/ai-human-in-the-loop.svg",
          imageAlt: "Four-step diagram from question to human confirmation, with the AI audit log underneath",
        },
      ],
      relatedAppRoutes: ["/app/ai/assistant", "/app/settings/config", "/app/settings/roles"],
      relatedArticleIds: ["ai-tools-overview", "ai-assistant-drawer", "ai-document-autofill", "settings-roles-permissions"],
    },
    {
      id: "ai-assistant-drawer",
      title: "Ask the AI assistant (✦ drawer and AI Assistant page)",
      summary:
        "Open the ✦ drawer from any screen, ask about the order or customer you are looking at, and use the full AI Assistant page for sessions and Quick Actions.",
      content: `## Overview

The **Prime7 AI Assistant** answers questions about your ERP data in plain language: *"Which orders are late?"*, *"Summarise this customer"*, *"When is this order due?"*. You can open it as a **drawer** from any screen, or use the bigger **AI Tools → AI Assistant** page.

## Before you start

- You need normal access to the records you ask about. The assistant cannot see modules your role cannot open.
- Answers need the AI service to be running on the server. If it is down you will see an error in red above the input box.

## Steps: ask about the record on screen

1. Open the record first — for example an order from **Merchandising → Orders** (\`/app/orders\`). Context works on **order, customer, style, voucher and employee** pages.
2. Click the **✦** button (**Prime7 AI**) in the top bar. The drawer **Prime7 AI Assistant** slides in from the right.
3. Look for the chip **Asking about …** above the input. It means your question will use this record.
4. Type your question in the box (*Ask about dashboard, approvals, orders, inventory, production, or finance...*) and press **Send**.
5. While it works you see **Local AI is thinking...**. The answer appears in the conversation, with a **Source** link back to the record it used.
6. If the answer card says **Paid processing required**, read the reason. Click **Approve Paid Processing** to let the larger cloud tool answer, or **Cancel**.
7. To ask without the record, click **×** on the chip. Click **Use this … as context** to switch it back on.
8. Click **New** to start a fresh session; click **×** (top right) to close the drawer. Your conversation is kept.

## Steps: the full AI Assistant page

1. Open **AI Tools → AI Assistant** (\`/app/ai/assistant\`). The page title is **AI Tool**.
2. **AI Sessions** (left) lists your past conversations. Click one to reopen it, or **New**.
3. **Quick Actions** (right) run ready-made questions in one click: **Summarize dashboard**, **Show pending approvals**, **Search delayed orders**, **Buyer-wise order status**, **Inventory shortages**, **Production summary** and more.
4. Further down the right column: anomaly insights, **Controlled Automation** (see *AI Automation*), a knowledge question box, forecast requests and recent report / forecast runs.

## What happens next

The assistant only **reads**. If you want something changed (a reminder, a message), use **AI Automation**, which asks for a one-time confirmation token first, or do it yourself on the normal screen.

## Tips

- Ask one thing at a time and name the period: *"late orders this week for buyer H&M"*.
- Quick Actions are the fastest way to see what the assistant is good at.
- Read *AI and your data* once before using the assistant for buyer or bank figures.

## Common problems

- **No "Asking about" chip** → the screen is a list, not a single record. Open the record's detail page.
- **"Rate limit reached. Please wait a few seconds and retry."** → too many questions in a short time; wait a minute.
- **"Request timed out"** → ask a smaller question (one buyer, one month).`,
      tags: ["AI", "assistant", "chat", "drawer", "screen context", "quick actions", "sessions"],
      keywords: ["ask AI", "sparkle button", "Prime7 AI", "chatbot", "question", "context", "Approve Paid Processing", "AI Tool"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/ai-drawer-order-context.jpg",
      videos: [
        {
          src: "/tutorials/videos/ai-assistant-drawer-tour.webm",
          poster: "/tutorials/screens/ai-drawer-order-context.jpg",
          title: "Open the AI assistant and see what it knows",
          caption:
            "Open an order, click the ✦ button, see the Asking about chip, then visit Exception agents to see that a manager confirms before anything is sent. No question is sent in this demo.",
          durationSeconds: 60,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Ask about the order you are looking at",
          steps: [
            {
              title: "Open the record",
              body: "Open an order, customer, style, voucher or employee detail page.",
              href: "/app/orders",
            },
            {
              title: "Click ✦ Prime7 AI",
              body: "The drawer opens on the right. The chip **Asking about …** shows which record it will use.",
              imageSrc: "/tutorials/screens/ai-drawer-order-context.jpg",
              imageAlt: "AI drawer open on an order page with the Asking about chip above the question box",
            },
            {
              title: "Ask and read the source",
              body: "Type a question and press **Send**. Check the **Source** link before using the answer.",
            },
            {
              title: "Approve paid processing only if needed",
              body: "If you see **Paid processing required**, choose **Approve Paid Processing** or **Cancel**.",
            },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/ai-drawer-open.jpg",
          alt: "Prime7 AI Assistant drawer open over the dashboard with New and close buttons at the top",
          caption: "The drawer works on every app page. Without a record open, questions are general.",
        },
        {
          src: "/tutorials/screens/ai-assistant.jpg",
          alt: "AI Tool page with AI Sessions, Conversation, Ask AI Tool box and Quick Actions list",
          caption: "AI Tools → AI Assistant: click a Quick Action to run a ready-made question.",
        },
      ],
      relatedAppRoutes: ["/app/ai/assistant", "/app/orders", "/app/customers"],
      relatedArticleIds: ["ai-tools-overview", "ai-privacy-data", "ai-automation-drafts", "gs-dashboard"],
    },
    {
      id: "ai-exception-agents",
      title: "Exception agents: find problems, confirm who to tell",
      summary:
        "Agents flag overdue TNA actions, expiring LCs and BOM materials not on PO, and prepare an owner brief. A manager confirms before anything is sent.",
      content: `## Overview

**AI Tools → Exception agents** (\`/app/ai/agents\`) checks your data for three common problems every time you open it or click **Run agents**:

- **TNA delay** — follow-up / TNA actions past their planned date (critical after 7 days late).
- **LC expiry** — trade cases whose LC or master contract expires within 14 days (or has already expired).
- **BOM shortfall** — orders due within 45 days whose BOM materials are not fully covered by purchase orders.

Who uses it: owners, merchandising managers and commercial managers, usually first thing in the morning.

## Before you start

- On for every company by default. An admin can switch it off in **Settings → Configuration → More features → AI exception agents**.
- You only see agents for modules you can open: TNA delay and BOM shortfall need Merchandising access; LC expiry needs Trade access.
- To **send** notifications you must be an **admin** or **manager**, or have the permission key \`ai.agents.confirm\` on your role. Others can look but not send.

## Steps

1. Open **AI Tools → Exception agents**. The agents run automatically.
2. Use the chips **All**, **TNA delay**, **LC expiry**, **BOM shortfall** to filter. Each chip shows its count.
3. Read each row: **Severity** (CRITICAL / HIGH / MEDIUM / LOW), **Agent**, **Finding** (click the title to open the record) and **Recommended** action.
4. Click **Actions** on a row:
   - **Open record** — jump to the order or trade case.
   - **Notify the assignee… / Notify managers…** — a dialog opens. Add an optional **Note**, then click **Confirm & send**. The person gets it in their bell inbox with a link.
   - **Dismiss for 7 days** — hide a finding you handled another way; confirm with **Dismiss**.
5. Click **Run agents** at any time to check again.
6. **Owner brief** (top card): click **Generate** for a short morning summary from today's figures and open findings. Click **Send to managers** and confirm to deliver it to admins and managers.

## What happens next

- Notified findings hide for **3 days**, dismissed ones for **7 days**. If the problem is still open after that, they come back.
- Every confirm and dismiss is stored and written to the AI audit log.
- The brief says *Written by AI from the figures above* or *Built from rules (AI not available)* so you know where the words came from.

## Tips

- Use **Export** on the table toolbar to download the list for a meeting. **Columns** hides columns you do not need.
- Fix the root cause (update the TNA date, extend the LC, raise the PO) — the finding disappears on the next run.

## Common problems

- **"You can review findings; a manager (or a role with "ai.agents.confirm") sends them."** → you do not have send rights. Ask a manager to confirm, or ask your admin about the permission.
- **There is no tick box for \`ai.agents.confirm\` on the Roles screen** → it is not in the governance list yet. Admin and manager roles can already confirm; for other roles ask your system administrator to add the key.
- **"No open exceptions. 🎉"** → nothing is late or expiring right now.`,
      tags: ["AI", "agents", "exceptions", "TNA", "LC expiry", "BOM", "shortage", "owner brief", "governance"],
      keywords: [
        "alerts",
        "human in the loop",
        "approval",
        "morning brief",
        "late TNA",
        "LC expire",
        "BTB",
        "notify",
        "dismiss",
        "ai.agents.confirm",
      ],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      featured: true,
      coverImage: "/tutorials/screens/ai-agents.jpg",
      infographics: [
        {
          type: "steps",
          title: "Review and notify",
          steps: [
            {
              title: "Run the agents",
              body: "Open **AI Tools → Exception agents** or click **Run agents**.",
              href: "/app/ai/agents",
              imageSrc: "/tutorials/screens/ai-agents.jpg",
              imageAlt: "Exception agents list with filter chips and Run agents button",
            },
            {
              title: "Open Actions on a finding",
              body: "Choose **Open record**, **Notify…** or **Dismiss for 7 days**.",
              imageSrc: "/tutorials/screens/ai-agents-row-actions.jpg",
              imageAlt: "Actions menu open on the first finding showing Open record, Notify and Dismiss options",
            },
            {
              title: "Confirm & send",
              body: "Add a short note and click **Confirm & send**. Nothing is sent before this click.",
              imageSrc: "/tutorials/screens/ai-agents-notify-dialog.jpg",
              imageAlt: "Notify dialog with a note filled in and the Confirm and send button",
            },
          ],
        },
        {
          type: "diagram",
          title: "Human confirmation",
          imageSrc: "/tutorials/diagrams/ai-tools/ai-human-in-the-loop.svg",
          imageAlt: "Diagram showing that a person must confirm before any notification is sent",
        },
      ],
      relatedAppRoutes: ["/app/ai/agents", "/app/settings/config"],
      relatedArticleIds: ["ai-tools-overview", "ai-dashboard-brief", "settings-configuration", "settings-roles-permissions"],
    },
    {
      id: "ai-ask-a-figure",
      title: "Ask a figure: pin answers to your dashboard",
      summary:
        "Type a question like \"late orders\" on the dashboard; the answer comes from a fixed list of figures and can be pinned as a card.",
      content: `## Overview

**Ask a figure** sits on the **Dashboard** (\`/app\`), below the KPI cards. Type a short question and get **one number** with a link to the matching list. Pin the figures you check every day as cards.

## Before you start

- Company switch **Ask-a-metric dashboard cards** must be on (**Settings → Configuration → More features**). It is on by default.
- You only get figures for modules your role can open (for example, finance figures need Finance access).

## Steps

1. Open the **Dashboard** and scroll to **Ask a figure**.
2. Type a question, for example *How many orders are late?*, *Open orders by buyer* or *LCs expiring*.
3. Click **Ask**. The answer shows the figure name (a link), the number, and a breakdown when there is one.
4. Click the figure name to open the matching list screen.
5. Click **Pin card** to keep it on your dashboard. You can pin up to **8** cards; only you see your cards.
6. Remove a card with the **×** in its corner.

## What it can answer

Answers come only from this fixed list: **Open orders**, **Open order quantity**, **Orders due in 14 days**, **Late orders**, **Open orders by buyer**, **Overdue TNA actions**, **Open purchase orders**, **BTB LCs expiring in 30 days**, **Vouchers awaiting approval** and **Active employees**.

If your question does not match, you get **Try:** suggestions instead of a guess. The note *Answered from a fixed list of figures (AI picked the figure)* means AI only chose which figure you meant — the number itself comes from a tested query.

## Tips

- Short questions work best: *late orders*, *open POs*, *active employees*.
- Click a **Related:** suggestion to see a similar figure.

## Common problems

- **The figure name does not match your question** (for example *How many orders are late?* answered with **Open orders**) → always read the figure name above the number. Click the right suggestion under **Related:** (here **Late orders**) or type a shorter question such as *late orders*.
- **"Already pinned"** → that figure is already one of your cards.
- **"You can pin up to 8 cards"** → remove one with × first.
- **Card says "This figure is not available."** → your role lost access to that module, or the feature was switched off.`,
      tags: ["AI", "dashboard", "metric", "KPI", "question", "pin"],
      keywords: ["natural language", "ask", "cards", "how many", "late orders", "open orders", "figure", "number"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/ai-dashboard-ask-figure.jpg",
      images: [
        {
          src: "/tutorials/screens/ai-dashboard-ask-figure.jpg",
          alt: "Ask a figure box on the dashboard with the question How many orders are late, the answer Open orders 7, a Late orders suggestion and a Pin card button",
          caption: "Check the figure name: here the question was matched to Open orders, so click the Late orders suggestion before pinning.",
        },
      ],
      relatedAppRoutes: ["/app", "/app/settings/config"],
      relatedArticleIds: ["ai-dashboard-brief", "ai-exception-agents", "gs-dashboard"],
    },
    {
      id: "ai-dashboard-brief",
      title: "AI daily brief and cash flow brief on the dashboard",
      summary:
        "Generate a short executive summary of today's KPIs and a 30/60/90-day cash-flow narrative from the dashboard.",
      content: `## Overview

The **Dashboard** section **Pipeline & brief** has two AI cards:

- **AI daily brief** — a few lines summarising today's KPIs (orders, approvals, alerts) for owners and managers.
- **Cash Flow AI Brief** — a 30/60/90-day cash-flow story built on the finance forecast.

## Before you start

- AI wording needs an AI service on the server. If it is missing, the card shows an error and the rest of the dashboard still works.
- The brief uses the dashboard **Date range** you picked at the top (**This week**, **This month**, **Last 90 days**).

## Steps

1. Open the **Dashboard** (\`/app\`) and scroll to **Pipeline & brief**.
2. On **AI daily brief**, click **Generate Brief**. Wait a few seconds.
3. Read the summary. The line **Generated:** shows when it was written.
4. Click **Refresh** later in the day for an updated brief.
5. On **Cash Flow AI Brief**, click **Generate** for the cash-flow view, and use the link on the card to open the full forecast.

## What happens next

Nothing is saved or sent. To send a morning summary to all managers, use **Owner brief → Send to managers** on **AI Tools → Exception agents**.

## Tips

- Generate the brief once in the morning; repeated clicks use AI credits without adding much.
- For a weekly, stored version see **Weekly AI reports**.

## Common problems

- **Button keeps spinning** → the AI service is slow; wait, then click **Refresh** once.
- **Numbers in the brief differ from a report** → check the date range at the top of the dashboard.`,
      tags: ["AI", "dashboard", "brief", "summary", "cash flow", "executive"],
      keywords: ["daily summary", "Generate Brief", "owner summary", "morning report", "cash forecast"],
      estimatedMinutes: 2,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/ai-dashboard-daily-brief.jpg",
      images: [
        {
          src: "/tutorials/screens/ai-dashboard-daily-brief.jpg",
          alt: "Pipeline and brief section on the dashboard with the AI daily brief and Cash Flow AI Brief cards",
          caption: "Click Generate Brief on the AI daily brief card.",
        },
      ],
      relatedAppRoutes: ["/app", "/app/ai/weekly-reports", "/app/ai/agents"],
      relatedArticleIds: ["ai-weekly-reports", "ai-exception-agents", "gs-dashboard"],
    },
    {
      id: "ai-document-autofill",
      title: "Fill a form from a document (AI autofill)",
      summary:
        "Upload a business card, inquiry sheet or PDF, review the extracted fields, apply the ones you trust, then save the form yourself.",
      content: `## Overview

Typing a new customer or buyer inquiry from a business card, email screenshot or PDF takes time. **AI autofill** reads the document and **suggests** values for the form. You choose which values to use. Nothing is saved until you click the form's own **Save** button.

Where you find it:

- **New customer** (\`/app/customers/new\`) → card **Import Customer Info** (business card, company profile, letterhead, registration document).
- **New inquiry** (\`/app/inquiries/new\`) → card **Import Inquiry Info** (buyer inquiry sheet, email screenshot, tech-pack summary, PO summary, PDF).
- Similar upload cards exist in HR **AI employee onboarding**, **Master contracts** (LC documents) and **Logistics** (shipping documents) when those features are switched on.

## Before you start

- File types: **PNG, JPEG, WebP or PDF**, up to **10 MB**.
- You need permission to create the record (customer or inquiry).
- The uploaded file is **not stored** — it is read in memory and discarded.

## Steps

1. Open the form, for example **New customer**.
2. On **Import Customer Info**, drag a file onto **Drag and drop a file here**, or click **Upload file**.
3. Click **Extract data**. A banner shows **Extracted successfully**, **Partial extraction** or **Extraction failed**.
4. In **Review extracted fields**, each row shows the **Field**, the **Extracted** value, a **Confidence** badge, the **Current** form value and a **Status**.
5. Click **Apply** to copy a value into the form, or **Skip** to ignore it. **Apply all high-confidence** applies every high-confidence row at once.
6. If a row says **Conflict** (the form already has a different value), choose **Keep existing** or **Use extracted**.
7. On **New inquiry**, suggested customer and style buttons set the link without creating new records.
8. Check the whole form, then click the form's normal **Save** button (**Save inquiry** on New inquiry).

On **New customer** there is also an **AI assistant** box on the right (*Suggestions only — review and apply manually. Nothing is auto-saved.*) with **Extract from document**, **Enrich from website / hints**, **Validate profile** and **Find possible duplicates**.

## What happens next

The record is created exactly as if you had typed it. Applied fields have a coloured left border so you can double-check them. **Clear imported data** removes the suggestions (values you already applied stay in the form).

## Tips

- Clear, straight photos give higher confidence. Crop to the card or the table.
- Watch the **duplicate warning** on New customer — it lists existing customers with the same email or name.

## Common problems

- **"Please use PNG, JPEG, WebP, or PDF."** → convert the file (for example print to PDF).
- **"File is too large (max 10 MB)."** → compress the PDF or take a smaller photo.
- **Most fields Pending with low confidence** → the scan is blurry or the AI provider on your server is a basic one; type the remaining fields by hand.`,
      tags: ["AI", "OCR", "extract", "autofill", "customer", "inquiry", "document", "upload"],
      keywords: [
        "scan business card",
        "read PDF",
        "import from document",
        "Extract data",
        "Import Customer Info",
        "Import Inquiry Info",
        "tech pack",
        "buyer inquiry",
      ],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/ai-extract-customer-card.jpg",
      infographics: [
        {
          type: "flow",
          title: "Document to saved record",
          steps: [
            { label: "Upload file" },
            { label: "Extract data" },
            { label: "Review: Apply / Skip" },
            { label: "Save the form", href: "/app/customers/new" },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/ai-extract-customer-card.jpg",
          alt: "Import Customer Info card on the New customer form with the drag-and-drop area and Upload file, Extract data, Clear imported data buttons",
          caption: "New customer → Import Customer Info.",
        },
        {
          src: "/tutorials/screens/ai-extract-inquiry-card.jpg",
          alt: "Import Inquiry Info card on the New inquiry form",
          caption: "New inquiry → Import Inquiry Info works the same way and also suggests customer and style matches.",
        },
      ],
      relatedAppRoutes: ["/app/customers/new", "/app/inquiries/new", "/app/hr/employees/ai-onboard"],
      relatedArticleIds: ["merch-create-inquiry", "ai-privacy-data", "ai-tools-overview"],
    },
    {
      id: "ai-automation-drafts",
      title: "AI Automation: draft actions, data quality and rules",
      summary:
        "Describe a draft action in words, get a preview and a one-time confirmation token, and only then execute it. Also run data-quality scans and read the rule catalog.",
      content: `## Overview

**AI Tools → AI Automation** (\`/app/ai/automation\`) is for small, safe automations such as follow-up reminders or draft messages. The page says it clearly: *Nothing is posted automatically; every execution step requires human confirmation.*

Tabs:

- **Draft Actions** — propose an action in words, then confirm with a token.
- **Data Quality** — scan for missing or inconsistent master data.
- **Rules** — the catalog of actions the system knows how to draft.
- **Governance** — proposals waiting for an admin (only when your company has controlled automation switched on).

## Before you start

- You need AI tools access.
- The **Governance** tab and its **Approve / Reject / Rollback** buttons are for admins only.

## Steps: propose and confirm a draft action

1. Open **AI Automation**. **Draft Actions** is selected.
2. In **Propose a draft action**, type what you want, or click an example chip such as *Create follow-up reminder for order 123*.
3. Click **Propose action**. The system maps your words to a rule and shows a yellow box with a **One-time confirmation token**, the **Action**, the **Risk** level and a preview.
4. Read the preview carefully. If it is wrong, simply leave it — nothing happens.
5. To run it, copy the token into **Paste token** and click **Confirm and execute**.
6. Check **Recent action runs** (click **Refresh**) for the status: **PROPOSED**, **EXECUTED** or **FAILED**.

## Steps: data quality

1. Open the **Data Quality** tab.
2. Click **Run scan**. It checks orders, BOMs, customers and stock movements for gaps and odd values.
3. Review the issues listed and fix them on the normal master-data screens.

## What happens next

Executed actions are drafts or reminders — they do not post vouchers or approve documents. Every proposal and confirmation is logged.

## Tips

- The token is shown **once**. Copy it before leaving the tab.
- Start with the example chips to learn what the rules can do (**Rules** tab lists them all).

## Common problems

- **"Rate limit exceeded for AI read operations"** → wait a minute and click **Refresh**.
- **Wrong token** → propose again to get a fresh token.
- **No Governance tab** → controlled automation is not switched on for your company.`,
      tags: ["AI", "automation", "draft", "token", "data quality", "rules", "governance"],
      keywords: ["Propose action", "Confirm and execute", "confirmation token", "reminder", "draft message", "AI Automation"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/ai-automation-draft-actions.jpg",
      images: [
        {
          src: "/tutorials/screens/ai-automation-draft-actions.jpg",
          alt: "AI Automation page on the Draft Actions tab with the Propose a draft action box and example chips",
          caption: "Draft Actions: type or pick an example, then Propose action.",
        },
        {
          src: "/tutorials/screens/ai-automation-data-quality.jpg",
          alt: "AI Automation page on the Data Quality tab",
          caption: "Data Quality: scan master data for gaps you should fix.",
        },
      ],
      relatedAppRoutes: ["/app/ai/automation", "/app/ai/assistant"],
      relatedArticleIds: ["ai-tools-overview", "ai-assistant-drawer"],
    },
    {
      id: "ai-predictions",
      title: "AI Predictions: forecasts you can check",
      summary:
        "Run quick forecasts (cash flow, inventory shortage, production output, shipment delay risk) or a custom forecast, then open each run to see charts, confidence and assumptions.",
      content: `## Overview

**AI Tools → AI Predictions** (\`/app/ai/predictions\`) turns your history into forward-looking estimates: cash flow, inventory shortages, production output, shipment delay risk, receivable risk and capacity shortfall. Owners, planners and finance managers use it for planning — not as exact numbers.

## Before you start

- Forecasts are only as good as the data behind them: keep orders, POs, GRNs and vouchers up to date.
- Some panels (**Profitability (Gemini)**) need an AI service on the server.

## Steps

1. Open **AI Tools → AI Predictions**. The KPI strip at the top summarises recent runs.
2. **Finance Forecast**: set **Horizon (days)** (for example 90) and click **Run forecast** for a cash-flow projection with a short narrative.
3. **Quick forecasts**: click one button such as **Cash Flow Projection** or **Inventory Shortage Forecast**. It uses your company data and appears in the run list.
4. **Forecast Request** (custom): type what you want (for example *Generate cash flow projection*), set the horizon and optional from/to dates, then click **Generate Forecast**.
5. Use **Filters** (template, minimum confidence, since / until) to find older runs.
6. Click a run to open the detail drawer: chart, confidence, assumptions. You can copy the JSON or remove old runs there.
7. **Profitability (Gemini)**: click **Refresh** for a narrative on quotation and trade margins. **Recent anomalies** lists unusual events with links.

## What happens next

Runs are stored so you can compare them later. Nothing is posted to accounts.

## Tips

- Read the confidence and limitations shown in each result before sharing numbers.
- Click **Refresh all** (top right) after a big data import.

## Common problems

- **"Rate limit reached. Please wait a few seconds and retry."** → wait and click **dismiss**, then **Refresh all**.
- **Run stays PENDING** → large forecasts take a minute; the page checks again automatically.`,
      tags: ["AI", "forecast", "prediction", "cash flow", "inventory", "planning", "anomaly"],
      keywords: ["projection", "Run forecast", "Generate Forecast", "quick forecast", "profitability", "anomalies", "what will happen"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/ai-predictions-hub.jpg",
      images: [
        {
          src: "/tutorials/screens/ai-predictions-hub.jpg",
          alt: "AI Predictions page with Finance Forecast, Forecast Request, Quick forecasts and Profitability panels",
          caption: "AI Tools → AI Predictions: quick forecasts and custom requests.",
        },
      ],
      relatedAppRoutes: ["/app/ai/predictions", "/app/finance/cash-forecast", "/app/production/planning"],
      relatedArticleIds: ["ai-tools-overview", "ai-weekly-reports", "mfg-planning-deep"],
    },
    {
      id: "ai-weekly-reports",
      title: "Weekly AI reports: a stored summary for management",
      summary:
        "Each week the system stores an executive summary built from live KPIs; open past weeks, compare with the week before and print.",
      content: `## Overview

**AI Tools → Weekly AI reports** (\`/app/ai/weekly-reports\`) keeps one short executive summary per week, written from a snapshot of your KPIs. Owners and managers read it on Monday morning or print it for the management meeting.

## Before you start

- Reports are created automatically on a weekly schedule (Sunday, UTC) while the app is running.
- **Generate this week** and **Regenerate** need an AI key on the server. Without it the page shows **Gemini is not configured** — you can still open old reports.

## Steps

1. Open **AI Tools → Weekly AI reports**.
2. Read the status banner: the next scheduled run, the current week, and whether a report is stored for this week.
3. Choose how many weeks to list (**Last 12**, **Last 24**, **Last 52**) and click **Refresh**.
4. Click a week in the list to open it. The narrative appears on the right; open the panel for raw numbers and week-over-week change.
5. To create the current week now, click **Generate this week**. **Regenerate** overwrites this week with a new narrative.
6. Use your browser's print (Ctrl+P) to print or save as PDF.

## What happens next

Reports are stored and stay the same unless someone clicks **Regenerate** for that week.

## Tips

- Compare the same week across months to spot trends.
- Combine with **Exception agents → Owner brief** for daily follow-up.

## Common problems

- **"No weekly reports yet."** → wait for Sunday's run or click **Generate first report** (when AI is configured).
- **Buttons are greyed out** → AI is not configured on the server; ask your system administrator.`,
      tags: ["AI", "weekly report", "executive summary", "KPI", "management"],
      keywords: ["Monday report", "weekly summary", "Generate this week", "Regenerate", "MIS summary", "Gemini"],
      estimatedMinutes: 3,
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/ai-weekly-reports-hub.jpg",
      images: [
        {
          src: "/tutorials/screens/ai-weekly-reports-hub.jpg",
          alt: "Weekly AI reports page with Last 24, Refresh, Generate this week and Regenerate buttons",
          caption: "Weekly AI reports: pick a week on the left to read it.",
        },
      ],
      relatedAppRoutes: ["/app/ai/weekly-reports"],
      relatedArticleIds: ["ai-dashboard-brief", "ai-predictions", "reports-overview"],
    },
  ],
};

import type { TutorialSection } from "../types";

const DIAGRAMS = "/tutorials/diagrams/finance-reports";
const SCREENS = "/tutorials/screens";

export const financeReportsSection: TutorialSection = {
  id: "finance-reports",
  title: "Finance — Books & reports",
  description:
    "Read your books: Day Book, ledgers, Trial Balance, Profit & Loss, Balance Sheet, ageing, budgets, cost centres, MIS and the month-end / year-end close.",
  articles: [
    {
      id: "fin-rpt-overview",
      title: "Finance books & reports map",
      summary: "Which finance report answers which question, where to find it in the sidebar, and how all reports come from posted vouchers.",
      featured: true,
      estimatedMinutes: 5,
      audience: "finance",
      coverImage: `${SCREENS}/accounts-reports-trial-balance.jpg`,
      tags: ["finance", "reports", "books", "trial balance", "profit and loss", "balance sheet"],
      keywords: [
        "account books",
        "hisab",
        "khata",
        "ledger",
        "day book",
        "TB",
        "P&L",
        "income statement",
        "balance sheet",
        "MIS",
        "finance reports",
        "Tally reports",
      ],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: [
        "/app/accounts/reports/day-book",
        "/app/accounts/reports/trial-balance",
        "/app/accounts/reports/financial-statements",
        "/app/accounts/reports/ledger-activity",
        "/app/accounts/reports/ar-ap-aging",
        "/app/accounts/reports/exceptions",
        "/app/accounts/reports/cash-flow",
        "/app/accounts/reports/group-summary",
        "/app/accounts/reports/ratio-analysis",
        "/app/accounts/reports/voucher-analytics",
      ],
      relatedArticleIds: [
        "fin-rpt-read-statements",
        "fin-rpt-drilldown",
        "fin-rpt-daybook-ledger",
        "fin-rpt-month-end",
        "fin-overview",
        "fin-voucher-entry",
        "fin-coming-from-tally",
      ],
      infographics: [
        {
          type: "diagram",
          title: "Where each voucher lands",
          caption: "A posted voucher updates two or more ledgers. Ledgers add up to the Trial Balance, which splits into Profit & Loss and Balance Sheet.",
          imageSrc: `${DIAGRAMS}/where-voucher-lands.svg`,
          imageAlt:
            "Diagram: a payment voucher (debit Electricity Expense 5,000, credit Bank 5,000) updates two ledgers, which feed the Trial Balance, which feeds Profit and Loss and the Balance Sheet",
        },
        {
          type: "flow",
          title: "From daily entries to the year's results",
          steps: [
            { label: "Day Book", href: "/app/accounts/reports/day-book" },
            { label: "Ledger Activity", href: "/app/accounts/reports/ledger-activity" },
            { label: "Trial Balance", href: "/app/accounts/reports/trial-balance" },
            { label: "Financial Statements", href: "/app/accounts/reports/financial-statements" },
            { label: "MIS Dashboard", href: "/app/finance/mis" },
          ],
        },
      ],
      images: [
        {
          src: `${SCREENS}/accounts-reports-financial-statements.jpg`,
          alt: "Financial Statements screen with a Profit & Loss card (Income, Expense, Net Profit) and a Balance Sheet card (Assets, Liabilities, Equity)",
          caption: "Financial Statements: Profit & Loss on the left, Balance Sheet on the right.",
        },
      ],
      content: `## Overview

All finance reports in P7 ERP are built from **vouchers**. When a voucher is **POSTED**, its debit and credit lines update the ledgers (accounts). Every report on this page just reads those ledgers in a different way.

This guide is for **accountants, finance managers and owners** who need to check the books, answer "how much did we spend / earn / owe?" and close the month.

## Before you start

- You need the **Finance** menu in the sidebar (your role must include finance access).
- Reports show **posted** vouchers only. Drafts and vouchers still waiting for approval do **not** appear in the Trial Balance or statements. See [Voucher approvals](/app/accounts/vouchers/approval-queue).
- Your **financial year** comes from **Settings → Configuration → Finance & costing → Financial year starts in** (for example **July (Bangladesh July–June)**).

## Steps

Open **Finance** in the sidebar, then the **Reports** group. Pick the report that answers your question:

1. **"What was entered today / this week?"** → **Day Book** (\`/app/accounts/reports/day-book\`). A list of vouchers by date, with type and status.
2. **"What happened in one account?"** → **Ledger Activity** (\`/app/accounts/reports/ledger-activity\`). One account, every posted voucher, running balance. Bill-wise customer / supplier balances are in **Party Ledgers** when your company has that feature switched on.
3. **"Do the books balance?"** → **Trial Balance** (\`/app/accounts/reports/trial-balance\`). Every account with its debit or credit balance. Total Debit must equal Total Credit.
4. **"Did we make a profit? What do we own and owe?"** → **Financial Statements** (\`/app/accounts/reports/financial-statements\`). **Profit & Loss** and **Balance Sheet** on one page.
5. **"Where did the cash go?"** → **Cash Flow** (\`/app/accounts/reports/cash-flow\`). Operating, investing and financing cash in and out.
6. **"Who owes us, and whom do we owe?"** → **AR/AP Aging** (\`/app/accounts/reports/ar-ap-aging\`). Bills grouped by days overdue.
7. **"What is stuck or wrong?"** → **Exception Reports** (\`/app/accounts/reports/exceptions\`). Goods received but not billed, negative cash, overdue bills and more.
8. **Summaries for management** → **Group Summary**, **Ratio Analysis**, **Voucher Analytics**, and the **Financial MIS Dashboard** (\`/app/finance/mis\`) with **Fund Flow**, **MIS Ratios**, **Comparative** and **Cash Scenarios**.

Planning screens sit in the **Planning** group: **Budgets** (\`/app/accounts/budgets\`), **Cash Forecast**, **Cashflow Calendar**, **Style Profitability**, **LC Profitability** and **Costing Variance**. Period control is in **Setup → Accounting Periods** (\`/app/accounts/accounting-periods\`).

## What happens next

- Click any **orange link** in a report to go one level deeper (report → account → voucher). See [Drill down from a report to the voucher](/app/tutorials/fin-rpt-drilldown).
- At month-end, run the checks in [Month-end and year-end closing checklist](/app/tutorials/fin-rpt-month-end), then close the period.

## Tips

- Most reports have the same toolbar: a **date** box, filters (**All Groups**, **All Accounts**), **Compact View**, **Print**, **Export CSV** and (on Day Book, Trial Balance, Financial Statements and Ledger Activity) **Export Excel**. Excel keeps numbers as numbers, so you can add them up.
- **Print** prints only the report (not the sidebar), with the report title and date at the top.
- Reports update as soon as you change a date or filter — there is no separate **Run** button.

> **Tip:** New to accounting words like debit, credit, asset and liability? Read [How to read a Trial Balance, P&L and Balance Sheet](/app/tutorials/fin-rpt-read-statements) first — it uses a small worked example.

## Common problems

- **A voucher I entered is missing from the Trial Balance** → it is probably not **POSTED** yet. Find it in **Day Book** and look at the **Status** column, then finish the approval.
- **A report shows only zeros** → check the date. Many reports start at the first day of the current month; move the date back to when your vouchers were entered.
- **I don't see Financial MIS Dashboard / Fund Flow** → an admin has switched off **Enable MIS reports** in **Settings → Configuration**.`,
    },
    {
      id: "fin-rpt-read-statements",
      title: "How to read a Trial Balance, P&L and Balance Sheet",
      summary: "Beginner accounting in plain words: debit and credit, the five account natures, and a small worked example that follows four vouchers into all three reports.",
      featured: true,
      estimatedMinutes: 10,
      audience: "finance",
      coverImage: `${SCREENS}/accounts-reports-financial-statements.jpg`,
      tags: ["trial balance", "profit and loss", "balance sheet", "accounting basics", "debit", "credit"],
      keywords: [
        "TB",
        "P&L",
        "PL",
        "income statement",
        "net profit",
        "loss",
        "assets",
        "liabilities",
        "equity",
        "capital",
        "debit credit",
        "double entry",
        "financial statements",
        "profit brought forward",
        "lav khoti",
      ],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app/accounts/reports/trial-balance", "/app/accounts/reports/financial-statements", "/app/accounts/groups"],
      relatedArticleIds: ["fin-rpt-overview", "fin-rpt-drilldown", "fin-rpt-month-end", "fin-voucher-entry"],
      videos: [
        {
          src: "/tutorials/videos/fin-rpt-pnl-tour.webm",
          poster: "/tutorials/videos/fin-rpt-pnl-tour-poster.jpg",
          title: "Tour of the Profit & Loss and Balance Sheet",
          caption: "Open Financial Statements, switch between this financial year and all years, then click Expense to see the accounts behind the number.",
          durationSeconds: 50,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "Where each voucher lands",
          caption: "Income and Expense accounts go to Profit & Loss; Asset, Liability and Equity accounts go to the Balance Sheet; every account is in the Trial Balance.",
          imageSrc: `${DIAGRAMS}/where-voucher-lands.svg`,
          imageAlt: "Diagram showing a voucher flowing into ledgers, then the Trial Balance, then Profit and Loss and the Balance Sheet",
        },
        {
          type: "steps",
          title: "Read the three reports in order",
          steps: [
            {
              title: "Trial Balance — do the books balance?",
              body: "Check the **Total** row at the bottom: total **Debit** must equal total **Credit**.",
              imageSrc: `${SCREENS}/accounts-reports-trial-balance.jpg`,
              imageAlt: "Trial Balance with columns Account, Group, Nature, Debit and Credit",
              href: "/app/accounts/reports/trial-balance",
            },
            {
              title: "Profit & Loss — did we make money?",
              body: "**Income − Expense = Net Profit**. A minus sign means a loss.",
              imageSrc: `${SCREENS}/accounts-reports-financial-statements.jpg`,
              imageAlt: "Financial Statements with the Profit & Loss card showing Income, Expense and Net Profit",
              href: "/app/accounts/reports/financial-statements",
            },
            {
              title: "Balance Sheet — what we own and owe",
              body: "**Assets** (what we own) = **Liabilities** (what we owe) + **Equity** (owners' money) + profit.",
              imageSrc: `${SCREENS}/fin-rpt-fs-cumulative.jpg`,
              imageAlt: "Financial Statements switched to Since start (all years)",
              href: "/app/accounts/reports/financial-statements",
            },
          ],
        },
      ],
      content: `## Overview

The **Trial Balance**, **Profit & Loss (P&L)** and **Balance Sheet** are the three reports every owner, auditor and bank asks for. This guide explains them in plain words with a small example you can follow with a pencil.

- **Trial Balance** — \`/app/accounts/reports/trial-balance\`
- **Profit & Loss** and **Balance Sheet** — both on **Financial Statements**, \`/app/accounts/reports/financial-statements\`

## Before you start

Learn three ideas:

1. **Every voucher has two sides.** Money always comes **from** somewhere and goes **to** somewhere. The "to" side is the **Debit (Dr)**, the "from" side is the **Credit (Cr)**. In every voucher, total debit = total credit.
2. **Every account has a nature.** The **Account Group** of an account (see **Finance → Setup → Account Groups**) decides its nature:
   - **Asset** — things we own: cash, bank, stock, money customers owe us (receivables).
   - **Liability** — things we owe: supplier bills (payables), loans, BTB LC liability.
   - **Equity** — the owners' money (capital).
   - **Income** — sales, export proceeds, other income.
   - **Expense** — purchases, salary, electricity, rent.
3. **Assets and Expenses grow with a debit. Liabilities, Equity and Income grow with a credit.**

## Steps

### Worked example — four vouchers

A new company records four posted vouchers:

1. Owner puts **100,000** into the bank → **Dr Bank 100,000 / Cr Capital 100,000**.
2. Buys fabric on credit for **40,000** → **Dr Purchases 40,000 / Cr Supplier 40,000**.
3. Sells garments on credit for **70,000** → **Dr Customer 70,000 / Cr Sales 70,000**.
4. Pays electricity **5,000** from the bank → **Dr Electricity 5,000 / Cr Bank 5,000**.

### 1. Read the Trial Balance

Open **Finance → Reports → Trial Balance**. Each account appears once with its balance in the **Debit** or **Credit** column:

- Bank — Debit **95,000** (100,000 in, 5,000 out)
- Customer — Debit **70,000**
- Purchases — Debit **40,000**
- Electricity — Debit **5,000**
- Capital — Credit **100,000**
- Supplier — Credit **40,000**
- Sales — Credit **70,000**
- **Total: Debit 210,000 = Credit 210,000** ✔

If the two totals are equal, every voucher was balanced. Columns on screen: **Account**, **Group**, **Nature**, **Debit**, **Credit**.

### 2. Read the Profit & Loss

Open **Finance → Reports → Financial Statements** and look at the **Profit & Loss** card:

- **Income** = Sales **70,000**
- **Expense** = Purchases 40,000 + Electricity 5,000 = **45,000**
- **Net Profit** = 70,000 − 45,000 = **25,000**

A **negative** Net Profit (for example **-18,000**) means a loss.

### 3. Read the Balance Sheet

On the same page, the **Balance Sheet** card shows:

- **Assets** = Bank 95,000 + Customer 70,000 = **165,000**
- **Liabilities** = Supplier **40,000**
- **Equity** = Capital **100,000**
- **Profit this year** = **25,000**

Check: 40,000 + 100,000 + 25,000 = **165,000** = Assets ✔. That is why it is called a *balance* sheet.

### 4. Pick the period

- The **date box** is the "as of" date: balances are shown up to and including that day.
- **This financial year** — Income and Expense count only from the start of the current financial year. Profit from earlier years appears as **Profit & Loss brought forward** (Trial Balance) and **Profit brought forward (earlier years)** (Balance Sheet).
- **Since start (all years)** — adds every year together.
- **All Groups** — pick one group to see only part of the books.

## What happens next

- Click **Income**, **Expense**, **Assets**, **Liabilities** or **Equity** on Financial Statements to open the Trial Balance with only those accounts. Then click an account to see its vouchers — see [Drill down from a report to the voucher](/app/tutorials/fin-rpt-drilldown).
- Use **Export Excel** or **Print** to share the reports with management or the auditor.

## Tips

- P7 works like Tally: you do **not** post a year-end closing entry. The new year starts automatically on the first day of your financial year.
- A credit balance on an asset (for example a bank account below zero) is shown in the **Credit** column — check it in **Exception Reports → Negative cash / bank**.
- **Group Summary** (\`/app/accounts/reports/group-summary\`) shows the same balances added up per account group.

> **Note:** The P&L and Balance Sheet cards show totals by nature. To see each account, click the heading to open the Trial Balance filtered to that nature.

## Common problems

- **Trial Balance totals are not equal** → usually an account has an **opening balance** in the Chart of Accounts that has no matching other side. Ask your finance lead to check opening balances in **Finance → Setup → Chart of Accounts**.
- **Assets do not equal Liabilities + Equity + Profit** → same cause (unbalanced opening balances), or an account sits in a group with the wrong nature. Check **Account Groups**.
- **Profit looks too high or too low for the year** → check you chose **This financial year**, and that the financial year start month in **Settings → Configuration** is right.
- **Expense shows a number but I can't see which accounts** → click the word **Expense**; the Trial Balance opens with **Showing Expense accounts only**. Click **Show all** to remove the filter.`,
    },
    {
      id: "fin-rpt-drilldown",
      title: "Drill down from a report to the voucher",
      summary: "Click through Financial Statements → Trial Balance → Ledger Activity → Voucher to find exactly which entries make up any figure.",
      estimatedMinutes: 4,
      audience: "finance",
      coverImage: `${SCREENS}/fin-rpt-ledger-activity-drill.jpg`,
      tags: ["drill-down", "trial balance", "ledger activity", "voucher", "audit trail"],
      keywords: ["drill down", "click through", "trace", "source voucher", "audit", "why is this number", "ledger statement", "Tally drill"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: [
        "/app/accounts/reports/financial-statements",
        "/app/accounts/reports/trial-balance",
        "/app/accounts/reports/ledger-activity",
        "/app/accounts/reports/day-book",
        "/app/accounts/vouchers",
      ],
      relatedArticleIds: ["fin-rpt-read-statements", "fin-rpt-daybook-ledger", "fin-rpt-overview", "fin-voucher-entry"],
      videos: [
        {
          src: "/tutorials/videos/fin-rpt-trial-balance-drilldown.webm",
          poster: "/tutorials/videos/fin-rpt-trial-balance-drilldown-poster.jpg",
          title: "Trial Balance drill-down: report → ledger → voucher",
          caption: "Change the period on the Trial Balance, click an account to open its Ledger Activity, then click a voucher number to open the voucher.",
          durationSeconds: 48,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "The drill-down path",
          caption: "Each orange link opens the next level. Use the browser Back button to go back up.",
          imageSrc: `${DIAGRAMS}/report-drilldown.svg`,
          imageAlt: "Diagram: Financial Statements, then Trial Balance, then Ledger Activity, then Voucher, with shortcuts from Day Book and Exception Reports",
        },
        {
          type: "steps",
          title: "Drill down step by step",
          steps: [
            {
              title: "Click a heading on Financial Statements",
              body: "Click **Expense** (or Income, Assets, Liabilities, Equity).",
              imageSrc: `${SCREENS}/accounts-reports-financial-statements.jpg`,
              imageAlt: "Financial Statements with clickable Income, Expense, Assets, Liabilities and Equity headings",
              href: "/app/accounts/reports/financial-statements",
            },
            {
              title: "The Trial Balance opens filtered",
              body: "The header says **Showing Expense accounts only**. Click an **account name**.",
              imageSrc: `${SCREENS}/fin-rpt-tb-expense-only.jpg`,
              imageAlt: "Trial Balance showing only Expense accounts with a Show all link",
              href: "/app/accounts/reports/trial-balance",
            },
            {
              title: "Ledger Activity shows every voucher",
              body: "**Opening**, each posted voucher with **Running Balance**, and **Closing**. Click a **Voucher** number.",
              imageSrc: `${SCREENS}/fin-rpt-ledger-activity-drill.jpg`,
              imageAlt: "Ledger Activity Report for one account with opening, closing and voucher rows",
              href: "/app/accounts/reports/ledger-activity",
            },
            {
              title: "The voucher opens",
              body: "See the debit / credit lines, narration, status and history.",
              imageSrc: `${SCREENS}/fin-rpt-voucher-from-ledger.jpg`,
              imageAlt: "Voucher detail page opened from the ledger",
            },
          ],
        },
      ],
      content: `## Overview

**Drill-down** means clicking a number in a report to see what it is made of, until you reach the voucher that created it. Accountants use it to answer "why is this figure so high?" and auditors use it to check entries.

The path is: **Financial Statements → Trial Balance → Ledger Activity → Voucher**.

## Before you start

- You need access to the **Finance** menu.
- Only **posted** vouchers appear in these reports.

## Steps

1. Open **Finance → Reports → Financial Statements** (\`/app/accounts/reports/financial-statements\`).
2. Set the **date** and choose **This financial year** or **Since start (all years)**.
3. Click a heading — **Income**, **Expense**, **Assets**, **Liabilities** or **Equity**. The **Trial Balance** opens with the same date and only accounts of that nature. The text under the title says, for example, **Showing Expense accounts only. Show all**.
4. In the Trial Balance, click an **account name** (for example *5001 - Office Expense*). **Ledger Activity Report** opens for that account, from the start of the financial year to the report date.
5. In Ledger Activity, read **Opening**, each voucher row (**Date**, **Voucher**, **Entry** DEBIT/CREDIT, **Amount**, **Reference**, **Description**, **Running Balance**) and **Closing**.
6. Click a **Voucher** number. The voucher page opens with all its lines, status and history.
7. Press the browser **Back** button to return to the previous report — your filters are kept in the address.

### Shortcuts

- **Day Book** (\`/app/accounts/reports/day-book\`) → click a **Voucher** number to open it directly.
- **Exception Reports → Negative cash / bank** → click the ledger to open its Ledger Activity.
- **Exception Reports → Overdue bills** → click the bill number to open its voucher (or the Bills list).

## What happens next

- If the voucher is wrong and already posted, do **not** edit the report. Fix it on the voucher with **Reverse** and enter a correct voucher — see [Voucher entry](/app/tutorials/fin-voucher-entry).
- Export what you found with **Export Excel** on the Ledger Activity page.

## Tips

- You can bookmark or share a drill-down link — the date and filters are part of the address (for example \`?nature=Expense\`).
- On Ledger Activity you can change the account in the drop-down and the **From** / **To** dates, then click **Refresh**.
- Use **Compact View** to fit more rows on screen, **Comfort View** to go back.

## Common problems

- **The ledger shows Opening and Closing but no rows** → no posted vouchers for that account in the date range. Move the **From** date earlier.
- **Ledger Activity closing balance is different from the Trial Balance** → Ledger Activity **Opening** is the account's opening balance from the Chart of Accounts only; it does not add vouchers dated before the **From** date. Set **From** to the date of your first voucher to match the Trial Balance.
- **An account name is not clickable** → the grey italic line *Profit & Loss brought forward* is a calculated line, not an account. It is earlier years' profit.`,
    },
    {
      id: "fin-rpt-daybook-ledger",
      title: "Day Book and Ledger Activity: your daily account books",
      summary: "Use the Day Book to review every voucher entered in a period, and Ledger Activity to read one account like a bank statement.",
      estimatedMinutes: 5,
      audience: "finance",
      coverImage: `${SCREENS}/fin-rpt-daybook-filters.jpg`,
      tags: ["day book", "ledger", "ledger activity", "party ledger", "daily check", "account statement"],
      keywords: ["daybook", "journal register", "voucher register", "ledger statement", "account statement", "khata", "cash book", "bank book", "party ledger", "running balance"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app/accounts/reports/day-book", "/app/accounts/reports/ledger-activity", "/app/finance/party-ledgers", "/app/accounts/reports/voucher-analytics"],
      relatedArticleIds: ["fin-rpt-drilldown", "fin-rpt-overview", "fin-voucher-approval-queue", "fin-rpt-month-end"],
      infographics: [
        {
          type: "steps",
          title: "Daily check in two screens",
          steps: [
            {
              title: "Day Book — what was entered",
              body: "Set the dates, filter by **All Types** / **All Groups** / **All Accounts** or type in **Party/Ref contains...**.",
              imageSrc: `${SCREENS}/fin-rpt-daybook-filters.jpg`,
              imageAlt: "Day Book with date range, type, group and account filters and a list of vouchers",
              href: "/app/accounts/reports/day-book",
            },
            {
              title: "Ledger Activity — one account in detail",
              body: "Pick the account, set **From** / **To**, read the **Running Balance**.",
              imageSrc: `${SCREENS}/fin-rpt-ledger-activity-drill.jpg`,
              imageAlt: "Ledger Activity Report for a bank account with running balance",
              href: "/app/accounts/reports/ledger-activity",
            },
          ],
        },
      ],
      content: `## Overview

- **Day Book** (\`/app/accounts/reports/day-book\`) is the register of vouchers by date. Use it every morning to see what was entered yesterday, including vouchers created automatically by inventory, payroll and payment runs.
- **Ledger Activity** (\`/app/accounts/reports/ledger-activity\`) is the statement of **one account** — like a bank statement: opening balance, every posted entry and a running balance. Use it for the cash book, bank book, a supplier or an expense head.

## Before you start

- Finance menu access.
- Know the account you want (account number and name, for example *1010 - Bank - Main*).

## Steps

### Review the Day Book

1. Open **Finance → Reports → Day Book**.
2. Set the two date boxes (**from** and **to**). By default they cover the current month up to today.
3. Narrow the list if needed: **All Types** (voucher type, e.g. PAYMENT, RECEIPT, JOURNAL), **All Groups**, **All Accounts**, or type part of a party name or reference in **Party/Ref contains...**.
4. Read the columns **Voucher**, **Date**, **Type**, **Status**, **Description**, **Amount**. The **Total** row adds up the amounts.
5. Click a **Voucher** number to open it.

### Read one account in Ledger Activity

1. Open **Finance → Reports → Ledger Activity**.
2. Choose the account in the first drop-down.
3. Set the **From** and **To** dates and click **Refresh**.
4. Read **Opening**, the voucher rows (each with **Entry** = DEBIT or CREDIT and the **Running Balance**) and **Closing**.
5. Click a voucher number to open it, or use **Print**, **Export CSV** or **Export Excel**.

### Customer and supplier ledgers

If your company uses bill-wise party ledgers, **Finance → Transactions → Party Ledgers** (\`/app/finance/party-ledgers\`) lists each customer and vendor with **DR** / **CR** balance, an **Overdue only** filter and a detail page per party. This menu appears only when an admin ticks **Enable party ledger (bill-wise AR/AP)** in **Settings → Configuration**.

## What happens next

- Vouchers in the Day Book that are not **POSTED** still need approval — send the preparer to [Voucher approvals](/app/tutorials/fin-voucher-approval-queue).
- Use **Voucher Analytics** (\`/app/accounts/reports/voucher-analytics\`) for a **Summary**, **Monthly Trend** and **Top Preparers** view of who entered what.

## Tips

- The Day Book shows vouchers of **every status** (DRAFT, SUBMITTED, POSTED…); the Trial Balance and Ledger Activity count **POSTED** only. Use the **Status** column to spot unfinished work.
- Memorandum vouchers, stock transfer vouchers and future post-dated vouchers are kept out of the Day Book; they have their own registers under **Transactions**.
- Export the Day Book at month-end and keep it with the month's report pack.

## Common problems

- **Day Book is empty** → the date range has no vouchers. Move the first date back (the default is only the current month).
- **Ledger Activity shows a different closing balance from the Trial Balance** → the **Opening** on Ledger Activity is the account's opening balance only, not vouchers before **From**. Set **From** to your first voucher date.
- **Party Ledgers is not in my sidebar** → the feature is off for your company. Use **AR/AP Aging** or **Bills** instead, or ask an admin.`,
    },
    {
      id: "fin-rpt-ageing",
      title: "AR/AP Aging and Exception Reports",
      summary: "See who owes you and whom you owe by days overdue, and find documents that are stuck (goods received but not billed, delivered but not invoiced).",
      estimatedMinutes: 5,
      audience: "finance",
      coverImage: `${SCREENS}/accounts-reports-ar-ap-aging.jpg`,
      tags: ["aging", "ageing", "receivables", "payables", "overdue", "exceptions", "collections"],
      keywords: [
        "AR aging",
        "AP aging",
        "debtors",
        "creditors",
        "outstanding",
        "due",
        "baki",
        "pawna",
        "dena",
        "overdue bills",
        "GRN not billed",
        "challan not invoiced",
        "negative cash",
        "negative stock",
        "exception report",
      ],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app/accounts/reports/ar-ap-aging", "/app/accounts/reports/exceptions", "/app/accounts/outstanding-bills", "/app/accounts/vendor-bills"],
      relatedArticleIds: ["fin-bills-ap", "fin-rpt-month-end", "fin-rpt-overview", "fin-rpt-daybook-ledger"],
      infographics: [
        {
          type: "steps",
          title: "Weekly receivables / payables review",
          steps: [
            {
              title: "Open AR/AP Aging — Receivable",
              body: "Read the buckets **Current**, **1-30**, **31-60**, **61-90**, **90+**.",
              imageSrc: `${SCREENS}/accounts-reports-ar-ap-aging.jpg`,
              imageAlt: "AR/AP Aging Report in Receivable mode with bucket totals and a bill list",
              href: "/app/accounts/reports/ar-ap-aging",
            },
            {
              title: "Switch to Payable",
              body: "Choose **Payable** in the first drop-down to see supplier bills.",
              imageSrc: `${SCREENS}/fin-rpt-aging-payable.jpg`,
              imageAlt: "AR/AP Aging Report switched to Payable",
              href: "/app/accounts/reports/ar-ap-aging",
            },
            {
              title: "Check Exception Reports",
              body: "Click each card; fix rows until every count is **0**.",
              imageSrc: `${SCREENS}/accounts-reports-exceptions.jpg`,
              imageAlt: "Exception reports with five cards: Goods received not billed, Delivered not invoiced, Negative cash / bank, Negative stock, Overdue bills",
              href: "/app/accounts/reports/exceptions",
            },
          ],
        },
      ],
      images: [
        {
          src: `${SCREENS}/fin-rpt-exceptions-overdue.jpg`,
          alt: "Exception reports with the Overdue bills card selected, listing bills with party, type, due date, days overdue and amount due",
          caption: "Overdue bills: click the bill number to open its voucher.",
        },
      ],
      content: `## Overview

- **AR/AP Aging** (\`/app/accounts/reports/ar-ap-aging\`) groups open bills by how many days they are past the due date. **AR** (accounts receivable) = customers who owe us. **AP** (accounts payable) = suppliers we owe.
- **Exception Reports** (\`/app/accounts/reports/exceptions\`) list things that are stuck between documents or should never happen. Fix them before month-end.

Used by accountants, the credit-control person and the finance manager, usually once a week.

## Before you start

- Bills must exist: customer and supplier bills in **Finance → Transactions → Bills** (\`/app/accounts/outstanding-bills\`) or **Vendor bills (GRN)**. See [Bills and payables](/app/tutorials/fin-bills-ap).
- Each bill needs a **due date** — ageing counts days from the due date.

## Steps

### AR/AP Aging

1. Open **Finance → Reports → AR/AP Aging**.
2. In the first drop-down choose **Receivable** (customers) or **Payable** (suppliers).
3. Set the "as of" **date** (normally today or the month-end date).
4. Optional: type part of a name in **Party contains...** to see one party.
5. Read the bucket cards: **Current** (not yet due), **1-30**, **31-60**, **61-90** and **90+** days overdue.
6. Read the table: **Bill**, **Party**, **Due Date**, **Outstanding**, **Overdue Days**, **Bucket**.
7. Click **Export CSV** or **Print** to send the list to the sales or purchase team.

### Exception Reports

1. Open **Finance → Reports → Exception Reports**.
2. Look at the five cards. A red number means something needs fixing:
   - **Goods received, not billed** — GRNs with no vendor bill yet. Use **Actions → Create vendor bill draft**, then review and post it under **Vendor bills (GRN)**.
   - **Delivered, not invoiced** — posted delivery challans with no commercial invoice. Click the challan to open it.
   - **Negative cash / bank** — cash or bank ledgers below zero. Click the ledger to see its entries.
   - **Negative stock** — items where more went out than came in, per warehouse.
   - **Overdue bills** — receivables and payables past their due date.
3. Click a card to see its list. **Nothing to fix here.** means that check is clean.
4. Click **Refresh** after fixing records.

## What happens next

- Collect overdue receivables first from the **90+** bucket; agree payment dates for overdue payables.
- When a bill is paid, the payment voucher reduces **Outstanding**, and the bill drops out of the ageing.

## Tips

- Run the Payable ageing before each **Payment Run** to choose which supplier bills to pay.
- **Ratio Analysis** has an **Open AR/AP Aging** link for quick checking.
- Aim for all five exception counts at **0** before you close the month.

## Common problems

- **A bill shows Outstanding 0 but still appears** → it is fully paid but the bill status was not closed. Check it in **Bills**.
- **Ageing is empty but I know customers owe money** → the sale was entered as a voucher only, without a bill. Create the bill in **Bills** so it can be aged.
- **"Goods received, not billed" keeps growing** → stores are receiving GRNs but accounts is not booking supplier bills. Agree a daily routine with the store.`,
    },
    {
      id: "fin-rpt-budgets",
      title: "Budgets and Budget vs Actual",
      summary: "Create a monthly budget by account and cost centre, compare it with posted actuals, and optionally warn or block over-budget vouchers.",
      estimatedMinutes: 6,
      audience: "finance",
      coverImage: `${SCREENS}/fin-rpt-finance-config.jpg`,
      tags: ["budget", "budget vs actual", "variance", "cost centre", "spending control"],
      keywords: ["budgeting", "budget control", "variance", "over budget", "spending limit", "enforcement", "warn", "block", "budget override", "khoroch"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app/accounts/budgets", "/app/accounts/cost-centers", "/app/settings/config"],
      relatedArticleIds: ["fin-rpt-cost-centres", "fin-rpt-month-end", "fin-voucher-entry", "fin-rpt-overview"],
      infographics: [
        {
          type: "flow",
          title: "Budget control loop",
          steps: [
            { label: "Cost Centers", href: "/app/accounts/cost-centers" },
            { label: "Budgets (FINAL)", href: "/app/accounts/budgets" },
            { label: "Enforcement in Configuration", href: "/app/settings/config" },
            { label: "Vouchers with cost centre", href: "/app/accounts/vouchers" },
            { label: "Budget vs Actual", href: "/app/accounts/budgets" },
          ],
        },
      ],
      images: [
        {
          src: `${SCREENS}/fin-rpt-finance-config.jpg`,
          alt: "Settings Configuration, Finance and costing block with Financial year starts in and Budget enforcement mode",
          caption: "Settings → Configuration → Finance & costing: choose the Budget enforcement mode (Off, Warn or Block).",
        },
      ],
      content: `## Overview

A **budget** is the amount you plan to spend (or earn) per month. **Budget vs Actual** compares that plan with **posted** vouchers so managers can see overspending early.

Screen: **Finance → Planning → Budgets** (\`/app/accounts/budgets\`), titled **Budgets & Budget vs Actual**.

## Before you start

- Create **Cost Centers** first if you want budgets per department — see [Cost centres](/app/tutorials/fin-rpt-cost-centres).
- Know the **accounts** you want to control (for example *Office Expense*, *Electricity*).
- Optional: an admin chooses **Budget enforcement mode** in **Settings → Configuration → Finance & costing**:
  - **Off — no checks on voucher post**
  - **Warn — allow post, show budget warnings**
  - **Block — refuse over-budget posts (override with permission)**. Users with the **finance.budget_override** permission can still post.

## Steps

1. Open **Finance → Planning → Budgets**. The badge at the top right shows **Enforcement: Off / Warn / Block**.
2. In **New budget**, type a **Budget Name** (e.g. *FY26 Operations Budget*) and the **Fiscal Year** (e.g. *2026-2027*).
3. Leave status **DRAFT** while you are working.
4. Fill the first line: **Month** (format \`YYYY-MM\`, e.g. 2026-07), **Account** (or **Any Account**), **Cost Center** (or **Any Cost Center**) and **Amount**.
5. Click **Add Line** for each further month / account / cost centre. Use **Remove** to delete a line.
6. Click **Create Budget**.
7. When management agrees, open the budget with **Actions → Edit**, change the status to **FINAL** and click **Save budget**. Only **FINAL** budgets are used for enforcement.
8. To compare, choose the budget in **Select for vs actual** (top right of **Budget List**). The **Budget vs Actual** panel shows **Budget**, **Actual** and **Variance** totals, a coloured bar per month and a table with **Variance %**.

### How "Actual" is worked out

- Each budget line is compared only with posted vouchers in **its own period**. A monthly line (e.g. \`2025-07\`) counts that month only; a line without a month counts the budget's whole financial year (for example 1 July 2025 – 30 June 2026 for a "2025-26" budget).
- Amounts are in your **base currency** (foreign-currency vouchers are converted at their voucher rate).
- Amounts are **netted**: expense and asset accounts = debit − credit (refunds and reversals reduce the actual); income, liability and equity accounts = credit − debit.
- Hover the **Actual (line period)** figure to see the debit, credit and date range.

## What happens next

- When a voucher line has a **cost centre** and a **FINAL** budget exists for that month, posting the voucher is checked against the budget (Warn or Block mode).
- Review Budget vs Actual at every month-end and explain red bars.

## Tips

- Bar colours: **green** up to 90% used, **yellow** 90–100%, **red** over 100%.
- Use **Fiscal year filter** (e.g. *2025-2026*) to show one year's budgets only.
- Start with **Warn** for a month before switching to **Block**, so people learn to pick the right cost centre.

## Common problems

- **The Budgets page shows "Internal Server Error" and the Budget List is empty** → a known server error when loading saved budgets (reported to the development team). Until it is fixed, the Budget List and Budget vs Actual cannot load — tell your system administrator.
- **Vouchers are not blocked even in Block mode** → the voucher lines have no **Cost center**, or the budget is still **DRAFT**, or there is no budget line for that month.
- **Actual is 0** → the vouchers are not **POSTED** yet, or they use a different account / cost centre than the budget line.`,
    },
    {
      id: "fin-rpt-cost-centres",
      title: "Cost centres and cost nature: see spending by department",
      summary: "Create cost centres (Production, Admin, Trade…), tag voucher lines with them, read the Cost Center Dashboard, and set cost nature (material / CM) for costing reports.",
      estimatedMinutes: 4,
      audience: "finance",
      coverImage: `${SCREENS}/accounts-cost-centers.jpg`,
      tags: ["cost centre", "cost center", "department", "cost tracking"],
      keywords: ["cost center", "cost centre", "department cost", "profit centre", "cost nature", "division", "unit wise expense", "line wise cost"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app/accounts/cost-centers", "/app/accounts/budgets", "/app/accounts/vouchers", "/app/accounts"],
      relatedArticleIds: ["fin-rpt-budgets", "fin-voucher-entry", "fin-rpt-overview"],
      infographics: [
        {
          type: "steps",
          title: "Set up and use cost centres",
          steps: [
            {
              title: "Create the cost centre",
              body: "Fill **Center Code**, **Name**, **Department**, keep **Active** ticked, click **Create**.",
              imageSrc: `${SCREENS}/accounts-cost-centers.jpg`,
              imageAlt: "Cost Centers screen with a create form and a list of cost centres",
              href: "/app/accounts/cost-centers",
            },
            {
              title: "Tag voucher lines",
              body: "On each voucher line, choose a cost centre in **Cost center (optional)…**.",
              href: "/app/accounts/vouchers",
            },
            {
              title: "Read the dashboard",
              body: "**Cost Center Dashboard** shows **Debit**, **Credit** and **Net** per cost centre.",
              imageSrc: `${SCREENS}/fin-rpt-cost-center-dashboard.jpg`,
              imageAlt: "Cost Center Dashboard table with debit, credit and net per cost centre",
              href: "/app/accounts/cost-centers",
            },
          ],
        },
      ],
      content: `## Overview

A **cost centre** is a label for *where* money is spent — a department (Production, Admin), a factory unit, or a contract. The account says *what* was spent (e.g. Electricity); the cost centre says *who* spent it. This lets you see electricity for Production separately from Admin without creating extra accounts.

Screen: **Finance → Setup → Cost Centers** (\`/app/accounts/cost-centers\`).

## Before you start

- Agree a short list of cost centres with management (too many makes data entry slow).
- Pick a code style, e.g. **PRD** for Production, **ADM** for Admin.

## Steps

1. Open **Finance → Setup → Cost Centers**.
2. Fill **Center Code**, **Name** and **Department**. Keep **Active** ticked.
3. Click **Create**. The cost centre appears in the list with status **ACTIVE**.
4. To change one, use **Actions → Edit**, change the fields and click **Update**. To stop using it, untick **Active** and click **Update** (the status becomes **INACTIVE**; old entries are kept).
5. When entering a voucher (\`/app/accounts/vouchers\`), choose the cost centre on each expense line in **Cost center (optional)…**.
6. Back on **Cost Centers**, use **Actions → View dashboard** (or scroll down) to see the **Cost Center Dashboard**: **Code**, **Name**, **Debit**, **Credit**, **Net** per cost centre.

### Cost nature (material / CM / other)

**Cost nature** is a second, simpler label used for garment costing and financier reports: **MATERIAL**, **CM** (cost of making), **OTHER** or **NON_OPERATING**.

- Set the default on the account: **Finance → Setup → Chart of Accounts** → edit the account → **Cost nature (reporting / financier rollups)**.
- Change it for one voucher line with the line drop-down **Cost nature: account default** (pick another value only when this line is different from the usual).
- The voucher page shows both **Cost Center** and **Cost nature** columns in **Line Items**.

## What happens next

- Use cost centres in **Budgets** to plan spending per department — see [Budgets and Budget vs Actual](/app/tutorials/fin-rpt-budgets).
- With **Budget enforcement mode** set to Warn or Block, posting a voucher line with a cost centre is checked against the FINAL budget.

## Tips

- Tag **expense** lines (and income lines if you track profit per unit). Bank and party lines usually don't need a cost centre.
- The voucher print shows a **Cost Center** column, so approvers can check it.
- For profit per style or LC, use **Planning → Style Profitability** and **LC Profitability** instead of creating a cost centre for each order.

## Common problems

- **Dashboard shows 0 for a cost centre** → no **posted** voucher lines carry that cost centre yet.
- **A cost centre is missing in the voucher picker** → it is **INACTIVE**. Edit it and tick **Active**.
- **"Cost center name is required"** → fill the **Name** box before clicking **Create**.`,
    },
    {
      id: "fin-rpt-month-end",
      title: "Month-end and year-end closing checklist",
      summary: "A step-by-step close: clear approvals, reconcile banks, fix exceptions, review TB and statements, export the pack, then close the accounting period. Includes the year-end steps.",
      featured: true,
      estimatedMinutes: 12,
      audience: "finance",
      coverImage: `${SCREENS}/accounts-accounting-periods.jpg`,
      tags: ["month-end", "year-end", "closing", "period lock", "accounting periods", "financial year", "checklist"],
      keywords: [
        "month end close",
        "year end closing",
        "period close",
        "lock period",
        "close books",
        "fiscal year",
        "financial year",
        "July June",
        "opening balance new year",
        "reopen period",
        "No open accounting period",
        "audit",
      ],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: [
        "/app/accounts/accounting-periods",
        "/app/accounts/vouchers/approval-queue",
        "/app/banking/reconciliation",
        "/app/accounts/reports/exceptions",
        "/app/accounts/reports/ar-ap-aging",
        "/app/accounts/reports/trial-balance",
        "/app/accounts/reports/financial-statements",
        "/app/accounts/budgets",
        "/app/settings/config",
      ],
      relatedArticleIds: ["fin-rpt-ageing", "fin-rpt-read-statements", "fin-voucher-approval-queue", "fin-rpt-budgets", "fin-rpt-overview"],
      videos: [
        {
          src: "/tutorials/videos/fin-rpt-month-end-tour.webm",
          poster: "/tutorials/videos/fin-rpt-month-end-tour-poster.jpg",
          title: "Month-end checks before closing a period",
          caption: "Exception Reports, AR/AP Aging and Accounting Periods (Check Date Lock and the Close action) — nothing is closed in this demo.",
          durationSeconds: 52,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "Month-end close checklist",
          caption: "Clean up, review, then close. Only the last row changes what users can post.",
          imageSrc: `${DIAGRAMS}/month-end-close.svg`,
          imageAlt: "Twelve-step month-end checklist: clear approvals, bank reconciliation, exception reports, AR/AP aging, trial balance, financial statements, budgets, export, sign-off, close the period, check date lock, open next month",
        },
        {
          type: "steps",
          title: "Close the period",
          steps: [
            {
              title: "Check a date",
              body: "Pick a date and click **Check Date Lock**. **Open:** plus a period name means vouchers can be posted. **Locked: No accounting period found for date** (as in this picture) means you must create a period first.",
              imageSrc: `${SCREENS}/fin-rpt-periods-check-lock.jpg`,
              imageAlt: "Accounting Periods with the Check Date Lock result",
              href: "/app/accounts/accounting-periods",
            },
            {
              title: "Close the month",
              body: "In the period row click **Actions → Close** (not Delete). The status becomes **CLOSED**.",
              imageSrc: `${SCREENS}/fin-rpt-periods-actions.jpg`,
              imageAlt: "Accounting Periods row Actions menu with Close and Delete",
              href: "/app/accounts/accounting-periods",
            },
            {
              title: "Make sure next month exists",
              body: "Type a **Period name**, pick start and end dates, click **Create Period**.",
              imageSrc: `${SCREENS}/accounts-accounting-periods.jpg`,
              imageAlt: "Accounting Periods with timeline, create form and period list",
              href: "/app/accounts/accounting-periods",
            },
          ],
        },
      ],
      content: `## Overview

**Closing a month** means checking that the month's books are complete and correct, then **locking** the month so nobody can post more vouchers into it. P7 ERP uses **Accounting Periods** (\`/app/accounts/accounting-periods\`) for the lock: *posting is blocked when a voucher date is outside any open period*.

This checklist is for the **finance lead** (who signs off) and the **accountants** who prepare the month. Plan 1–3 working days after month-end.

## Before you start

- **Closing** and **reopening** a period needs a **manager** or **admin** role.
- Every month must have a period. If a voucher date has no open period, posting fails with **No open accounting period for this voucher date**.
- Check your financial year: **Settings → Configuration → Finance & costing → Financial year starts in** (e.g. **July (Bangladesh July–June)**). Change it only at a year boundary.

## Steps

### A. Clean up (accountants)

1. **Clear approvals** — open **Finance → Transactions → Voucher Approvals** (\`/app/accounts/vouchers/approval-queue\`). Approve or reject every voucher dated in the month, then post the approved ones. In **Day Book**, filter the month and make sure no voucher is left in DRAFT or SUBMITTED by mistake.
2. **Bank reconciliation** — open **Finance → Banking → Bank Reconciliation** (\`/app/banking/reconciliation\`). Match the bank statement lines for every bank account and finalize (manager / admin).
3. **Exception Reports** — open \`/app/accounts/reports/exceptions\`. Bring every card to **0**: create vendor bill drafts for **Goods received, not billed**, raise invoices for **Delivered, not invoiced**, investigate **Negative cash / bank** and **Negative stock**.
4. **AR/AP Aging** — open \`/app/accounts/reports/ar-ap-aging\` with the month-end date. Review **61-90** and **90+** for both **Receivable** and **Payable**.

### B. Review (finance lead)

5. **Trial Balance** — open \`/app/accounts/reports/trial-balance\`, set the date to the **last day of the month**. Check **Total Debit = Total Credit** and look for odd balances (a bank in Credit, a customer in Credit, an expense in Credit).
6. **Financial Statements** — open \`/app/accounts/reports/financial-statements\` with the same date. Compare Income, Expense and Net Profit with last month. Click any surprising heading to drill down.
7. **Budgets** — in **Planning → Budgets** choose the budget in **Select for vs actual** and explain every red bar.
8. **Export the pack** — **Export Excel** (or **Print** to PDF) the **Day Book** for the month, the **Trial Balance**, the **Financial Statements** and the **AR/AP Aging**. Save them with the month in the file name (e.g. *2026-07 Trial Balance.xlsx*).

### C. Close (manager / admin)

9. **Sign-off** — the finance lead confirms the numbers.
10. **Close the period** — open **Finance → Setup → Accounting Periods**. In the month's row click **Actions → Close**. The status changes to **CLOSED** and the timeline card turns grey.
11. **Check the lock** — pick a date in that month in the date box and click **Check Date Lock**. It should say **Locked:** followed by *Period '…' is closed* with your period name.
12. **Open the next month** — if the next month is missing, type a **Period name** (e.g. *Aug-2026*), choose the start and end dates, and click **Create Period**.

### Year-end (once a year)

P7 works like Tally: **you do not post a year-end closing entry**.

1. Close the last month of the year with steps 1–12 above.
2. Run the **Trial Balance** and **Financial Statements** with the date = last day of the financial year and **This financial year** selected. Export them for the auditor.
3. Create the 12 monthly periods for the new year in **Accounting Periods**.
4. On the first day of the new year the reports start again automatically: Income and Expense restart from zero, and last year's profit shows as **Profit & Loss brought forward** (Trial Balance) / **Profit brought forward (earlier years)** (Balance Sheet). Asset, liability and equity balances carry forward on their own.
5. New voucher numbers use the new year (e.g. \`VCH-2026-…\` from 1 July 2026 when the year starts in July).
6. Prepare the new year's **Budgets**, and compare the two years in **Reports → Comparative** (\`/app/finance/mis/comparative\`).

## What happens next

- Vouchers dated in a closed month can no longer be posted. Users get **No open accounting period for this voucher date**.
- Corrections after close go into the **next open month** (e.g. a reversal dated the 1st of next month), or a manager reopens the period.

## Tips

- Close months **in order** — never leave an old month open after a newer one is closed.
- Keep the exported pack in one shared folder per year.
- Operational modules (inventory, payroll, payment runs) post vouchers automatically. Close the period only after the store and HR have finished the month too.

> **Warning:** **Actions → Delete** removes a period. It is refused if the period has posted vouchers (**Cannot delete period with posted vouchers**), but deleting an empty period can still stop users posting for those dates. Use **Close** for locking, not Delete.

## Common problems

- **"No open accounting period for this voucher date"** → the month is closed or no period covers that date. Create the period, or ask a manager to **Actions → Reopen** if a correction is approved — and close it again afterwards.
- **"Accounting period overlaps with existing period"** → the dates you typed overlap another period. Check the start / end dates in the list.
- **Close is refused** → your role is not manager or admin.
- **The Trial Balance still changes after closing** → automatic vouchers dated in an open month are still posting, or someone reopened the period. Check the period status and the Day Book.`,
    },
    {
      id: "fin-rpt-mis",
      title: "Management reports: MIS dashboard, ratios, comparative and cash flow",
      summary: "One-page financial health for owners: net profit, current ratio, cash, fund flow, year-on-year comparison, cash flow statement and cash scenarios.",
      estimatedMinutes: 6,
      audience: "management",
      coverImage: `${SCREENS}/finance-mis.jpg`,
      tags: ["MIS", "dashboard", "ratios", "comparative", "cash flow", "fund flow", "KPI"],
      keywords: [
        "management information",
        "finance dashboard",
        "KPI",
        "current ratio",
        "debt to equity",
        "runway",
        "year on year",
        "YoY",
        "comparative statement",
        "cash flow statement",
        "fund flow",
        "cash scenario",
        "group summary",
        "ratio analysis",
        "voucher analytics",
      ],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: [
        "/app/finance/mis",
        "/app/finance/mis/fund-flow",
        "/app/finance/mis/ratios",
        "/app/finance/mis/comparative",
        "/app/finance/mis/cash-scenarios",
        "/app/accounts/reports/cash-flow",
        "/app/accounts/reports/ratio-analysis",
        "/app/accounts/reports/group-summary",
        "/app/accounts/reports/voucher-analytics",
      ],
      relatedArticleIds: ["fin-rpt-overview", "fin-rpt-read-statements", "fin-rpt-month-end"],
      infographics: [
        {
          type: "flow",
          title: "MIS screens (Finance → Reports)",
          steps: [
            { label: "Financial MIS Dashboard", href: "/app/finance/mis" },
            { label: "Fund Flow", href: "/app/finance/mis/fund-flow" },
            { label: "MIS Ratios", href: "/app/finance/mis/ratios" },
            { label: "Comparative", href: "/app/finance/mis/comparative" },
            { label: "Cash Scenarios", href: "/app/finance/mis/cash-scenarios" },
          ],
        },
      ],
      images: [
        {
          src: `${SCREENS}/accounts-reports-ratio-analysis.jpg`,
          alt: "Ratio Analysis with cards for Debt to Equity, Profit Margin, ROE and ROA and a metric table",
          caption: "Ratio Analysis: health metrics as of a date, with an optional second date to compare.",
        },
        {
          src: `${SCREENS}/accounts-reports-cash-flow.jpg`,
          alt: "Cash Flow Report in Statement mode with opening cash, inflow, outflow, closing cash and operating, investing and financing sections",
          caption: "Cash Flow Report: Statement mode splits cash into Operating, Investing and Financing activities.",
        },
        {
          src: `${SCREENS}/finance-mis-fund-flow.jpg`,
          alt: "Fund Flow screen under Finance MIS showing sources and uses of funds for a period",
          caption: "Finance → MIS → Fund Flow: where money came from and where it went in the chosen period.",
        },
        {
          src: `${SCREENS}/finance-mis-comparative.jpg`,
          alt: "Comparative MIS screen comparing two periods side by side",
          caption: "Finance → MIS → Comparative: put two periods side by side to spot big changes.",
        },
      ],
      content: `## Overview

These screens turn the books into a few numbers owners and bankers understand. They only **read** data — nothing here changes your books.

- **Financial MIS Dashboard** (\`/app/finance/mis\`) — cards for **Net Profit**, **Current Ratio**, **Cash & Bank** and **Receivables (AR)**, with warnings when liquidity is weak.
- **Fund Flow**, **MIS Ratios**, **Comparative**, **Cash Scenarios** — linked from the dashboard's **Quick links**.
- **Cash Flow** (\`/app/accounts/reports/cash-flow\`), **Ratio Analysis**, **Group Summary** and **Voucher Analytics** — in the same **Reports** group.

## Before you start

- The MIS screens appear when **Enable MIS reports (fund flow, ratios, comparative)** is ticked in **Settings → Configuration** (on by default). If it is off, the dashboard says *MIS reports are disabled for this tenant*.
- The numbers are only as good as the posted vouchers — do the month-end checks first.

## Steps

1. Open **Finance → Reports → Financial MIS Dashboard**.
2. Read the four cards. A yellow / red badge on **Current Ratio** means current assets are low compared with current liabilities. A red banner about **Cash runway** means cash covers less than 6 months of spending.
3. Click a **Quick link**:
   - **Fund Flow** — where funds came from and where they went.
   - **MIS Ratios** — liquidity, profitability and leverage ratios with status colours.
   - **Comparative** — choose two years (e.g. 2025 **vs** 2026), switch **Balance Sheet** / **P&L**, tick **Significant only (>10%)** to see big changes. **Export CSV** saves the table.
   - **Cash Scenarios** — what-if cash plans.
4. Open **Cash Flow** for the accounting cash flow: choose **Statement**, set the two dates, read **Opening Cash**, **Inflow**, **Outflow**, **Closing Cash** and the **Operating / Investing / Financing Activities** sections. Choose **Forecast** to see saved forecast scenarios month by month.
5. Open **Ratio Analysis** to compare two dates side by side (**Primary** and **Compare**), and **Group Summary** for totals per account group.

## What happens next

- Share the dashboard and comparative tables in the monthly management meeting (**Print** or **Export CSV**).
- If cash runway is short, plan collections with **AR/AP Aging** and spending with **Budgets** and **Cash Forecast**.

## Tips

- **Voucher Analytics** shows a **Monthly Trend** and **Top Preparers** — useful to see workload and unusual spikes in entries.
- The Comparative screen compares **calendar years** (the numbers in the year drop-downs).

## Common problems

- **Current Ratio shows n/a** → there are no current liabilities (or no current assets) posted yet, so the ratio cannot be calculated.
- **Cash Flow shows zeros** → no posted cash or bank vouchers between the two dates. Move the first date back.
- **MIS menu items are missing** → **Enable MIS reports** is off in **Settings → Configuration**.
- **Fund Flow, MIS Ratios or Comparative says you do not have permission** → your role has that MIS report switched off. Ask your administrator to allow it under **Settings → Roles**, or use **Ratio Analysis**, **Group Summary** and **Financial Statements** (switch the date to compare periods).`,
    },
  ],
};

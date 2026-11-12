import type { TutorialSection } from "../types";

export const financeSection: TutorialSection = {
  id: "finance",
  title: "Finance",
  description:
    "Day-to-day accounting: ledgers, vouchers, approvals, bills, receipts and payments, banking, cheques and loans.",
  articles: [
    {
      id: "fin-overview",
      title: "Finance module map",
      summary:
        "A map of the Finance menu: where to set up ledgers, enter vouchers, approve them, pay suppliers, receive money and reconcile the bank.",
      content: `## Overview

**Finance** is where the accounts team keeps the books. Every money event ends up here as a **voucher** (a debit/credit entry). Some vouchers you type yourself (payments, receipts, journals); others are created for you by other modules — for example goods receiving, vendor bills, payment runs and payroll.

**Who uses it:** accountants and cashiers (enter vouchers, bills, receipts), the finance manager (check, approve, post, reconcile the bank), and management (reports).

## Before you start

- Your role must include **Finance**. The approval steps **Check**, **Recommend**, **Approve**, **Post**, **Reject** and **Reverse** need a **manager** or **admin** role.
- Set the company **financial year** once: **Settings → Configuration → Finance & costing → Financial year starts in** (choose **July** for the Bangladesh July–June year).
- Make sure an **open accounting period** covers today: **Finance → Setup → Accounting Periods** (\`/app/accounts/accounting-periods\`). Without one, posting fails.

## Steps — find your way around the Finance menu

1. **Setup** — the master data. **Account Groups** (\`/app/accounts/groups\`) and **Chart of Accounts** (\`/app/accounts\`) hold your ledgers. **Cost Centers**, **Multi-Currency**, **Accounting Periods** and **Advance Options** are also here.
2. **Transactions** — daily work. **Vouchers** (\`/app/accounts/vouchers\`) to enter and find vouchers, **Voucher Print**, **Voucher Approvals** (the approval queue), **Bills** (outstanding receivables and payables), **Vendor bills (GRN)** and **Purchase & AP**. Optional items such as **Party Ledgers**, **Credit Note**, **Debit Note**, **Post-dated Register** and **TDS Settings** appear only when your admin switches them on.
3. **Banking** — **Bank Accounts**, **Bank Reconciliation**, **Payment Runs**, **Payment Advice**, **Settlement Audit** and **FX Receipts**.
4. **Reports** — Day Book, Trial Balance, Financial Statements, Ledger Activity, Exception Reports and more. These have their own guides in the **Finance reports** section of Help.
5. **Planning** and **Loans & facilities** — budgets, cash forecast, profitability, and bank loan facilities.

## Compact Finance menu (switched on per company)

An admin can switch on **Finance hubs (compact menu)** in **Settings → Configuration → More features → Finance navigation**. Then the long Finance menu shrinks to **10 links**, and each link opens a **hub** whose tabs are the same pages you already know:

- **Finance Home** — shortcuts to the other hubs.
- **Vouchers & Payables** — Vouchers, Approvals, Outstanding Bills, Vendor Bills (GRN), Purchase & AP and the optional registers. **Print vouchers** and the **New credit note / debit note / stock transfer** buttons (when switched on) sit at the top of this hub.
- **Banking** — Bank Accounts, Reconciliation, Payment Runs, Payment Advice, Settlement Audit, FX Receipts.
- **Statements** — Trial Balance, Financial Statements, Cash Flow, Funds Flow, Ratio Analysis. With **Tally-style statements** switched on, the new Tally layouts (Trial Balance, Balance Sheet, Profit & Loss, monthly Cash Flow and Funds Flow, Ratio Analysis, Stock vs Ledger) come first and the old pages are marked **Classic** — see [Tally-style statements](/app/tutorials/fin-tally-statements).
- **Reports & MIS** — Day Book, AR/AP Aging, Ledger Activity, Exceptions, Voucher Analytics, Group Summary and the Financial MIS reports.
- **Budgets & Cash**, **Profitability**, **Tax & Compliance**, **Loans & Facilities** and **Finance Setup**.

Old links and bookmarks still work: they open the matching tab. Opening one voucher, a cheque print, a party ledger or a facility still shows that record's own page. Who can see what does not change. Press **Ctrl+K** and type a tab name to jump straight to it.

## What happens next

- A voucher you enter starts as **DRAFT** and moves through **SUBMITTED → CHECKED → RECOMMENDED → APPROVED → POSTED** (see the diagram below). Only **POSTED** vouchers change ledger balances and reports.
- Vouchers created by other modules (goods receiving, vendor bill **Post AP**, executed payment runs, payroll) are usually saved straight as **POSTED**. Review them every day in **Day Book**.
- Supplier bills flow from purchase order → GRN → bill → payment → bank statement (second diagram).

## Good to know

- **Editing a draft voucher's date:** if the new date falls in a different financial year, the voucher gets a new number from that year's series (the voucher's history shows the old and new number). Moving the date inside the same year keeps the number.
- **Budget vs actual** (\`/app/accounts/budgets\`): each budget line is compared only with posted vouchers in its own month (or the whole financial year for a line without a month), in base currency and netted (refunds and reversals reduce the actual). See [Budgets and Budget vs Actual](/app/tutorials/fin-rpt-budgets).
- **Bank reconciliation** (\`/app/banking/reconciliation\`): the book balance is the bank ledger's balance on the statement date (opening balance plus posted vouchers up to that date). **Payment runs** can only be executed for a bank account linked to a ledger account, because bills are marked paid only together with the posted payment voucher.
- **Recurring vouchers** (\`/app/finance/recurring-vouchers\`, shown when **Advanced vouchers** is on): due dates always count from the start date (a schedule starting 31 January runs 28 February, 31 March, 30 April …). **Generate now** creates the next scheduled voucher early, dated on its scheduled date, and does not move the schedule; a period that already has a voucher is skipped.

## Tips

- Press **Ctrl+K** anywhere and type "payment voucher", "receipt voucher" or "journal voucher" to open a new voucher of that type.
- On the **Vouchers** page, **F4 / F5 / F6 / F7** open Contra / Payment / Receipt / Journal (like Tally).
- Use **Exception Reports** (\`/app/accounts/reports/exceptions\`) before month-end to find GRNs with no bill, negative cash and overdue bills.

## Common problems

- **"Accounting period: No accounting period found for date"** on the voucher form → ask finance to create or reopen the period in **Accounting Periods**.
- **A Finance menu item is missing** → it may be behind a feature switch (for example **Party Ledgers**, **TDS Settings**, **Post-dated Register**). Ask an admin to turn it on in **Settings → Configuration**.
- **You cannot see Approve or Post** → your role is not manager or admin.`,
      tags: ["finance", "accounts", "vouchers", "banking", "map", "overview"],
      keywords: [
        "accounts",
        "accounting",
        "hisab",
        "ledger",
        "voucher",
        "bank",
        "AP",
        "AR",
        "payable",
        "receivable",
        "finance menu",
      ],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-12",
      featured: true,
      audience: "finance",
      coverImage: "/tutorials/screens/accounts-vouchers.jpg",
      infographics: [
        {
          type: "diagram",
          title: "Voucher lifecycle",
          caption:
            "Real statuses from the app. Reject sends a voucher to REJECTED; Set Draft brings it back for correction. Reverse creates a mirror voucher dated today.",
          imageSrc: "/tutorials/diagrams/finance/voucher-lifecycle.svg",
          imageAlt:
            "Diagram: DRAFT, SUBMITTED, CHECKED, RECOMMENDED, APPROVED, POSTED in a row, with Reject, Set Draft, Cancel, Reverse and Cancel posting branches",
        },
        {
          type: "diagram",
          title: "Purchase to pay",
          caption:
            "Purchase order and GRN come from Inventory. Finance books the bill, pays it with a payment run or payment voucher, and matches the bank statement.",
          imageSrc: "/tutorials/diagrams/finance/purchase-to-pay.svg",
          imageAlt:
            "Diagram: purchase order, goods receiving, vendor bill or AP bill, open payable bill, payment run or payment voucher, payment advice, bank reconciliation",
        },
        {
          type: "flow",
          title: "Daily voucher work",
          steps: [
            { label: "Enter voucher", href: "/app/accounts/vouchers" },
            { label: "Approval queue", href: "/app/accounts/vouchers/approval-queue" },
            { label: "Print / PDF", href: "/app/accounts/vouchers/print" },
            { label: "Day Book check", href: "/app/accounts/reports/day-book" },
          ],
        },
        {
          type: "flow",
          title: "Purchase to pay",
          steps: [
            { label: "Purchase order", href: "/app/inventory/purchase-orders" },
            { label: "Goods receiving", href: "/app/inventory/goods-receiving" },
            { label: "Purchase & AP", href: "/app/accounts/purchase-workflow" },
            { label: "Payment run", href: "/app/banking/payment-runs" },
            { label: "Bank reconciliation", href: "/app/banking/reconciliation" },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/accounts-vouchers.jpg",
          alt: "Vouchers page with the voucher list, status column and Actions buttons",
          caption: "Finance → Transactions → Vouchers: every voucher with its status. Click a row to open it.",
        },
        {
          src: "/tutorials/screens/accounts-purchase-workflow.jpg",
          alt: "Purchase & AP Workflow page with payable cards, open bills, approved POs and received GRNs",
          caption: "Purchase & AP shows what you owe suppliers and lets you create AP bills from POs or GRNs.",
        },
      ],
      relatedAppRoutes: [
        "/app/accounts",
        "/app/accounts/vouchers",
        "/app/accounts/vouchers/approval-queue",
        "/app/accounts/purchase-workflow",
        "/app/banking/accounts",
        "/app/accounts/budgets",
        "/app/banking/reconciliation",
        "/app/finance/recurring-vouchers",
      ],
      relatedArticleIds: [
        "fin-rpt-overview",
        "fin-rpt-month-end",
        "fin-coming-from-tally",
        "fin-coa-setup",
        "fin-voucher-entry",
        "fin-voucher-approval-queue",
        "fin-receipts-payments",
        "fin-bills-ap",
        "fin-bank-reconciliation",
        "fin-rpt-budgets",
        "wf-approvals",
      ],
    },
    {
      id: "fin-coming-from-tally",
      title: "Coming from Tally? Where to find things in P7",
      summary:
        "A side-by-side list of Tally screens and keys (F4–F7, Alt+C, Ctrl+A, bill-wise, cheque printing) and the matching P7 ERP screen.",
      content: `## Overview

Many accountants learned on **Tally**. P7 ERP works on the same ideas — groups, ledgers, vouchers, bill-wise tracking — so most of your habits still work. This guide lists each Tally screen or key and where to find it in P7.

**The one big difference:** in Tally, saving a voucher posts it at once. In P7 a voucher you type goes through an **approval chain** (Draft → Submitted → Checked → Recommended → Approved → Posted) so a second person can check it. Small teams can switch on **Direct posting** to get Tally-style "save = post" (see the end of this guide).

## Before you start

- You need a Finance role. Approve / Post need **manager** or **admin**.
- Ask your admin which optional features are on (**Settings → Configuration**, like Tally's **F11**).

## Steps — Tally to P7, screen by screen

| In Tally | In P7 ERP |
|---|---|
| Gateway of Tally | Left **sidebar** → **Finance**. Press **Ctrl+K** (or **/**) to search any screen. |
| **F11** Company features | **Settings → Configuration**. Use **Essential / More features / All features** at the top to show more switches. |
| Groups (Sundry Debtors, Bank Accounts …) | **Finance → Setup → Account Groups**. **Seed default groups** gives a starting set. Nature is Asset, Liability, Income, Expense or Equity. |
| Create ledger | **Finance → Setup → Chart of Accounts** → fill **Ledger Name**, group, opening balance → **Create**. |
| **Alt+C** (create master inside a voucher) | Same key: in a voucher's ledger box press **Alt+C** (or click **+ New ledger**). The **New ledger** box opens; the new ledger is selected on the line. |
| **F4** Contra, **F5** Payment, **F6** Receipt, **F7** Journal | Same keys on the **Vouchers** page (\`/app/accounts/vouchers\`). **Alt+4 … Alt+7** also work on laptops where F-keys are locked. |
| **F8** Sales, **F9** Purchase | No F-key. Sales come from **Export & Import → Commercial Invoices** (issuing raises an AR voucher). Purchases come from **Vendor bills (GRN)** or **Purchase & AP**. Other voucher types are in the **Voucher type** list on the form. |
| **Alt+F6 / Alt+F5** Credit / Debit note | **Finance → Transactions → Credit Note / Debit Note** (shown when the feature is on). |
| **Ctrl+A** Accept | **Ctrl+Enter** = **Save Draft**. **Ctrl+Shift+Enter** = **Save & Submit**. |
| **Alt+G** Go To | **Ctrl+K**. Tip: open the other screen in a **new browser tab** (Ctrl+click) so your half-typed voucher stays. |
| Bill-wise: New Ref / Agst Ref | Tick **Bill-Wise Tracking** on the ledger. After posting, open the voucher → **Bill-Wise Details** → **Auto-Create Bill References**. Track them in **Bills** and **AR/AP Aging**. |
| Post-dated, Optional, Memorandum vouchers | Switch on in **Settings → Configuration → More features → Advanced vouchers**, then use **Post-dated Register** / **Memorandum Register**. |
| Reversing journal | Open the posted voucher → **Reverse** (creates a mirror voucher dated today). |
| Cheque printing | Open a **Payment** voucher → **Print cheque**. |
| Bank reconciliation | **Finance → Banking → Bank Reconciliation**. |
| Day Book, Trial Balance, Balance Sheet, P&L, drill-down | **Finance → Reports**. Click figures to drill down to the voucher (see the Finance reports guides). |
| **F2** change period, no year-end closing | The voucher form has a **Financial year** picker. Like Tally, there is **no closing entry** — earlier years' profit is brought forward automatically. |
| Edit Log | Open any voucher → **History** at the bottom. |
| Security levels | **Settings → Roles**. Approval steps are for manager / admin. |
| Multi-currency | Tick **Enable Multi-Currency** on the voucher form. |
| Cost centres | **Finance → Setup → Cost Centers**, then pick a cost center on each voucher line. |
| Voucher class | **Finance → Transactions → Voucher Classes** (when switched on). |
| Receipt Note (GRN), "Purchase Bills to Come" | **Inventory → Goods Receiving**; un-billed GRNs show in **Exception Reports → Goods received, not billed**. |
| Delivery Note, Sales invoice | **Inventory → Delivery Challans**, then **Commercial Invoices**. |
| Backup / Tally Vault | **Settings → Backup & Restore** (admin). |

## What happens next

- Your vouchers wait in **Voucher Approvals** until a manager posts them. Reports show **posted** vouchers only — if a figure is missing, check the voucher status first.

## Tips

- **Want Tally's "save = post"?** An admin ticks **Direct posting (save = post)** in **Settings → Configuration → More features → Advanced vouchers**. Managers and admins then see **Save & Post** on the form and **Post now** on a voucher. Every step still appears in the voucher **History**.
- The **Entry assistant** on the right of the voucher form shows each ledger's balance before and after the voucher — like the Tally balance panel, plus duplicate and unusual-amount warnings.

## Common problems

- **F5 refreshes the browser** → click once on the Vouchers page first so it has focus, or use **Alt+5**.
- **I posted in Tally style but the report does not change** → the voucher is still DRAFT or SUBMITTED. Submit it and ask a manager to approve and post.
- **Bill-wise allocation is not asked during entry** → in P7 you create bill references after posting (**Auto-Create Bill References**) or use **Party Ledgers** FIFO allocation when that feature is on.`,
      tags: ["tally", "migration", "shortcuts", "keyboard", "voucher", "finance"],
      keywords: [
        "tally",
        "tallyprime",
        "tally erp 9",
        "F4",
        "F5",
        "F6",
        "F7",
        "alt+c",
        "ctrl+a",
        "gateway",
        "f11",
        "bill-wise",
        "agst ref",
        "edit log",
        "shortcut",
      ],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "finance",
      coverImage: "/tutorials/screens/fin-voucher-new-journal.jpg",
      infographics: [
        {
          type: "highlight",
          title: "Same keys as Tally",
          body: "On the Vouchers page: **F4** Contra · **F5** Payment · **F6** Receipt · **F7** Journal · **Alt+C** new ledger · **Ctrl+Enter** save draft · **Ctrl+Shift+Enter** save & submit · **Ctrl+K** go to any screen.",
        },
        {
          type: "diagram",
          title: "The extra approval steps P7 adds",
          caption: "Tally posts on save. P7 adds Submit → Check → Recommend → Approve before Post, unless Direct posting is switched on.",
          imageSrc: "/tutorials/diagrams/finance/voucher-lifecycle.svg",
          imageAlt: "Voucher lifecycle diagram from DRAFT to POSTED with reject and reverse branches",
        },
      ],
      images: [
        {
          src: "/tutorials/screens/fin-voucher-ledger-quick-create.jpg",
          alt: "New ledger box opened with Alt+C from inside a payment voucher",
          caption: "Alt+C inside the ledger box opens New ledger without leaving the voucher — just like Tally.",
        },
        {
          src: "/tutorials/screens/accounts-groups.jpg",
          alt: "Account Groups page with Seed default groups button and the list of groups",
          caption: "Account Groups is the P7 version of Tally groups. The group's nature decides where its ledgers show in reports.",
        },
      ],
      relatedAppRoutes: ["/app/accounts/vouchers", "/app/accounts/groups", "/app/accounts", "/app/settings/config"],
      relatedArticleIds: ["fin-voucher-entry", "fin-coa-setup", "fin-voucher-approval-queue", "fin-cheques", "fin-overview", "fin-rpt-overview", "fin-rpt-drilldown"],
    },
    {
      id: "fin-coa-setup",
      title: "Set up account groups and ledgers (chart of accounts)",
      summary:
        "Create account groups and ledgers, mark bank and bill-wise ledgers, import a chart of accounts from Excel, and add a missing ledger from inside a voucher.",
      content: `## Overview

The **chart of accounts** is the list of all your ledgers (cash, bank, suppliers, customers, expenses, income). Every ledger sits under an **account group**, and the group's **nature** (Asset, Liability, Income, Expense, Equity) decides where it appears in the Balance Sheet or Profit & Loss.

**Who uses it:** the finance manager or senior accountant, usually once at the start and then when a new ledger is needed.

## Before you start

- You need Finance access. **CoA settings** (number format) is for admins.
- Decide your groups first. If the list is empty, **Seed default groups** gives a sensible starting set.

## Steps

### A. Check or add account groups

1. Open **Finance → Setup → Account Groups** (\`/app/accounts/groups\`).
2. Use **List**, **Hierarchy** or **Advance Design** at the top right to see the groups.
3. To add a group, fill **Name \\***, optional **Code** (left blank = automatic), choose the **Nature** and an optional **Parent group**.
4. Tick **Bank group** for bank groups and **Affects gross profit** for direct costs and sales, then click **Create**.

### B. Create a ledger

1. Open **Finance → Setup → Chart of Accounts** (\`/app/accounts\`).
2. **Account Number** is filled automatically when you save.
3. Type the **Ledger Name** (for example "Generator Fuel") and choose its group in the drop-down next to it.
4. Enter the **Opening Balance** and choose **Debit** or **Credit** (assets and expenses are usually Debit).
5. Tick **Bank Account** for a bank ledger, and **Bill-Wise Tracking** for customer and supplier ledgers so you can follow each invoice.
6. Optional: click **Show advanced** for **Posting / Statistical / Header** type, **Reporting code**, **Display order**, parent ledger and **Cost nature**.
7. Click **Create**. To change a ledger later, use **Actions → Edit** on its row.

### C. Import many ledgers at once

1. Click **Export CoA** to download the current list as a sample.
2. Click **Import CoA**, choose a **.csv** or **.xlsx** file (first sheet is read) and pick **Skip existing**, **Update existing** or **Abort on conflict**.
3. Click **Import** and read the result line (groups and accounts created / updated).

### D. Add a missing ledger while entering a voucher

1. In the voucher's ledger box, type the new name and press **Alt+C** (or click **+ New ledger** at the bottom of the list).
2. In **New ledger**, choose **Account group (under)**, optional **Opening balance** and **Track bill-wise**, then **Create ledger**. It is selected on the line straight away.

## What happens next

- The ledger is available in every voucher's ledger search.
- A **bank** ledger can be linked to a bank in **Finance → Banking → Bank Accounts** (field **Linked GL Account**) so payment runs and receipts post to it.
- Bill-wise ledgers feed **Bills** and **AR/AP Aging**.

## Tips

- Keep ledger names short and clear — people search by name in every voucher.
- Use **Show Inactive** to find ledgers you switched off; untick **Active** instead of deleting a used ledger.
- Use **Header** type only for grouping ledgers; vouchers cannot post to header ledgers (the Entry assistant warns you).

## Common problems

- **"Ledger name is required"** or **"Please select a group"** → type a Ledger Name and pick a group.
- **"Select a CSV file first."** on import → choose the .csv or .xlsx file before clicking **Import**.
- **Ledger shows under the wrong report** → its group has the wrong Nature. Edit the group, not the ledger.
- **Import failed** → check the column headings match the file from **Export CoA**, then try **Skip existing**.`,
      tags: ["chart of accounts", "ledger", "account groups", "setup", "coa"],
      keywords: [
        "chart of accounts",
        "COA",
        "ledger",
        "khata",
        "group",
        "sundry debtors",
        "sundry creditors",
        "bank ledger",
        "bill-wise",
        "opening balance",
        "import excel",
      ],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      audience: "finance",
      coverImage: "/tutorials/screens/accounts.jpg",
      infographics: [
        {
          type: "steps",
          title: "Create a ledger in 4 steps",
          steps: [
            {
              title: "Check the group exists",
              body: "**Finance → Setup → Account Groups**. Add a group with the right **Nature** if needed.",
              imageSrc: "/tutorials/screens/fin-groups-hierarchy.jpg",
              imageAlt: "Account Groups page showing the group hierarchy",
              href: "/app/accounts/groups",
            },
            {
              title: "Fill the ledger form",
              body: "**Chart of Accounts** → **Ledger Name**, group, **Opening Balance**, **Debit/Credit**. Click **Show advanced** for type and cost nature.",
              imageSrc: "/tutorials/screens/fin-coa-new-ledger.jpg",
              imageAlt: "Chart of Accounts form with ledger name Generator Fuel and the advanced fields open",
              href: "/app/accounts",
            },
            {
              title: "Tick Bank Account or Bill-Wise Tracking",
              body: "Bank ledgers → **Bank Account**. Customers and suppliers → **Bill-Wise Tracking**.",
            },
            {
              title: "Click Create",
              body: "The account number is generated. Edit later with **Actions → Edit**.",
            },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/accounts-groups.jpg",
          alt: "Account Groups list with codes, names, nature and Actions",
          caption: "Account Groups: each group has a nature that decides its report (Balance Sheet or P&L).",
        },
        {
          src: "/tutorials/screens/fin-voucher-ledger-quick-create.jpg",
          alt: "New ledger dialog inside the voucher form",
          caption: "Alt+C in a voucher's ledger box creates a ledger without leaving the voucher.",
        },
      ],
      relatedAppRoutes: ["/app/accounts", "/app/accounts/groups", "/app/banking/accounts"],
      relatedArticleIds: ["fin-overview", "fin-voucher-entry", "fin-coming-from-tally", "fin-bank-reconciliation"],
    },
    {
      id: "fin-voucher-entry",
      title: "Step-by-step: enter a voucher (payment, receipt, journal, contra)",
      summary:
        "Open a new voucher, pick the type and financial year, add debit and credit lines, use the Entry assistant and AI narration, then save as draft or submit.",
      content: `## Overview

A **voucher** records one money event with at least one **debit** line and one **credit** line of the same total. The **Vouchers** page (\`/app/accounts/vouchers\`) is where you type payments, receipts, journals and contras, and where you find every voucher later.

**Who uses it:** accountants and cashiers. Managers use the same page to approve and post.

## Before you start

- The ledgers you need must exist (or create them on the spot with **Alt+C**).
- An **open accounting period** should cover the voucher date. If not, a yellow **Accounting period** banner appears and posting will fail later.
- For foreign currency, know the exchange rate (or use **Live Rate**).

## Steps

1. Open **Finance → Transactions → Vouchers** and click **+ New Voucher** (top right). Shortcut: **F4** Contra, **F5** Payment, **F6** Receipt, **F7** Journal (or **Alt+4 … Alt+7**).
2. Pick the type with the quick buttons (**Contra F4**, **Payment F5**, **Receipt F6**, **Journal F7**) or the **Voucher type** list for other types.
3. **Financial year** is already set to the year that contains today. Choose an older year only for back-dated entries — the **Voucher date** picker then stays inside that year. **Use today** puts the date back.
4. Optional: **Reference** (for example the supplier invoice number), **Trade case** and **BTB LC**.
5. In **Entries**, type in **Search account number or name…** for line 1. Use the arrow keys + **Enter** or click to pick the ledger. Under it you see **Balance … → after …**.
6. Type the amount in **Debit** or **Credit** (it must be more than zero).
7. Click **+ Debit line** or **+ Credit line** for the next line and repeat. Each line also has an optional **Cost center**, **Cost nature** and **Line note**, and an **Actions** menu (**Copy line**, **Switch to Debit / Credit**, **Delete line**).
8. Watch the totals bar: it shows **Balanced** in green, or **Difference: …** in red. Debits and credits must match **exactly**, to 4 decimal places (the same precision the server stores). **Auto balance** adds a line for the exact difference.
9. Write the **Narration \\*** (required). Or click **Suggest with AI**, read the suggestion and click **Use** (or **Dismiss**).
10. Check the **Entry assistant** on the right (see below), then click **Save Draft** (**Ctrl+Enter**) or **Save & Submit** (**Ctrl+Shift+Enter**).

### Entry assistant (right-hand panel)

It shows **live hints from your posted vouchers (last 12 months)** and never saves anything:

- **Financial year** of the voucher date, marked **Current** or **Not current**.
- **Check before saving** — possible duplicate of a posted voucher (with a link to open it), an amount far above the usual, cash or bank going negative, header or inactive ledgers, future dates.
- **Ledgers in this voucher** — **Balance now**, **After this voucher**, **Usual amount**, **Used (12 months)**.
- **Usually used together** (or **Common ledgers for this voucher type**) — click one to add it to the voucher.
- **Narrations used before** — click to reuse.

### Foreign currency (optional)

1. In **Multi-Currency Entry**, tick **Enable Multi-Currency**.
2. Choose **Transaction Currency** and **Base Currency**, then type the **Exchange Rate** or click **Live Rate**. Prime7 asks its own server for today's rate (the server uses open.er-api.com). If that service cannot be reached, the server's built-in fallback rate is used and the source says **fallback** — check it before saving. A missing, zero or negative rate is never filled in.
3. **BDT Equivalent** shows the base amount. Line amounts are in the transaction currency.

## What happens next

- **Save Draft** → status **DRAFT**. You can still edit it (**Actions → Edit**). If you change a draft's date into a **different financial year**, the voucher gets a new number from that year's series (its **History** shows the old and new number). Moving the date inside the same year keeps the number.
- **Save & Submit** → status **SUBMITTED**; it appears in **Voucher Approvals** for a manager.
- When **Direct posting** is on, managers and admins also see **Save & Post**, which runs every approval step at once (each step still shows in **History**). If a step fails (for example a closed period), the voucher stays at the last step reached.
- After posting, the voucher shows in Day Book, Ledger Activity, Trial Balance and Financial Statements.

## Tips

- Paying a supplier or receiving from a buyer? Use **Payment** / **Receipt** type so cheque printing and bill-wise tools work.
- In the list, **Actions** offers **View Details**, **Edit**, **Print / PDF**, the next workflow step and **Delete**.
- Need the voucher on paper? See "Print a voucher, signatures and cheques".

## Common problems

- **"Narration is required for audit purposes."** → fill the Narration box.
- **"Use at least two lines (debit and credit)."** → add a second line.
- **"Select account for each line."** → a line has no ledger; pick one or delete the line.
- **"Line amount must be greater than zero."** / **"Voucher is not balanced."** → fix the amounts or click **Auto balance**.
- **"Exchange rate must be greater than zero."** → with multi-currency on, type a rate or click **Live Rate**.
- **"Could not fetch live rate. Enter manually."** → type the bank's rate yourself.
- **Live Rate source says "fallback"** → the live service was not reachable and a built-in rate was used. Compare it with the bank's rate and type the correct one if needed.
- **"Discard the voucher you are entering and start a new one?"** → you pressed F4–F7 while typing. Click **Cancel** to keep your work.`,
      tags: ["voucher", "journal", "payment", "receipt", "contra", "debit", "credit", "shortcuts", "financial year", "ai"],
      keywords: [
        "voucher entry",
        "JV",
        "journal voucher",
        "payment voucher",
        "receipt voucher",
        "contra",
        "debit credit",
        "narration",
        "entry assistant",
        "suggest with AI",
        "multi currency",
        "exchange rate",
        "F5",
        "F7",
      ],
      estimatedMinutes: 8,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "finance",
      coverImage: "/tutorials/screens/fin-voucher-new-journal.jpg",
      videos: [
        {
          src: "/tutorials/videos/fin-voucher-entry.webm",
          poster: "/tutorials/videos/fin-voucher-entry-poster.jpg",
          title: "Enter a two-line journal voucher",
          caption:
            "Open a new Journal, add Office Expense (debit) and Cash In Hand (credit), read the Entry assistant and write the narration. The demo cancels instead of saving.",
          durationSeconds: 76,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "A two-line journal, start to finish",
          steps: [
            {
              title: "Open a new voucher",
              body: "**Finance → Transactions → Vouchers** → **+ New Voucher**, then click **Journal F7**.",
              imageSrc: "/tutorials/screens/accounts-vouchers.jpg",
              imageAlt: "Vouchers page with the + New Voucher button",
              href: "/app/accounts/vouchers",
            },
            {
              title: "Add the debit and credit lines",
              body: "Line 1: **Office Expense** Debit 2,500. **+ Credit line**, line 2: **Cash In Hand** Credit 2,500. The totals bar says **Balanced**.",
              imageSrc: "/tutorials/screens/fin-voucher-new-journal.jpg",
              imageAlt: "New journal voucher with Office Expense debit and Cash In Hand credit lines",
            },
            {
              title: "Read the Entry assistant",
              body: "Check warnings, the balance **after this voucher** and the usual amount for each ledger.",
              imageSrc: "/tutorials/screens/fin-voucher-entry-assistant.jpg",
              imageAlt: "Entry assistant panel with financial year and ledger balances",
            },
            {
              title: "Write or suggest the narration",
              body: "Type it, or click **Suggest with AI** → **Use**.",
              imageSrc: "/tutorials/screens/fin-voucher-narration-ai.jpg",
              imageAlt: "AI suggestion for the narration with Use and Dismiss buttons",
            },
            {
              title: "Save",
              body: "**Save Draft** (Ctrl+Enter) or **Save & Submit** (Ctrl+Shift+Enter).",
            },
          ],
        },
        {
          type: "highlight",
          title: "Before you save",
          body: "Right financial year and date? Narration filled? Totals **Balanced**? No red warning in **Check before saving**? Then **Save Draft** or **Save & Submit**.",
        },
      ],
      images: [
        {
          src: "/tutorials/screens/fin-voucher-ledger-quick-create.jpg",
          alt: "New ledger dialog opened with Alt+C from a voucher line",
          caption: "Ledger not found? Press Alt+C in the ledger box to create it without leaving the voucher.",
        },
        {
          src: "/tutorials/screens/fin-voucher-row-actions.jpg",
          alt: "Voucher list with the Actions menu open showing View Details, Edit, Print / PDF, Reverse, Cancel posting and Delete",
          caption: "Row Actions shows only the steps allowed for that voucher's status and your role.",
        },
      ],
      relatedAppRoutes: ["/app/accounts/vouchers", "/app/accounts/vouchers/approval-queue"],
      relatedArticleIds: [
        "fin-voucher-approval-queue",
        "fin-voucher-print",
        "fin-coming-from-tally",
        "fin-receipts-payments",
        "fin-tax-deductions",
        "gs-row-actions",
      ],
    },
    {
      id: "fin-voucher-approval-queue",
      title: "Step-by-step: check, approve and post vouchers",
      summary:
        "Use the Voucher Approval Queue to see every voucher's approval stage, then move vouchers through Check, Recommend, Approve and Post — or reject, reverse or cancel posting with a reason.",
      content: `## Overview

The **Voucher Approval Queue** (\`/app/accounts/vouchers/approval-queue\`) lists **every voucher** in the date range with its approval stage — from **Draft** to **Posted**, plus **Rejected**, **Cancelled** and **Reversed**. Each row shows a coloured status, a six-step progress bar (Draft → Submitted → Checked → Recommended → Approved → Posted) and what happens next, e.g. *Preparer to submit*, *Waiting for Check* or *Done (in books)*.

**Who uses it:** finance managers and admins (checkers and approvers) use **Waiting for approval** as their work list. Accountants use **All** or **Draft** to see where their voucher is.

## Before you start

- **Check**, **Recommend**, **Approve**, **Post**, **Reject**, **Reverse** and **Cancel posting** need a **manager** or **admin** role. Other users only see **Submit** and **Cancel** on their own drafts.
- Posting needs an **open accounting period** for the voucher date.

## Steps

1. Open **Finance → Transactions → Voucher Approvals** (or **Approval queue** on the Vouchers page).
2. Click a status button above the filters: **All**, **Waiting for approval**, **Draft**, **Rejected**, **Posted** or **Cancelled / Reversed**. Each button shows how many vouchers it holds. Reviewers usually work from **Waiting for approval** (Submitted, Checked, Recommended and Approved).
3. To narrow to one stage (for example only **Checked**), pick it in the status box next to the search.
4. Check the two dates. They start at **the last 3 months** — move the From date back if a voucher seems missing.
5. Use the search box to find a voucher by number, reference or description.
6. Read the **Status & progress** column: the bar shows how far the voucher has gone and the line under it says who acts next.
7. Click the **voucher number** (or **Actions → View details**) and read the lines, narration and **Approval Progress**.
8. Back in the queue, open **Actions** and click the next step. Only the allowed step is shown: **Submit** (drafts), **Check** → **Recommend** → **Approve** → **Post**, or **Reject**.
9. For **Reject**, **Cancel**, **Reverse** and **Cancel posting** a box asks for a reason. Type a short, clear reason and confirm — it is saved in the voucher's **History**.
10. Use **Print Current Page**, **Export CSV** or **Refresh** when needed. **Export CSV** includes every voucher that matches the filters, on all pages.

## What happens next

- **Post** moves the amounts into the ledgers. If the system finds something to review, the message starts with **"Posted. Review: …"**. Posting the same voucher twice is blocked.
- **Reject** → status **REJECTED**. The owner opens it, clicks **Set Draft**, corrects it and submits again.
- A **posted** voucher can leave POSTED only by:
  - **Reverse** — creates a mirror voucher dated **today** (today must be in an open period). The original becomes **REVERSED**.
  - **Cancel posting** — removes the book effect and returns the voucher to **APPROVED** (its own date must be in an open period).
- **Reverse** is not offered for memorandum, optional or post-dated vouchers that never reached the books — use **Cancel posting**.
- Vouchers made by a **loan / facility** drawdown or repayment must be undone from **Loans & facilities**, not here.

## Tips

- The voucher page shows the same steps as buttons at the bottom, plus **Print / PDF** and **History**.
- When **Direct posting** is on, managers can click **Post now** on a voucher to run all remaining steps at once.
- Do not approve your own voucher if your company policy forbids it — ask a second person.

## Common problems

- **"No vouchers between … and …"** → widen the dates or click **All**. A new voucher starts as **Draft**; it appears under **Waiting for approval** only after someone clicks **Submit**.
- **No Approve / Post in Actions** → your role is not manager or admin.
- **Posting fails with a period error** → ask finance to open the accounting period for the voucher date (or for today when reversing).
- **Budget exceeded / near limit** banner on the voucher → a budget control is active; a manager with budget override permission must decide.`,
      tags: ["voucher", "approval", "posting", "reverse", "workflow", "finance"],
      keywords: [
        "approve voucher",
        "post voucher",
        "check",
        "recommend",
        "reject",
        "reverse",
        "cancel posting",
        "approval queue",
        "maker checker",
        "pending vouchers",
      ],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "finance",
      coverImage: "/tutorials/screens/accounts-vouchers-approval-queue.jpg",
      videos: [
        {
          src: "/tutorials/videos/fin-approval-queue-tour.webm",
          poster: "/tutorials/videos/fin-approval-queue-tour-poster.jpg",
          title: "Tour of the voucher approval queue",
          caption:
            "Read each voucher's stage and progress bar, use the status buttons (Waiting for approval is the reviewer's list), see where the workflow actions are, then open a voucher's Approval Progress and History. Nothing is approved in the demo.",
          durationSeconds: 63,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "Which button moves a voucher where",
          caption: "Only POSTED vouchers change balances. Reverse and Cancel posting are the only ways out of POSTED.",
          imageSrc: "/tutorials/diagrams/finance/voucher-lifecycle.svg",
          imageAlt: "Voucher lifecycle diagram with Submit, Check, Recommend, Approve, Post, Reject, Set Draft, Reverse and Cancel posting",
        },
        {
          type: "flow",
          title: "Approval chain",
          steps: [
            { label: "Submitted", href: "/app/accounts/vouchers/approval-queue" },
            { label: "Checked" },
            { label: "Recommended" },
            { label: "Approved" },
            { label: "Posted", href: "/app/accounts/reports/day-book" },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/fin-voucher-detail.jpg",
          alt: "Voucher detail page with the Approval Progress bar showing all steps done and POSTED current",
          caption: "Approval Progress on the voucher page shows which step the voucher has reached.",
        },
        {
          src: "/tutorials/screens/fin-voucher-row-actions.jpg",
          alt: "Actions menu on a posted voucher with Reverse and Cancel posting",
          caption: "For a posted voucher, Actions offers Reverse and Cancel posting (managers and admins).",
        },
      ],
      relatedAppRoutes: ["/app/accounts/vouchers/approval-queue", "/app/accounts/vouchers"],
      relatedArticleIds: ["fin-voucher-entry", "fin-voucher-print", "wf-approvals", "fin-overview"],
    },
    {
      id: "fin-voucher-print",
      title: "Print a voucher with signatures and QR verification",
      summary:
        "Print or save a voucher as PDF in Standard, Compact or Audit layout, with up to three copies, approver signatures and a QR code anyone can scan to verify it.",
      content: `## Overview

Every voucher can be printed or saved as PDF. The printout shows the company, voucher type and number, all lines, totals, amount in words, a **QR code** ("Scan to Verify") and signature blocks — **Prepared By**, **Checked By**, **Recommended By**, **Approved By**, **Posted By**.

**Who uses it:** accountants (file copies), cashiers (payment vouchers), auditors.

## Before you start

- Each approver should set up **My Signature** once (\`/app/my-signature\`, under **Settings → My Signature**): type a **Designation** and click **Save designation**, then **Upload image** of a signature (PNG, JPG or WEBP, up to 2 MB). Their name, designation, date and signature image then print in the block for the step they did.

## Steps

1. Open **Finance → Transactions → Vouchers**.
2. On the voucher's row click **Actions → Print / PDF** (or open the voucher and click **Print / PDF** or **Open print page**).
3. On the **Voucher Print** page (\`/app/accounts/vouchers/print\`), choose a layout: **Standard Template**, **Compact Template** or **Audit Template**.
4. Choose **1 Copy**, **2 Copies** or **3 Copies** — they are marked **Original**, **Duplicate**, **Triplicate**.
5. Click **Print**, or **Save as PDF** and pick "Save as PDF" in the browser's print window.
6. To print another voucher, type its number in **Voucher ID** and click **Load**.

## What happens next

- Only the voucher sheets are printed — the menu and buttons are hidden automatically.
- Anyone can scan the QR code with a phone to check that the voucher is genuine. It opens a public **Genuine document** page (no sign-in) with your company name, voucher number, date, status and amount — once an admin turns on **Public document verification** in **Settings → Configuration**. While it is off, scans show **Not found**.
- **Signed** = **Yes** in the voucher list means the system has digitally signed it.

## Tips

- Print payment vouchers only after they are approved, so the signature blocks are filled.
- Documents you already approved show your new signature image the next time they are printed.
- Use **Audit Template** for the auditor's file.

## Common problems

- **"Enter a voucher ID and click Load"** → you opened Voucher Print directly; go back to the list and use **Actions → Print / PDF**.
- **Signature block is blank** → the person has not uploaded an image in **My Signature**, or that step has not happened yet.
- **Extra blank pages** → choose **1 Copy** or check the paper size in the browser print window.`,
      tags: ["voucher print", "pdf", "signature", "qr", "verification"],
      keywords: ["print voucher", "pdf", "signature", "designation", "QR code", "verify", "original duplicate", "audit copy"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      audience: "finance",
      coverImage: "/tutorials/screens/fin-voucher-print-preview.jpg",
      infographics: [
        {
          type: "steps",
          title: "Print in three clicks",
          steps: [
            {
              title: "Actions → Print / PDF",
              body: "From the voucher list or the voucher page.",
              imageSrc: "/tutorials/screens/fin-voucher-row-actions.jpg",
              imageAlt: "Voucher list Actions menu with Print / PDF",
              href: "/app/accounts/vouchers",
            },
            {
              title: "Choose layout and copies",
              body: "**Standard / Compact / Audit Template** and **1–3 Copies**.",
              imageSrc: "/tutorials/screens/fin-voucher-print-preview.jpg",
              imageAlt: "Voucher Print page with the payment voucher preview and QR code",
            },
            {
              title: "Print or Save as PDF",
              body: "Only the voucher sheets print. The signature row (**Prepared By … Posted By**) fills in as each person does their step.",
              imageSrc: "/tutorials/screens/fin-voucher-print-sheet.jpg",
              imageAlt: "Full printed voucher sheet with lines, amount in words and signature blocks",
            },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/my-signature.jpg",
          alt: "My Signature page with designation and signature image upload",
          caption: "Settings → My Signature: each approver sets designation and signature once.",
        },
      ],
      relatedAppRoutes: ["/app/accounts/vouchers/print", "/app/accounts/vouchers", "/app/my-signature"],
      relatedArticleIds: ["fin-voucher-entry", "fin-cheques", "wf-digital-signatures", "fin-voucher-approval-queue"],
    },
    {
      id: "fin-receipts-payments",
      title: "Receive money from buyers and pay suppliers",
      summary:
        "Record customer receipts (receipt voucher, export PI payment, FX receipt) and supplier payments (payment voucher), and keep outstanding bills up to date.",
      content: `## Overview

Money in and money out are the most common vouchers:

- **Receipt** (F6) — money received from a buyer or other party. Dr bank/cash, Cr customer.
- **Payment** (F5) — money paid to a supplier or for an expense. Dr supplier/expense, Cr bank/cash.
- **Contra** (F4) — cash ↔ bank, or bank ↔ bank transfers.

**Who uses it:** cashier and accountants; commercial team for export proceeds.

## Before you start

- Party ledgers exist with **Bill-Wise Tracking** ticked (see the chart of accounts guide).
- The bank is set up in **Finance → Banking → Bank Accounts** with a **Linked GL Account**.

## Steps

### A. Receive money (receipt voucher)

1. **Vouchers** → press **F6** (or **+ New Voucher** → **Receipt F6**).
2. Debit line: the **bank** or **cash** ledger. Credit line: the **customer** ledger. Same amount.
3. **Reference**: the buyer's payment advice or LC number. Narration, then **Save & Submit**.
4. After it is posted, open it → **Bill-Wise Details** → **Auto-Create Bill References** so the receipt is tracked against the customer's bills. To reduce an open bill in **Bills**, use **Settle** there (step E).

### B. Record export proceeds against a proforma invoice

1. Open **Export & Import → Proforma Invoices** and **Actions → Edit** on an **ISSUED EXPORT** PI.
2. In **Payments**, enter **Amount**, **Receipt date**, **Bank account**, **Receivable ledger**, **Currency** and **Exchange rate to base**.
3. Click **Record Payment**. A **draft receipt voucher** is created for finance to approve and post; it appears in **Receipt history**.

### C. Foreign-currency receipts (FX Receipts)

1. Open **Finance → Banking → FX Receipts** (\`/app/finance/fx-receipts\`).
2. Fill **Receipt No** (optional), date, **Source Ref**, **Currency**, **FC Amount** and **Rate to Base**, then **Create Receipt**.
3. As the bank converts the money, type an amount in **Settle** on the row. Status moves **OPEN → PARTIAL → SETTLED**.

### D. Pay a supplier (payment voucher)

1. **Vouchers** → press **F5**.
2. Debit line: the **supplier** ledger (or the expense). Credit line: the **bank** or **cash** ledger.
3. If you must deduct VAT/VDS or TDS, add credit lines for the payable ledgers (see "VAT, VDS and TDS on vouchers").
4. Save & Submit. After approval, open the voucher → **Print cheque** if paying by cheque.

### E. Keep outstanding bills right

1. Open **Finance → Transactions → Bills** (\`/app/accounts/outstanding-bills\`) and choose **Receivable** or **Payable** at the top right.
2. The aging boxes (**Current, 1-30, 31-60, 61-90, 90+**) show how old the open amounts are.
3. To mark part of a bill paid, type the amount in **Settle** on its row and click **Settle**.
4. To make bills from a posted voucher, enter its **Voucher ID** under **From voucher** and click **Auto-create bill references** or **Auto-create outstanding bill**.

## What happens next

- Posted receipts and payments update the bank and party ledgers and the **AR/AP Aging** report.
- Payments made through **Payment Runs** settle the payable bills automatically.

## Tips

- Many supplier payments on one day? Use **Payment Runs** instead of many payment vouchers.
- Use the same **Reference** as on the bank statement — it makes bank reconciliation easier.

## Common problems

- **Bank account is greyed out ("— no GL")** in the PI payment form → link the bank to a ledger in **Bank Accounts**.
- **"Settle amount must be greater than zero"** → type an amount before clicking Settle.
- **IMPORT proformas use a payment voucher flow** → import PIs are paid with a payment voucher, not Record Payment.`,
      tags: ["receipt", "payment", "AR", "AP", "customer", "supplier", "bank", "fx"],
      keywords: [
        "receipt voucher",
        "payment voucher",
        "collection",
        "export proceeds",
        "LC payment",
        "realisation",
        "contra",
        "cash to bank",
        "outstanding",
        "settle bill",
        "FX receipt",
        "dollar receipt",
      ],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-06",
      audience: "finance",
      coverImage: "/tutorials/screens/accounts-outstanding-bills.jpg",
      infographics: [
        {
          type: "flow",
          title: "Customer receipt",
          steps: [
            { label: "Proforma / commercial invoice", href: "/app/commercial/proforma-invoices" },
            { label: "Receipt voucher (F6)", href: "/app/accounts/vouchers" },
            { label: "Approve & post", href: "/app/accounts/vouchers/approval-queue" },
            { label: "Bills (Receivable)", href: "/app/accounts/outstanding-bills" },
          ],
        },
        {
          type: "steps",
          title: "Record export proceeds on a PI",
          steps: [
            {
              title: "Open the issued export PI",
              body: "**Export & Import → Proforma Invoices** → **Actions → Edit**.",
              href: "/app/commercial/proforma-invoices",
            },
            {
              title: "Fill the Payments form",
              body: "Amount, date, bank, receivable ledger, currency and rate → **Record Payment**.",
              imageSrc: "/tutorials/screens/fin-pi-receipt-panel.jpg",
              imageAlt: "Payments panel on a proforma invoice with PI total, posted paid and outstanding",
            },
            {
              title: "Finance posts the draft receipt",
              body: "The draft receipt voucher waits in **Vouchers** / **Voucher Approvals**.",
              href: "/app/accounts/vouchers/approval-queue",
            },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/fin-outstanding-payable.jpg",
          alt: "Outstanding Bills page set to Payable with aging boxes and Settle fields",
          caption: "Bills → Payable: open supplier bills with aging. Settle records a part payment.",
        },
        {
          src: "/tutorials/screens/finance-fx-receipts.jpg",
          alt: "FX Receipts & Settlement page with totals, receipt form and receipt list",
          caption: "FX Receipts tracks foreign-currency money received and how much is settled.",
        },
      ],
      relatedAppRoutes: [
        "/app/accounts/vouchers",
        "/app/accounts/outstanding-bills",
        "/app/finance/fx-receipts",
        "/app/commercial/proforma-invoices",
      ],
      relatedArticleIds: ["fin-voucher-entry", "fin-bills-ap", "fin-tax-deductions", "fin-cheques", "commercial-overview"],
    },
    {
      id: "fin-bills-ap",
      title: "Step-by-step: supplier bills and purchase & AP",
      summary:
        "Turn received goods into supplier bills — from Vendor bills (GRN) or Purchase & AP — post them to payables, and follow open bills until they are paid.",
      content: `## Overview

**Accounts payable (AP)** is what you owe suppliers. In P7 a supplier bill is booked from what the store actually received (the **GRN**), so finance pays for accepted goods only.

- **Vendor bills (GRN)** (\`/app/accounts/vendor-bills\`) — draft bills matched to GRN accepted quantities. Post them to clear **GRNI** (goods received, not billed) and book trade payables.
- **Purchase & AP** (\`/app/accounts/purchase-workflow\`) — one page with payable totals, open bills, approved POs and received GRNs, with **Create AP bill** on each.
- **Bills** (\`/app/accounts/outstanding-bills\`) — every open payable and receivable with aging.

**Who uses it:** AP accountant; finance manager for posting.

## Before you start

- **Post AP** needs a **manager** or **admin** role, or the permission **finance.ap_posting_approve** (**Settings → Roles → Material control & finance governance**).
- The GRN must be **RECEIVED** in **Inventory → Goods Receiving** (and QC accepted when QC is used).
- Have the supplier's invoice number ready.

## Steps

### A. Post a vendor bill from a GRN

1. Open **Finance → Transactions → Vendor bills (GRN)**.
2. On the bill's row click **Actions → View**. Check the lines (item, qty, rate, line total) and the **Vendor party ledger** card.
3. Type the supplier's invoice number in **Vendor invoice ref** and click **Save ref**.
4. Click **Mark approved** when the bill is checked.
5. Click **Post AP**. The message shows **Posted. Voucher #…** — a journal Dr GRNI / Cr trade payables is posted.

### B. Create an AP bill from a PO or GRN

1. Open **Finance → Transactions → Purchase & AP**.
2. Check the cards: **Payable Bills**, **Open Payables**, **Open Amount**, **Due 7 Days**.
3. Under **Received GRNs (Create AP Bill from actual receipt)** click **Actions → Create AP bill** on the GRN. (Use **Approved Purchase Orders** only when you bill against the PO, for example an advance.)
4. The bill is created with a 30-day due date and appears in the open bills table and in **Bills → Payable**.

### C. Follow open bills

1. **Open Outstanding Bills** (or **Finance → Transactions → Bills**) and choose **Payable**.
2. Use the status filter (**OPEN / PARTIAL / PAID**) and search by bill number or party.
3. When you are ready to pay, click **Create Payment Run** on Purchase & AP (see "Pay suppliers with payment runs").

## What happens next

- Posted vendor bills and AP bills show in **AR/AP Aging** and **Purchase & AP**.
- **Exception Reports → Goods received, not billed** lists GRNs still waiting for a bill — **Actions → Create vendor bill draft** fixes them from the report.
- Paying the bill (payment run or payment voucher) changes it to **PARTIAL** or **PAID**.

## Tips

- Bill from the **GRN**, not the PO, so short or rejected quantities are not paid.
- Click **Open GRN QC inspection** on a vendor bill to see what QC accepted.

## Common problems

- **"Enter vendor invoice reference before posting."** → fill **Vendor invoice ref** first.
- **"No vendor bills yet."** → no draft bills exist; create them from **Exception Reports → Goods received, not billed** or use **Purchase & AP**.
- **Post AP is refused (permission)** → ask an admin for **finance.ap_posting_approve** or ask a manager to post.
- **"Posted vendor bill cannot be edited"** → correct it with a debit note or a journal instead.`,
      tags: ["AP", "bills", "payable", "supplier", "vendor bill", "GRN", "GRNI"],
      keywords: [
        "accounts payable",
        "supplier bill",
        "vendor bill",
        "purchase bill",
        "GRN",
        "GRNI",
        "goods received not billed",
        "post AP",
        "outstanding bills",
        "aging",
        "three way match",
      ],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      audience: "finance",
      coverImage: "/tutorials/screens/accounts-purchase-workflow.jpg",
      infographics: [
        {
          type: "diagram",
          title: "Purchase to pay",
          caption: "Where each step happens and which accounting entry it makes.",
          imageSrc: "/tutorials/diagrams/finance/purchase-to-pay.svg",
          imageAlt: "Purchase to pay diagram from purchase order through GRN, bill, payment and bank reconciliation",
        },
        {
          type: "flow",
          title: "Bill a GRN",
          steps: [
            { label: "Goods receiving", href: "/app/inventory/goods-receiving" },
            { label: "Vendor bills (GRN)", href: "/app/accounts/vendor-bills" },
            { label: "Post AP" },
            { label: "Bills (Payable)", href: "/app/accounts/outstanding-bills" },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/fin-purchase-ap-actions.jpg",
          alt: "Purchase & AP page with the Actions menu open on an approved PO showing Create AP bill",
          caption: "Purchase & AP: Actions → Create AP bill on a PO or a received GRN.",
        },
        {
          src: "/tutorials/screens/accounts-vendor-bills.jpg",
          alt: "Vendor bills (GRN match) page with the bills table",
          caption: "Vendor bills (GRN): open a bill with Actions → View, add the invoice ref, then Post AP.",
        },
      ],
      relatedAppRoutes: ["/app/accounts/vendor-bills", "/app/accounts/purchase-workflow", "/app/accounts/outstanding-bills"],
      relatedArticleIds: ["fin-payment-runs", "fin-receipts-payments", "inv-grn-deep", "inv-po-deep", "fin-overview"],
    },
    {
      id: "fin-payment-runs",
      title: "Pay suppliers with payment runs and payment advice",
      summary:
        "Pick open payable bills, create a payment run, take it through Approve, Process and Execute, then print the payment advice for the bank.",
      content: `## Overview

A **payment run** pays many supplier bills from one bank account in one batch. Executing the run posts a **PAYMENT** voucher and marks the bills paid. **Payment Advice** is the printable list for the bank and suppliers.

**Who uses it:** AP accountant prepares; manager or admin approves and executes.

## Before you start

- Open payable bills exist (**Bills → Payable** or **Purchase & AP**).
- The bank account in **Bank Accounts** has a **Linked GL Account**. A run can only be executed for a bank account linked to a ledger, because bills are marked paid only together with the posted payment voucher.
- An open accounting period covers the run date.
- **Approve**, **Process** and **Execute** need a **manager** or **admin** role.

## Steps

1. Open **Finance → Banking → Payment Runs** (\`/app/banking/payment-runs\`).
2. In **Create Payment Run**: optional **Run code**, the run date, **Select bank account \\***, optional **Remarks**.
3. In **Open Payable Bills**, tick **Pick** on each bill to pay. Search by bill number or party.
4. For foreign-currency bills, type the rate in **FX to BDT**. **Settlement Preview** shows the source total and the base total.
5. Click **Create Run (Draft)**.
6. In **Payment Run Queue**, a manager clicks **Approve**, then **Process**, then **Execute**.
7. Click **Open Advice** on the run (or open **Payment Advice** and type the **Payment run ID** → **Load Advice**) and print it.

## What happens next

- **Execute** posts a PAYMENT voucher (Dr supplier, Cr bank) — its number shows in the **Voucher** column — and updates the paid amounts on the bills.
- The executed run can be matched to the bank statement in **Bank Reconciliation**.
- **Settlement Audit** (\`/app/banking/settlement-audit\`) shows the settlement history.

## Tips

- Run payments once or twice a week, by bank, so the bank statement is easy to match.
- Use **Remarks** for the purpose ("Trims suppliers – weekly payment").

## Common problems

- **"Required: Bank account and at least one payable bill."** → pick the bank and tick at least one bill.
- **"Manager/Admin action"** instead of buttons → ask a manager to approve, process and execute.
- **"No open accounting period for this payment run date"** → open the period or change the run date.
- **Base Equivalent shows 0** → type the **FX to BDT** rate for that currency.`,
      tags: ["payment run", "supplier payment", "batch payment", "payment advice", "AP"],
      keywords: ["payment run", "batch payment", "pay suppliers", "bank transfer", "BEFTN", "payment advice", "execute payment"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      audience: "finance",
      coverImage: "/tutorials/screens/banking-payment-runs.jpg",
      infographics: [
        {
          type: "flow",
          title: "Payment run status",
          steps: [
            { label: "DRAFT", href: "/app/banking/payment-runs" },
            { label: "APPROVED" },
            { label: "PROCESSED" },
            { label: "EXECUTED" },
            { label: "Payment advice", href: "/app/banking/payment-advice" },
          ],
        },
        {
          type: "steps",
          title: "Create a run",
          steps: [
            {
              title: "Choose bank and tick bills",
              body: "Pick the **bank account** and tick **Pick** on each bill. Check **Settlement Preview**.",
              imageSrc: "/tutorials/screens/fin-payment-run-select.jpg",
              imageAlt: "Payment Runs form with a bank selected and two bills ticked",
            },
            {
              title: "Create Run (Draft)",
              body: "The run appears in **Payment Run Queue** as DRAFT.",
            },
            {
              title: "Approve → Process → Execute",
              body: "Manager or admin. Execute posts the payment voucher.",
            },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/banking-payment-advice.jpg",
          alt: "Payment Advice page with Payment run ID field and Load Advice button",
          caption: "Payment Advice: load a run by its ID and print it for the bank.",
        },
      ],
      relatedAppRoutes: ["/app/banking/payment-runs", "/app/banking/payment-advice", "/app/banking/settlement-audit"],
      relatedArticleIds: ["fin-bills-ap", "fin-bank-reconciliation", "fin-cheques", "fin-overview"],
    },
    {
      id: "fin-bank-reconciliation",
      title: "Step-by-step: bank accounts and bank reconciliation",
      summary:
        "Set up bank accounts, then compare each bank statement with your books: add the statement, import its lines, match them to payment runs and finalize.",
      content: `## Overview

**Bank reconciliation** proves that the bank statement and your books agree. For each statement you enter the bank's closing balance; P7 compares it with the **book balance** of that bank account and shows the **Difference**. The book balance is the bank ledger's balance **on the statement date** (opening balance plus posted vouchers up to that date). Statement lines are matched to executed **payment runs**.

**Who uses it:** accountant (enters and matches), manager or admin (finalizes).

## Before you start

- The bank exists in **Finance → Banking → Bank Accounts** (\`/app/banking/accounts\`): fill **Account Name**, **Bank Name**, **Account Number**, **Linked GL Account**, **Currency**, **Opening Balance**, **Current Balance** and click **Create**. Edit later with **Actions → Edit**.
- Have the statement (PDF or CSV) from the bank for the period.
- **Finalize** is for **manager** or **admin** only.

## Steps

1. Open **Finance → Banking → Bank Reconciliation** (\`/app/banking/reconciliation\`).
2. Choose the bank account in the first drop-down. Its earlier statements load below.
3. Set the **statement date**, type the **Statement balance** from the bank and click **Add Statement**. A row appears with **Statement**, **Book** and **Difference**.
4. Click **Open** on that row (it changes to **Selected**).
5. Add the bank's lines under **Statement Lines**: type date, **Description**, **Reference**, **Debit**, **Credit** and click **Add Line** — or paste CSV in **CSV Import (paste CSV text)** with the heading \`transaction_date,description,reference,debit_amount,credit_amount,running_balance\` and click **Import CSV**.
6. Click **Auto Match**. Lines that match an executed payment run show **MATCHED** with the run number.
7. For the rest, choose a run in **Select run** and click **Match**. Use **Unmatch** to undo a wrong match.
8. Check the summary boxes: **Lines**, **Matched**, **Unmatched**, **Difference**.
9. When everything agrees, a manager types a **Finalize reason**, clicks **Finalize**, then **Yes, Finalize**.

## What happens next

- A finalized statement is **locked** — no more lines, matches or changes. The row shows **Locked**.
- **Match Audit Trail** lists every match and unmatch with user and time. **Export CSV** saves it for the auditor.
- **Resolve** on a statement row marks it **MATCHED** by hand when you have explained the difference outside the system.

## Tips

- Reconcile every bank at least once a week, and all banks before month-end close.
- Use the payment run code as the reference on bank transfers — Auto Match then finds it easily.
- Bank charges and interest on the statement need a **journal** or **payment** voucher; post it, then re-check the difference.

## Common problems

- **"Select a reconciliation first"** → click **Open** on a statement row before adding lines or matching.
- **"Paste CSV text first"** → the CSV box is empty.
- **"Only manager/admin can finalize reconciliation."** → ask a manager.
- **"Reconciliation is finalized and cannot be changed"** → create a new statement for the next period.
- **Book balance looks wrong** → the book balance is the bank's **linked GL account** balance on the statement date (opening balance plus posted vouchers up to that date). Check the linked ledger, the statement date and any vouchers still not posted.`,
      tags: ["bank reconciliation", "bank", "statement", "brs", "banking"],
      keywords: [
        "bank reconciliation",
        "BRS",
        "bank statement",
        "match",
        "auto match",
        "finalize",
        "bank account",
        "bank balance",
        "CSV import",
      ],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "finance",
      coverImage: "/tutorials/screens/banking-reconciliation.jpg",
      videos: [
        {
          src: "/tutorials/videos/fin-bank-reconciliation-tour.webm",
          poster: "/tutorials/videos/fin-bank-reconciliation-tour-poster.jpg",
          title: "Tour of bank reconciliation",
          caption:
            "Choose the bank, enter the statement balance, paste statement lines as CSV, then see Auto Match, Finalize and the Match Audit Trail. Nothing is saved in the demo.",
          durationSeconds: 62,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Reconcile one statement",
          steps: [
            {
              title: "Check the bank account",
              body: "**Bank Accounts**: the bank has a **Linked GL Account** and a current balance.",
              imageSrc: "/tutorials/screens/banking-accounts.jpg",
              imageAlt: "Bank Accounts page with three bank accounts and their current balances",
              href: "/app/banking/accounts",
            },
            {
              title: "Add the statement and its lines",
              body: "Statement date + **Statement balance** → **Add Statement** → **Open**. Then **Add Line** or paste CSV → **Import CSV**.",
              imageSrc: "/tutorials/screens/fin-bank-recon-csv.jpg",
              imageAlt: "Bank Reconciliation page with statement balance filled and CSV text pasted",
              href: "/app/banking/reconciliation",
            },
            {
              title: "Auto Match, then match the rest",
              body: "**Auto Match** pairs lines with executed payment runs; use **Select run → Match** for the rest.",
            },
            {
              title: "Finalize",
              body: "When **Difference** is zero, a manager types a reason → **Finalize** → **Yes, Finalize**.",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/banking/reconciliation", "/app/banking/accounts"],
      relatedArticleIds: ["fin-payment-runs", "fin-receipts-payments", "fin-coa-setup", "fin-overview"],
    },
    {
      id: "fin-cheques",
      title: "Print cheques and handle post-dated cheques",
      summary:
        "Print a bank cheque from an approved payment voucher, line it up with your bank's cheque leaf, and use post-dated vouchers for cheques dated in the future.",
      content: `## Overview

P7 prints the date, payee, amount in words (Taka … Lakh … Thousand … Only) and amount in figures (12,50,000.00/=) straight onto a blank **8 × 3.5 inch** cheque leaf, with an optional **A/C Payee only** stamp. Post-dated cheques are handled as **post-dated vouchers**.

**Who uses it:** cashier and accountant.

## Before you start

- The payment is a **Payment** voucher and is **APPROVED** or **POSTED**. (For other statuses the page warns "Print cheques only after the payment is approved.")
- A blank cheque leaf and plain paper for a test print.
- For post-dated cheques: an admin switches on **Post-dated vouchers** in **Settings → Configuration → More features → Advanced vouchers**.

## Steps

### A. Print a cheque

1. Open the payment voucher (**Vouchers** → click the row).
2. Click **Print cheque** at the bottom.
3. Check **Pay to (payee)** — it is taken from the debit ledger; correct it to the exact name on the cheque.
4. Optional: **Cheque number (for your records)**. Tick or untick **Print "A/C Payee only"**.
5. Print once on plain paper and hold it over a cheque leaf. Adjust **Shift right (mm)** and **Shift down (mm)** until the text sits in the right boxes. The shift is remembered on this computer.
6. Put the cheque leaf in the printer and click **Print cheque**.

### B. Handle a post-dated cheque (PDC)

1. Enter the payment (or receipt) voucher with the **cheque date** as the **Voucher date** and put the cheque number in **Reference**.
2. Click **Save Draft** (or **Save & Submit**) and leave it there. The **Entry assistant** reminds you the date is in the future.
3. On the cheque date, approve and post it from **Voucher Approvals**, so the bank balance changes on the right day.
4. If your admin has switched on **Post-dated vouchers**, vouchers flagged post-dated (for example from the memorandum / optional voucher tools) appear in **Finance → Transactions → Post-dated Register** (\`/app/finance/registers/post-dated\`) with **Days until active** (**Due now** when the date has come). Click **Activate due** on the due date; use **Edit voucher** to change one first.

## What happens next

- The cheque is only paper — the books change when the payment voucher is posted.
- Vouchers in the Post-dated Register stay out of the books until activated, so cash and bank balances are not affected early.

## Tips

- Each bank's leaf is different: do the plain-paper test once per bank and per printer.
- Write the cheque number in the voucher **Reference** too, so it shows on the bank reconciliation.

## Common problems

- **"Cheques are normally printed from Payment vouchers"** warning → you opened a non-payment voucher.
- **Text prints outside the boxes** → change **Shift right / Shift down** in small steps (0.5 mm).
- **"Feature disabled. Enable tenant feature flag post_dated_voucher_enabled."** on the Post-dated Register → ask an admin to switch on **Post-dated vouchers**.
- **Settings → Cheque Templates** says templates will come in a future release → use the shift fields on **Print cheque** instead.`,
      tags: ["cheque", "check", "post-dated", "pdc", "payment", "printing"],
      keywords: ["cheque print", "check printing", "account payee", "A/C payee", "PDC", "post-dated cheque", "amount in words", "taka in words"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      audience: "finance",
      coverImage: "/tutorials/screens/fin-cheque-print.jpg",
      infographics: [
        {
          type: "highlight",
          title: "Test on plain paper first",
          body: "Print once on plain paper, hold it over a real cheque leaf, adjust **Shift right / Shift down (mm)**, then print on the leaf. The shift is remembered on this computer.",
        },
      ],
      images: [
        {
          src: "/tutorials/screens/fin-cheque-print.jpg",
          alt: "Print cheque page with payee, cheque number, A/C Payee only, shift fields and the cheque preview",
          caption: "Print cheque: date boxes, payee, amount in words and figures on an 8 × 3.5 inch leaf.",
        },
        {
          src: "/tutorials/screens/fin-voucher-detail.jpg",
          alt: "Payment voucher page where the Print cheque button is found at the bottom",
          caption: "Open the payment voucher; Print cheque is in the button bar at the bottom.",
        },
      ],
      relatedAppRoutes: ["/app/accounts/vouchers", "/app/finance/registers/post-dated", "/app/settings/cheque-templates"],
      relatedArticleIds: ["fin-voucher-print", "fin-receipts-payments", "fin-payment-runs", "fin-coming-from-tally"],
    },
    {
      id: "fin-tax-deductions",
      title: "VAT, VDS and TDS on vouchers",
      summary:
        "Set VAT/VDS/TDS rates, calculate the deduction for a line, add the payable lines on payment vouchers, and let TDS be deducted automatically for parties with a TDS section.",
      content: `## Overview

When you pay a supplier in Bangladesh you often deduct **VDS** (VAT deducted at source) and **TDS** / AIT (tax deducted at source) and pay them to the government later. In P7 you set the rates once, calculate the amounts, and show them as separate **credit lines** on the payment voucher.

**Who uses it:** accountant and tax officer.

## Before you start

- Ledgers for **VAT payable**, **VDS payable** and **TDS payable** exist in the chart of accounts.
- Rates are set by an admin in **Settings → Statutory compliance → Tax rates** (\`/app/settings/statutory-compliance\`).

## Steps

### A. Set the rates (once)

1. Open **Settings → Statutory compliance** and stay on **Tax rates**.
2. Choose **Tax code** (**VAT**, **VDS** or **TDS**), type **Rate (%)**, optional **Registration no.**, keep **Active** ticked and click **Save tax rate**.

### B. Work out the deduction

1. In **Line tax calculator**, type the **Line amount (BDT)**.
2. Tick **VAT**, **VDS** and/or **TDS** and click **Calculate**. It shows each tax, **Total tax** and **Gross with tax**.

### C. Put it on the payment voucher

1. New **Payment** voucher (F5).
2. Debit the **supplier** with the full bill amount.
3. Credit the **bank** with the net amount actually paid.
4. Credit **VDS payable** and **TDS payable** with the deducted amounts. The totals bar must show **Balanced**.
5. Mention the challan or certificate number in the narration.

### D. Automatic TDS (optional)

1. An admin switches on the TDS feature. **Finance → Transactions → TDS Settings** then appears.
2. Set the **TDS payable account** (**Save settings**) and create sections (**Section code**, **Threshold**, **TDS rate %**) with **Create**.
3. Assign a section to a supplier's party ledger under **Assign section to party ledger**.
4. When a **Payment** voucher for that supplier is posted above the threshold, P7 records the TDS deduction and its liability. See **TDS Reports** for the list.

## What happens next

- The payable ledgers show what you owe the government. Pay them with a payment voucher when you deposit the challan.
- If GST-style tax is switched on for your company, the voucher form also shows **Tax Preview** with **Calculate tax**.

## Tips

- Keep one payable ledger per tax so the balance equals what you must deposit.
- Use the same rates in purchase orders and vendor bills so the supplier's net payment is correct.

## Common problems

- **TDS Settings or Tax Settings missing from the menu** → the feature is off; ask an admin.
- **Voucher not balanced after deductions** → supplier debit = bank credit + VDS credit + TDS credit.
- **TDS Settings says you do not have permission** → your role cannot manage TDS sections. Ask your administrator, or add TDS lines by hand as in step C.`,
      tags: ["vat", "vds", "tds", "tax", "mushak", "deduction", "withholding"],
      keywords: ["VAT", "VDS", "TDS", "AIT", "source tax", "withholding tax", "mushak", "tax deduction", "tax at source", "challan"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      audience: "finance",
      coverImage: "/tutorials/screens/fin-statutory-tax-rates.jpg",
      infographics: [
        {
          type: "highlight",
          title: "Example: pay a supplier bill of 100,000 with 5% VDS and 3% TDS",
          body: "Dr **Supplier** 100,000 · Cr **Bank** 92,000 · Cr **VDS payable** 5,000 · Cr **TDS payable** 3,000. Debits = credits = 100,000.",
        },
      ],
      images: [
        {
          src: "/tutorials/screens/fin-statutory-tax-rates.jpg",
          alt: "Statutory compliance Tax rates tab with the tax rate form and Line tax calculator",
          caption: "Settings → Statutory compliance → Tax rates: set VAT/VDS/TDS rates and use the Line tax calculator.",
        },
        {
          src: "/tutorials/screens/finance-tds.jpg",
          alt: "TDS Settings screen listing TDS sections with their rates and thresholds",
          caption: "Finance → TDS Settings: the TDS sections (rates and thresholds) used when you deduct tax at source.",
        },
      ],
      relatedAppRoutes: ["/app/settings/statutory-compliance", "/app/finance/tds", "/app/finance/tds/reports", "/app/accounts/vouchers"],
      relatedArticleIds: ["fin-receipts-payments", "fin-voucher-entry", "commercial-bd-registers", "settings-overview"],
    },
    {
      id: "fin-loans-facilities",
      title: "Loans & facilities (credit lines)",
      summary:
        "Record bank loan facilities, draw down utilizations with an EMI schedule, and create the disbursement voucher from the facility.",
      content: `## Overview

A **facility** is a sanctioned limit from a bank or lender (term loan, working capital, BTB LC facility, overdraft …). Each drawdown is a **utilization** with its own principal, rate and repayment schedule. Activating a utilization creates a **disbursement draft voucher** for finance to post.

**Who uses it:** finance manager and treasury.

## Before you start

- Ledgers for the **loan liability**, **interest expense** and **interest payable** exist. Note their IDs from the chart of accounts.
- Optional: the bank is set up as a financier in **Settings → External access → Financiers**.

## Steps

### A. Create a facility

1. Open **Finance → Loans & facilities → All facilities** (\`/app/finance/facilities\`) and click **New facility**.
2. Choose **Facility type**, the **Financier (external principal)** or type a **Financier display name**.
3. Fill **Sanctioned amount**, **Currency**, **Interest % (annual)** and **Interest type** (reducing_balance, flat or fixed).
4. Type the **Liability GL**, **Interest expense GL** and **Interest payable GL** account IDs.
5. Click **Save draft facility**.

### B. Draw down (utilization)

1. On the facility row click **Actions → New utilization**.
2. Fill **Principal**, **Annual rate %**, **Repayment policy**, **Installments**, **Frequency**, **Moratorium months** and **Disbursement date**. The **Live EMI preview** on the right updates as you type.
3. Click **Create draft utilization**.
4. On the utilization page check the **Repayment schedule**, then click **Create disbursement draft & activate**.
5. Post the disbursement voucher from **Vouchers** / **Voucher Approvals**.

## What happens next

- **Facilities dashboard** (\`/app/finance/facilities/dashboard\`) and **Business overview** (\`/app/finance/business-overview\`) show utilized amounts, active debt and liquid funds.
- Repayments are also posted as vouchers.

## Tips

- Draft facilities can be deleted (**Actions → Delete**); active ones cannot.
- Keep the facility code on loan-related vouchers' **Reference**.

## Common problems

- **Activation fails** → the GL account IDs are missing or wrong on the facility.
- **Cannot reverse a disbursement voucher** → loan vouchers must be undone from the facility, not from the voucher list.`,
      tags: ["finance", "facility", "loans", "emi", "bank loan"],
      keywords: ["loan", "term loan", "overdraft", "OD", "CC limit", "working capital", "EMI", "facility", "drawdown", "utilization"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      audience: "finance",
      coverImage: "/tutorials/screens/finance-facilities.jpg",
      infographics: [
        {
          type: "flow",
          title: "Facility to voucher",
          steps: [
            { label: "New facility", href: "/app/finance/facilities" },
            { label: "New utilization" },
            { label: "Activate (draft voucher)" },
            { label: "Post voucher", href: "/app/accounts/vouchers/approval-queue" },
            { label: "Dashboard", href: "/app/finance/facilities/dashboard" },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/finance-facilities.jpg",
          alt: "Loans & facilities list with facility code, type, status, sanctioned and utilized amounts",
          caption: "All facilities: open a facility, or use Actions → New utilization to draw down.",
        },
        {
          src: "/tutorials/screens/fin-facility-new.jpg",
          alt: "New facility form with type, financier, sanctioned amount, interest and GL fields",
          caption: "New facility: sanctioned amount, interest and the three GL accounts.",
        },
      ],
      relatedAppRoutes: [
        "/app/finance/facilities",
        "/app/finance/facilities/dashboard",
        "/app/finance/business-overview",
      ],
      relatedArticleIds: ["fin-overview", "fin-voucher-entry", "fin-voucher-approval-queue"],
    },
    {
      id: "fin-tally-statements",
      title: "Tally-style statements",
      summary:
        "Trial Balance, Balance Sheet, Trading and Profit & Loss, monthly Cash Flow and Funds Flow, Ratio Analysis and Stock vs Ledger in the classic Tally layout, with drill-down, Excel, PDF and print.",
      content: `## Overview

**Tally-style statements** show your books in the layout accountants know from Tally: a grouped **Trial Balance**, a two-sided **Balance Sheet**, a **Trading and Profit & Loss A/c**, a **monthly Cash Flow**, a **monthly Funds Flow**, **Ratio Analysis** and a **Stock vs Ledger** control report. Amounts use lakh / crore grouping (for example \`1,81,38,63,870.26\`), a negative amount is written \`(-)1,234.00\`, and balances carry **Dr** or **Cr**.

Only **posted** vouchers are counted. Nothing here changes a voucher or a balance; it is a different way to read the same books.

**Who uses it:** the accountant who sets up the groups, and the finance manager and management who read the statements.

## Before you start

1. An admin switches on **Tally-style statements** in **Settings → Configuration → More features → Finance navigation**. It is off by default. The old reports stay available (they are marked **Classic**).
2. You need permission to view the finance reports. To download Excel or PDF you also need the export permission; without it the **Excel** and **PDF** buttons are greyed out.
3. A **manager or admin** gives each account group a **Statement class** (see below). Groups without a class are shown as **Unclassified**; the program never guesses from names.

## Steps — give every group a Statement class

1. Open **Finance → Setup → Account Groups** (\`/app/accounts/groups\`).
2. Click **Actions → Edit** on a group. In the **Statement class** box choose a class, for example **Sundry Debtors**, **Cash In Hand**, **Sales Accounts** or **Indirect Expenses**.
3. Read the **Preview**: it tells you how many sub-groups and ledgers follow this group and how their class changes.
4. Click **Save statement class**. Sub-groups and ledgers follow the group unless they have their own class. **Inherit / Unclassified** removes the group's own class.
5. The **Statement class** column in the list shows the class that applies, and **(inherited)** when it comes from a parent group.
6. For stock: open **Inventory → Stock Groups**, click a group and choose its **Stock nature** (raw material, work in process, finished goods or other), then **Save stock nature**.

Anyone who is not a manager or admin sees these fields read-only.

## Steps — read the statements

Open **Finance → Statements** (\`/app/finance/statements\`). The new tabs come first: **Trial Balance**, **Balance Sheet**, **Profit & Loss**, **Cash Flow**, **Funds Flow**, **Ratio Analysis** and **Stock vs Ledger**. The old pages follow as **Trial Balance (Classic)** and so on.

- **Trial Balance** (\`/app/finance/statements/trial-balance\`): Opening, Period (Debit, Credit) and Closing for each group and ledger. The Grand Total debit equals the credit. Tick **Show zero balances** to list empty ledgers.
- **Balance Sheet** (\`/app/finance/statements/balance-sheet\`): Liabilities on the left and Assets on the right (stacked on a phone). Inner amounts are ledgers, outer amounts are groups. The **Profit & Loss A/c** line carries the result of earlier years and this year: a profit sits on the liabilities side, a loss on the assets side.
- **Profit & Loss** (\`/app/finance/statements/profit-loss\`): the **Trading Account** first (gross profit or loss carried over), then the **Profit & Loss Account** (nett profit or loss). The **Memo: opening and closing stock** box is for information only and is never inside a total.
- **Cash Flow** (\`/app/finance/statements/cash-flow\`): twelve months of Inflow, Outflow and Nett flow plus the year total. Transfers between two cash or bank ledgers (contra) are **not counted** and the page shows how much was left out. The **Cash without overdraft** figure shows cash and bank money before the bank overdraft.
- **Funds Flow** (\`/app/finance/statements/funds-flow\`): opening and closing working capital for each month and the flow between them.
- **Ratio Analysis** (\`/app/finance/statements/ratio-analysis\`): **Principal Groups** on the left and **Principal Ratios** on the right. A **—** means the figure cannot be worked out (for example sales are zero); the reason is written under it.
- **Stock vs Ledger** (\`/app/finance/statements/stock-vs-ledger\`): the stock value from the stock records against the stock ledgers in the books. A difference is shown as it is.

Pick a **Financial year** or type **From** and **To** dates (the Balance Sheet and Stock vs Ledger use one **As of** date). A green **Balanced** badge means the statement agrees with itself; a red badge shows the **Difference**.

## Steps — drill down

1. Click the name of a group, a ledger or (on Cash Flow) a month.
2. A side panel opens: group → its sub-groups and ledgers → the vouchers of a ledger (50 per page, **Previous** / **Next**).
3. Click a voucher number to open the normal voucher page.
4. Press **Esc** or the close button to leave the panel; the arrow goes back one level.

## Steps — Excel, PDF and print

- **Excel** and **PDF** download a file with the same numbers, the company header, lakh / crore grouping and Dr / Cr.
- **Print** prints the statement on A4 with the company header and a repeated table heading on every page. Menus and buttons are not printed.

## Good to know

- **Unclassified** warning: a yellow banner links to Account Groups. Fix the class there and reload the statement.
- Profit and loss come only from classified income and expense groups. Stock is taken from the stock ledger, so the Balance Sheet balances.
- Switching the setting off hides the new tabs again. The classic reports and your data are untouched.

## Common problems

- **A statement says it is switched off** → ask an admin to turn on **Tally-style statements** in Settings → Configuration.
- **Excel / PDF is greyed out** → your role does not have the export permission.
- **"You do not have permission to view this statement"** → your role is not allowed to view finance reports.
- **Balance Sheet shows a Difference** → check the **Unclassified** banner first; a group with no class can put an amount on the wrong side.`,
      tags: [
        "tally",
        "trial balance",
        "balance sheet",
        "profit and loss",
        "trading account",
        "cash flow",
        "funds flow",
        "ratio analysis",
        "statement class",
        "stock nature",
        "drill down",
        "lakh",
        "crore",
        "export",
      ],
      keywords: ["statements", "unclassified", "dr cr", "tally style", "classic reports", "finance_statements_v2"],
      estimatedMinutes: 8,
      lastUpdated: "2026-11-12",
      audience: "finance",
      infographics: [
        {
          type: "steps",
          title: "Switch on and use the statements",
          steps: [
            { title: "Switch on", body: "Settings → Configuration → **Tally-style statements**.", href: "/app/settings/config" },
            { title: "Classify groups", body: "Account Groups → Edit → **Statement class** → Save.", href: "/app/accounts/groups" },
            { title: "Read", body: "Finance → **Statements** → pick a tab and a financial year.", href: "/app/finance/statements" },
            { title: "Drill down", body: "Click a group, ledger or month; click a voucher to open it." },
            { title: "Export or print", body: "**Excel**, **PDF** or **Print** (A4)." },
          ],
        },
      ],
      relatedAppRoutes: [
        "/app/finance/statements",
        "/app/finance/statements/trial-balance",
        "/app/finance/statements/balance-sheet",
        "/app/finance/statements/profit-loss",
        "/app/finance/statements/cash-flow",
        "/app/finance/statements/funds-flow",
        "/app/finance/statements/ratio-analysis",
        "/app/finance/statements/stock-vs-ledger",
        "/app/accounts/groups",
      ],
      relatedArticleIds: ["fin-overview"],
    },
  ],
};

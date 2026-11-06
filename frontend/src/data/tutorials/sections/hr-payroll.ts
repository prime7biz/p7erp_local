import type { TutorialSection } from "../types";

const S = "/tutorials/screens";
const D = "/tutorials/diagrams/hr-payroll";
const V = "/tutorials/videos";

export const hrPayrollSection: TutorialSection = {
  id: "hr-payroll",
  title: "HR — Payroll & compliance",
  description:
    "Monthly salary from setup to bank file: components, salary structures, payroll runs, piece-rate and overtime pay, bonuses, advances, payslips, statutory deductions and final settlement.",
  articles: [
    // ------------------------------------------------------------------ 1. Overview
    {
      id: "hr-pay-overview",
      title: "Payroll module map — how monthly salary works",
      summary:
        "One-page map of every Payroll screen in the HR menu, the order to use them in, and who does each step.",
      tags: ["HR", "payroll", "salary", "overview"],
      keywords: [
        "payroll",
        "salary",
        "beton",
        "wages",
        "salary sheet",
        "monthly salary",
        "pay run",
        "payroll process",
        "HR payroll",
      ],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "hr",
      coverImage: `${S}/hr-payroll-runs.jpg`,
      videos: [
        {
          src: `${V}/hr-pay-run-walkthrough.webm`,
          poster: `${V}/hr-pay-run-walkthrough-poster.jpg`,
          title: "Monthly payroll run: period, run and approval screens",
          caption: "A 1-minute tour of Periods, Runs and Payroll Approvals. Nothing is saved.",
          durationSeconds: 53,
        },
      ],
      content: `## Overview

**Payroll** turns each month's attendance, leave, overtime and (for piece-rate workers) scanned pieces into **gross pay, deductions and net pay** for every employee. It then sends the salary cost to Finance as a journal voucher, makes payslips, and gives you a bank file.

Who uses it: **HR / payroll officers** prepare the run; a **manager or admin** checks, approves and posts it; **accountants** see the posted voucher; **employees** read their own payslips under **My Payslips**.

All payroll screens are in the sidebar under **HR → Payroll**:

| Screen | Path | What it is for |
|---|---|---|
| **Components** | \`/app/hr/payroll/components\` | Pay items such as Basic, House rent, Overtime, Tax, Advance recovery |
| **Salary Structures** | \`/app/hr/payroll/salary-structures\` | Grade templates that group components |
| **Structure Assignments** | \`/app/hr/payroll/assignments\` | Links each employee to a structure from a date, with base salary |
| **Periods** | \`/app/hr/payroll/periods\` | The payroll month (start, end, payment date); lock it when done |
| **Runs** | \`/app/hr/payroll/runs\` | Create → Auto-calculate → Finalize → Approve → Post GL → Payslips → Bank CSV |
| **Advances & Loans** | \`/app/hr/payroll/advances\` | Salary advances and the monthly recovery amount |
| **Bonuses** | \`/app/hr/payroll/bonuses\` | Festival, attendance and performance bonus declarations |
| **Accounting Config** | \`/app/hr/payroll/accounting-config\` | Which ledger accounts the payroll voucher uses |
| **Statutory Config** | \`/app/hr/payroll/statutory\` | PF and other statutory rates (only when **Statutory payroll** is switched on) |
| **Approvals** | \`/app/hr/payroll/approvals\` | Finalized runs waiting for a manager |
| **Payslips** | \`/app/hr/payroll/payslips\` | All generated payslips; download as PDF |

Related screens outside the Payroll group: **Overtime Rules** and **Overtime** (HR → Time & Attendance), **Payroll Summary** report (\`/app/reports/payroll\`) and **Settings → Statutory compliance** (\`/app/settings/statutory-compliance\`).

## Before you start

- You need **HR manager** access or the payroll permission **hr.payroll.manage** to create periods, runs and assignments.
- **Finalize, Approve, Reject, Post GL, Payslips, Bank CSV** and **locking a period** need the **admin** or **manager** role.
- Employees must exist and be **active** (see [HR module map](/app/tutorials/hr-overview)). Attendance, leave and overtime for the month should be entered and approved first.
- **Auto-calculate** needs the tenant switch **Payroll auto-calculate** under **Settings → Configuration** (\`/app/settings/config\`, section **HR payroll**). It is off by default.

## Steps

1. **One-time setup** — create **Components**, build **Salary Structures**, then add a **Structure Assignment** for every employee. See [Payroll setup](/app/tutorials/hr-pay-setup).
2. **Every month** — add the **Period**, create a **Run**, use **Auto-calculate** to preview and apply, then **Finalize**. See [Run monthly payroll](/app/tutorials/hr-pay-monthly-run).
3. **Manager** — opens **Payroll Approvals** and chooses **Actions → Approve** (or **Reject** with a reason).
4. **Manager / accounts** — on **Runs** clicks **Post GL** (creates the journal voucher), **Payslips** (generates payslips) and **Bank CSV** (bank advice file).
5. **Close the month** — on **Periods**, click **Finalize** next to the period so no new run can be created for it.

## What happens next

- **Finance**: **Post GL** creates a posted **Journal** voucher numbered like \`PR00012\` (Dr salary expense, Cr salary payable) dated on the period's payment date. Accounts then pays the salary with a payment voucher. See [Finance overview](/app/tutorials/fin-overview).
- **Employees** see their payslip under **HR → Self-Service → My Payslips** (\`/app/hr/ess/payslips\`).
- **Reports**: **Reports → Payroll Summary** shows gross, deductions and net by period for a year.

## Tips

- Run the **Auto-calculate preview** as many times as you like — it does not save anything until you click **Apply**.
- Keep one person preparing and a different person approving. This is the "maker–checker" control auditors look for.
- Status words on the **Runs** table tell you what is allowed next: **DRAFT** (editable) → **FINALIZED** (waiting) → **APPROVED** → **POSTED** (in the books). **REJECTED** runs can be recalculated and finalized again.

## Common problems

- **"Payroll run … already exists for this period"** → only one active run per period. Reject the old run first (Payroll Approvals → **Actions → Reject**), then create a new one.
- **Period not in the "Payroll period" list on Runs** → the period is locked (finalized). Create the next period instead.
- More fixes: [Payroll troubleshooting](/app/tutorials/hr-pay-troubleshooting).`,
      infographics: [
        {
          type: "flow",
          title: "Monthly payroll in 8 steps",
          steps: [
            { label: "Period", href: "/app/hr/payroll/periods" },
            { label: "Create run", href: "/app/hr/payroll/runs" },
            { label: "Auto-calculate & apply", href: "/app/hr/payroll/runs" },
            { label: "Finalize", href: "/app/hr/payroll/runs" },
            { label: "Approve", href: "/app/hr/payroll/approvals" },
            { label: "Post GL", href: "/app/hr/payroll/runs" },
            { label: "Payslips & bank CSV", href: "/app/hr/payroll/payslips" },
            { label: "Lock period", href: "/app/hr/payroll/periods" },
          ],
        },
        {
          type: "diagram",
          title: "Monthly payroll cycle",
          caption: "Run statuses in orange. A manager can send a run back with Reject; it is then recalculated and finalized again.",
          imageSrc: `${D}/monthly-payroll-cycle.svg`,
          imageAlt:
            "Diagram: period OPEN, create run DRAFT, auto-calculate, finalize FINALIZED, approve APPROVED, post GL POSTED, payslips and bank CSV, lock period. Reject loop back to auto-calculate.",
        },
        {
          type: "flow",
          title: "One-time setup chain",
          steps: [
            { label: "Components", href: "/app/hr/payroll/components" },
            { label: "Salary Structures", href: "/app/hr/payroll/salary-structures" },
            { label: "Structure Assignments", href: "/app/hr/payroll/assignments" },
            { label: "Accounting Config", href: "/app/hr/payroll/accounting-config" },
          ],
        },
      ],
      images: [
        {
          src: `${S}/hr-payroll-approvals.jpg`,
          alt: "Payroll Approvals screen listing finalized runs with an Actions menu",
          caption: "Payroll Approvals — the manager's queue of finalized runs.",
        },
        {
          src: `${S}/reports-payroll.jpg`,
          alt: "Payroll Summary report with gross, deductions and net totals by period",
          caption: "Reports → Payroll Summary — yearly view of every run.",
        },
      ],
      relatedAppRoutes: [
        "/app/hr/payroll/components",
        "/app/hr/payroll/salary-structures",
        "/app/hr/payroll/assignments",
        "/app/hr/payroll/periods",
        "/app/hr/payroll/runs",
        "/app/hr/payroll/approvals",
        "/app/hr/payroll/payslips",
        "/app/reports/payroll",
      ],
      relatedArticleIds: [
        "hr-overview",
        "hr-pay-setup",
        "hr-pay-monthly-run",
        "hr-pay-troubleshooting",
        "fin-overview",
      ],
    },

    // ------------------------------------------------------------------ 2. Setup
    {
      id: "hr-pay-setup",
      title: "Payroll setup: components, salary structures and assignments",
      summary:
        "Create pay components, group them into salary structures, and assign a structure and base salary to every employee before the first run.",
      tags: ["HR", "payroll", "setup", "salary structure", "components"],
      keywords: [
        "salary structure",
        "pay grade",
        "grade",
        "salary component",
        "basic",
        "house rent",
        "medical allowance",
        "conveyance",
        "allowance",
        "deduction",
        "structure assignment",
        "base salary",
      ],
      estimatedMinutes: 10,
      lastUpdated: "2026-11-06",
      audience: "hr",
      coverImage: `${S}/hr-payroll-components.jpg`,
      videos: [
        {
          src: `${V}/hr-pay-setup-tour.webm`,
          poster: `${V}/hr-pay-setup-tour-poster.jpg`,
          title: "Payroll setup: components and structure assignments",
          caption: "Opens the Add component form and the Assign structure form. Nothing is saved.",
          durationSeconds: 47,
        },
      ],
      content: `## Overview

Before the first payroll run you tell P7 ERP **what each person is paid and how it is calculated**. This is done once and then changed only when salaries change.

There are three building blocks:

1. **Components** — single pay items (Basic, House rent, Medical, Transport, Food, Overtime, Tax, Advance recovery …). Each one is either an **EARNING** (adds to gross) or a **DEDUCTION** (reduces net) and has a **calculation type**.
2. **Salary Structures** — a template, usually one per grade or worker type (for example "Grade 7 operator", "Staff", "Piece-rate sewing"). A structure holds **lines**: which components, the amount or rate of each, and the order they are calculated in.
3. **Structure Assignments** — link **one employee** to **one structure** from an **Effective from** date, with that person's **base salary**.

Who uses it: HR / payroll officer (with **hr.payroll.manage** or HR manager access).

## Before you start

- Employees must be created and **active** (HR → Employees).
- Know each worker's grade and gross / basic salary (for example from the appointment letter).
- For piece-rate workers see also [Piece-rate and daily-wage workers](/app/tutorials/hr-pay-piece-rate).

## Steps

### A. Create components

1. Open **HR → Payroll → Components** (\`/app/hr/payroll/components\`).
2. Click **Add component**.
3. Fill **Code** (short, e.g. \`BASIC\`, \`HRA\`, \`OT\`, \`ADV\`) and **Name** (e.g. "House rent").
4. **Component type**: type \`EARNING\` or \`DEDUCTION\` (exactly these words).
5. Choose how the amount is calculated (the drop-down):

| Option | Meaning | Typical use |
|---|---|---|
| **Fixed amount (monthly salary)** | The amount as it is | Basic, Medical, Transport, Food, fixed Tax |
| **% of base salary** | Amount is a percent of the assignment's base salary (40 = 40 %) | House rent |
| **Per day present (daily wage)** | Rate × paid days (present + paid leave) | Daily-wage workers, attendance allowance per day |
| **Per overtime hour** | Rate × approved OT hours | Overtime |
| **Per piece scanned (piece rate)** | Rate × pieces scanned at the Scan station | Piece-rate operators |
| **Per standard minute earned (SAM)** | Rate × (pieces × SMV) | SAM-based incentive |

6. **Default amount** — used when the structure line has no amount.
7. **Applies to** — \`ALL\`, \`WORKER\` or \`STAFF\`.
8. Leave **Active** ticked and click **Save**. To change one later use the row's **Actions → Edit**.

### B. Salary structures

1. Open **HR → Payroll → Salary Structures** (\`/app/hr/payroll/salary-structures\`) to see the structures (grades) that exist.
2. The **Add salary structure** box at the bottom asks for **Name**, **Grade**, **Basic Amount**, **House Rent**, **Medical** and **Transport**, then **Save**.
3. What Auto-calculate actually pays comes from the structure's **lines** (component + amount + order). There is no screen to add lines yet, so creating a new structure with its lines is currently a one-time job for your **system administrator / implementation team** — see *Common problems* below.

### C. Assign a structure to each employee

1. Open **HR → Payroll → Structure Assignments** (\`/app/hr/payroll/assignments\`).
2. In **Assign structure** choose the **Employee** and the **Structure**.
3. Set **Effective from** (the first day the structure applies).
4. **Base salary override** — enter the person's base salary (for example the gross or minimum-wage base). This figure is used by **% of base salary** lines, by the piece-rate **minimum-wage check** and by statutory calculations. Leave it empty only if no line depends on it.
5. **Component overrides (JSON, optional)** — change one component for this person only, e.g. \`{"HRA":{"amount":5000,"formula_type":"FIXED"}}\` or \`{"TAX":"500"}\`. The code must match a component that is in the structure.
6. Click **Assign structure**. The table below shows **From**, **To** and **Status** (**Active**, **Future** or **Ended**).
7. When a salary changes (increment, promotion), use the old row's **Actions → End assignment**, then add a new assignment with the new date and amount.

### D. Accounting (once)

Open **HR → Payroll → Accounting Config** (\`/app/hr/payroll/accounting-config\`), enter the **Salary expense GL account ID** and **Salary payable GL account ID** (ask your accountant), and click **Save mapping**. If left empty, posting tries the system's default salary accounts.

## What happens next

- Every **active employee** with an assignment effective on the run date appears in the **Auto-calculate** preview. Employees without one are listed as **Missing Assignment** and skipped.
- The calculation order is shown in the *gross to net* diagram below and in [Run monthly payroll](/app/tutorials/hr-pay-monthly-run).

## Tips

- Use the same component codes in every structure (\`BASIC\`, \`HRA\` …) — overrides and reports stay simple.
- Put earnings first and deductions last in the line order so the preview reads like a salary sheet.
- For Bangladesh garment grades, the government's **Minimum Wage Board** fixes a grade-wise minimum wage and how it splits into basic, house rent, medical, transport and food. Copy the current gazette figures into your structures, and check them again whenever a new wage notice is published.

## Common problems

- **Add salary structure shows an error when you click Save** (for example that a "code" field is required) → this form does not yet send every field the server needs, and it has no place to add lines. Ask your system administrator to create the structure and its lines; then you can assign it as normal.
- **Basic / House Rent columns on Salary Structures show "-"** → those columns are not filled by the server; the real amounts live on the structure's lines. Check figures in the Auto-calculate preview instead.
- **"component_overrides must be an object"** → the JSON is not valid. Use double quotes and curly braces exactly like the example.
- **Employee missing from the Employee list** → only **active** employees are offered. Re-activate the employee first.`,
      infographics: [
        {
          type: "steps",
          title: "Setup in three screens",
          steps: [
            {
              title: "Create components",
              body: "**Add component** → Code, Name, EARNING/DEDUCTION, calculation type → **Save**.",
              imageSrc: `${S}/hr-pay-component-form.jpg`,
              imageAlt: "Add component dialog with Code OT, Name Overtime and calculation type Per overtime hour",
              href: "/app/hr/payroll/components",
            },
            {
              title: "Check salary structures",
              body: "One structure per grade or worker type; its lines decide the pay.",
              imageSrc: `${S}/hr-payroll-salary-structures.jpg`,
              imageAlt: "Salary Structures list",
              href: "/app/hr/payroll/salary-structures",
            },
            {
              title: "Assign every employee",
              body: "Employee + Structure + **Effective from** + **Base salary override** → **Assign structure**.",
              imageSrc: `${S}/hr-pay-assign-form.jpg`,
              imageAlt: "Assign structure form with Employee, Structure, Effective from, Base salary override and Component overrides fields",
              href: "/app/hr/payroll/assignments",
            },
          ],
        },
        {
          type: "diagram",
          title: "How the structure becomes pay",
          caption: "The order Auto-calculate follows for each employee.",
          imageSrc: `${D}/gross-to-net.svg`,
          imageAlt:
            "Diagram of the gross-to-net steps: assignment, period inputs, structure lines, add up earnings and deductions, minimum-wage check, statutory lines, net pay; with a worked example.",
        },
      ],
      images: [
        {
          src: `${S}/hr-payroll-assignments.jpg`,
          alt: "Payroll structure assignments page with the Assign structure form and the assignments table",
          caption: "Structure Assignments — status shows Active, Future or Ended.",
        },
        {
          src: `${S}/hr-payroll-accounting-config.jpg`,
          alt: "Payroll GL mapping page with salary expense and salary payable account ID fields",
          caption: "Accounting Config — ledger accounts used by Post GL.",
        },
      ],
      relatedAppRoutes: [
        "/app/hr/payroll/components",
        "/app/hr/payroll/salary-structures",
        "/app/hr/payroll/assignments",
        "/app/hr/payroll/accounting-config",
      ],
      relatedArticleIds: ["hr-pay-overview", "hr-pay-monthly-run", "hr-pay-piece-rate", "hr-overview"],
    },

    // ------------------------------------------------------------------ 3. Monthly run
    {
      id: "hr-pay-monthly-run",
      title: "Run monthly payroll step by step (preview → finalize → approve → post)",
      summary:
        "Create the month's period and run, preview the auto-calculated salaries, apply them, and take the run through finalize, approval, posting, payslips and the bank file.",
      tags: ["HR", "payroll", "payroll run", "auto-calculate", "approval"],
      keywords: [
        "payroll run",
        "salary process",
        "process salary",
        "salary sheet",
        "auto calculate",
        "preview",
        "finalize",
        "approve payroll",
        "post to GL",
        "lock period",
        "month end salary",
      ],
      estimatedMinutes: 12,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "hr",
      coverImage: `${S}/hr-payroll-runs.jpg`,
      videos: [
        {
          src: `${V}/hr-pay-run-walkthrough.webm`,
          poster: `${V}/hr-pay-run-walkthrough-poster.jpg`,
          title: "Monthly payroll run: period, run and approval screens",
          caption: "Walks through Periods, Runs and Payroll Approvals and explains each button. Nothing is saved, applied or approved.",
          durationSeconds: 53,
        },
      ],
      content: `## Overview

Once a month the payroll officer prepares a **payroll run** for the month's **period**; a manager approves it; then it is posted to the books and paid. This guide walks through every button on **HR → Payroll → Runs** (\`/app/hr/payroll/runs\`).

## Before you start

- [Payroll setup](/app/tutorials/hr-pay-setup) is done: every employee has a **Structure Assignment**.
- The month's **attendance** (Daily Entry), **leave** and **overtime** are entered and **approved**. Auto-calculate only counts **approved** overtime and **approved** leave.
- Piece-rate workers' bundles are scanned at the **Scan station** with their employee code.
- **Settings → Configuration → HR payroll → Payroll auto-calculate** is ticked (otherwise the preview shows "Payroll auto-calculation is disabled").
- Permissions: officer = **hr.payroll.manage** or HR manager; Finalize / Approve / Post GL / Payslips / Bank CSV = **admin** or **manager** role.

## Steps

### 1. Add the payroll period (once per month)

1. Open **HR → Payroll → Periods** (\`/app/hr/payroll/periods\`).
2. In **Add payroll period** enter **Period code** (e.g. \`PR-2026-11\`), **Start date**, **End date** and **Payment date**, then click **Save**.
3. The period appears with status **OPEN** and **Locked: No**.

### 2. Create the run

1. Open **HR → Payroll → Runs**.
2. In **New payroll run** choose the **Payroll period**, set a **Run date** *inside* that period (the end of the month is best — assignments are checked on this date), and leave **Run code** empty to get an automatic code like \`PRUN0007\`.
3. Click **Create run**. The run appears in the table with status **DRAFT**.

### 3. Preview with Auto-calculate

1. In the run's row click **Auto-calculate**. The **Auto-calculate preview** panel opens below the table. It is read-only.
2. For each active employee you see **Base**, **Earnings**, **Deductions**, **Gross**, **Net**, **Status** and **Warnings**.
   - Under **Base**, piece-rate workers show *Piece rate · N pcs · M SAM min*; daily-wage workers show *Daily wage · N days*.
   - **Status** is **Ready**, **Missing Assignment** (skipped, checkbox greyed) or **Manual Override Exists**.
   - When statutory lines exist, **Breakdown → Show** lists Earnings, Statutory, Statutory Deductions, Other Deductions and Net Pay.
3. Read the warnings at the top and in the **Warnings** column (see the table in *Common problems*). Fix the source data and click **Auto-calculate** again — the preview always recalculates from the latest data.

### 4. Apply

1. Ready employees are ticked automatically. Use **Select all** / **Deselect all** or the checkboxes to choose.
2. Leave **Force overwrite manual** unticked unless you really want to replace manually entered lines.
3. Click **Apply**. The message shows how many lines were applied and skipped and the new **Net** total. The run stays **DRAFT**, so you can re-apply after corrections.

### 5. Finalize

Click **Finalize** in the run's row (manager / admin). The totals are fixed and the status becomes **FINALIZED**. A run with no lines cannot be finalized.

### 6. Approve (manager)

1. The manager opens **HR → Payroll → Approvals** (\`/app/hr/payroll/approvals\`) — or the company-wide **Approvals** inbox.
2. Check **Gross** and **Net**, then **Actions → Approve**. Status becomes **APPROVED**.
3. To send it back choose **Actions → Reject** and type the reason. The preparer gets a notification; the run becomes **REJECTED** and can be auto-calculated and finalized again.

### 7. Post to the books, payslips, bank file

On **Runs**, for the approved run:

1. **Post GL** — creates a posted journal voucher (\`PR\` + run number) dated on the period's **payment date**: debit salary expense, credit salary payable, for the run's **net** total. Status becomes **POSTED**.
2. **Payslips** — generates one payslip per employee line. See [Payslips and bank advice](/app/tutorials/hr-pay-payslips-bank).
3. **Bank CSV** — downloads \`employee_code, net_pay, currency\` for the bank or mobile-wallet upload.

### 8. Lock the period

On **Periods**, in **Finalize period (manager/admin)**, click **Finalize** next to the month. The period becomes **FINALIZED**, **Locked: Yes**, and disappears from the run form.

## Pay rules Auto-calculate follows

- **Loss of pay** (flag \`payroll_lop_enabled\`, on unless set to false): auto-calculate pays **Fixed amount** and **% of base salary** components only for **payable days** — the days the person was employed in the period (joining / exit date) minus **Absent** days not covered by approved leave and minus approved **unpaid** leave days. People who left during the period are included for the days they worked. The preview shows LOP days and the amount deducted. A run that was already auto-calculated before this switched on keeps its old numbers.
- **Overtime from salary** (off by default; **HR → HR Settings**): approved overtime is paid as hours × (base salary ÷ 208) × multiplier on an **Overtime (from salary)** line — see [Overtime pay from salary](/app/tutorials/hr-overtime-from-salary).
- **Manual run lines** — gross, deductions and net must be valid amounts, not negative, and **net = gross − deductions** (0.01 rounding allowed). Leave net empty and it is calculated for you.

## What happens next

- Accounts pays salaries with a payment voucher (debit salary payable, credit bank / cash) — see [Voucher entry](/app/tutorials/fin-voucher-entry).
- Employees see their payslip in **My Payslips**.
- **Reports → Payroll Summary** includes the run.

## Tips

- Make the **Run date** the last day of the month so new joiners and salary changes effective during the month are picked up.
- Wages in Bangladesh must normally be paid within **seven working days** after the end of the wage period — plan Finalize and Approve early.
- Download the **Bank CSV** only after approval so the bank never receives unapproved figures.

## Common problems

| Message or symptom | Meaning | Fix |
|---|---|---|
| "Payroll auto-calculation is disabled…" | Tenant switch is off | **Settings → Configuration → HR payroll → Payroll auto-calculate** (admin) |
| "N active employee(s) have no effective structure assignment" | Workers without an assignment on the run date | Add their assignment, then preview again |
| "Piece-rate structure but no scanned pieces for operator code …" | No scans with that employee code | Check the operator code used at the Scan station |
| "Earnings … are below the base salary / minimum wage …" | Piece / regular pay under the base | Add a top-up before paying — see [Piece-rate workers](/app/tutorials/hr-pay-piece-rate) |
| "Unpaid leave days in period: N" | Approved unpaid leave exists | With **Loss of pay** on (the default), fixed and % lines are already reduced for those days — check the LOP days in the preview. If \`payroll_lop_enabled\` is set to false, adjust by hand |
| "Payroll run … already exists for this period" | One active run per period | Reject the old run first |
| "run_date must be inside payroll period" | Run date outside start–end | Pick a date inside the period |
| Auto-calculate / Finalize buttons greyed | Run is FINALIZED / APPROVED / POSTED | Reject it (if not posted) to edit again |

More: [Payroll troubleshooting](/app/tutorials/hr-pay-troubleshooting).`,
      infographics: [
        {
          type: "steps",
          title: "The run on one screen",
          steps: [
            {
              title: "Create the run",
              body: "**New payroll run** → Payroll period, Run date → **Create run** (status DRAFT).",
              imageSrc: `${S}/hr-pay-run-new-form.jpg`,
              imageAlt: "New payroll run form with Payroll period, Run date, Run code and Create run button",
              href: "/app/hr/payroll/runs",
            },
            {
              title: "Preview and apply",
              body: "In the run's row: **Auto-calculate** → read **Warnings** → tick employees → **Apply**. The preview lists Base, Earnings, Deductions, Gross, Net, Status and Warnings per employee.",
              imageSrc: `${S}/hr-payroll-runs.jpg`,
              imageAlt: "Payroll runs page with the New payroll run form and the runs table",
              href: "/app/hr/payroll/runs",
            },
            {
              title: "Approve",
              body: "Manager: **Payroll Approvals → Actions → Approve** (or Reject with a reason).",
              imageSrc: `${S}/hr-payroll-approvals.jpg`,
              imageAlt: "Payroll Approvals list with Actions menu",
              href: "/app/hr/payroll/approvals",
            },
            {
              title: "Post, payslips, bank file, lock",
              body: "**Post GL** → **Payslips** → **Bank CSV**, then **Periods → Finalize**.",
              imageSrc: `${S}/hr-pay-period-finalize.jpg`,
              imageAlt: "Payroll Periods page with the Finalize period section",
              href: "/app/hr/payroll/periods",
            },
          ],
        },
        {
          type: "diagram",
          title: "Run statuses",
          imageSrc: `${D}/monthly-payroll-cycle.svg`,
          imageAlt: "Monthly payroll cycle diagram with DRAFT, FINALIZED, APPROVED, POSTED statuses and the reject loop",
        },
        {
          type: "diagram",
          title: "Gross to net",
          imageSrc: `${D}/gross-to-net.svg`,
          imageAlt: "Gross-to-net calculation order with worked example",
        },
      ],
      relatedAppRoutes: [
        "/app/hr/payroll/periods",
        "/app/hr/payroll/runs",
        "/app/hr/payroll/approvals",
        "/app/approvals",
        "/app/settings/config",
      ],
      relatedArticleIds: [
        "hr-pay-overview",
        "hr-pay-setup",
        "hr-pay-payslips-bank",
        "hr-pay-troubleshooting",
        "hr-overtime-from-salary",
        "fin-voucher-entry",
        "hr-overview",
      ],
    },

    // ------------------------------------------------------------------ 4. Piece rate
    {
      id: "hr-pay-piece-rate",
      title: "Piece-rate and daily-wage workers (with the minimum-wage check)",
      summary:
        "Pay operators by pieces or standard minutes scanned at the Scan station, or by days present, and make sure nobody falls below the minimum wage.",
      tags: ["HR", "payroll", "piece rate", "daily wage", "minimum wage"],
      keywords: [
        "piece rate",
        "piece work",
        "contract rate",
        "per piece",
        "SAM",
        "SMV",
        "daily wage",
        "daily basis",
        "minimum wage",
        "top up",
        "operator code",
        "pay basis",
      ],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-06",
      audience: "hr",
      coverImage: `${S}/hr-pay-component-form.jpg`,
      content: `## Overview

Not every worker gets a fixed monthly salary. P7 ERP can pay **salaried staff, daily-wage workers and piece-rate operators in the same run**. The **pay basis** is decided by the calculation types of the components in the worker's structure:

| Worker | Calculation type on the component | Paid as | Shown under Base in preview |
|---|---|---|---|
| Monthly staff | **Fixed amount** / **% of base salary** | Amount each month | (nothing extra) |
| Daily wage | **Per day present** | Rate × paid days (present + late + half days as 0.5 + paid leave) | *Daily wage · N days* |
| Piece rate | **Per piece scanned** | Rate × pieces scanned in the period | *Piece rate · N pcs · M SAM min* |
| SAM based | **Per standard minute earned** | Rate × (pieces × SMV) | *Piece rate · N pcs · M SAM min* |

## Before you start

- **Shop-floor scan station** must be in use (Production → Scan station, \`/app/production/scan-station\`). See [Scan station](/app/tutorials/mfg-scan-station).
- The **operator code** typed or scanned at the station **must be exactly the worker's employee code** (upper / lower case does not matter). Otherwise the worker shows 0 pieces.
- The worker's **Structure Assignment** has a **Base salary override** equal to the minimum wage (or agreed base) for their grade — the check below uses it.

## Steps

1. On **Components** create a piece component, e.g. Code \`PIECE\`, Name "Piece earnings", type \`EARNING\`, calculation **Per piece scanned (piece rate)**, Default amount = rate per piece (e.g. \`1.20\`). For SAM pay choose **Per standard minute earned (SAM)** and enter the rate per minute.
2. Make sure the worker's structure contains this component (your administrator adds structure lines). A structure can mix a **Fixed** basic with a piece bonus on top.
3. Assign the structure to the worker with **Base salary override** = the minimum wage for the grade.
4. During the month, operators scan bundles for each operation at the Scan station with their employee code.
5. At month end open **Runs → Auto-calculate**. Check the line under **Base** (pieces and SAM minutes) for each piece-rate worker.
6. Read the **Warnings** column. If you see *"Earnings X (piece Y) are below the base salary / minimum wage Z — add a top-up before paying"*, the worker must receive at least Z.
7. Add the top-up (agree the method with your manager — for example a fixed top-up component via the worker's component overrides, then preview again) and only then **Apply** and **Finalize**.

## How the minimum-wage check works

- It runs only for workers whose pay basis is **piece rate** and who have a base salary.
- **Regular earnings = total earnings − overtime.** Every regular earning counts — piece pay **plus** any fixed basic or allowance. Overtime does **not** count towards the minimum.
- If regular earnings are below the base salary, the warning appears. A fixed basic plus a piece bonus does **not** trigger the warning as long as the total reaches the base.
- The warning does not block Apply — it is your reminder to correct the pay first.

## What happens next

The piece-rate worker's line is finalized, approved and posted like everyone else's. Piece counts are kept in the calculation snapshot for audit.

## Tips

- Bangladesh law requires that piece-rated workers are **never paid less than the minimum wage** for their grade, even in a low-output month.
- Scan corrections made **after** the month closes do not change an applied run. Re-run **Auto-calculate** and **Apply** while the run is still DRAFT.
- Daily-wage workers: late days count as full worked days; half days count as 0.5.

## Common problems

- **0 pcs for a worker who worked** → the operator code at the station was different from the employee code (e.g. a card number). Correct the code used at the station.
- **Warning "Piece-rate structure but no scanned pieces…"** → same cause, or the worker was on leave all month.
- **Pieces look doubled** → the Scan station never counts the same bundle and operation twice; check whether two operations were scanned with the same operator code.`,
      infographics: [
        {
          type: "flow",
          title: "From scan to salary",
          steps: [
            { label: "Scan station (operator code = employee code)", href: "/app/production/scan-station" },
            { label: "Auto-calculate: pieces × rate", href: "/app/hr/payroll/runs" },
            { label: "Minimum-wage check", href: "/app/hr/payroll/runs" },
            { label: "Apply → Finalize → Approve", href: "/app/hr/payroll/approvals" },
          ],
        },
        {
          type: "highlight",
          title: "Rule of thumb",
          body: "Regular earnings (everything except overtime) must reach the worker's base salary / minimum wage. If the preview warns, add a top-up before you apply.",
        },
      ],
      images: [
        {
          src: `${S}/hr-pay-component-form.jpg`,
          alt: "Add component dialog showing the calculation type drop-down",
          caption: "The calculation type on each component decides the pay basis (here: Per overtime hour; choose Per piece scanned for piece rate).",
        },
      ],
      relatedAppRoutes: ["/app/hr/payroll/components", "/app/hr/payroll/runs", "/app/production/scan-station"],
      relatedArticleIds: ["hr-pay-setup", "hr-pay-monthly-run", "mfg-scan-station", "hr-pay-troubleshooting"],
    },

    // ------------------------------------------------------------------ 5. Overtime
    {
      id: "hr-pay-overtime",
      title: "Overtime: rules, approval and how it is paid",
      summary:
        "Set overtime rules, approve overtime entries, and pay approved hours through an overtime component in payroll.",
      tags: ["HR", "payroll", "overtime", "OT"],
      keywords: ["overtime", "OT", "extra hours", "OT rate", "OT approval", "double rate", "OT hours", "night duty"],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      audience: "hr",
      coverImage: `${S}/hr-attendance-overtime.jpg`,
      content: `## Overview

Overtime (OT) pay in P7 ERP has three parts:

1. **Overtime Rules** (\`/app/hr/attendance/overtime-rules\`) — named rules with **weekday**, **weekend** and **holiday multipliers** (defaults 1.5 / 2 / 2), optionally per employee category.
2. **Overtime** entries (\`/app/hr/attendance/overtime\`) — hours per employee per day. New entries are **PENDING**; a manager clicks **Approve**.
3. A payroll **component** with calculation type **Per overtime hour** — Auto-calculate pays **rate × approved OT hours** in the period.

> **Tip:** Instead of a fixed OT rate, you can let P7 work out the rate from each person's salary (base salary ÷ 208 × multiplier). Turn on **Pay overtime from salary** on **HR → HR Settings** — see [Overtime pay from salary](/app/tutorials/hr-overtime-from-salary). The rest of this page describes the component method (the default).

## Before you start

- An OT component exists in the worker's structure (e.g. Code \`OT\`, type \`EARNING\`, **Per overtime hour**).
- Approving OT needs the **manager** or **admin** role.

## Steps

1. **Rules (once):** open **HR → Time & Attendance → Overtime Rules**. Fill **Code**, **Name**, optional **Employee category**, **Weekday mult**, **Weekend mult**, **Holiday mult**, and click **Add rule**. Edit later with **Actions → Edit**.
2. **Daily:** OT hours are recorded as overtime entries (status **PENDING**).
3. **Approve:** open **HR → Time & Attendance → Overtime**. For each **PENDING** row check **Emp**, **Date** and **Hours**, then click **Approve**. The status becomes **APPROVED**.
4. **Pay:** at month end, **Runs → Auto-calculate** sums all **APPROVED** (and posted) OT hours dated inside the period and multiplies them by the OT component's rate. The OT amount is part of **Earnings / Gross**.

## How the OT amount is worked out

- **OT pay = OT component rate × approved OT hours in the period.**
- Auto-calculate does **not** multiply again by the rule's multiplier. Enter the **final hourly OT rate** (already doubled if your rule is "2×") as the component amount, or per worker through **Component overrides** on the structure assignment, e.g. \`{"OT":"76.92"}\`.
- Overtime is **excluded** from the piece-rate minimum-wage check.

## Bangladesh labour law notes (general guidance)

- Overtime is normally paid at **twice the ordinary hourly rate of basic wage** (plus dearness / ad-hoc allowance if any).
- A common factory method for the hourly basic rate is **monthly basic ÷ 208 hours**; OT rate = that × 2. Example: basic 8,000 → 8,000 ÷ 208 × 2 ≈ 76.92 per hour.
- Normal working time is 8 hours a day / 48 a week; with overtime, usually not more than 10 hours a day and an average of 56 hours a week.
- Always confirm current rules with your compliance team or legal adviser — buyers' codes of conduct may be stricter.

## What happens next

The OT amount is stored on the run line (overtime amount) and appears in the payslip's earnings once the run is approved and payslips are generated.

## Tips

- Approve OT **before** month end; pending OT is not paid.
- Use one OT component per rate if weekday and holiday OT are paid differently, and record those hours separately.

## Common problems

- **OT not in the preview** → the entry is still **PENDING**, or its date is outside the period.
- **OT amount half of what you expected** → the component holds the plain hourly rate; put the doubled rate.
- **No Approve button** → the entry is not pending, or you do not have the manager/admin role.`,
      infographics: [
        {
          type: "flow",
          title: "Overtime to pay",
          steps: [
            { label: "Overtime Rules", href: "/app/hr/attendance/overtime-rules" },
            { label: "OT entry (PENDING)", href: "/app/hr/attendance/overtime" },
            { label: "Approve (APPROVED)", href: "/app/hr/attendance/overtime" },
            { label: "Auto-calculate: rate × hours", href: "/app/hr/payroll/runs" },
          ],
        },
      ],
      images: [
        {
          src: `${S}/hr-pay-ot-rules.jpg`,
          alt: "Overtime rules page with the add rule form and weekday and weekend multipliers",
          caption: "Overtime Rules — multipliers by category.",
        },
        {
          src: `${S}/hr-attendance-overtime.jpg`,
          alt: "Overtime entries list with status and Approve buttons",
          caption: "Overtime — approve PENDING entries before running payroll.",
        },
      ],
      relatedAppRoutes: [
        "/app/hr/attendance/overtime-rules",
        "/app/hr/attendance/overtime",
        "/app/hr/payroll/components",
        "/app/hr/payroll/runs",
      ],
      relatedArticleIds: ["hr-pay-setup", "hr-pay-monthly-run", "hr-overtime-from-salary", "hr-overview"],
    },

    // ------------------------------------------------------------------ 5b. Overtime from salary
    {
      id: "hr-overtime-from-salary",
      title: "Overtime pay from salary",
      summary: "Pay approved overtime as hours × (base salary ÷ 208) × multiplier in payroll auto-calculate.",
      tags: ["HR", "payroll", "overtime", "OT", "salary", "settings"],
      keywords: ["208", "overtime rate", "double rate", "OT_SALARY"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      audience: "hr",
      content: `## Overview

When **Pay overtime from salary** is on (**HR → HR Settings**, \`/app/hr/settings\`), payroll auto-calculate adds an **Overtime (from salary)** earning line (code \`OT_SALARY\`) for every employee with approved overtime. It is **off** by default.

## How the amount is worked out

- Hourly rate = monthly **base salary** on the structure assignment ÷ **Hours per month** (default **208**, the Bangladesh rule).
- Each **approved** overtime entry pays hours × hourly rate × multiplier.
- Multiplier = the entry's **Overtime rule** (weekday, weekend or holiday multiplier by OT type; the rule's **max OT hours per day** caps the hours paid per day). Without a rule, the **Default multiplier** from HR Settings is used (default **2**).
- A salary change in the middle of the month is handled: each entry uses the salary in effect on its date. Entries before joining or after the exit date are not paid.
- Overtime is **not** reduced by loss of pay.
- Salary components of type **Per OT hour** pay 0 while this is on, so overtime is never paid twice (the preview shows a warning).

## Turning it on

1. Make sure overtime entries are approved on **Overtime** (\`/app/hr/attendance/overtime\`) and rules are set on **Overtime Rules**.
2. On **HR Settings**, tick **Pay overtime from salary**, check the hours and multiplier, then **Save overtime settings** (needs manager / admin or **hr.payroll.manage**).
3. On **Payroll → Runs**, preview auto-calculate: the gross column shows OT hours, hourly rate and amount.

> **Warning:** A payroll run keeps the overtime method of its **first** auto-calculation. Runs calculated before you switched this on keep their old numbers; new runs use the new method.`,
      relatedAppRoutes: ["/app/hr/settings", "/app/hr/payroll/runs", "/app/hr/attendance/overtime-rules"],
      relatedArticleIds: ["hr-overview", "hr-attendance-devices", "hr-pay-overtime"],
    },

    // ------------------------------------------------------------------ 6. Bonus + advances
    {
      id: "hr-pay-bonus-advances",
      title: "Festival bonus, advances and loans",
      summary:
        "Declare festival and other bonuses, issue salary advances with a monthly recovery amount, and make sure both reach the salary sheet.",
      tags: ["HR", "payroll", "bonus", "festival bonus", "advance", "loan"],
      keywords: [
        "festival bonus",
        "Eid bonus",
        "Puja bonus",
        "utsab bhata",
        "attendance bonus",
        "performance bonus",
        "salary advance",
        "loan",
        "advance recovery",
        "installment",
        "deduction",
      ],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      audience: "hr",
      coverImage: `${S}/hr-payroll-bonuses.jpg`,
      content: `## Overview

- **Bonuses** (\`/app/hr/payroll/bonuses\`) — record a bonus **declaration**: **Festival**, **Attendance** or **Performance**, for a period, with an amount or percentage.
- **Advances & Loans** (\`/app/hr/payroll/advances\`) — record money paid to an employee in advance and the **Monthly deduction** to recover it. The list shows **Amount**, **Outstanding** and **Status**.

Creating bonus declarations and advances needs the **manager** or **admin** role.

## Before you start

- Know the employee's **ID** number (shown on the employee record) — the advance form asks for **Employee ID**.
- Agree the bonus policy (who is eligible, amount or % of basic) with management.

## Steps — festival bonus

1. Open **HR → Payroll → Bonuses**.
2. Choose the type (**Festival**, **Attendance** or **Performance**).
3. Enter **Period code** (e.g. the payroll period the bonus is paid with, \`PR-2027-03\`), a **Title** (e.g. "Eid-ul-Fitr bonus 2027") and **Amount or %**.
4. Click **Create declaration**. The declaration is listed with status **DRAFT**.
5. **Paying it:** the declaration is a record of the decision. Auto-calculate does not read it, so pay the bonus through a **bonus earning component** (for example \`FBONUS\`, **% of base salary** or **Fixed**) in the structure for the bonus month, or as a separate payment agreed with accounts.

## Steps — salary advance or loan

1. Open **HR → Payroll → Advances & Loans**.
2. Enter **Employee ID**, **Amount**, **Monthly deduction** and a **Reason**.
3. Click **Issue advance**. It appears as **ACTIVE** with **Outstanding** = the amount.
4. **Recovering it:** Auto-calculate does not deduct advances on its own yet. Recover the instalment through a **deduction component** (e.g. \`ADV\`, **Fixed**) in the worker's structure, setting the amount per person with **Component overrides** such as \`{"ADV":"1000"}\` on the structure assignment. Remove the override when the advance is fully recovered.
5. Pay the advance itself from Finance with a payment voucher — see [Voucher entry](/app/tutorials/fin-voucher-entry).

## What happens next

The bonus or advance recovery appears as a line in the Auto-calculate breakdown, then on the payslip after approval.

## Bangladesh labour law notes (general guidance)

- Workers with at least **one year of continuous service** are entitled to **two festival bonuses a year**, each **not more than one month's basic wage** (Bangladesh Labour Rules).
- Pay festival bonuses **before** the festival.
- Deductions from wages (including advance recovery) are limited by law; keep a signed advance agreement on file.

## Tips

- Use the **Period code** of the month the bonus is paid so reports line up.
- Check the **Outstanding** column on **Advances & Loans** during [final settlement](/app/tutorials/hr-pay-final-settlement).

## Common problems

- **"Employee not found" when issuing an advance** → the Employee ID is the internal number of the employee record, not the employee code.
- **Bonus not in the salary** → declarations are not added automatically; add the bonus component as described above.
- **"Only manager/admin can perform this action"** → ask a manager to create the declaration or advance.`,
      images: [
        {
          src: `${S}/hr-payroll-bonuses.jpg`,
          alt: "Bonuses page with bonus type, period code, title and amount fields and the Create declaration button",
          caption: "Bonuses — declarations start as DRAFT.",
        },
        {
          src: `${S}/hr-payroll-advances.jpg`,
          alt: "Employee advances and loans page with Issue advance form and outstanding column",
          caption: "Advances & Loans — watch the Outstanding column.",
        },
      ],
      infographics: [
        {
          type: "highlight",
          title: "Important",
          body: "Bonus declarations and advance records are registers. To put the money on the salary sheet, use a bonus earning component or an advance-recovery deduction component in the structure.",
        },
      ],
      relatedAppRoutes: ["/app/hr/payroll/bonuses", "/app/hr/payroll/advances", "/app/hr/payroll/assignments"],
      relatedArticleIds: ["hr-pay-setup", "hr-pay-monthly-run", "hr-pay-final-settlement", "fin-voucher-entry"],
    },

    // ------------------------------------------------------------------ 7. Payslips & bank
    {
      id: "hr-pay-payslips-bank",
      title: "Payslips, bank advice file and posting to Finance",
      summary:
        "Generate and download payslips, export the bank CSV for salary transfer, and understand the journal voucher that Post GL creates.",
      tags: ["HR", "payroll", "payslip", "bank", "finance", "GL"],
      keywords: [
        "payslip",
        "pay slip",
        "salary slip",
        "bank advice",
        "bank file",
        "salary transfer",
        "bKash",
        "Nagad",
        "mobile wallet",
        "salary voucher",
        "post GL",
        "journal",
        "salary payable",
      ],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      audience: "hr",
      coverImage: `${S}/hr-payroll-payslips.jpg`,
      content: `## Overview

After a run is **approved**, three outputs come from the **Runs** screen:

| Button on Runs | Allowed when | Result |
|---|---|---|
| **Post GL** | APPROVED | Posted journal voucher; run becomes **POSTED** |
| **Payslips** | APPROVED or POSTED | One payslip per employee (number like \`PS-0007-0123\`) |
| **Bank CSV** | Any time (manager / admin) | File \`payroll-run-<id>-bank.csv\` with \`employee_code, net_pay, currency\` (BDT) |

## Before you start

- The run is **APPROVED** (see [Run monthly payroll](/app/tutorials/hr-pay-monthly-run)).
- **Accounting Config** holds the salary expense and salary payable accounts, and an **open accounting period** covers the period's **payment date** (Finance → Accounting periods).
- You have the **admin** or **manager** role.

## Steps

1. Open **HR → Payroll → Runs** and find the approved run.
2. Click **Post GL**. The message shows the voucher number. The run's status becomes **POSTED**.
3. Click **Payslips**. Payslips are created for every line (running it again does not create duplicates).
4. Click **Bank CSV** and send the file to the bank / wallet provider in the format they need.
5. Open **HR → Payroll → Payslips** (\`/app/hr/payroll/payslips\`) to see every payslip with **Payroll Run ID**, **Employee ID**, **Gross**, **Deductions**, **Net** and **Status** (*generated*). In the box below the table click **Download** next to a payslip to get the PDF.
6. Employees open **HR → Self-Service → My Payslips** (\`/app/hr/ess/payslips\`) to download their own.

## What Post GL writes in the books

- One **Journal** voucher, numbered \`PR\` + run id (e.g. \`PR00012\`), status **Posted**, dated on the period's **payment date**, source *Payroll*, and **not editable by hand**.
- **Debit** salary expense and **credit** salary payable for the run's **net** total.
- If **Statutory payroll** is on and a bank account is set in the accounting configuration, a second journal for statutory remittance (PF / other dues) may be created.
- Accounts then pays salaries: payment voucher **debit salary payable, credit bank / cash** — see [Voucher entry](/app/tutorials/fin-voucher-entry) and [Finance overview](/app/tutorials/fin-overview).

## Tips

- Post first, then pay — the payable balance should go to zero after the salary payment.
- Payslip access: managers / admins (or users with the **view all payslips** permission) see everybody's payslips; other users see only their own, and only if their login is linked to an employee record.

## Common problems

- **"No accounting period found for payroll payment date"** → ask Finance to create the accounting period for that month.
- **"Accounting period is locked/closed; payroll posting blocked"** → Finance must reopen the period or you must use a payment date in an open month.
- **"Cannot resolve payroll GL accounts…"** → fill **Accounting Config** (salary expense and payable account IDs).
- **"Payslips can be generated for approved/posted runs only"** → approve the run first.
- **"Employee profile not linked with current user"** or **"You can only view your own payslips"** (employee) → the login is not linked to an employee record; ask HR to link it on the employee record.`,
      images: [
        {
          src: `${S}/hr-payroll-payslips.jpg`,
          alt: "Payslips list with payroll run, employee, gross, deductions, net and a download section",
          caption: "Payslips — download a PDF from the box below the table.",
        },
        {
          src: `${S}/hr-payroll-accounting-config.jpg`,
          alt: "Payroll GL mapping form",
          caption: "Accounting Config — accounts used by Post GL.",
        },
        {
          src: `${S}/hr-ess-payslips.jpg`,
          alt: "My Payslips page showing the message Employee profile not linked with current user",
          caption: "My Payslips — this red message means the login is not linked to an employee record yet; HR must link it before payslips show.",
        },
      ],
      infographics: [
        {
          type: "flow",
          title: "From approval to payment",
          steps: [
            { label: "APPROVED run", href: "/app/hr/payroll/approvals" },
            { label: "Post GL (journal)", href: "/app/hr/payroll/runs" },
            { label: "Payslips", href: "/app/hr/payroll/payslips" },
            { label: "Bank CSV", href: "/app/hr/payroll/runs" },
            { label: "Payment voucher", href: "/app/accounts/vouchers" },
          ],
        },
      ],
      relatedAppRoutes: [
        "/app/hr/payroll/runs",
        "/app/hr/payroll/payslips",
        "/app/hr/payroll/accounting-config",
        "/app/hr/ess/payslips",
        "/app/accounts/vouchers",
      ],
      relatedArticleIds: ["hr-pay-monthly-run", "fin-voucher-entry", "fin-overview", "hr-overview"],
    },

    // ------------------------------------------------------------------ 8. Statutory & tax
    {
      id: "hr-pay-statutory-tax",
      title: "Statutory deductions and tax on salary",
      summary:
        "Use the Bangladesh payroll statutory calculator, the optional statutory config for PF and other contributions, and a tax deduction component for salary tax.",
      tags: ["HR", "payroll", "statutory", "tax", "PF", "compliance"],
      keywords: [
        "statutory",
        "provident fund",
        "PF",
        "AIT",
        "TDS",
        "income tax",
        "salary tax",
        "tax deduction",
        "gratuity",
        "compliance",
        "labour law",
        "NBR",
      ],
      estimatedMinutes: 7,
      lastUpdated: "2026-11-06",
      audience: "hr",
      coverImage: `${S}/hr-pay-settings-statutory-tab.jpg`,
      content: `## Overview

P7 ERP offers three tools for statutory payroll items:

1. **Settings → Statutory compliance → Payroll statutory** (\`/app/settings/statutory-compliance\`) — a quick **calculator**: enter **Gross pay (BDT)**, **AIT %**, **PF emp %** and **PF er %**, click **Calculate**, and see **Gross total**, **AIT**, **PF (employee)**, **PF (employer)** and **Net payable**. Tick **Save summary for period** (Year, Month) to keep the result.
2. **HR → Payroll → Statutory Config** (\`/app/hr/payroll/statutory\`) — appears only when the tenant switch **Statutory payroll** is on (**Settings → Configuration**). It stores rates that **Auto-calculate adds to every run**: **PF employee / employer rate %**, **PF wage ceiling**, **ESI** rates and ceiling, **PT state** and **PT slabs**, and **Gratuity days per year**. **Run preview** shows the result for a sample basic and gross.
3. A normal **DEDUCTION component** such as \`TAX\` for monthly salary tax.

## Before you start

- Agree the rates with your accountant / tax adviser.
- Changing the Statutory payroll switch or saving the statutory config needs admin rights.

## Steps — quick calculator

1. Open **Settings → Statutory compliance** and click the **Payroll statutory** tab.
2. Enter **Gross pay (BDT)**, **AIT %**, **PF emp %**, **PF er %**.
3. Click **Calculate** and read the results. It is a calculator only — it does not change any payroll run.

## Steps — statutory lines inside payroll (optional)

1. Ask an admin to tick **Statutory payroll** in **Settings → Configuration**.
2. Open **HR → Payroll → Statutory Config**.
3. Set **PF employee rate %** and **PF employer rate %** to your provident fund rules. **ESI** and **PT** (professional tax) are Indian schemes — in Bangladesh set their rates and slabs to **0** unless your adviser says otherwise.
4. Click **Save config**, then use **Run preview** with a sample basic and gross to check.
5. In the next **Auto-calculate** preview, employee shares (e.g. *PF Employee Contribution*) appear under **Statutory Deductions** and reduce net pay; employer shares are shown under **Statutory** but are **not** paid to the worker.

## Steps — tax on salary

1. Create a component \`TAX\`, type \`DEDUCTION\`, **Fixed amount**, and make sure it is in the structures of tax-paying staff.
2. For each person set the monthly tax with **Component overrides** on their structure assignment, e.g. \`{"TAX":"1500"}\`.
3. Update the amount when the yearly tax estimate changes.

## Bangladesh notes (general guidance)

- Salary income tax in Bangladesh is based on **yearly income and tax slabs**, not a flat rate. The calculator's **AIT %** is a simple flat percentage — use it for estimates only and take the monthly figure from your tax adviser.
- A **provident fund** is voluntary unless your company has a recognised fund; follow its trust rules for the rates.
- Many employers keep a gratuity or service-benefit policy; the **Gratuity (sample)** figure on Statutory Config uses **Gratuity days per year** × years of service and is for reference only.

## What happens next

When statutory payroll is on and the run is posted, a statutory remittance journal can be created if the payroll accounting configuration has a bank account. Pay the dues to the fund / tax authority through Finance.

## Common problems

- **Statutory Config not in the sidebar** → the **Statutory payroll** switch is off.
- **Statutory Config shows 12 % PF or Maharashtra PT slabs** → these are the built-in sample defaults, not Bangladesh rules. Check every value with your compliance team before you save.
- **PF counted twice** → the structure already has a PF line flagged as PF; the automatic PF line is then skipped. Keep only one method.
- **"Preview failed"** → a rate field is empty or not a number.`,
      images: [
        {
          src: `${S}/hr-pay-settings-statutory-tab.jpg`,
          alt: "Bangladesh statutory compliance settings on the Payroll statutory tab with gross pay, AIT and PF fields",
          caption: "Settings → Statutory compliance → Payroll statutory calculator.",
        },
        {
          src: `${S}/hr-payroll-statutory.jpg`,
          alt: "HR Payroll Statutory Config screen with provident fund, insurance and tax settings and a Run preview button",
          caption: "HR → Payroll → Statutory Config. The built-in defaults are samples — confirm every rate with your compliance team.",
        },
      ],
      relatedAppRoutes: ["/app/settings/statutory-compliance", "/app/hr/payroll/statutory", "/app/settings/config"],
      relatedArticleIds: ["hr-pay-setup", "hr-pay-monthly-run", "hr-pay-payslips-bank", "fin-overview"],
    },

    // ------------------------------------------------------------------ 9. Final settlement
    {
      id: "hr-pay-final-settlement",
      title: "Final settlement when an employee leaves",
      summary:
        "Separation, department clearance and the calculated final settlement (salary to the last day, leave encashment, service benefit, notice pay, advances), then approve, post and pay.",
      tags: ["HR", "payroll", "final settlement", "resignation", "separation"],
      keywords: [
        "final settlement",
        "full and final",
        "F&F",
        "resignation",
        "termination",
        "retirement",
        "separation",
        "leave encashment",
        "notice pay",
        "service benefit",
        "gratuity",
        "clearance",
      ],
      estimatedMinutes: 8,
      lastUpdated: "2026-11-07",
      audience: "hr",
      coverImage: `${S}/hr-payroll-assignments.jpg`,
      content: `## Overview

When someone leaves, they must receive everything owed: salary up to the last working day, approved overtime and allowances, earned-leave encashment, notice pay and the service benefit (gratuity / resignation / termination / death benefit), minus notice recovery, unpaid advances and clearance recoveries.

**HR → Core HR → Separations & Settlement** (\`/app/hr/separations\`) calculates all of this from attendance, the approved Bangladesh rule set and the employee's pay, and posts one balanced voucher.

**Who uses it:** HR officers (create, clearance, calculate), a manager or admin (approve, post, mark paid, reverse).

## Before you start

- Attendance is entered up to the last day and overtime is **approved**.
- If the month's payroll run already includes the person, the settlement does **not** pay that salary again (you see a warning). Salary for days not in any run is paid by the settlement.
- Unauthorised absence is different: start it on **Notices & Cases** (s.27(3A)). Its decision creates the separation here.

## Steps

1. Open **HR → Core HR → Separations & Settlement** and click **New separation**.
2. Choose the employee and the **Type** (resignation, termination, retrenchment, dismissal, retirement, death), then the **Request / notice date**, **Last working day**, **Effective date** and **Notice days served**. Click **Create** (status **DRAFT**).
3. On the row click **Actions → Approve** (manager / admin).
4. **Actions → Open** shows two panels. In **Clearance** add one item per department (ID card, tools, locker key…) with any **Recoverable (Tk)** amount, then **Actions → Mark cleared** or **Waive** on each.
5. In **Final settlement** click **Preview** to see the figures and warnings, then **Calculate & save** (status **DRAFT**). You can **Recalculate** while it is a draft.
6. **Approve** (needs every clearance item done), then **Post voucher** — one balanced journal is posted to the books.
7. After paying, click **Mark paid** and type the payment reference (cheque, bank, bKash or cash receipt). The separation shows **SETTLED**.

## What happens next

- Approved tiffin / dinner / night bills, production bonus, festival bonus lines and festival-work compensation not yet in payroll are paid once, inside the settlement.
- A posted settlement can be corrected only with **Reverse** (a new reversal voucher); posted vouchers are never edited.
- End the person's **Structure Assignment** and deactivate the employee record when everything is paid.

## Bangladesh labour law notes

- Final dues are payable within **30 working days** of separation (s.30).
- Service benefit depends on the reason and length of service; the **Bangladesh Rules → Checks & calculators** tab shows the legal section used for each amount.

## Common problems

- **"Approve the separation first"** → the separation is still DRAFT.
- **"Clearance is not complete"** → an item is still **PENDING**.
- **Salary shows 0 with a warning** → the salary is already in a payroll run (paid once, through payroll), or the person has no salary assignment on the last day.
- **"Recoveries exceed the amount payable"** → the employee still owes the remainder; recover it separately.`,
      infographics: [
        {
          type: "flow",
          title: "Separation to payment",
          steps: [
            { label: "New separation", href: "/app/hr/separations" },
            { label: "Approve" },
            { label: "Clearance" },
            { label: "Calculate settlement" },
            { label: "Approve & post voucher" },
            { label: "Mark paid" },
          ],
        },
      ],
      relatedAppRoutes: ["/app/hr/separations", "/app/hr/payroll/assignments", "/app/hr/payroll/advances", "/app/accounts/vouchers"],
      relatedArticleIds: ["hr-pay-monthly-run", "hr-pay-bonus-advances", "hr-cases-notices", "hr-bd-setup", "fin-voucher-entry", "hr-overview"],
    },

    // ------------------------------------------------------------------ 10. Troubleshooting
    {
      id: "hr-pay-troubleshooting",
      title: "Payroll troubleshooting: common problems and fixes",
      summary:
        "Fixes for the payroll problems people hit most: minimum-wage warning, missing attendance or assignment, locked period, duplicate run and posting errors.",
      tags: ["HR", "payroll", "troubleshooting", "errors"],
      keywords: [
        "payroll error",
        "minimum wage warning",
        "missing assignment",
        "locked period",
        "cannot finalize",
        "run already exists",
        "salary wrong",
        "net pay wrong",
        "payroll not posting",
        "problem",
        "help",
      ],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      audience: "hr",
      coverImage: `${S}/hr-payroll-runs.jpg`,
      content: `## Overview

Use this page when a payroll number looks wrong or a button gives an error. Find the symptom, then follow the fix. Most problems come from **source data** (attendance, leave, overtime, assignments) rather than from payroll itself.

## Before you start

Open the run's **Auto-calculate** preview — its **Warnings** and the **Breakdown** usually point to the cause. The preview is safe: nothing is saved until **Apply**.

## Steps — check in this order

1. **Is the employee in the preview?** If not, they are inactive or have no assignment on the run date.
2. **Is the Status "Ready"?** *Missing Assignment* → add an assignment. *Manual Override Exists* → a hand-entered line exists; tick **Force overwrite manual** only if you want to replace it.
3. **Are the inputs right?** Compare days, OT hours and pieces with **Attendance → Summary**, **Overtime** and the Scan station.
4. **Are the rates right?** Check the components and the person's **Base salary override** / overrides on **Structure Assignments**.
5. Fix, then click **Auto-calculate** again and **Apply** while the run is still DRAFT or REJECTED.

## Common problems

### Minimum-wage warning

*"Earnings X (piece Y) are below the base salary / minimum wage Z — add a top-up before paying."*
- Applies to piece-rate workers only. Regular earnings (all earnings except overtime) are below the base salary on the assignment.
- Fix: check scans (operator code = employee code), then add a top-up so the worker gets at least Z. If the base salary itself is wrong, correct the assignment. Details: [Piece-rate workers](/app/tutorials/hr-pay-piece-rate).

### Missing or wrong attendance

- Days come only from **Daily Entry** records dated inside the period. **Present**, **Late** and **Work from home** count as 1 day, **Half day** as 0.5; **Absent** counts 0.
- With **Loss of pay** on (flag \`payroll_lop_enabled\`, on unless set to false), **Fixed** and **% of base salary** lines are paid only for payable days: days employed in the period minus unexcused **Absent** days and approved **unpaid** leave. The preview shows the LOP days and amount. With the flag off, fixed lines are not reduced and only **Per day present** lines change with attendance.
- Fix: enter or regularise attendance (HR → Time & Attendance → Daily Entry / Regularizations), then preview again.

### Overtime missing

- Only **APPROVED** overtime dated inside the period is paid. Approve pending rows on **Overtime**.

### Locked period

- *"Payroll period is locked"* or *"Payroll period is locked; auto-calculate rejected"* → the period was finalized. Locked periods cannot get new runs or recalculation. Corrections go into the next month's run (or a voucher agreed with accounts).

### Run already exists / cannot create run

- *"Payroll run … already exists for this period; reject it before creating another"* → reject the existing run first.
- *"run_date must be inside payroll period"* → pick a date between the period's start and end.

### Cannot finalize / approve / post

- *"Cannot finalize run without payroll lines"* → click **Auto-calculate** and **Apply** first.
- *"Only finalized run can be approved"* → finalize first.
- *"Only manager/admin can perform this action"* → a manager or admin must do this step.
- *"No accounting period found for payroll payment date"* / *"Accounting period is locked/closed"* → ask Finance to open the period.
- *"Cannot resolve payroll GL accounts…"* → fill **Accounting Config**.
- *"Cannot reject a POSTED payroll run"* → posted runs are in the books; correct in the next run or with a Finance voucher.

### Auto-calculate disabled

- *"Payroll auto-calculation is disabled. Enable 'payroll_auto_calculate_enabled' in Settings → Configuration."* → an admin ticks **Payroll auto-calculate** in **Settings → Configuration → HR payroll**. (The help text there mentions preview being always available, but in practice both preview and apply need this switch.)

### Net pay looks too high or too low

- Open **Breakdown → Show** (when statutory lines exist) or compare **Earnings** and **Deductions**.
- Check for a missing deduction component (tax, advance recovery) or an override left from an earlier month.

## What happens next

After fixing, re-apply and finalize. If the run was already **approved** but not posted, a manager can **Reject** it to reopen it.

## Tips

- Close attendance, leave and OT approvals two days before payroll day.
- Keep a short monthly checklist: assignments for new joiners, ended assignments for leavers, advances, bonus month.`,
      infographics: [
        {
          type: "highlight",
          title: "First check",
          body: "Open Runs → Auto-calculate and read the Warnings column. It is read-only, so you can check as often as you like.",
        },
        {
          type: "diagram",
          title: "Where the numbers come from",
          imageSrc: `${D}/gross-to-net.svg`,
          imageAlt: "Gross-to-net calculation order diagram",
        },
      ],
      images: [
        {
          src: `${S}/hr-payroll-periods.jpg`,
          alt: "Payroll periods list with status and locked columns",
          caption: "Periods — Locked: Yes means no new runs for that month.",
        },
      ],
      relatedAppRoutes: [
        "/app/hr/payroll/runs",
        "/app/hr/payroll/periods",
        "/app/hr/payroll/assignments",
        "/app/hr/attendance/entries",
        "/app/hr/attendance/summary",
        "/app/hr/attendance/overtime",
      ],
      relatedArticleIds: [
        "hr-pay-monthly-run",
        "hr-pay-piece-rate",
        "hr-pay-overtime",
        "hr-pay-setup",
        "hr-overview",
      ],
    },

    // ------------------------------------------------------------------ 11. Salary sheets & registers
    {
      id: "hr-pay-salary-registers",
      title: "Department salary sheets, top sheet, wage register and private wage slips",
      summary:
        "Freeze a finalized payroll run, then print the department-wise salary sheet with its top sheet, the wage register and one private wage slip per employee, and record how each worker was paid.",
      tags: ["HR", "payroll", "salary sheet", "wage register", "payslip"],
      keywords: ["salary sheet", "top sheet", "department wise", "wage register", "form 38", "wage slip", "payslip zip", "acknowledgement", "revenue stamp", "bKash salary"],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-07",
      audience: "hr",
      content: `## Overview

**Salary Sheets & Registers** prints everything from one frozen copy of a payroll run, so every sheet and slip shows the same figures even if someone edits the run later.

**Who uses it:** payroll officers and HR managers (\`hr.payroll.manage\`).

## Before you start

- The payroll run is **FINALIZED**, **APPROVED** or **POSTED**. Close every day on **Manual IN / OUT → Missing OUT** first — a run cannot be finalized while days are open.

## Steps

1. Open **HR → Payroll → Salary Sheets & Registers** (\`/app/hr/payroll/registers\`) and choose the **Payroll run**.
2. If it says the run is not frozen, click **Freeze documents**.
3. **Top sheet** tab: one line per department with employees, present / absent / paid-leave days, OT hours and amount, allowances, gross, deductions and net pay, plus the grand total.
4. **Department sheets** tab: every employee in each department. Pick a **Department** to see only one.
5. Print with **Print salary sheet + top sheet** (all departments, or the chosen one), **Wage register (Form 38)** and **Private wage slips (ZIP)** — one PDF per employee to hand out individually.
6. **Payments** tab: choose the **Payment method** (cash with signature, mobile financial service, or bank transfer) and click **Actions → Record payment** on each row. Cash needs the worker's signature; MFS and bank need the transaction reference.

> **Warning:** Wage slips are private. Do not pin individual salaries on the notice board; give each worker their own slip.

## Common problems

- **"Freeze the payroll documents first"** → click **Freeze documents**.
- **"Totals do not match the run"** → finalize the run again, then freeze.
- **A run is missing from the list** → it is still DRAFT; finalize it first.`,
      infographics: [
        {
          type: "flow",
          title: "From run to payment",
          steps: [
            { label: "Finalize run", href: "/app/hr/payroll/runs" },
            { label: "Freeze documents", href: "/app/hr/payroll/registers" },
            { label: "Print sheets & slips" },
            { label: "Record payments" },
          ],
        },
      ],
      relatedAppRoutes: ["/app/hr/payroll/registers"],
      relatedArticleIds: ["hr-pay-monthly-run", "hr-pay-payslips-bank", "hr-manual-attendance"],
    },

    // ------------------------------------------------------------------ 12. Allowances & bonuses
    {
      id: "hr-pay-allowances-bonuses",
      title: "Tiffin, dinner and night bills, production bonus and Eid bonus",
      summary:
        "Set bill rules from attendance, calculate production bonus from output and allocate the festival bonus; each is approved by a manager and paid once in the next payroll run.",
      tags: ["HR", "payroll", "allowance", "bonus", "tiffin bill", "night bill"],
      keywords: ["tiffin bill", "dinner bill", "night bill", "production bonus", "piece rate bonus", "efficiency bonus", "eid bonus", "festival bonus", "utsob bonus"],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-07",
      audience: "hr",
      content: `## Overview

**Allowances & Bonuses** (\`/app/hr/payroll/allowances\`) has three tabs. Each item is generated, checked, approved by a manager or admin, then added to the next payroll run (or a final settlement) exactly once.

## Before you start

An admin turns on the parts you use under **Settings → Configuration**: **HR tiffin / dinner / night bills**, **HR production bonus**, **HR Eid / festival bonus**. They are off by default and the menu item appears once one is on.

## Tiffin / dinner / night bills

1. Add a **Bill rule**: code, name, bill type, **Who gets it** (every present day, night-shift day, worked at least N minutes, or overtime at least N minutes), the amount per day and the start date. A manager clicks **Actions → Approve**.
2. Choose **From / To**, click **Preview** to see the count and totals, then **Generate**.
3. Review the **Bills** list (**Actions → Correct amount** with a reason, or **Reject**), then **Approve all pending**.

## Production bonus

1. Add a scheme: per piece, efficiency above a threshold, or a fixed bonus for reaching a target, with an optional cap. A manager approves it.
2. Choose the scheme, a **Period code** and dates, and click **Calculate**.
3. Check the entries and click **Approve all pending**.

## Eid / festival bonus

1. Create the bonus declaration on **HR → Payroll → Bonuses**.
2. On the **Eid / festival bonus** tab choose the declaration, the **Service cut-off date** and **% of basic** (up to 100), then **Allocate**. Employees with less than one year of service are listed as not eligible.
3. Check the lines and the total, then **Approve**.

> **Tip:** The festival bonus is set up as company policy; Prime7 does not label it as a statutory amount.

## Common problems

- **"… is switched off for this company (Settings > Configuration)"** → an admin must turn the switch on.
- **An approved bill is not in payroll** → it is paid in the next run that covers its date; items already in a run or settlement are not paid again.`,
      relatedAppRoutes: ["/app/hr/payroll/allowances", "/app/hr/payroll/bonuses", "/app/settings/config"],
      relatedArticleIds: ["hr-pay-bonus-advances", "hr-pay-monthly-run", "hr-pay-final-settlement"],
    },
  ],
};

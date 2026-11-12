import type { TutorialSection } from "../types";

/**
 * HR (everything except payroll processing — see `hr-payroll.ts`).
 * Screens: `frontend/src/pages/app/hr/` (+ `ess/`, `attendance/`, `leave/`, `recruitment/`, `performance/`).
 * Assets: `public/tutorials/screens/hr-*.jpg`, `public/tutorials/videos/hr-*.webm`, `public/tutorials/diagrams/hr/`.
 */
export const hrSection: TutorialSection = {
  id: "hr",
  title: "HR",
  description:
    "Employees, departments, shifts, attendance, overtime, leave, hiring, performance and employee self-service (ESS).",
  articles: [
    {
      id: "hr-overview",
      title: "HR module map",
      summary:
        "Find every HR screen in the sidebar, learn the order to set things up, and see how attendance and leave feed payroll.",
      featured: true,
      estimatedMinutes: 6,
      content: `## Overview

The **HR** section of the sidebar holds everything about your people: who works here, which shift they work, whether they came to work, their leave, their pay, hiring, performance and the employee's own self-service pages.

**Who uses it:** HR officers and admin staff (daily), line supervisors and managers (approvals), accounts (payroll), and every employee (**My HR**).

**Why it matters:** payroll can only be correct when the employee master, attendance and leave are correct. Set up HR in the order below and keep it up to date every day.

## Before you start

- You need an HR, manager or admin role. Some actions are limited to **manager / admin** (approvals, holidays, overtime rules, carry forward).
- Two fine-grained permission keys exist under **Settings → Roles**: \`hr.attendance.manage\` (edit a saved attendance entry) and \`hr.leave.types.manage\` (create or change leave types). Without them, only a manager or admin can do these jobs.
- Some screens appear only when a feature flag is on (ask your admin to check **Settings → Configuration**): **AI Onboarding** (OCR flags), **Compliance** (\`compliance_tracking_enabled\`), **AI Insights** (HR AI flags) and **Statutory Config** (\`statutory_payroll_enabled\`).

## Steps — where everything is

The HR sidebar has six groups with 16 links. Most links open **one page with tabs along the top** — click a tab to switch screens. The open tab is part of the web address, so you can bookmark it or send the link to a colleague. Old links and bookmarks still work and open the matching tab. Press **Ctrl+K** and type a tab name (for example "Payslips") to jump straight to it.

1. **Main**
   - **HR Dashboard** (\`/app/hr\`) — clickable cards for employees, today's attendance, pending leave, payroll queue and open hiring, a **Needs your attention** list and quick links.
   - **Employees** (\`/app/hr/employees\`) — the employee list and records. The **AI onboarding** button (when the OCR flags are on) scans a CV or NID.
   - **My HR** (\`/app/hr/my\`) — tabs **Profile**, **Attendance**, **Leave**, **Payslips**, **Tickets** (for every employee).
2. **Daily work**
   - **Attendance** (\`/app/hr/attendance\`) — tabs **Daily entry**, **Manual IN / OUT**, **Regularizations**, **Overtime**, **Summary**.
   - **Leave** (\`/app/hr/leave\`) — tabs **Requests**, **Approvals**, **Balances**, **Calendar**.
   - **Gate Passes** (\`/app/hr/gate\`) — tabs **Gate passes**, **Gate scan**.
   - **Cases & Exits** (\`/app/hr/cases-exits\`) — tabs **Notices & cases**, **Separations & settlement**.
3. **Payroll**
   - **Payroll** (\`/app/hr/payroll\`) — tabs **Periods**, **Runs**, **Approvals**, **Payslips**, **Salary sheets & registers**.
   - **Payroll Extras** (\`/app/hr/payroll-extras\`) — tabs **Advances & loans**, **Bonuses**, **Allowances & bonuses** (when switched on).
   - Step-by-step help is in the **HR — Payroll & compliance** section: **Payroll module map**, **Payroll setup**, **Run monthly payroll**, **Piece-rate and daily-wage workers**, **Overtime**, **Festival bonus, advances and loans**, **Payslips, bank advice file and posting to Finance**, **Statutory deductions and tax**, **Final settlement** and **Payroll troubleshooting** (all linked at the bottom of this page).
4. **Talent**
   - **Recruitment** (\`/app/hr/recruitment\`) — tabs **Job requisitions**, **Candidates**, **Interviews**, **Offers**.
   - **Performance** (\`/app/hr/performance\`) — tabs **Dashboard**, **Cycles**, **Goals**, **Reviews**.
5. **Setup** (done once, then changed rarely)
   - **HR Setup** (\`/app/hr/setup\`) — tabs **Settings** (weekend days, overtime pay from salary, employee number format), **Departments**, **Designations**, **Sections & lines**, **Bangladesh setup**. Set up departments, designations and sections before anything else.
   - **Attendance Setup** (\`/app/hr/attendance-setup\`) — tabs **Shifts**, **Roster**, **Holidays**, **Overtime rules**, **Devices** (fingerprint / face / card machines).
   - **Leave & Payroll Setup** (\`/app/hr/leave-payroll-setup\`) — tabs **Leave types**, **Leave policies**, **Salary components**, **Salary structures**, **Structure assignments**, **Accounting**, **Statutory** (when switched on).
   - **Bangladesh Rules** (\`/app/hr/bangladesh-rules\`) — official RMG wage grades, leave and labour-law rules (see **Configure HR for Bangladesh**).
6. **Reports**
   - **Reports & Insights** (\`/app/hr/insights\`) — tabs **HR reports**, **Compliance**, **AI insights** (the last two need feature flags).

**HR Setup → Settings** holds company-wide HR rules: the **weekend days** used when counting leave, and **overtime pay from salary**. See **HR Settings: weekend days** and **Overtime pay from salary**.

### Recommended set-up order (first week)

1. **Departments** → **Designations** → **Sections & Lines**.
2. **Employees** (add or import from Excel). Link each person's login in **Linked app user (ESS / login)**.
3. **Shifts** → **Holidays** → **Roster** (all on **Attendance Setup**), and the weekend on **HR Setup → Settings**.
4. **Leave Types** (and policies / balances).
5. **Overtime Rules**.
6. Payroll set-up (components, structures, assignments, periods).
7. Optional: **Attendance Devices** if you use fingerprint / card machines.

## What happens next

- Daily: attendance is entered in **Daily Entry** (by hand or a biometric batch) or imported from **Attendance Devices**, leave is requested and approved, overtime is approved.
- Leave days are counted for you: weekend days and company holidays are skipped. See **Apply for leave and approve it**.
- Monthly: payroll reads approved overtime and approved leave (paid or unpaid) for the period and creates payslips. Employees see them in **My Payslips**.
- At exit: the employee's status history, exit date and final settlement close the record. See **Employee exit (resignation or termination)**.

Warning letters, memos, show-cause letters and unauthorised-absence cases are handled on **Notices & Cases**. There is no separate Training screen yet; keep certificates as files on the employee's **Documents** tab.

## Tips

- HR lists show the one or two most used actions as buttons on each row (for example **Approve** and **Reject**, or **Edit**); everything else, including **Delete**, is in the row's **Actions** menu. See **Row actions**.
- Every HR list has a **Search this list…** box, clickable column headers to sort, status chips with counts (for example **Pending 4**) and page controls. Managers and admins also see **Export CSV**.
- Forms open in a panel on the right. To choose a person, type part of the **employee code or name** and pick from the list — you never need the internal employee number. Leave types, shifts, candidates and cycles are drop-downs.
- **বাংলা / Bangla** — **My Leave**, **My Attendance**, **My Payslips**, **Manual IN / OUT** and **Gate Scan** have an **English / বাংলা** switch at the top right. The choice is remembered on that device. Notices print in both English and Bangla. Other HR screens are in English.

## Common problems

- **A screen from this guide is missing** → most screens are now tabs inside a page (see the list above). If the tab is missing too, it is behind a feature flag or your role. Ask your admin to check **Settings → Configuration** and **Settings → Roles**.
- **"Only manager/admin can perform this action"** → ask a manager to do it, or ask the admin to give your role the matching permission.
- **My HR says "Your login is not linked to an employee record"** → HR must open your employee record and choose your login in **Linked app user (ESS / login)**.`,
      tags: ["HR", "overview", "attendance", "leave", "payroll", "ESS", "Bangla"],
      keywords: [
        "human resources",
        "HR map",
        "employee",
        "staff",
        "worker",
        "karmachari",
        "hajira",
        "attendance",
        "chhuti",
        "leave",
        "salary",
        "beton",
        "payroll",
        "self service",
        "বাংলা",
        "permission",
        "hr.attendance.manage",
        "hr.leave.types.manage",
        "Bangladesh",
        "tabs",
        "hub",
      ],
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/hr.jpg",
      infographics: [
        {
          type: "diagram",
          title: "HR module map",
          caption: "The six HR sidebar groups, the tabs inside each page, and how data flows from people to attendance and leave to payroll.",
          imageSrc: "/tutorials/diagrams/hr/hr-module-map.svg",
          imageAlt:
            "Diagram of HR groups: Main, Daily work, Payroll, Setup, Talent and Reports, each listing its pages and tabs, with arrows from Main to Daily work to Payroll",
        },
        {
          type: "diagram",
          title: "Employee lifecycle",
          caption: "From hiring to exit — the screen to open at each stage.",
          imageSrc: "/tutorials/diagrams/hr/hr-employee-lifecycle.svg",
          imageAlt:
            "Six-step lifecycle: recruit, hire and onboard, daily attendance, leave, monthly payroll, exit; steps 3 to 5 repeat every month",
        },
        {
          type: "flow",
          title: "Set-up order",
          steps: [
            { label: "Departments", href: "/app/hr/departments" },
            { label: "Designations", href: "/app/hr/designations" },
            { label: "Employees", href: "/app/hr/employees" },
            { label: "Shifts", href: "/app/hr/attendance/shifts" },
            { label: "Leave Types", href: "/app/hr/leave/types" },
            { label: "Payroll set-up", href: "/app/hr/payroll/components" },
          ],
        },
        {
          type: "flow",
          title: "Every month",
          steps: [
            { label: "Daily Entry", href: "/app/hr/attendance/entries" },
            { label: "Leave Approvals", href: "/app/hr/leave/approvals" },
            { label: "Overtime", href: "/app/hr/attendance/overtime" },
            { label: "Payroll Runs", href: "/app/hr/payroll/runs" },
            { label: "Payslips", href: "/app/hr/payroll/payslips" },
          ],
        },
      ],
      relatedAppRoutes: [
        "/app/hr",
        "/app/hr/departments",
        "/app/hr/designations",
        "/app/hr/sections",
        "/app/hr/employees",
        "/app/hr/employees/ai-onboard",
        "/app/hr/attendance/shifts",
        "/app/hr/attendance/entries",
        "/app/hr/attendance/devices",
        "/app/hr/attendance/summary",
        "/app/hr/settings",
        "/app/hr/leave/types",
        "/app/hr/leave/requests",
        "/app/hr/leave/approvals",
        "/app/hr/payroll/components",
        "/app/hr/payroll/salary-structures",
        "/app/hr/payroll/assignments",
        "/app/hr/payroll/periods",
        "/app/hr/payroll/runs",
        "/app/hr/payroll/advances",
        "/app/hr/payroll/bonuses",
        "/app/hr/payroll/statutory",
        "/app/hr/payroll/approvals",
        "/app/hr/payroll/payslips",
        "/app/hr/performance/cycles",
        "/app/hr/recruitment/requisitions",
        "/app/hr/ess/profile",
        "/app/hr/ess/leave",
        "/app/hr/compliance",
        "/app/hr/ai-insights",
        "/app/hr/reports",
      ],
      relatedArticleIds: [
        "hr-bd-setup",
        "hr-org-setup",
        "hr-add-employee",
        "hr-ai-onboarding",
        "hr-manual-attendance",
        "hr-gate-passes",
        "hr-cases-notices",
        "hr-shifts-roster-holidays",
        "hr-settings-weekend",
        "hr-daily-attendance",
        "hr-attendance-devices",
        "hr-overtime",
        "hr-leave-setup",
        "hr-leave-request-approval",
        "hr-ess",
        "hr-recruitment",
        "hr-performance",
        "hr-employee-exit",
        "hr-reports-analytics",
        "hr-pay-overview",
        "hr-pay-setup",
        "hr-pay-monthly-run",
        "hr-pay-piece-rate",
        "hr-pay-overtime",
        "hr-overtime-from-salary",
        "hr-pay-bonus-advances",
        "hr-pay-payslips-bank",
        "hr-pay-statutory-tax",
        "hr-pay-final-settlement",
        "hr-pay-salary-registers",
        "hr-pay-allowances-bonuses",
        "hr-pay-troubleshooting",
        "gs-row-actions",
      ],
    },
    {
      id: "hr-org-setup",
      title: "Set up departments, designations and sections & lines",
      summary: "Create the organisation masters that every employee record points to: departments, job titles and factory floors or lines.",
      estimatedMinutes: 5,
      content: `## Overview

Before you add employees, create three small lists:

- **Departments** — for example Production, Merchandising, Human Resources.
- **Designations** — job titles such as Sewing Operator, Line Incharge, HR Manager. A designation can belong to one department.
- **Sections & Lines** — the factory floors, sewing lines and units people work on.

HR officers usually do this once, then add new items when the factory grows.

## Before you start

- You need an HR, manager or admin role.
- Agree short codes with your team first (for example \`D-PROD\` for Production, \`DS-SMO\` for Sewing Machine Operator). Codes must be unique.

## Steps

### A. Add a department

1. Open **HR → HR Setup → Departments** (\`/app/hr/departments\`).
2. Click **+ Add department**.
3. Type the **Department name**. Keep **Active** ticked. The code (for example **DEPT-0001**) is assigned automatically ("Code assigned automatically").
4. Click **Save**.

### B. Add a designation

1. Open **HR → HR Setup → Designations** (\`/app/hr/designations\`).
2. Click **+ Add designation**. If you filtered the list by a department first, that department is already chosen.
3. Type the **Designation name** (required — the screen marks required fields with two stars). The code (for example **DESG-0001**) is assigned automatically.
4. Choose the department in the drop-down (or leave **No department** if the title is used everywhere). If the department is missing, click **+** next to the drop-down, type its name and click **Create** — it is added and selected without leaving the form.
5. Click **Save**.

### C. Add a section or line

1. Open **HR → HR Setup → Sections & lines** (\`/app/hr/sections\`).
2. Click **Add section**.
3. Type the **Name** (for example "Sewing Line 05") and pick the **Type**: **Floor**, **Line**, **Section** or **Unit**.
4. Click **Save**. The code is created for you.

## What happens next

- The **Add employee** form and the employee **Job** tab (**Employment & Salary** in the unified employee workspace) show these lists in drop-downs.
- On that tab, the designation list is filtered to the department you picked.
- Sections & lines help attendance and production reports group workers by line.

## Find and filter

- The cards at the top show **Total**, **Active** and **Inactive** (click one to filter), plus **No designations** on Departments and **No department** on Designations.
- Search by code or name, pick a **Status**, and on Designations pick a **Department** (or **No department**). **Clear** resets the filters. Click a column title to sort.
- On Departments, the **Designations** column shows how many job titles each department has; click it (or **Actions → View designations**) to open Designations filtered to that department.
- Managers and admins can save the filtered list with **Export (Excel)**.

## Tips

- To change a department or designation, use **Actions → Edit** on its row. Use **Actions → Deactivate** (or untick **Active**) instead of deleting when a name is no longer used. Only an edit shows the code box; leave it as it is unless you must rename the code.
- The designation **description** is printed as the employee's **Job description** (see **Unified employee workspace**), so write the duties there, one per line.
- Every drop-down with a **+** button (department, designation, section / line) lets you add a missing entry on the spot.
- **Actions → Delete** is blocked when employees are still linked — this protects old records.
- Type part of a code or name in **Search code or name** on Sections & Lines to find a line quickly.

## Common problems

- **"Save failed" with a duplicate message** → the code already exists. Use a different code.
- **The designation I want is missing on the employee Job tab** → it belongs to another department. Change the department first, or edit the designation and set **No department**.
- **Delete does nothing / shows an error** → employees are linked. Move them to another department first, or just untick **Active**.`,
      tags: ["HR", "departments", "designations", "sections", "lines", "setup"],
      keywords: ["department", "designation", "job title", "position", "post", "padobi", "line", "floor", "unit", "section", "org chart", "quick add", "auto code", "job description"],
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/hr-designations.jpg",
      infographics: [
        {
          type: "steps",
          title: "Organisation set-up in three screens",
          steps: [
            {
              title: "Add department",
              body: "**HR Setup → Departments → Add department** — code, name, **Active**, then **Save**.",
              imageSrc: "/tutorials/screens/hr-dept-add-form.jpg",
              imageAlt: "Add department dialog with the name Quality Control (the code is given automatically)",
              href: "/app/hr/departments",
            },
            {
              title: "Add designation",
              body: "**HR Setup → Designations → Add designation** — code, name and the department it belongs to.",
              imageSrc: "/tutorials/screens/hr-desig-add-form.jpg",
              imageAlt: "Add designation dialog with name Sewing Machine Operator and department D-PROD Production",
              href: "/app/hr/designations",
            },
            {
              title: "Add section or line",
              body: "**HR Setup → Sections & lines → Add section** — name and **Type** (Floor, Line, Section, Unit).",
              imageSrc: "/tutorials/screens/hr-section-add-form.jpg",
              imageAlt: "New section dialog with name Sewing Line 05 and type Line",
              href: "/app/hr/sections",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/hr/departments", "/app/hr/designations", "/app/hr/sections"],
      relatedArticleIds: ["hr-overview", "hr-add-employee", "gs-row-actions"],
    },
    {
      id: "hr-add-employee",
      title: "Add an employee and complete the profile",
      summary:
        "Create a new employee (the employee number is given automatically), link their login, then fill the Personal, Job, Photo & biometrics and Documents tabs and print an ID card.",
      featured: true,
      estimatedMinutes: 10,
      content: `## Overview

The **Employees** list is the master record of every worker and staff member. Attendance, leave, payroll, production crew sheets and the Scan station all point to it.

**Who uses it:** HR officers (add and maintain), managers (view).

## Before you start

- Departments and designations exist (see **Set up departments, designations and sections & lines**).
- The **employee number** is given automatically when you save, for example **EMP-0000001**, then **EMP-0000002**. A number is used once only: it is never given to another person, even after someone leaves or the prefix changes. Change the prefix and digits under **HR → HR Setup → Settings → Employee number format**. The same number is printed on the ID card and typed at the **Scan station**.
- After **Bangladesh setup**, every employee needs a Bangladesh **mobile number** (like 01712345678) and either an **NID** (10, 13 or 17 digits) or a **birth registration number** (17 digits). The same NID or birth registration number cannot be used for two employees.
- If the person will use **My Leave / My Attendance / My Payslips**, create their login first under **Settings → User Mgmt**.

> **Tip:** If your admin has switched on **Unified employee workspace** (Settings → Configuration), **Add employee** and **Actions → Edit** open one tabbed screen with AI autofill, salary set-up, a checklist and QR-signed letters instead of the dialog below. See **Unified employee workspace: add and edit employees**.

## Steps

### A. Add the employee

1. Open **HR → Employees** (\`/app/hr/employees\`).
2. Type the number, name, email or phone in **Search code, name, email or phone** to make sure the person is not already there (set the **Status** filter to **All statuses** to search old staff too). If they worked here before, reactivate the old record instead of adding a new one.
3. Click **+ Add employee**. The top box shows the next employee number ("New number on save, never reused").
4. Fill **First name** (required), then **Last name**, **Email**, **Mobile**, **NID** or **Birth registration no.**
5. Pick the department (**No department** by default) and the designation (**No designation** by default).
6. In **Linked app user (ESS / login)** choose the person's login, or leave **None**.
7. Pick the joining date in the date box at the bottom.
8. Click **Save**. The new row appears in the list with its new number and status **Active**.

### B. Complete the profile

1. On the employee's row click **Actions → View**.
2. **Personal** tab — date of birth, **Gender**, **Marital status**, **Blood group**, **Emergency contact name / phone**, **Address**, **City**, **Country**, **NID** and **Birth registration no.** Click **Save personal**.
3. **Job** tab — the employee number is shown but cannot be changed. Fill **Employment type** (for example Permanent, Probation, Contract), department, designation, **No section / line**, **Category** (**WORKER**, **STAFF**, **MANAGEMENT**) and **Reporting manager**. The three date boxes are, in order: **joining date**, **confirmation date** and (full width) **exit date**. Click **Save job**.
4. **Photo & biometrics** tab — take the photo with **Open webcam** (choose the external USB camera under **Camera** if you have one), **Take photo with phone**, or **Upload file**. Tick the privacy-notice box and click **Save photo**. Then record fingerprint / face consent with **Record consent**, enroll the person on the attendance terminal using the **Device user no.** shown, and click **Actions → Confirm test punch**.
5. **Documents** tab — **Upload CV or scanned document**: choose the type (CV, NID scan, birth registration scan, certificate…), then **Choose file** or **Scan with camera** on a phone, and **Upload**. Uploaded files have **Actions → Download** in the list. You can still add a paper record without a file with **Add document record**.
6. Click **Generate document** (top right) → **ID card (PDF)** (with photo and a secure QR), **Appointment letter** or **Age verification cert**. Every ID card print is recorded in the ID card issue register.

### C. Find and filter employees

- The cards at the top show **Total**, **Active**, **Inactive**, **Departments**, **On probation** and **New (30 days)** for the current filters. Click **Total**, **Active**, **Inactive**, **On probation** or **New (30 days)** to filter by it.
- Narrow the list with **Status**, **Department**, **Designation**, **Section / line**, **Employment type**, **Category** and **Gender**. **Clear** resets every filter.
- Quick chips: **On probation**, **Joined last 30 days**, **No department**, **No linked app user**, **Has photo**.
- Switch between **Table** and **Cards** (the page remembers your choice), sort with the sort box or by clicking a column title, and change **Rows** per page at the bottom.

### D. Many employees at once

- Tick the box on each row (or the box in the table header for the whole page), then use the bar that appears: **Export selected**, **Print ID cards**, **Activate**, **Deactivate**. **Select all … matching** picks every employee that matches the filters.
- **Import / Export → Export all employees (Excel)** downloads every employee (\`employees.xlsx\`) — use it as the template. **Export current view** saves only what the filters show. Exporting (and **Activate** / **Deactivate**) is for managers and admins.
- **Import / Export → Import from Excel** uploads a filled sheet. The message shows how many were created and updated. After Bangladesh setup, import only **updates** existing employees; add new people through **Add employee** so the number, mobile and NID / birth registration checks run.
- **Import / Export → Print all ID cards (ZIP)** downloads a ZIP with one ID card per active employee.

## What happens next

- The employee appears in Roster, Daily Entry, leave forms, payroll **Structure Assignments** and production crew screens.
- If a login is linked, the person can open **My HR** (their own profile, attendance, leave and payslips).
- **Production** tab shows the worker's line, IE skills and 30-day attendance trend; **Salary** tab points to payroll payslips.
- **Age verification** and **Medical records** tabs appear only when the compliance flags are on.

## Tips

- Attendance, roster and leave forms find the person by **employee code or name** — type a few letters and pick from the list.
- Use **Edit** in the row **Actions** menu to change basic fields quickly without opening the profile.
- Never delete people — use **Deactivate** on the profile when they leave (see **Employee exit**).

## Common problems

- **Save does nothing** → **First name** is empty.
- **"Required for every employee file: NID or birth registration number and mobile number"** → Bangladesh setup is on; fill the mobile and one of the two ID numbers.
- **"An employee file with this NID already exists (EMP-…)"** → the person already has a record (maybe inactive). Reactivate it instead of creating a new number.
- **"The employee number is permanent and cannot be changed"** → numbers never change after creation.
- **Camera does not open** → allow camera access in the browser (the live site needs HTTPS), or use **Take photo with phone** / **Upload file**.
- **The person's login is not in Linked app user** → create the user under **Settings → User Mgmt** first, then edit the employee again.
- **Generate document fails** → your role may lack the HR documents permission; ask your admin.`,
      tags: ["HR", "employees", "onboarding", "employee master", "ESS"],
      keywords: [
        "add employee",
        "new joiner",
        "new worker",
        "onboard",
        "hire",
        "employee code",
        "employee number",
        "employee ID",
        "ID card",
        "appointment letter",
        "NID",
        "national ID",
        "birth registration",
        "photo",
        "webcam",
        "fingerprint",
        "face",
        "CV upload",
        "import employees",
        "excel",
        "link user",
        "karmi",
      ],
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/hr-employees.jpg",
      videos: [
        {
          src: "/tutorials/videos/hr-add-employee.webm",
          poster: "/tutorials/videos/hr-add-employee-poster.jpg",
          title: "Add a new employee",
          caption: "Search first, open Add employee, fill name, phone and department, link the login, then Save (the demo cancels). The employee number is filled in for you.",
          durationSeconds: 55,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Add and complete an employee",
          steps: [
            {
              title: "Fill the Add employee form",
              body: "**First name** is required; the employee number is given on save. After Bangladesh setup also fill **Mobile** and **NID** or **Birth registration no.** Choose department, designation and **Linked app user (ESS / login)**, then **Save**.",
              imageSrc: "/tutorials/screens/hr-emp-add-form.jpg",
              imageAlt: "Add employee dialog with the next employee number shown, Rahima Akter, a mobile number, department D-PROD Production and the joining date",
              href: "/app/hr/employees",
            },
            {
              title: "Open the profile",
              body: "On the row click **Actions → View**.",
              imageSrc: "/tutorials/screens/hr-emp-row-actions.jpg",
              imageAlt: "Employees list with the Actions menu open showing View and Edit",
            },
            {
              title: "Personal tab",
              body: "Date of birth, gender, blood group, emergency contact, address and **National ID**, then **Save personal**.",
              imageSrc: "/tutorials/screens/hr-emp-detail-personal.jpg",
              imageAlt: "Employee profile Personal tab with name, email, phone and empty personal fields",
            },
            {
              title: "Job tab",
              body: "Employment type, department, designation, section / line, **Category**, **Reporting manager** and the joining, confirmation and exit dates, then **Save job**.",
              imageSrc: "/tutorials/screens/hr-emp-detail-job.jpg",
              imageAlt: "Employee profile Job tab with department D-HR and designation DS-HRM HR Manager",
            },
            {
              title: "Photo & biometrics, then Documents",
              body: "Take the photo (webcam, phone or file) and record fingerprint / face consent on **Photo & biometrics**. On **Documents** upload the CV or scans, or record papers with **Add document record**.",
              imageSrc: "/tutorials/screens/hr-emp-detail-documents.jpg",
              imageAlt: "Employee Documents tab with document type NID and the Add document record button",
            },
            {
              title: "Print ID card or letter",
              body: "**Generate document → ID card (PDF)**, **Appointment letter** or **Age verification cert**.",
              imageSrc: "/tutorials/screens/hr-emp-generate-doc.jpg",
              imageAlt: "Generate document menu with ID card PDF, Appointment letter and Age verification cert",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/hr/employees", "/app/settings/users"],
      relatedArticleIds: ["hr-employee-workspace", "hr-org-setup", "hr-bd-setup", "hr-ai-onboarding", "hr-ess", "hr-employee-exit", "hr-pay-setup", "hr-overview", "mfg-scan-station"],
    },
    {
      id: "hr-ai-onboarding",
      title: "AI employee onboarding from CV and NID",
      summary: "Upload a CV, NID, birth or medical certificate, let AI read the fields, check them, then create the employee in one click.",
      estimatedMinutes: 4,
      content: `## Overview

**AI Onboarding** reads scanned HR papers and fills the new-employee form for you. You always check the fields before anything is saved. Files are only read, not stored.

**Who uses it:** HR officers onboarding many new workers.

> **Tip:** With **Unified employee workspace** switched on, AI Onboarding opens **Add employee** instead: the same upload cards sit at the top of the **Personal** tab and fill the fields automatically (no **Apply** button), without overwriting anything you typed. See **Unified employee workspace: add and edit employees**.

## Before you start

- The screen appears in the sidebar only when at least one OCR flag is on: \`ocr_cv_extraction_enabled\` (CV / Resume), \`ocr_id_extraction_enabled\` (National ID and Birth certificate) or \`ocr_medical_extraction_enabled\` (Medical certificate). Your admin turns them on in **Settings → Configuration**.
- If all are off, the page shows "Document OCR is off. Enable CV, ID, or medical OCR under Settings → Configuration."
- Have a clear photo or PDF of each paper.

## Steps

1. Open **HR → Employees → AI onboarding** (\`/app/hr/employees/ai-onboard\`).
2. In a card (**CV / Resume**, **National ID**, **Birth certificate**, **Medical certificate**) choose the file and wait for the reading to finish.
3. Click **Apply … fields to form** under the card. The message "Extracted fields applied — review before creating employee." appears.
4. Repeat for the other papers.
5. In **Employee details (edit before save)** check every field. Type the **First name** (required) if it is empty, and correct anything the AI misread. The employee number is assigned automatically on save.
6. Click **Confirm & create employee**. The new employee profile opens.

Click **Cancel** to go back to Employees without saving.

## What happens next

The employee is created like a normal **Add employee**. Continue on the profile: **Job** tab (department, designation, category), **Documents** tab and the login link — see **Add an employee and complete the profile**.

## Tips

- Upload the NID first: it gives the National ID number and date of birth.
- Check Bangla names carefully — OCR can mix up similar letters.

## Common problems

- **There is no AI onboarding button on HR → Employees** → no OCR flag is on for your company, or your company uses the new employee workspace (then use **Add employee**, which has AI autofill on the **Personal** tab).
- **Confirm & create employee is greyed out** → **First name** is empty.
- **Reading fails** → the file is too dark, blurred or not a supported image/PDF. Scan again.`,
      tags: ["HR", "AI", "OCR", "onboarding", "employees"],
      keywords: ["scan CV", "resume", "NID scan", "national ID", "birth certificate", "medical certificate", "OCR", "auto fill", "AI onboard"],
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/hr-employees-ai-onboard.jpg",
      images: [
        {
          src: "/tutorials/screens/hr-employees-ai-onboard.jpg",
          alt: "AI employee onboarding page with the message Document OCR is off",
          caption: "When the OCR flags are off you see this message and a link to Settings → Configuration.",
        },
      ],
      infographics: [
        {
          type: "flow",
          title: "AI onboarding in four moves",
          steps: [
            { label: "Upload CV / NID", href: "/app/hr/employees/ai-onboard" },
            { label: "Apply fields to form" },
            { label: "Check every field" },
            { label: "Confirm & create employee" },
          ],
        },
      ],
      relatedAppRoutes: ["/app/hr/employees/ai-onboard", "/app/settings/config"],
      relatedArticleIds: ["hr-employee-workspace", "hr-add-employee", "hr-overview", "settings-overview"],
    },
    {
      id: "hr-employee-workspace",
      title: "Unified employee workspace: add and edit employees",
      summary:
        "One tabbed screen to add and edit employees: AI autofill, family and both addresses, quick-add drop-downs, salary with the legal minimum check, bank and facilities, a truthful checklist and QR-signed appointment letters.",
      estimatedMinutes: 8,
      content: `## Overview

The **unified employee workspace** replaces the small **Add employee** dialog and the separate **AI Onboarding** page with one screen that has the same tabs as the employee profile. Adding and editing work the same way.

**Who uses it:** HR officers (add and maintain), payroll officers (salary and bank), compliance officers (checklist).

## Before you start

- An admin switches it on: **Settings → Configuration → HR compliance / OCR / AI → Unified employee workspace**. While it is off, the old dialog and pages stay exactly as before.
- What you may change depends on your role: family, religion, nationality, addresses and the bKash tick need the **HR identity** permission; salary, bank and payment method need **payroll manage**; the temporary gate pass needs **gate pass manage**. Fields you cannot see show **Hidden for your role**.
- AI autofill appears only when at least one document OCR switch is on.

## Steps

### A. Add an employee

1. Open **HR → Employees** and click **Add employee** (\`/app/hr/employees/new\`).
2. **Personal** tab — at the top, **AI autofill** (coloured box): upload the National ID, CV or birth certificate. Matching fields fill in by themselves and glow for a moment. Anything you already typed is kept; the box lists "AI read …" with **Use AI value** / **Keep mine**.
3. Fill **Basic details**, **Family** (father's, mother's, spouse's name), **Contact & emergency** (tick **This mobile is a bKash number** when it is), **Present address** and **Permanent address**. Tick **Same as present address** to copy it.
4. **Employment & Salary** tab — one page for the job and the pay. First the employment type (permanent, temporary, contractual or probation), category, joining date and **Probation (months)**; the confirmation date is calculated for you (**Use …**). Pick department, designation and section / line; if one is missing click **+** next to it to add it without leaving the form.
5. Tick **Issue a 7-day temporary gate pass** if the person starts before the ID card is printed (needs a mobile number).
6. **Salary set-up** (same tab, needs payroll permission) — tick **Set salary now**, or leave it off and set the salary later from the profile. Then:
   - Choose the **Salary structure** (how the pay is split into basic, house rent and allowances).
   - For workers choose the **Bangladesh wage grade**. The **Standard basic salary** is the grade minimum, so you do not type anything. The **Legal minimum** box next to it shows the grade's basic and gross.
   - Only if this person is paid more than the standard, tick **Override standard basic salary**, type the **Employee basic salary** and tick the confirmation box. Changing the amount, grade or structure clears the tick, so you confirm the final figure.
   - Without a grade, type the **Basic salary** yourself.
   - The **component table** lists every part of the structure (basic, house rent, medical, transport, food…) with the **Standard** amount and **This employee (per month)**. Type a different amount in a box to override that allowance for this person; **Reset** goes back to the standard. The basic row always follows the basic salary above, and per-day / per-piece / overtime lines and deductions are worked out by payroll. **Monthly gross** at the bottom includes your amounts, and the legal minimum still applies.
   - **Salary starts on** is filled in from the joining date and follows it until you type another date (with no joining date it is today).
   - The green / red box shows basic and gross against the legal minimum; a salary below the grade is refused.
7. **Overtime & allowances** (same tab, needs payroll permission) — tick what this person gets: **Overtime**, **Friday allowance**, **Tiffin bill**, **Lunch bill**, **Dinner bill** and **Night bill**. All are ticked by default. Each bill shows the **Company rate** from **HR → Payroll Extras → Allowances & bonuses**; type an **Own amount per day** only if this person gets a different amount. With **Overtime** unticked, overtime cannot be entered or approved for this person and payroll pays no overtime.
8. Below: **Salary paid by** (bank, bKash or cash), the optional bank details and the **Facilities** the person gets (lunch, transport…).
9. Click **Create employee** in the bar at the bottom (use **Next** / **Back** to move between Personal and Employment & Salary). If **Set salary now** is ticked but the salary is not complete or not valid yet, the employee is **not** created and a message says what to fix. Photo, documents, medical and the other tabs are locked until this first save.
10. The **Next steps** window shows each step. Download the **ID card**, the **Appointment letter (QR signed)**, the **Job description (QR signed)** and the **Temporary gate pass**. If a step failed, fix it and click **Retry failed steps** — the employee is never created twice.

> **Tip:** You no longer need **Payroll → Structure assignments** for a new employee: choosing the structure here creates the assignment.

### B. Complete and edit the profile

1. Open the employee (**Actions → View** or **Edit**). Each tab has its own **Save** button in the bottom bar.
2. **Employment & Salary** tab — job, payment and facility changes are saved with **Save employment & payment** in the bottom bar. The salary has its own save:
   - **Current salary** shows basic, gross, structure and grade, then every component of the salary (basic, house rent, medical, transport, food…) with its rule and monthly amount — amounts set only for this person are marked **Own amount** with the standard underneath — and the history.
   - Click **Change salary**. The form starts from today's pay (an above-standard basic and any component amounts are kept). Choose the **Type of change**:
     - **Increment** — choose **% of basic** or **Taka** and type the raise, or click **Use the annual increment (5%)**. The new basic is typed in for you and you can still change it.
     - **Promotion** — pick the new grade or structure.
     - **Correction (fix a mistake)** — fixes a wrong salary. With the **same start date** as the current salary it corrects that salary in place, but only while no payroll has been calculated for it; otherwise use a later date.
   - Add an optional **Note**, choose **New salary starts on**, then **Save new salary**: the old period ends the day before and the new one starts that day. Earlier periods are never changed.
   - If you changed the **Joining date**, click **Save employment & payment** first; until then **Save new salary** stays off.
   - **Overtime & allowances** has its own **Save overtime & allowances** button.
3. **Checklist** tab — photo, photo consent, NID / birth registration scan and (when medical tracking is on) the medical exam. Each task shows **Pending** until the real record is saved on the matching tab (click **Open**); it reopens if the record is withdrawn. The medical task needs a medical record with result **Fit** or **Restricted** — a record still marked **Pending** keeps it pending. A compliance manager can **Waive…** a task with a reason.

### C. Signed letters

- **Generate document → Appointment letter** or **Job description** downloads the latest signed version. The job description is the designation's description.
- After changing the employee's details use **Reissue appointment letter** / **Reissue job description**: a new version with a new QR code is made and older versions stay valid.
- Anyone can scan the QR code to open the public check page. It shows only the company, document number, date, the employee's initials and code, and **genuine / changed** — never salary, address or ID numbers. The company must have **public document verification** switched on.

## Common problems

- **"Requires … permission 'hr.identity.manage'"** or **'hr.payroll.manage'** → your role cannot set that field; leave it for a manager.
- **"Basic … is below the … minimum"** / **"Gross … is below …"** → raise the basic salary or pick the right structure for the grade.
- **"A salary assignment already starts on …"** → choose an effective date after the latest salary period, or choose **Correction** with the same date to fix it.
- **"Payroll has already been calculated … on or after …"** → that salary is already in a payroll run; record the change from a later date.
- **"… is the basic salary; change the basic salary instead"** → the basic row in the component table follows the basic salary field.
- **"Overtime is not activated for this employee"** → tick **Overtime** under **Overtime & allowances** on the employee's Employment & Salary tab.
- **"Tick the confirmation box …"** → you overrode the standard basic; tick the box under the amount to confirm it.
- **"Save employment first …"** → the joining date has an unsaved change; save employment & payment, then the new salary.
- **"A mobile number is needed for the temporary gate pass"** → fill **Mobile** on the Personal tab.
- **Generate document is missing** → document generation is off, or your role lacks the documents permission.`,
      tags: ["HR", "employees", "onboarding", "AI", "salary", "documents", "checklist"],
      keywords: [
        "add employee",
        "employee workspace",
        "onboarding",
        "AI autofill",
        "father name",
        "permanent address",
        "bKash",
        "bank account",
        "wage grade",
        "minimum wage",
        "facilities",
        "probation",
        "appointment letter",
        "job description",
        "QR verification",
        "gate pass",
        "checklist",
        "salary components",
        "increment",
        "promotion",
        "overtime",
        "friday allowance",
        "tiffin bill",
        "lunch bill",
      ],
      lastUpdated: "2026-11-11",
      coverImage: "/tutorials/screens/hr-emp-ws-personal.jpg",
      images: [
        {
          src: "/tutorials/screens/hr-emp-ws-personal.jpg",
          alt: "Add employee workspace on the Personal tab with the AI autofill panel and locked Photo, Documents and Checklist tabs",
          caption: "Personal tab: AI autofill at the top; record tabs stay locked (padlock) until you create the employee.",
        },
        {
          src: "/tutorials/screens/hr-emp-ws-job.jpg",
          alt: "Employment & Salary tab with employment type, joining date, probation months, confirmation date and department, designation and section drop-downs with + buttons",
          caption: "Employment & Salary tab, top: probation months calculate the confirmation date; + next to a drop-down adds a missing entry.",
        },
        {
          src: "/tutorials/screens/hr-emp-ws-quick-add.jpg",
          alt: "Add department dialog opened from the Employment & Salary tab with the name Finishing and the note Code assigned automatically",
          caption: "Quick add: type the name, click Create — the new department is selected and your form stays as it was.",
        },
        {
          src: "/tutorials/screens/hr-emp-ws-salary.jpg",
          alt: "Salary set-up on the Employment & Salary tab with Set salary now ticked, salary structure, Bangladesh wage grade, standard basic salary with an override tick, start date and a green legal-minimum check",
          caption: "Salary set-up: pick the structure and grade; the standard basic is the grade minimum unless you override it with a confirmation.",
        },
      ],
      infographics: [
        {
          type: "flow",
          title: "Add an employee in one screen",
          steps: [
            { label: "Personal (+ AI autofill)", href: "/app/hr/employees/new" },
            { label: "Employment & Salary" },
            { label: "Create employee" },
            { label: "Next steps: ID card, letter, JD, gate pass" },
          ],
        },
      ],
      relatedAppRoutes: ["/app/hr/employees/new", "/app/hr/employees", "/app/settings/config"],
      relatedArticleIds: ["hr-add-employee", "hr-ai-onboarding", "hr-org-setup", "hr-pay-setup", "hr-bd-setup"],
    },
    {
      id: "hr-shifts-roster-holidays",
      title: "Set up shifts, holidays and the roster",
      summary: "Create shift times, enter the year's holidays and put each worker on a shift (or week off) for each day.",
      estimatedMinutes: 6,
      content: `## Overview

- **Shifts** — the start and end time of each working pattern (General, Day, Night…).
- **Holidays** — plant-wide holidays (Eid, Victory Day…), used by attendance and overtime rules.
- **Roster** — which shift an employee works on a given date, or that it is their **Week off**.

**Who uses it:** HR / time-keeping officers; managers for holidays.

## Before you start

- Employees exist.
- **Holidays** can be added or edited only by a manager or admin.
- Times are typed as text: shifts use \`HH:MM\` (24-hour, for example \`08:00\`, \`17:00\`).

## Steps

### A. Add a shift

1. Open **HR → Attendance Setup → Shifts** (\`/app/hr/attendance/shifts\`).
2. Click **Add shift**.
3. Type **Code** (for example \`GEN\`), **Name**, **Start time (HH:MM)** and **End time (HH:MM)**.
4. Tick **Night shift** if the shift crosses midnight. Keep **Active** ticked.
5. Click **Save**.

### B. Add a holiday

1. Open **HR → Attendance Setup → Holidays** (\`/app/hr/attendance/holidays\`).
2. Click **+ Add holiday**, pick the **Date** and type the **Name** (tick **Optional holiday** if it is optional).
3. Click **Save**.
4. To mark it optional or add a note, click **Edit** on the row → tick **Optional holiday** → **Save**.

### C. Put a worker on the roster

1. Open **HR → Attendance Setup → Roster** (\`/app/hr/attendance/roster\`).
2. Click **+ Add roster entry**. In the panel, search the **Employee** by code or name, pick the **Date** and choose the **Shift** from the list.
3. Tick **Week off on this day** if the person is off that day. Add a **Note** if useful.
4. Click **Save**.
5. To change a day, click **Edit** on the row.

## What happens next

- **Daily Entry** records the actual in and out time against the employee and date.
- Holidays and week-offs are used by overtime rules (holiday and weekend multipliers).

## Tips

- The roster table shows each person's name and the shift name and times, so you can check a day at a glance. Use **Search this list…** to find one worker or one date.
- Enter all of next year's public holidays in December so nobody forgets.

## Common problems

- **"Shift code already exists"** → pick another code or edit the existing shift.
- **"Roster already exists for employee and date"** → that day is already planned; click **Edit** on that row.
- **"Holiday already exists for this date"** → edit the existing holiday instead.
- **"Only manager/admin can perform this action"** on Holidays → ask a manager.
- **"Employee not found" / "Shift not found"** → the employee or shift was removed or deactivated; pick another one from the list.`,
      tags: ["HR", "attendance", "shifts", "roster", "holidays"],
      keywords: ["shift", "duty time", "night shift", "roster", "duty roster", "week off", "weekly holiday", "holiday", "chhutir din", "Eid", "public holiday"],
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/hr-attendance-shifts.jpg",
      infographics: [
        {
          type: "steps",
          title: "Shifts, holidays, roster",
          steps: [
            {
              title: "Add a shift",
              body: "**Add shift** → Code, Name, **Start time (HH:MM)**, **End time (HH:MM)**, **Night shift** if needed → **Save**.",
              imageSrc: "/tutorials/screens/hr-shift-add-form.jpg",
              imageAlt: "Add shift side panel with code GEN, name General shift, 08:00 to 17:00",
              href: "/app/hr/attendance/shifts",
            },
            {
              title: "Add holidays",
              body: "**+ Add holiday** → pick the **Date**, type the **Name** → **Save**.",
              imageSrc: "/tutorials/screens/hr-attendance-holidays.jpg",
              imageAlt: "Holidays page with Date, Name and Add holiday button",
              href: "/app/hr/attendance/holidays",
            },
            {
              title: "Roster the worker",
              body: "**+ Add roster entry** → search the **Employee**, pick the date and the **Shift** (or tick **Week off**), **Note** → **Save**.",
              imageSrc: "/tutorials/screens/hr-roster-form.jpg",
              imageAlt: "Add roster entry side panel with the employee search, a date, the shift list and a note",
              href: "/app/hr/attendance/roster",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/hr/attendance/shifts", "/app/hr/attendance/holidays", "/app/hr/attendance/roster"],
      relatedArticleIds: ["hr-daily-attendance", "hr-overtime", "hr-settings-weekend", "hr-overview"],
    },
    {
      id: "hr-settings-weekend",
      title: "HR Settings: weekend days",
      summary: "Choose the company's weekly holiday so leave requests do not count those days.",
      estimatedMinutes: 2,
      audience: "hr",
      content: `## Overview

**HR → HR Setup → Settings** (\`/app/hr/settings\`) holds company-wide HR rules. The cards at the top show the current weekend, overtime setting, hours per month and multiplier; click one to jump to its box. The **Weekend (weekly holiday)** box shows the seven days as buttons; the highlighted days are off every week.

## Steps

1. Open **HR → HR Setup → Settings**.
2. Click the days to turn them on or off as weekend days (default **Friday** until you save). An **Unsaved changes** tag appears; **Reset** puts back the saved days.
3. Click **Save weekend**.

## Rules

- At least one day must be a weekend day and at least one a working day.
- Leave requests (HR leave and **My Leave**) skip weekend days and company **Holidays** when counting days.
- Only a **manager / admin** or a role with **hr.attendance.manage** can change the weekend; everyone in HR can see it.
- The production planning calendar has its own weekend and does not change leave days.`,
      tags: ["HR", "settings", "weekend", "leave", "holiday"],
      keywords: ["weekly holiday", "friday", "saturday", "off day"],
      lastUpdated: "2026-11-10",
      relatedAppRoutes: ["/app/hr/settings", "/app/hr/leave/requests"],
      relatedArticleIds: ["hr-overview", "hr-overtime-from-salary"],
    },
    {
      id: "hr-daily-attendance",
      title: "Enter daily attendance, fix punches and read the summary",
      summary:
        "Record in and out times by hand or as a biometric batch, approve punch corrections, and check present, absent, late and leave days.",
      featured: true,
      estimatedMinutes: 8,
      content: `## Overview

**Daily Entry** is where each worker's attendance for a day is saved: in time, out time and a status such as **PRESENT**, **ABSENT**, **LATE**, **HALF_DAY** or **LEAVE**. Entries can be typed by HR (**MANUAL**) or uploaded from a device (**BIOMETRIC**, **CARD_READER**, **MOBILE_APP**).

**Regularizations** are requests to correct a punch; a manager approves or rejects them. **Summary** totals the days per employee.

**Who uses it:** time-keeping / HR officers daily; managers for corrections.

## Before you start

- Employees, shifts and the roster are set up (see **Set up shifts, holidays and the roster**).
- Anyone in HR can add a new entry. **Changing a saved entry** (**Edit** on the row) needs a manager / admin role or the permission \`hr.attendance.manage\`.
- **Upload batch** (bulk import) needs a manager or admin.
- Once a payroll period is **locked**, its attendance cannot be added or changed.

## Steps

### A. Type one entry (missed punch, manual register)

1. Open **HR → Attendance → Daily entry** (\`/app/hr/attendance/entries\`).
2. Click **+ Add entry**. In the panel, search the **Employee** by code or name and pick the date.
3. Type **In time** and **Out time** (HH:MM:SS), for example \`08:02:00\` and \`17:05:00\`.
4. Check the status box — it starts as **PRESENT**. Type \`ABSENT\`, \`LATE\`, \`HALF_DAY\` or \`LEAVE\` when needed (capital letters).
5. Leave the source as **MANUAL** and write **Remarks** (why it was typed by hand).
6. Click **Save**. The row appears in the table, with the person's name.

### B. Upload a biometric batch

1. Ask IT for the device export in the JSON layout shown on the page (\`employee_id\`, \`attendance_date\`, \`in_time\`, \`out_time\`, \`status\`, \`source\`).
2. Below the table, open **Bulk import (JSON)** (click the heading) and click **Load sample JSON** to see the layout, then paste your file's text over it.
3. Click **Upload batch**. The message shows "Created N entries."

> **Tip:** If you have fingerprint / card machines, register them on **Attendance Devices** instead — punch files are imported (or pushed) and turned into daily entries for you. See **Attendance devices and punch import**.

### C. Correct a saved entry

1. Find the row (use **Search**) and click **Edit**.
2. Change **In time**, **Out time**, **Status** or **Remarks** and click **Save** (or **Cancel**).

### D. Approve punch corrections

1. Open **Regularizations** (\`/app/hr/attendance/regularizations\`). Requests show **Entry ID**, **Status** and **Reason**.
2. For a **PENDING** row click the green **Approve** button or **Reject** (Reject asks for a reason). Click **Refresh** to reload.

### E. Check the summary

Open **Summary** (\`/app/hr/attendance/summary\`) to see **Present**, **Absent**, **Late** and **Leave** per employee. **Present** includes LATE and HALF_DAY entries.

## What happens next

- Payroll auto-calculate reads attendance for the period (daily-wage workers are paid per day present; **LATE** still counts as a worked day, late penalties are separate).
- Employees see their own rows in **My HR → Attendance**.
- **HR Reports** and the **HR Dashboard** "Today attendance" card use the same entries.

## Tips

- Type statuses exactly in capitals. Words the summary does not know are not counted.
- The **Summary** counts every saved entry (it is not filtered by month on screen yet); use **HR Reports** or payroll for a month view.
- For approved leave days, also save a Daily Entry with status \`LEAVE\` so the Summary's **Leave** column is right.

## Common problems

- **"Attendance already exists for employee and date"** → click **Edit** on the existing row.
- **"Attendance date falls in a locked payroll period"** → payroll for that month is locked. Ask the payroll manager.
- **"Only manager/admin can perform this action"** when editing or uploading → you need a manager / admin role or \`hr.attendance.manage\` (edit only).
- **"Invalid JSON body. Use {"rows":[...]}"** → the pasted text is not in the right layout; start again from **Load sample JSON**.
- **Regularization has no Approve / Reject** → it is no longer **PENDING**.`,
      tags: ["HR", "attendance", "biometric", "regularization", "summary"],
      keywords: [
        "attendance",
        "hajira",
        "punch",
        "in time",
        "out time",
        "biometric",
        "fingerprint",
        "card punch",
        "missed punch",
        "late",
        "absent",
        "regularize",
        "correction",
        "attendance summary",
        "hr.attendance.manage",
      ],
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/hr-attendance-entries.jpg",
      videos: [
        {
          src: "/tutorials/videos/hr-attendance-tour.webm",
          poster: "/tutorials/videos/hr-attendance-tour-poster.jpg",
          title: "Tour of time & attendance screens",
          caption: "Shifts, Holidays, Roster, Daily Entry (filled but not saved), Regularizations and Summary in under a minute.",
          durationSeconds: 55,
        },
      ],
      infographics: [
        {
          type: "flow",
          title: "Daily attendance routine",
          steps: [
            { label: "Roster", href: "/app/hr/attendance/roster" },
            { label: "Daily Entry", href: "/app/hr/attendance/entries" },
            { label: "Regularizations", href: "/app/hr/attendance/regularizations" },
            { label: "Summary", href: "/app/hr/attendance/summary" },
            { label: "Payroll Runs", href: "/app/hr/payroll/runs" },
          ],
        },
        {
          type: "steps",
          title: "Enter, correct, check",
          steps: [
            {
              title: "Type the entry",
              body: "**+ Add entry** → search the **Employee**, date, **In time**, **Out time** (HH:MM:SS), status, source **MANUAL**, **Remarks** → **Save**.",
              imageSrc: "/tutorials/screens/hr-att-entry-form.jpg",
              imageAlt: "Add attendance entry side panel with the employee search, in 08:02, out 17:05, PRESENT, MANUAL and a remark",
              href: "/app/hr/attendance/entries",
            },
            {
              title: "Approve corrections",
              body: "**Regularizations** → **Approve** / **Reject** buttons on PENDING rows.",
              imageSrc: "/tutorials/screens/hr-attendance-regularizations.jpg",
              imageAlt: "Attendance regularizations page with Refresh button and empty list",
              href: "/app/hr/attendance/regularizations",
            },
            {
              title: "Check the totals",
              body: "**Summary** shows Present, Absent, Late and Leave per employee.",
              imageSrc: "/tutorials/screens/hr-attendance-summary.jpg",
              imageAlt: "Attendance Summary table with employee code, name, present, absent, late and leave columns",
              href: "/app/hr/attendance/summary",
            },
          ],
        },
      ],
      relatedAppRoutes: [
        "/app/hr/attendance/entries",
        "/app/hr/attendance/regularizations",
        "/app/hr/attendance/summary",
      ],
      relatedArticleIds: ["hr-shifts-roster-holidays", "hr-attendance-devices", "hr-overtime", "hr-leave-request-approval", "hr-ess", "hr-pay-monthly-run", "hr-overview"],
    },
    {
      id: "hr-attendance-devices",
      title: "Attendance devices and punch import",
      summary: "Register fingerprint / card machines, import their punch files or let them push punches, and see how punches become daily attendance.",
      estimatedMinutes: 7,
      audience: "hr",
      content: `## Overview

**HR → Attendance Setup → Devices** (\`/app/hr/attendance/devices\`) turns machine punches into daily attendance. Each punch is stored once; attendance for that day is then rebuilt from all punches of the day with source **DEVICE**.

Only a **manager / admin** or a role with **hr.attendance.manage** can open this screen.

## Add a device

1. Click **Add device** and fill **Code**, **Name**, **Type** (ZKTeco or Other) and optionally a **Default shift** (used on days the employee has no roster).
2. Save. A window shows the device's **API key once** — click **Copy** and keep it safe. P7 stores only a fingerprint of the key, so it cannot show it again.
3. Lost the key? **Actions → Rotate key** makes a new one; the old key stops working at once.
4. **Actions → Deactivate** stops a device from sending punches (devices are never deleted).

## Import a punch file

**Actions → Import punches**, choose the file and click **Import**. Accepted files (up to 5,000 punches each):

- **CSV** — columns \`employee_code,punched_at,direction\` (direction optional; header row optional). Times like \`2026-11-05 08:01\`.
- **ZKTeco attendance log** — \`attlog.dat\` / .txt from the machine's USB export.
- **JSON** — a list of \`{"employee_code": "...", "punched_at": "..."}\`.

The device user number (PIN) is matched to the employee's **Device PIN** (employee page → **Job** tab, or **Employment & Salary** in the unified employee workspace) when one is filled in, otherwise to the **employee code**. The summary shows new punches, punches already imported, attendance days created / updated, unknown employee codes and lines that could not be read. Importing the same file again adds nothing.

## Automatic push

A device or a small bridge program can send punches to \`POST /api/v1/hr/attendance/device-push\` with the header \`X-Device-Key\` (JSON list or ZKTeco log lines). The key decides the company, so it can only add punches for its own employees. **Last push** on the list shows when the device last sent data.

## ZKTeco cloud push (no bridge program)

ZKTeco machines with a **Cloud Server / ADMS** setting can send punches directly:

1. **Actions → Edit** the device and fill **Serial number** (from the machine's System Info) and **Cloud push: allowed IP addresses** — the factory's public internet IP (ask your IT team or ISP; several can be separated by commas, ranges like \`103.4.145.0/24\` work too).
2. On the machine, set the cloud server address to this ERP's address (shown under the field) and enable the connection.
3. **Status** on the list shows **Cloud push on** once both fields are filled in; **Last push** updates when the machine checks in.

The machine is recognised by its serial number **and** the IP it connects from; a request from any other IP is refused. Cloud push stays off for a device until both fields are filled in.

> **Warning:** Many machines only speak plain HTTP for cloud push. Your server administrator must allow the \`/iclock/\` path over HTTP (or use a machine with HTTPS support) — see the deployment notes.

## How a day is built

- **In** = first punch, **Out** = last punch (only when there are two or more).
- Shift = the employee's **roster** for that day, otherwise the device's default shift.
- **Late** when the first punch is after shift start + grace minutes (late minutes counted from the start); **early out** and **overtime minutes** compare the last punch with the shift end.
- **Night shift:** an early-morning punch (up to 4 hours after the shift end) belongs to the previous day.
- Days typed or corrected by hand (including an approved **regularization**) are never overwritten, and days inside a **locked payroll period** are skipped. Editing a device day on **Daily Entry** turns it into a manual day.

> **Tip:** Overtime minutes on attendance are for information. Paid overtime still comes from approved entries on **Overtime** (\`/app/hr/attendance/overtime\`).`,
      tags: ["HR", "attendance", "device", "biometric", "fingerprint", "ZKTeco", "punch", "import"],
      keywords: ["machine", "attlog", "card", "clock in", "API key", "cloud push", "ADMS", "iclock", "device PIN"],
      lastUpdated: "2026-11-10",
      infographics: [
        {
          type: "flow",
          title: "From machine to payroll",
          steps: [
            { label: "Add device", href: "/app/hr/attendance/devices" },
            { label: "Import or push punches" },
            { label: "Daily attendance", href: "/app/hr/attendance/entries" },
            { label: "Payroll run", href: "/app/hr/payroll/runs" },
          ],
        },
      ],
      relatedAppRoutes: ["/app/hr/attendance/devices", "/app/hr/attendance/entries"],
      relatedArticleIds: ["hr-overview", "hr-settings-weekend"],
    },
    {
      id: "hr-overtime",
      title: "Overtime rules and approving overtime",
      summary: "Set weekday, weekend and holiday OT multipliers, then approve pending overtime entries so payroll pays them.",
      estimatedMinutes: 4,
      content: `## Overview

- **Overtime Rules** say how much more an OT hour pays: for example **1.5×** on weekdays and **2×** on weekends and holidays. A rule can be for one employee category (WORKER, STAFF…) or for everyone.
- **Overtime** lists OT entries (employee, date, hours) waiting for approval. Only **approved** OT is paid by payroll.

**Who uses it:** HR / compliance officers set rules; managers approve OT.

## Before you start

- Adding or editing rules and approving OT need a **manager or admin** role.
- Check the legal OT rate for your factory (Bangladesh Labour Act: normally 2× the basic hourly rate) with your compliance team.

## Steps

### A. Create an OT rule

1. Open **HR → Attendance Setup → Overtime rules** (\`/app/hr/attendance/overtime-rules\`).
2. Type **Code** and **Name**. Optionally type **Employee category (optional)** (for example \`WORKER\`).
3. Check the three multiplier boxes: **Weekday mult** (starts at 1.5), **Weekend mult** (2) and **Holiday mult** (2).
4. Click **Add rule**.
5. To change a rule later: click **Edit** on the row → change the multipliers or untick **Active** → **Save**.

### B. Approve overtime

1. Open **HR → Attendance → Overtime** (\`/app/hr/attendance/overtime\`).
2. Check **Emp**, **Date** and **Hours** against the supervisor's OT sheet.
3. Click **Approve** on each correct **PENDING** row.

## What happens next

Payroll adds the approved OT hours for the period to the worker's pay (OT hours × hourly rate × multiplier).

## Tips

- OT entries are created by your attendance device integration or by IT — this screen has no "add" form.
- Approve OT before the payroll period is processed; late approvals are not picked up by a run that is already finalized.

## Common problems

- **"Overtime rule code already exists"** → use another code or edit the existing rule.
- **No Approve button** → the entry is already approved (or posted).
- **"Only manager/admin can perform this action"** → ask a manager.`,
      tags: ["HR", "overtime", "OT", "attendance"],
      keywords: ["OT", "overtime", "extra hours", "OT rate", "multiplier", "double OT", "holiday OT", "approve OT"],
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/hr-attendance-overtime-rules.jpg",
      images: [
        {
          src: "/tutorials/screens/hr-attendance-overtime-rules.jpg",
          alt: "Overtime rules form with Code, Name, Employee category and multipliers 1.5, 2 and 2",
          caption: "Overtime Rules: the multiplier boxes start at 1.5 (weekday), 2 (weekend) and 2 (holiday).",
        },
        {
          src: "/tutorials/screens/hr-attendance-overtime.jpg",
          alt: "Overtime entries table with Emp, Date, Hours, Status and Actions columns",
          caption: "Overtime: each PENDING row has an Approve button.",
        },
      ],
      relatedAppRoutes: ["/app/hr/attendance/overtime-rules", "/app/hr/attendance/overtime"],
      relatedArticleIds: ["hr-pay-overtime", "hr-daily-attendance", "hr-shifts-roster-holidays", "hr-overview"],
    },
    {
      id: "hr-leave-setup",
      title: "Set up leave types, policies and balances",
      summary: "Create leave types such as casual and sick leave, check yearly quotas, and run the year-end carry forward.",
      estimatedMinutes: 5,
      content: `## Overview

- **Leave Types** — the kinds of leave (Casual, Sick, Earned/Annual, Maternity…), whether each is **paid** and whether it **requires approval**.
- **Policies** — yearly quota and maximum carry-forward days per leave type and employment type.
- **Balances** — for each employee, leave type and year: **Allocated**, **Used**, **Pending** and **Closing** days.

**Who uses it:** HR managers (set-up); HR officers (checking balances).

## Before you start

- Creating or changing leave types needs a **manager / admin** role or the permission \`hr.leave.types.manage\`.
- **Run carry forward** and **Leave encashment** need a manager or admin.
- Agree your leave rules with management (Bangladesh Labour Act: casual 10 days, sick 14 days, earned 1 day per 18 days worked, maternity 16 weeks).

## Steps

### A. Add a leave type

1. Open **HR → Leave & Payroll Setup → Leave types** (\`/app/hr/leave/types\`).
2. Click **Add leave type**.
3. Type **Code** (for example \`CL\`) and **Name** (Casual leave).
4. Tick or untick **Paid leave**, **Requires approval** and **Active**.
5. Click **Save**.

### B. Check policies

1. Open **HR → Leave & Payroll Setup → Leave policies** (\`/app/hr/leave/policies\`).
2. Each row shows the **Leave type**, **Employment** type and **Annual quota**.
3. To add one, click **+ Add policy** (choose the leave type and **Effective from**). To change one, click **Edit** on the row → **Employment type**, **Annual quota (days)**, **Max carry-forward (days)**, **Effective from / to**, **Active** → **Save**.

### C. Check balances and close the year

1. Open **HR → Leave → Balances** (\`/app/hr/leave/balances\`).
2. Read **Allocated**, **Used**, **Pending** and **Closing** for each employee and leave type.
3. At year end, in **Year-end carry forward** set **From year** and **To year** and click **Run carry forward**. It is safe to run more than once: each balance is carried only once, and never more than the policy's **max carry forward days**.

## What happens next

- Leave requests use the type's **Requires approval** setting: if it is off, requests are approved immediately.
- When an employee has an **Allocated** balance for a paid type, requests above the remaining days are blocked.
- Payroll treats approved days of a type with **Paid leave** unticked as unpaid leave.

## Tips

- Keep codes short (CL, SL, EL, ML) — they are what people remember.
- Untick **Active** to retire a type; never reuse a code for a different meaning.
- **Leave encashment (preview)** on the **Balances** tab takes an **Employee** (search by code or name) and **Days** and is still a preview — check with payroll before using it.
- Add a new quota rule with **+ Add policy** on **Leave & Payroll Setup → Leave policies** (leave type and **Effective from** are required).

## Common problems

- **"Leave type code already exists"** → the code is used; pick another or edit the existing type.
- **"Only manager/admin can perform this action"** → you need a manager / admin role or \`hr.leave.types.manage\`.
- **Policies list is empty and there is no Add button** → policies are created by your system administrator today; ask them to load your quotas.
- **Balances show nothing** → no leave has been requested or allocated yet; a balance row is created with the first request.`,
      tags: ["HR", "leave", "leave types", "policies", "balances", "setup"],
      keywords: ["leave type", "casual leave", "CL", "sick leave", "SL", "earned leave", "EL", "annual leave", "maternity", "quota", "carry forward", "encashment", "leave balance", "chhuti", "hr.leave.types.manage"],
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/hr-leave-types.jpg",
      infographics: [
        {
          type: "steps",
          title: "Leave set-up",
          steps: [
            {
              title: "Add leave type",
              body: "**Add leave type** → Code, Name, **Paid leave**, **Requires approval**, **Active** → **Save**.",
              imageSrc: "/tutorials/screens/hr-leave-type-add-form.jpg",
              imageAlt: "Add leave type side panel with code ML, name Maternity leave and three ticked boxes",
              href: "/app/hr/leave/types",
            },
            {
              title: "Check policies",
              body: "Annual quota and carry-forward per type; add with **+ Add policy**, change with **Edit**.",
              imageSrc: "/tutorials/screens/hr-leave-policies.jpg",
              imageAlt: "Leave policies table with Leave type, Employment, Annual quota and an Edit button on each row",
              href: "/app/hr/leave/policies",
            },
            {
              title: "Balances and carry forward",
              body: "Read Allocated / Used / Pending / Closing; at year end click **Run carry forward**.",
              imageSrc: "/tutorials/screens/hr-leave-balances.jpg",
              imageAlt: "Leave balances page with Year-end carry forward and Leave encashment panels",
              href: "/app/hr/leave/balances",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/hr/leave/types", "/app/hr/leave/policies", "/app/hr/leave/balances"],
      relatedArticleIds: ["hr-leave-request-approval", "hr-ess", "hr-overview"],
    },
    {
      id: "hr-leave-request-approval",
      title: "Apply for leave and approve it",
      summary: "Enter a leave application for a worker (or let them use My Leave), approve or reject it, and see it on the leave calendar.",
      featured: true,
      estimatedMinutes: 6,
      content: `## Overview

A leave request moves through simple statuses:

- **PENDING** — waiting for a manager. The days are reserved straight away (shown as **Pending** in Balances).
- **APPROVED** — the days move from Pending to **Used**.
- **REJECTED** — the reserved days are given back.

If the leave type does not require approval, the request is **APPROVED** as soon as it is saved.

**Who uses it:** HR officers (enter paper applications), employees (**My Leave**), managers (approve).

## Before you start

- Leave types exist (see **Set up leave types, policies and balances**).
- The employee exists in **HR → Employees** (you will pick them by code or name).
- Approving or rejecting needs a **manager or admin** role.

## Steps

### A. Enter the request (HR)

1. Open **HR → Leave → Requests** (\`/app/hr/leave/requests\`).
2. Click **+ Add leave request**. A panel opens on the right; fields marked with two stars are mandatory.
3. Search the **Employee** by code or name and choose the **Leave type** from the list (both required).
4. Pick **From date** and **To date** (required).
5. Type **Days requested** (for example \`2\`, or \`0.5\` for a half day) and a **Reason**. The app counts the real days from the dates (see below), so the number only matters for a half day.
6. Click **Save**. "Saved successfully." appears and the request shows in the list with status **PENDING** (or **APPROVED** if no approval is needed).

Employees can do the same themselves in **My HR → Leave** (they only choose the leave type and dates).

### How leave days are counted (HR leave and My Leave)

- Every date from **From** to **To** counts, except **weekend** days and **holidays** from **Attendance Setup → Holidays** (optional holidays still count). The weekend is **Friday** unless a manager changes it on **HR → HR Setup → Settings** (\`/app/hr/settings\`) — the production planning calendar does not change leave days.
- A single working day can be a **half day** (0.5). The number typed in "days" is otherwise ignored.
- The request is refused with a message when **To** is before **From**; when the dates are all weekends / holidays; when the dates **overlap** your own pending or approved leave; or when the leave **crosses the year end** — apply separately for each year.

### B. Approve or reject (manager)

1. Open **HR → Leave → Approvals** (\`/app/hr/leave/approvals\`). Only **PENDING** requests are listed.
2. Check the **Employee** (name and code), **Leave type**, **From**, **To**, **Days** and **Reason**. Use **Search** to find one person.
3. Click the green **Approve** button or **Reject** on the row (Reject asks for an optional reason). A message confirms the decision and the row disappears.
4. Click **Refresh** to load new requests.

### C. See who is on leave

Open **HR → Leave → Calendar** (\`/app/hr/leave/calendar\`), set **Year** and **Month**. Every approved leave in that month is listed with its dates.

## What happens next

- **Balances**: Used goes up and Closing goes down.
- **HR Reports → Leave Report** counts the request under Approved, Pending or Rejected.
- **Payroll** auto-calculate counts approved days as paid leave or unpaid leave (by the leave type's **Paid leave** setting).
- The **HR Dashboard** "Pending leave" card shows how many are waiting.

## Tips

- Approve leave before the month's payroll run so pay is right.
- For the attendance **Summary**, also record those days in **Daily Entry** with status \`LEAVE\`.
- A pending request can be changed only while it is DRAFT or PENDING — reject and re-enter if the dates were wrong after approval.

## Common problems

- **"Insufficient leave balance: available X day(s), requested Y"** → the employee has used their allocation for this paid type. Choose another type (for example unpaid) or ask HR to review the allocation.
- **Refused because of dates** (To before From, only weekends / holidays, overlap with existing leave, crossing the year end) → fix the dates; for leave over the new year, enter two requests.
- **"Employee not found" / "Leave type not found"** → the ID number is wrong.
- **"Only manager/admin can perform this action"** on Approve → you are not a manager.
- **"Only pending requests can be approved"** → someone already decided it; click **Refresh**.`,
      tags: ["HR", "leave", "approval", "leave request", "calendar"],
      keywords: ["apply leave", "leave application", "chhutir abedon", "approve leave", "reject leave", "pending leave", "leave calendar", "insufficient leave balance", "half day"],
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/hr-leave-request-form.jpg",
      videos: [
        {
          src: "/tutorials/videos/hr-leave-application.webm",
          poster: "/tutorials/videos/hr-leave-application-poster.jpg",
          title: "Enter a leave application and find it for approval",
          caption: "Fill Add leave request (not saved in the demo), then open Leave Approvals where managers click Approve or Reject on the row.",
          durationSeconds: 41,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "Leave approval flow",
          caption: "How a request moves from PENDING to APPROVED or REJECTED and what changes in the balance.",
          imageSrc: "/tutorials/diagrams/hr/hr-leave-approval-flow.svg",
          imageAlt:
            "Flow: request entered, balance check, requires approval check, PENDING, manager approves or rejects, then calendar, balances and payroll",
        },
        {
          type: "steps",
          title: "Request → approve → calendar",
          steps: [
            {
              title: "Fill Add leave request",
              body: "**+ Add leave request** → search the **Employee**, choose the **Leave type**, **From date**, **To date**, **Days requested**, **Reason** → **Save**.",
              imageSrc: "/tutorials/screens/hr-leave-request-form.jpg",
              imageAlt: "Leave page, Requests tab, with the Add leave request side panel filled for two days",
              href: "/app/hr/leave/requests",
            },
            {
              title: "Manager approves",
              body: "**Leave → Approvals** → **Approve** or **Reject** on the row.",
              imageSrc: "/tutorials/screens/hr-leave-approvals.jpg",
              imageAlt: "Leave Approvals page with Refresh button and the message No pending requests",
              href: "/app/hr/leave/approvals",
            },
            {
              title: "Check the calendar",
              body: "**Leave → Calendar** → pick **Year** and **Month**.",
              imageSrc: "/tutorials/screens/hr-leave-calendar.jpg",
              imageAlt: "Leave calendar with Year 2026 and Month 11 and no approved leave",
              href: "/app/hr/leave/calendar",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/hr/leave/requests", "/app/hr/leave/approvals", "/app/hr/leave/calendar"],
      relatedArticleIds: ["hr-leave-setup", "hr-ess", "hr-settings-weekend", "hr-daily-attendance", "hr-pay-monthly-run", "hr-overview", "wf-approvals"],
    },
    {
      id: "hr-ess",
      title: "Employee Self-Service: my profile, attendance, leave, payslips and tickets",
      summary: "Every employee with a linked login can update contact details, see attendance, apply for leave, view payslips and raise HR tickets — in English or Bangla.",
      featured: true,
      estimatedMinutes: 5,
      content: `## Overview

**My HR** (employee self-service, ESS) gives each employee their own tabs:

- **My Profile** — see your code, department and designation; update **Email**, **Phone** and **Address**.
- **My Attendance** — your monthly attendance summary (**Month**, **Present**, **Absent**, **Late**, **Overtime (hours)**).
- **My Leave** — apply for leave and follow the status.
- **My Payslips** — your payslips by **Payroll month** (October salary shows as October even if paid in November), with **Gross**, **Deduction**, **Net** and **Status**. Click **Download PDF** on a row to save the payslip.
- **My Tickets** — send a **Query**, **Complaint** or **Request** to HR.

**My Leave**, **My Attendance** and **My Payslips** have an **English / বাংলা** switch at the top right.

## Before you start

- HR must link your login to your employee record: **Employees → Edit** (or **Add employee**) → **Linked app user (ESS / login)**.
- Without the link you see "Employee profile not linked with current user" (or, on My Profile, "Your login account is not linked to an employee record yet…").

## Steps

### A. Apply for leave yourself

1. Open **HR → My HR → Leave** (\`/app/hr/ess/leave\`).
2. Click **+ Request leave** and choose the **Leave type** from the list (Casual, Sick…).
3. Pick **From Date** and **To Date**, check **Days requested** (all required) and write a **Reason**. Weekend days and company holidays inside the dates are not counted; a single working day can be a half day (0.5).
4. Click **Save**. Your request appears in the list as **DRAFT**.
5. Check the dates, then click **Submit** on the row. The status becomes **PENDING** and the request goes to your manager.

### B. Switch to Bangla

1. On **My HR → Leave**, **Attendance** or **Payslips**, open the language box at the top right.
2. Choose **বাংলা**. Headings, labels and buttons change to Bangla. Choose **English** to switch back. The choice is remembered on this device.

### C. Update your contact details

1. Open **My Profile** (\`/app/hr/ess/profile\`).
2. Change **Email**, **Phone** or **Address** and click **Save profile**.

### D. Raise a ticket to HR

1. Open **My Tickets** (\`/app/hr/ess/tickets\`).
2. Choose **Query**, **Complaint** or **Request**, type a **Subject** and **Details**.
3. Click **Submit ticket**. It appears in the list with its status.

## What happens next

- After you click **Submit**, your leave goes to **HR → Leave → Approvals** for your manager. A **DRAFT** is not seen by anyone else yet.
- Payslips appear in **My Payslips** after payroll is approved.
- HR answers tickets; check the status in **My Tickets**.

## Tips

- Use **Refresh** to see the latest status.
- For IT or system problems (not HR questions) use **Support → My tickets** instead.

## Common problems

- **"Employee profile not linked with current user"** → ask HR to set **Linked app user (ESS / login)** on your employee record.
- **"Insufficient leave balance…"** → you have used this leave type's allocation; talk to HR.
- **"Leave type not found"** or the list is empty → HR has not set up (or has switched off) that leave type; ask HR.
- **My Payslips is empty** → payroll for the month is not approved yet.`,
      tags: ["HR", "ESS", "self-service", "Bangla", "বাংলা", "leave", "payslips"],
      keywords: [
        "self service",
        "ESS",
        "my leave",
        "my attendance",
        "my payslip",
        "salary slip",
        "pay slip",
        "my profile",
        "HR ticket",
        "complaint",
        "Bangla",
        "বাংলা",
        "language",
        "chhutir abedon",
      ],
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/hr-ess-leave-form.jpg",
      infographics: [
        {
          type: "steps",
          title: "Self-Service in practice",
          steps: [
            {
              title: "Apply on My Leave",
              body: "**+ Request leave** → **Leave type**, **From date**, **To date**, **Days requested**, **Reason** → **Save**, then **Submit** on the row.",
              imageSrc: "/tutorials/screens/hr-ess-leave-form.jpg",
              imageAlt: "My HR, Leave tab, with the Request leave side panel: Casual leave for one day and the reason Doctor appointment",
              href: "/app/hr/ess/leave",
            },
            {
              title: "Switch to বাংলা",
              body: "Choose **বাংলা** in the language box at the top right.",
              imageSrc: "/tutorials/screens/hr-ess-leave-bangla.jpg",
              imageAlt: "My Leave page shown in Bangla after choosing বাংলা in the language box",
              href: "/app/hr/ess/leave",
            },
            {
              title: "Raise a ticket",
              body: "**My Tickets** → Query / Complaint / Request, **Subject**, **Details** → **Submit ticket**.",
              imageSrc: "/tutorials/screens/hr-ess-tickets.jpg",
              imageAlt: "My HR tickets page with category, subject, details and Submit ticket button",
              href: "/app/hr/ess/tickets",
            },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/hr-ess-profile.jpg",
          alt: "My Profile page with the message that the login is not linked to an employee record",
          caption: "What you see before HR links your login — HR fixes it on the employee record (Linked app user).",
        },
        {
          src: "/tutorials/screens/hr-ess-attendance.jpg",
          alt: "My HR, Attendance tab, with the language box and the monthly attendance summary of a linked employee",
          caption: "My Attendance shows your present, absent and late days and overtime hours per month.",
        },
        {
          src: "/tutorials/screens/hr-ess-payslips.jpg",
          alt: "My Payslips page with the language box, Refresh and the not-linked warning shown to the demo user",
          caption: "My Payslips shows Gross, Deduction, Net and Status for each payslip, with Download PDF.",
        },
      ],
      relatedAppRoutes: ["/app/hr/ess/profile", "/app/hr/ess/attendance", "/app/hr/ess/leave", "/app/hr/ess/payslips", "/app/hr/ess/tickets"],
      relatedArticleIds: ["hr-leave-request-approval", "hr-add-employee", "hr-pay-payslips-bank", "hr-overview", "sup-tickets"],
    },
    {
      id: "hr-recruitment",
      title: "Recruitment: requisitions, candidates, interviews and offers",
      summary: "Open a vacancy, record applicants, log interviews and make an offer — then add the new joiner as an employee.",
      estimatedMinutes: 5,
      content: `## Overview

Recruitment in P7 ERP has four tabs on **HR → Recruitment**:

1. **Job Requisitions** — an approved vacancy (title, number of vacancies, department).
2. **Candidates** — the people who applied.
3. **Interviews** — when each candidate was interviewed, by whom, and the result.
4. **Offers** — the position and salary offered.

**Who uses it:** HR / admin officers.

## Before you start

- Departments exist (the requisition can be linked to one).
- Forms link to each other by name: you pick the requisition, candidate or interviewer from a list — no ID numbers.

## Steps

### A. Open a vacancy

1. Open **HR → Recruitment → Job requisitions** (\`/app/hr/recruitment/requisitions\`).
2. Click **+ Add requisition**. Type the **Title** (for example "Sewing Operator") and the number of vacancies; optionally choose the **Department** and the **Hiring manager**.
3. Click **Save** ("Requisition created.").
4. Later, click **Change status** on the row and pick or type the new status (for example \`open\`, \`filled\`, \`cancelled\`).

### B. Add a candidate

1. Open the **Candidates** tab.
2. Click **+ Add candidate**, type the **Full name** (required), then **Email**, **Mobile**, **Current designation**, and choose the **Job requisition**.
3. Click **Save**.

### C. Schedule an interview

1. Open the **Interviews** tab.
2. Click **+ Schedule interview**, choose the **Candidate**, pick the **Date and time** (both required), then search the **Interviewer**, choose the **Mode** and type the **Location / meeting link**.
3. Click **Save**. The interview starts as **scheduled**.
4. After the interview, click **Completed** on the row — or **Actions → Cancel interview** if it did not happen.

### D. Make an offer

1. Open the **Offers** tab.
2. Click **+ Add offer**, choose the **Candidate** and type the **Position offered** (both required); add the **Proposed salary**, **Currency**, **Joining date** and **Notes** if known.
3. Click **Save**. The offer starts as **draft**.
4. Click **Mark sent** when the letter goes out, then **Accepted** or **Rejected** when the candidate answers. **Withdraw** is in the **Actions** menu. Changing an offer's status needs a manager or admin.

## What happens next

When the candidate joins, add them in **HR → Employees → Add employee** (or **AI Onboarding** from their CV). The **HR Dashboard** "Open hiring" card counts open requisitions.

## Tips

- Click a status chip (for example **scheduled** or **sent**) above a list to see only those rows.
- Keep requisition status words consistent (\`open\`, \`filled\`, \`closed\`, \`cancelled\`) so lists are easy to read.

## Common problems

- **Save does nothing** → a field marked with two stars is empty; the panel shows which one.
- **The candidate is missing from the list** → add the candidate on the **Candidates** tab first.
- **Status not changing** → offer status changes need a manager or admin; interviews that are **completed** or **cancelled** cannot be changed.`,
      tags: ["HR", "recruitment", "hiring", "candidates", "interviews", "offers"],
      keywords: ["recruit", "hiring", "vacancy", "job opening", "requisition", "applicant", "candidate", "interview", "offer letter", "niyog"],
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/hr-recruitment-requisitions.jpg",
      infographics: [
        {
          type: "flow",
          title: "Hiring chain",
          steps: [
            { label: "Job Requisitions", href: "/app/hr/recruitment/requisitions" },
            { label: "Candidates", href: "/app/hr/recruitment/candidates" },
            { label: "Interviews", href: "/app/hr/recruitment/interviews" },
            { label: "Offers", href: "/app/hr/recruitment/offers" },
            { label: "Add employee", href: "/app/hr/employees" },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/hr-candidate-form.jpg",
          alt: "Recruitment page, Candidates tab, with the Add candidate side panel filled with Nasima Begum and a phone number",
          caption: "Add candidate: Full name is mandatory (marked with two stars).",
        },
        {
          src: "/tutorials/screens/hr-recruitment-interviews.jpg",
          alt: "Interviews page with the Add interview form",
          caption: "Interviews: the candidate and the date and time are mandatory.",
        },
        {
          src: "/tutorials/screens/hr-recruitment-offers.jpg",
          alt: "Offers page with the Add offer form",
          caption: "Offers: the candidate and the position offered are mandatory.",
        },
      ],
      relatedAppRoutes: [
        "/app/hr/recruitment/requisitions",
        "/app/hr/recruitment/candidates",
        "/app/hr/recruitment/interviews",
        "/app/hr/recruitment/offers",
      ],
      relatedArticleIds: ["hr-add-employee", "hr-ai-onboarding", "hr-overview"],
    },
    {
      id: "hr-performance",
      title: "Performance cycles, goals and reviews",
      summary: "Create a review period, follow goals, record review ratings and watch the performance dashboard.",
      estimatedMinutes: 4,
      content: `## Overview

- **Performance Cycles** — a review period with a start and end date (status draft → active → closed).
- **Goals** — targets for each employee inside a cycle; a draft goal is **Submitted** for manager review.
- **Reviews** — the rating and period for each employee.
- **Performance Dashboard** — **Total Goals**, **Completed Goals**, **Pending Reviews** and **Average Rating**.

**Who uses it:** HR and line managers (for staff appraisal, increments and promotions).

## Before you start

- Employees exist (you pick them by code or name). Goals and reviews belong to a **performance cycle**, so create the cycle first.

## Steps

### A. Create a cycle

1. Open **HR → Performance → Cycles** (\`/app/hr/performance/cycles\`).
2. Click **+ Add cycle**, type the **Name** (for example "2026 Annual appraisal") and **Description**, pick the start and end dates, and click **Save**.
3. When the appraisal is finished, click **Close cycle** on the row. Goals can no longer be added or changed in a closed cycle.

### B. Add and submit goals

1. Open the **Goals** tab.
2. Click **+ Add goal**, choose the **Cycle**, search the **Employee**, type the **Title** and, if you use them, the **Weight** and **Target**. Click **Save**.
3. For your own goal with status \`draft\`, click **Submit** on the row. The message "Goal submitted." appears.
4. A manager or admin sees **Approve** on other people's \`draft\` or \`submitted\` goals. Clicking it marks the goal **approved** ("Goal approved.").

### C. Add a review

1. Open the **Reviews** tab.
2. Click **+ Add review**, choose the **Performance cycle** and search the **Employee** (both required). Optionally search the **Reviewer** and type the **Self rating** and **Manager rating** (0 to 5) and comments.
3. Click **Save**. When the review is final, click **Submit** on the row.

### D. Watch progress

Open **Performance Dashboard** (\`/app/hr/performance/dashboard\`) and click **Refresh**.

## What happens next

Use ratings when you plan increments in payroll salary structures. There is no automatic link to pay.

## Tips

- Agree one rating scale (for example 1 = poor … 5 = excellent) for the whole company.

## Common problems

- **The cycle is missing from the list** → it is closed, or it was not created yet (**Cycles** tab).
- **Submit or Approve is missing** → the goal is already approved or closed, it belongs to someone else and you are not a manager, or the review was already submitted.
- **An error about the rating when saving** → ratings must be between 0 and 5.`,
      tags: ["HR", "performance", "appraisal", "goals", "reviews"],
      keywords: ["appraisal", "performance review", "KPI", "goal", "rating", "increment", "promotion", "evaluation"],
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/hr-performance-cycles.jpg",
      images: [
        {
          src: "/tutorials/screens/hr-performance-goals.jpg",
          alt: "Performance goals page with Refresh and a note that goals are created via API",
          caption: "Goals: add goals with + Add goal; Submit your own drafts, managers Approve.",
        },
        {
          src: "/tutorials/screens/hr-performance-reviews.jpg",
          alt: "Performance Reviews page with the Add review form",
          caption: "Reviews: the performance cycle and the employee are mandatory; ratings use 0 to 5.",
        },
        {
          src: "/tutorials/screens/hr-performance-dashboard.jpg",
          alt: "Performance Dashboard with Total Goals, Completed Goals, Pending Reviews and Average Rating cards",
          caption: "The Performance Dashboard sums up goals and reviews.",
        },
      ],
      infographics: [
        {
          type: "flow",
          title: "Appraisal cycle",
          steps: [
            { label: "Performance Cycles", href: "/app/hr/performance/cycles" },
            { label: "Goals", href: "/app/hr/performance/goals" },
            { label: "Reviews", href: "/app/hr/performance/reviews" },
            { label: "Performance Dashboard", href: "/app/hr/performance/dashboard" },
          ],
        },
      ],
      relatedAppRoutes: [
        "/app/hr/performance/cycles",
        "/app/hr/performance/goals",
        "/app/hr/performance/reviews",
        "/app/hr/performance/dashboard",
      ],
      relatedArticleIds: ["hr-overview", "hr-recruitment"],
    },
    {
      id: "hr-employee-exit",
      title: "Employee exit (resignation or termination)",
      summary: "Record the resignation or termination, set the exit date, settle final pay and deactivate the employee — without deleting history.",
      estimatedMinutes: 5,
      content: `## Overview

When someone leaves, HR closes the record in a fixed order so pay, attendance and audits stay correct. Nothing is deleted — the employee simply becomes **Inactive**.

**Who uses it:** HR officers; payroll for the final settlement.

## Before you start

- You have the resignation letter or termination order (scan it to keep as a document record).
- Attendance and leave up to the last working day are entered and approved.

## Steps

1. Open **HR → Employees** and find the person (**Search code, name, email or phone**). Click **Actions → View**.
2. **Documents** tab — add a record for the resignation letter or termination order (**Document type**, **Document number**, date, **Notes**) and click **Add document record**.
3. **Status history** tab — type the **Status label** (for example \`RESIGNED\`, \`TERMINATED\`, \`RETIRED\`), pick the effective date, write **Remarks**, then click **Add status change**.
4. **Job** tab — set the third date box (full width) to the **exit date** and click **Save job**.
5. Create the separation, clearance and final settlement on **HR → Cases & Exits → Separations & settlement** — see **Final settlement when an employee leaves** (linked below). For unauthorised absence (a worker who stopped coming), start on **Notices & Cases** instead; the s.27(3A) decision creates the separation for you.
6. Back on the profile, click **Deactivate** (top right). The header now shows **Inactive** and the person disappears from normal lists. The employee number stays with this person and is never given to anyone else.

To bring someone back (re-join), set **Status** to **Inactive only** on Employees, then use **Actions → Activate** on their row (or open the profile and click **Activate**).

## What happens next

- Inactive employees are hidden from the Employees list unless the **Status** filter is **Inactive only** or **All statuses** (or you click the **Inactive** card).
- Their attendance, leave and payslip history stays for reports and audits.
- If their login is linked, ask the admin to disable the user under **Settings → User Mgmt**.

## Tips

- Deactivate **after** final pay is done, so the person is still available in the payroll run.
- Use the same status words every time (RESIGNED, TERMINATED, RETIRED, ABSCONDED) so reports stay clean.

## Common problems

- **Add status change does nothing** → the effective date is empty.
- **I cannot find a person who left** → set **Status** to **All statuses** on Employees.
- **The leaver still logs in** → disable their user in **Settings → User Mgmt**.`,
      tags: ["HR", "exit", "separation", "resignation", "termination", "employees"],
      keywords: ["resign", "resignation", "termination", "separation", "exit", "left job", "final settlement", "deactivate", "inactive", "absconding", "lefty", "unauthorised absence", "retire", "chakri chhara"],
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/hr-emp-detail-history.jpg",
      infographics: [
        {
          type: "steps",
          title: "Exit checklist",
          steps: [
            {
              title: "Status history",
              body: "Status label `RESIGNED` (or TERMINATED), effective date, remarks → **Add status change**.",
              imageSrc: "/tutorials/screens/hr-emp-detail-history.jpg",
              imageAlt: "Employee Status history tab with status label, date, remarks and Add status change button",
            },
            {
              title: "Exit date on Job tab",
              body: "Set the full-width date box (exit date) → **Save job**.",
              imageSrc: "/tutorials/screens/hr-emp-detail-job.jpg",
              imageAlt: "Employee Job tab with joining, confirmation and exit date boxes",
            },
            {
              title: "Final settlement, then Deactivate",
              body: "Settle final pay on **Separations & Settlement**, then click **Deactivate** at the top right of the profile.",
              imageSrc: "/tutorials/screens/hr-emp-detail-personal.jpg",
              imageAlt: "Employee profile header with Generate document and Deactivate buttons",
              href: "/app/hr/separations",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/hr/employees", "/app/hr/separations", "/app/settings/users"],
      relatedArticleIds: ["hr-pay-final-settlement", "hr-cases-notices", "hr-add-employee", "hr-leave-setup", "hr-overview"],
    },
    {
      id: "hr-reports-analytics",
      title: "HR dashboard, reports, compliance and AI insights",
      summary: "Read the HR Dashboard and HR Reports, and (when switched on) the BSCI / WRAP / SEDEX compliance score and HR AI insights.",
      estimatedMinutes: 5,
      content: `## Overview

- **HR Dashboard** (\`/app/hr\`) — cards for **Total employees**, **Pending leave**, **Payroll queue**, **Open hiring** and **Today attendance**, plus **Quick links**.
- **HR Reports** (\`/app/hr/reports\`) — **Total Employees**, **Attendance Rate**, **Pending Leave Requests**, **Payroll Runs (Month)** and three tables: **Attendance Report**, **Leave Report**, **Payroll Report**.
- **Compliance** (\`/app/hr/compliance\`) — buyer-audit frameworks (BSCI, WRAP, SEDEX): score, requirements and **Audit readiness gaps**.
- **AI Insights** (\`/app/hr/ai-insights\`) — attendance patterns, turnover risk, payroll anomalies and compliance forecast.

**Who uses it:** HR managers, compliance officers, management.

## Before you start

- **Compliance** appears only when \`compliance_tracking_enabled\` is on. Otherwise the page says "Compliance tracking is off…".
- **AI Insights** appears only when one of \`ai_attendance_analysis_enabled\`, \`ai_turnover_prediction_enabled\`, \`ai_payroll_anomaly_detection_enabled\` or \`ai_compliance_risk_prediction_enabled\` is on.
- Your admin switches these in **Settings → Configuration**.

## Steps

### A. Daily check (HR Dashboard)

1. Open **HR → HR Dashboard**.
2. If **Pending leave** is above 0, click **Leave approvals** in **Quick links**.
3. If **Today attendance** is low, check **Daily Entry** for missing punches.

### B. Monthly reports

1. Open **HR → Reports & Insights → HR reports** and click **Refresh**.
2. Read the **Attendance Report** (Present / Absent / Leave per employee), **Leave Report** (Total / Approved / Pending / Rejected per leave type) and **Payroll Report** (Gross / Deductions / Net per period).
3. For printable summaries also see **Reports → Employee Summary** and **Reports → Payroll Summary**.

### C. Compliance audit readiness

1. Open **HR → Reports & Insights → Compliance**.
2. Under **Frameworks** click **Activate** on BSCI, WRAP or SEDEX (once), then click the framework name.
3. Read the **Score** and the **Requirements** table.
4. In **Audit readiness gaps**, fix the missing documents, then use **Actions → Mark compliant** (or **Mark non-compliant**).

### D. AI insights

1. Open **HR → Reports & Insights → AI insights**. **Critical alerts** are shown at the top.
2. Read **Attendance analysis** and **Turnover risk** (click a name to open the employee).
3. Under **Payroll anomalies** choose a run in **Select payroll run** and click **Analyze run**.
4. Under **Compliance forecast** choose a framework.

## What happens next

Use the findings to act: chase missing attendance, approve leave, fix documents before a buyer audit, talk to at-risk workers.

## Tips

- AI insights are suggestions — always check the real records before acting.
- Compliance gaps often come from missing NID / birth certificate / medical records on the employee **Documents** tab (and the **Age verification** / **Medical records** tabs when switched on).

## Common problems

- **Compliance or AI Insights shows "…is off"** → the feature flag is off; ask your admin.
- **Reports show 0** → attendance or payroll has not been entered for the period yet.
- **Attendance Rate is 0%** → no Daily Entry rows exist for today.`,
      tags: ["HR", "reports", "dashboard", "compliance", "BSCI", "WRAP", "SEDEX", "AI"],
      keywords: ["HR report", "attendance report", "leave report", "payroll report", "compliance", "buyer audit", "social audit", "BSCI", "WRAP", "SEDEX", "turnover", "AI insights", "dashboard"],
      lastUpdated: "2026-11-10",
      coverImage: "/tutorials/screens/hr-reports.jpg",
      images: [
        {
          src: "/tutorials/screens/hr.jpg",
          alt: "HR Dashboard with Total employees 17, Pending leave, Payroll queue, Open hiring, Today attendance and Quick links",
          caption: "HR Dashboard: five cards and quick links to the daily jobs.",
        },
        {
          src: "/tutorials/screens/hr-compliance.jpg",
          alt: "Compliance dashboard page saying compliance tracking is off",
          caption: "Compliance when the compliance_tracking_enabled flag is off.",
        },
        {
          src: "/tutorials/screens/hr-ai-insights.jpg",
          alt: "HR AI insights page saying HR AI insights are off for this company",
          caption: "AI Insights when no HR AI flag is on.",
        },
      ],
      infographics: [
        {
          type: "flow",
          title: "From numbers to action",
          steps: [
            { label: "HR Dashboard", href: "/app/hr" },
            { label: "HR Reports", href: "/app/hr/reports" },
            { label: "Compliance", href: "/app/hr/compliance" },
            { label: "AI Insights", href: "/app/hr/ai-insights" },
          ],
        },
      ],
      relatedAppRoutes: ["/app/hr", "/app/hr/reports", "/app/hr/compliance", "/app/hr/ai-insights", "/app/reports/employee", "/app/reports/payroll"],
      relatedArticleIds: ["hr-overview", "hr-daily-attendance", "hr-add-employee", "reports-hr", "reports-overview", "ai-tools-overview"],
    },
    {
      id: "hr-bd-setup",
      title: "Configure HR for Bangladesh (RMG wage grades, leave and labour-law rules)",
      summary:
        "One click adds the official 2023 garments minimum-wage grades, designations, salary structures, leave types and settings; then review the rules and switch on enforcement area by area.",
      featured: true,
      estimatedMinutes: 10,
      audience: "hr",
      content: `## Overview

**Bangladesh setup** prepares HR and payroll for a Bangladesh garments (RMG) factory using the official minimum-wage Gazette (notification 40.00.0000.016.32.021.13.30, effective 1 December 2023) and the Bangladesh Labour Act 2006 as amended in 2026.

It only **adds** what is missing. Records you already have, or have edited, are never overwritten, and you can edit every amount afterwards.

**Who uses it:** HR manager / admin (or a role with \`hr.payroll.manage\`).

## What it adds

- **Wage grades:** worker grades 1–4 and worker apprentice, employee (staff) grades 1–4 and employee apprentice, with the Gazette basic, house rent (50% of basic), medical 750, transport 450 and food 1,250.
- **Designations** for each grade (for example Senior Operator, Operator, Junior Operator, Line Ironman) with codes like \`BD-W-G2-01\`.
- **Salary structures** \`BD-W-G1\` … \`BD-E-APP\` and pay components \`BD-BASIC\`, \`BD-HRENT\`, \`BD-MEDICAL\`, \`BD-TRANSPORT\`, \`BD-FOOD\`.
- **Leave types:** casual 10 days, sick 14 days, earned leave (1 day per 18 days worked, up to 40) and maternity.
- **Settings:** Friday weekend, overtime from salary at 2 × basic ÷ 208 per hour, and the rule that every employee needs a mobile number plus NID or birth registration number.

## Steps

1. Open **HR → HR Setup → Bangladesh setup** (\`/app/hr/bangladesh-setup\`).
2. Read the counts: **to add**, **present**, **edited by you**, **conflicts**. The **Setup items** list shows every grade, designation, leave type and setting; filter by area or **Conflicts only**.
3. Click **Configure for Bangladesh**, read the summary, then **Yes, apply**. You see how many records were created and how many were already present.
4. Check **Employee number format** at the bottom (default **EMP-** + 7 digits, so the first employee is EMP-0000001).
5. Open **Bangladesh Rules** (\`/app/hr/bangladesh-rules\`) → **Rule sets & wage schedule** → **Create official rule set**. Review **View values** and the wage schedule, then **Actions → Approve** (manager / admin).
6. **Checks & calculators** tab: run the **Minimum wage check** (who is below their grade, who has no grade), the **Festival holidays** check (13 paid festival holidays per year), and the **Service benefit** and **Maternity benefit** calculators. Nothing on this tab changes data.
7. **Wage grades** tab: give each employee their Gazette grade from a date.
8. When the checks are clean, open **Enforcement** and switch on one area at a time: **Minimum wage**, **Earned leave accrual**, **Maternity benefit**, **Festival-day work**, **Service benefits**. All are **off** by default.

## What happens next

- With **Minimum wage** on, a salary assignment or payroll line below the employee's grade is refused.
- **Maternity**, **Earned leave & festival work** and **Service benefits** tabs become usable for their workflows; each approval is manager / admin only and written to the audit log.

> **Warning:** Amounts are copied from the official Gazette and were independently checked against the Gazette pages, but your compliance officer or labour counsel should sign off before you switch enforcement on in production.

## Common problems

- **Configure button says "Already configured"** → every item is present; nothing to add.
- **Conflict on a designation** → you already have a designation with the same title under another code. Rename one of them, then apply again.
- **Enforcement switch is greyed out** → approve a rule set that covers today first.
- **"Only manager/admin can approve or switch enforcement"** → ask a manager or admin.`,
      tags: ["HR", "Bangladesh", "labour law", "minimum wage", "setup", "payroll"],
      keywords: [
        "configure for Bangladesh",
        "Bangladesh setup",
        "garments minimum wage",
        "wage board",
        "gazette 2023",
        "grade 1",
        "grade 4",
        "apprentice",
        "labour act",
        "maternity 120 days",
        "earned leave",
        "festival holiday",
        "gratuity",
        "shromo ain",
        "nimno mojuri",
      ],
      lastUpdated: "2026-11-10",
      infographics: [
        {
          type: "flow",
          title: "From setup to enforcement",
          steps: [
            { label: "Configure for Bangladesh", href: "/app/hr/bangladesh-setup" },
            { label: "Create & approve rule set", href: "/app/hr/bangladesh-rules" },
            { label: "Run checks" },
            { label: "Assign wage grades" },
            { label: "Switch on enforcement" },
          ],
        },
      ],
      relatedAppRoutes: ["/app/hr/bangladesh-setup", "/app/hr/bangladesh-rules"],
      relatedArticleIds: ["hr-add-employee", "hr-pay-setup", "hr-leave-setup", "hr-pay-final-settlement", "hr-overview"],
    },
    {
      id: "hr-manual-attendance",
      title: "Manual attendance: record IN now, OUT later",
      summary: "When the fingerprint or face machine is down, type the employee number (or scan the ID card) and the IN time, then add the OUT later from the Missing OUT list.",
      estimatedMinutes: 4,
      content: `## Overview

**Manual IN / OUT** records attendance in two steps. The day stays **open** after the IN; it counts as present (with late, early-out and overtime minutes) only after the OUT is added. These days appear in the attendance summary and the salary sheet like machine punches.

**Who uses it:** attendance clerks and HR officers (\`hr.attendance.manage\`). The screen has an English / বাংলা switch.

## Steps

1. Open **HR → Attendance → Manual IN / OUT** (\`/app/hr/attendance/manual\`).
2. **Record IN** tab: type the employee number (for example EMP-0000001) or scan the ID-card QR, click **Check** to see the name, pick the **Work date** and **IN time**, write a **Reason** (for example "Device was offline") and click **Save IN**.
3. Later, open **Missing OUT**. Every open day is listed; click **Actions → Add OUT** on the row. The OUT form opens with the number and date filled in.
4. Enter the **OUT time**. For a night shift that ends after midnight tick **OUT is after midnight (night shift)**. Click **Save OUT**. The message shows the day's result (for example PRESENT or LATE).

## What happens next

- Payroll cannot be finalized while any day in its period is still open, so clear **Missing OUT** before month end.
- To change a closed day, use **Regularizations**.

## Common problems

- **"already has an open IN (add the OUT instead)"** → the IN for that day exists; use **Missing OUT**.
- **"This day is already closed; use regularization"** → the OUT is already recorded.
- **"OUT must be after IN"** → tick the night-shift box if the OUT is after midnight.
- **"Employee is not active"** → the person was deactivated.`,
      tags: ["HR", "attendance", "manual attendance", "missing out"],
      keywords: ["manual punch", "in time", "out time", "missing out", "device offline", "hajira", "night shift"],
      lastUpdated: "2026-11-10",
      relatedAppRoutes: ["/app/hr/attendance/manual"],
      relatedArticleIds: ["hr-daily-attendance", "hr-attendance-devices", "hr-pay-monthly-run"],
    },
    {
      id: "hr-gate-passes",
      title: "Temporary gate passes and the gate scan screen",
      summary: "Print a pass with a secure QR for a visitor, contractor or new joiner; the guard scans passes and employee ID cards and every scan is logged.",
      estimatedMinutes: 4,
      content: `## Overview

A **temporary gate pass** lets someone without an ID card enter for a set time. The printed QR can only be checked by Prime7, so a photocopied or edited pass is refused. Guards use **Gate Scan** for both passes and employee ID cards.

**Who uses it:** HR / admin office (\`hr.gate_pass.manage\`) and gate guards (\`hr.gate_pass.scan\`).

## Steps

1. Open **HR → Gate Passes → Gate passes** (\`/app/hr/gate-passes\`).
2. Fill **Name on pass**, **Mobile**, optional last digits of the NID / birth registration, the host employee, **Valid from / to**, optional **Allowed zones** and the **Purpose**. Click **Create pass** (status **DRAFT**).
3. On the row click **Actions → Activate**, then **Actions → Print**. Hand the printed pass to the person.
4. At the gate, the guard opens **Gate Scan** (\`/app/hr/gate-scan\`), sets the **Gate** name and **Direction**, and scans the QR with a USB or Bluetooth scanner. The screen turns green (**ALLOWED**) or red (**DENIED**) with the reason.
5. To cancel a pass early: **Actions → Revoke** and type the reason.

## What happens next

- Every scan, allowed or denied, appears in the **Gate log**.
- A pass stops working after **Valid to**, after **Revoke**, or outside its allowed zones.

## Common problems

- **DENIED "Pass is DRAFT"** → it was not activated.
- **DENIED "Unknown pass"** → the QR is damaged or not from this company.
- **DENIED "Zone not allowed for this pass"** → type the zone on the scan screen or issue a new pass with that zone.`,
      tags: ["HR", "gate pass", "security", "visitor"],
      keywords: ["visitor pass", "temporary pass", "gate", "guard", "QR scan", "entry exit"],
      lastUpdated: "2026-11-10",
      relatedAppRoutes: ["/app/hr/gate-passes", "/app/hr/gate-scan"],
      relatedArticleIds: ["hr-add-employee", "hr-overview"],
    },
    {
      id: "hr-cases-notices",
      title: "Notices, memos, show-cause and unauthorised absence (s.27(3A))",
      summary: "Issue printed notices in English and Bangla, record delivery, replies and hearings, and follow the 10-day + 7-day procedure for a worker absent without leave.",
      estimatedMinutes: 6,
      content: `## Overview

**Notices & Cases** keeps every letter to an employee with its full history: office memos, notices, warnings, show-cause letters, disciplinary cases (s.24) and **unauthorised absence** (s.27(3A)). Each case prints in English and Bangla.

**Who uses it:** HR officers (\`hr.discipline.manage\`); decisions are manager / admin only.

## Steps (any notice)

1. Open **HR → Cases & Exits → Notices & cases** (\`/app/hr/cases\`) and click **New notice / case**.
2. Choose the employee and **Type**, write the **Subject**, the English text and the Bangla text. Click **Create draft**.
3. In the case panel click **Issue notice** and enter the issue date. **Print notice (English + Bangla)** downloads the letter.
4. Record what happens with **Record event** (delivered, response, hearing, rejoined…).
5. A manager chooses the **Decision** and clicks **Record decision**.

## Unauthorised absence (s.27(3A))

1. Workers absent more than **10 days** with no attendance or approved leave appear in **Absent more than 10 days**. Click **Actions → Start absence case** — the Bangla and English text is filled in for you.
2. **Issue notice**: the worker has **10 days** to explain in writing and rejoin.
3. If the worker does not rejoin, click **Issue 7-day defence notice** after the 10 days.
4. After the 7 days, a manager records **deemed resignation**. Prime7 creates a DRAFT separation on **Separations & Settlement** for the final dues.

## Common problems

- **"the explain-and-rejoin notice can be issued only after more than 10 days of absence"** → wait until the 11th day.
- **"The employee rejoined; close the case instead"** → record the decision **rejoined**.
- **"Record the hearing (s.24 procedure) before a dismissal"** → add a **hearing** event first.`,
      tags: ["HR", "discipline", "notice", "absence", "show cause"],
      keywords: ["memo", "warning letter", "show cause", "lefty", "absconding", "unauthorised absence", "27(3A)", "deemed resignation", "disciplinary", "hearing", "notish"],
      lastUpdated: "2026-11-10",
      relatedAppRoutes: ["/app/hr/cases"],
      relatedArticleIds: ["hr-pay-final-settlement", "hr-employee-exit", "hr-overview"],
    },
  ],
};

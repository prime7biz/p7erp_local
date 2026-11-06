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

**Who uses it:** HR officers and admin staff (daily), line supervisors and managers (approvals), accounts (payroll), and every employee (Self-Service).

**Why it matters:** payroll can only be correct when the employee master, attendance and leave are correct. Set up HR in the order below and keep it up to date every day.

## Before you start

- You need an HR, manager or admin role. Some actions are limited to **manager / admin** (approvals, holidays, overtime rules, carry forward).
- Two fine-grained permission keys exist under **Settings → Roles**: \`hr.attendance.manage\` (edit a saved attendance entry) and \`hr.leave.types.manage\` (create or change leave types). Without them, only a manager or admin can do these jobs.
- Some screens appear only when a feature flag is on (ask your admin to check **Settings → Configuration**): **AI Onboarding** (OCR flags), **Compliance** (\`compliance_tracking_enabled\`), **AI Insights** (HR AI flags) and **Statutory Config** (\`statutory_payroll_enabled\`).

## Steps — where everything is

The HR sidebar has eight groups. Open **HR** in the sidebar and expand the group you need.

1. **Overview → HR Dashboard** (\`/app/hr\`) — counts of employees, pending leave, payroll queue, open hiring and today's attendance, plus quick links. **Overview → HR Settings** (\`/app/hr/settings\`) — weekend days and overtime pay from salary.
2. **Core HR** — **Departments**, **Designations**, **Sections & Lines**, **Employees**, **AI Onboarding**. Set these up first.
3. **Time & Attendance** — **Shifts**, **Holidays**, **Roster**, **Daily Entry**, **Attendance Devices** (\`/app/hr/attendance/devices\`, for fingerprint / card machines), **Regularizations**, **Overtime Rules**, **Overtime**, **Summary**.
4. **Leave** — **Leave Types**, **Policies**, **Balances**, **Requests**, **Approvals**, **Calendar**.
5. **Payroll** — **Components**, **Salary Structures**, **Structure Assignments**, **Periods**, **Runs**, **Advances & Loans**, **Bonuses**, **Accounting Config**, **Statutory Config**, **Approvals**, **Payslips**. Step-by-step help is in the **HR — Payroll & compliance** section: **Payroll module map**, **Payroll setup**, **Run monthly payroll**, **Piece-rate and daily-wage workers**, **Overtime**, **Festival bonus, advances and loans**, **Payslips, bank advice file and posting to Finance**, **Statutory deductions and tax**, **Final settlement** and **Payroll troubleshooting** (all linked at the bottom of this page).
6. **Talent** — **Performance Cycles**, **Goals**, **Reviews**, **Performance Dashboard**, **Job Requisitions**, **Candidates**, **Interviews**, **Offers**.
7. **Self-Service** — **My Profile**, **My Attendance**, **My Leave**, **My Payslips**, **My Tickets** (for every employee).
8. **Analytics** — **Compliance**, **AI Insights**, **HR Reports**.

**HR Settings** holds company-wide HR rules: the **weekend days** used when counting leave, and **overtime pay from salary**. See **HR Settings: weekend days** and **Overtime pay from salary**.

### Recommended set-up order (first week)

1. **Departments** → **Designations** → **Sections & Lines**.
2. **Employees** (add or import from Excel). Link each person's login in **Linked app user (ESS / login)**.
3. **Shifts** → **Holidays** → **Roster**, and the weekend on **HR Settings**.
4. **Leave Types** (and policies / balances).
5. **Overtime Rules**.
6. Payroll set-up (components, structures, assignments, periods).
7. Optional: **Attendance Devices** if you use fingerprint / card machines.

## What happens next

- Daily: attendance is entered in **Daily Entry** (by hand or a biometric batch) or imported from **Attendance Devices**, leave is requested and approved, overtime is approved.
- Leave days are counted for you: weekend days and company holidays are skipped. See **Apply for leave and approve it**.
- Monthly: payroll reads approved overtime and approved leave (paid or unpaid) for the period and creates payslips. Employees see them in **My Payslips**.
- At exit: the employee's status history, exit date and final settlement close the record. See **Employee exit (resignation or termination)**.

There is **no separate Training or Disciplinary screen** yet. Keep certificates and warning letters as document records on the employee's **Documents** tab, and record status changes on **Status history**.

## Tips

- Every list uses one **Actions** button per row (View, Edit, Approve…). See **Row actions**.
- Several forms ask for an **Employee ID**. This is the system number, not the employee code. Open the employee (**Actions → View**) and read the number at the end of the web address, for example \`/app/hr/employees/12\` → Employee ID **12**.
- **বাংলা / Bangla** — **My Leave**, **My Attendance** and **My Payslips** have an **English / বাংলা** switch at the top right. The choice is remembered on that device. Other HR screens are in English.

## Common problems

- **A screen from this guide is missing in my sidebar** → it is behind a feature flag or your role. Ask your admin to check **Settings → Configuration** and **Settings → Roles**.
- **"Only manager/admin can perform this action"** → ask a manager to do it, or ask the admin to give your role the matching permission.
- **Self-Service pages say "Employee profile not linked with current user"** → HR must open your employee record and choose your login in **Linked app user (ESS / login)**.`,
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
      ],
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/hr.jpg",
      infographics: [
        {
          type: "diagram",
          title: "HR module map",
          caption: "The eight HR sidebar groups and how data flows from people to attendance and leave to payroll.",
          imageSrc: "/tutorials/diagrams/hr/hr-module-map.svg",
          imageAlt:
            "Diagram of HR groups: Core HR, Time and Attendance, Leave, Payroll, Talent, Self-Service and Analytics with arrows into Payroll",
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
        "hr-org-setup",
        "hr-add-employee",
        "hr-ai-onboarding",
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

1. Open **HR → Core HR → Departments** (\`/app/hr/departments\`).
2. Click **Add department**.
3. Type the **Department code** and **Department name**. Keep **Active** ticked.
4. Click **Save**.

### B. Add a designation

1. Open **HR → Core HR → Designations** (\`/app/hr/designations\`).
2. Click **Add designation**.
3. Type the **Designation code** and **Designation name** (both required — the screen marks required fields with two stars).
4. Choose the department in the drop-down (or leave **No department** if the title is used everywhere).
5. Click **Save**.

### C. Add a section or line

1. Open **HR → Core HR → Sections & Lines** (\`/app/hr/sections\`).
2. Click **Add section**.
3. Type the **Name** (for example "Sewing Line 05") and pick the **Type**: **Floor**, **Line**, **Section** or **Unit**.
4. Click **Save**. The code is created for you.

## What happens next

- The **Add employee** form and the employee **Job** tab show these lists in drop-downs.
- On the **Job** tab, the designation list is filtered to the department you picked.
- Sections & lines help attendance and production reports group workers by line.

## Tips

- To change a department or designation, use **Actions → Edit** on its row. Untick **Active** instead of deleting when a name is no longer used.
- **Actions → Delete** is blocked when employees are still linked — this protects old records.
- Type part of a code or name in **Search code or name** on Sections & Lines to find a line quickly.

## Common problems

- **"Save failed" with a duplicate message** → the code already exists. Use a different code.
- **The designation I want is missing on the employee Job tab** → it belongs to another department. Change the department first, or edit the designation and set **No department**.
- **Delete does nothing / shows an error** → employees are linked. Move them to another department first, or just untick **Active**.`,
      tags: ["HR", "departments", "designations", "sections", "lines", "setup"],
      keywords: ["department", "designation", "job title", "position", "post", "padobi", "line", "floor", "unit", "section", "org chart"],
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/hr-designations.jpg",
      infographics: [
        {
          type: "steps",
          title: "Organisation set-up in three screens",
          steps: [
            {
              title: "Add department",
              body: "**Core HR → Departments → Add department** — code, name, **Active**, then **Save**.",
              imageSrc: "/tutorials/screens/hr-dept-add-form.jpg",
              imageAlt: "Add department dialog with code D-QC and name Quality Control",
              href: "/app/hr/departments",
            },
            {
              title: "Add designation",
              body: "**Core HR → Designations → Add designation** — code, name and the department it belongs to.",
              imageSrc: "/tutorials/screens/hr-desig-add-form.jpg",
              imageAlt: "Add designation dialog with code SMO, name Sewing Machine Operator and department D-PROD Production",
              href: "/app/hr/designations",
            },
            {
              title: "Add section or line",
              body: "**Core HR → Sections & Lines → Add section** — name and **Type** (Floor, Line, Section, Unit).",
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
        "Create a new employee, link their login for Self-Service, then fill the Personal, Job and Documents tabs and print an ID card.",
      featured: true,
      estimatedMinutes: 8,
      content: `## Overview

The **Employees** list is the master record of every worker and staff member. Attendance, leave, payroll, production crew sheets and the Scan station all point to it.

**Who uses it:** HR officers (add and maintain), managers (view).

## Before you start

- Departments and designations exist (see **Set up departments, designations and sections & lines**).
- Decide the **Employee code** format. Use the number on the factory ID card — the same code is typed at the **Scan station** for piece-rate pay.
- If the person will use **My Leave / My Attendance / My Payslips**, create their login first under **Settings → User Mgmt**.

## Steps

### A. Add the employee

1. Open **HR → Core HR → Employees** (\`/app/hr/employees\`).
2. Type the code or name in **Search by code/name** to make sure the person is not already there (tick **Show inactive** to search old staff too).
3. Click **Add employee**.
4. Fill **Employee code** and **First name** (both required), then **Last name**, **Email** and **Phone**.
5. Pick the department (**No department** by default) and the designation (**No designation** by default).
6. In **Linked app user (ESS / login)** choose the person's login, or leave **None**.
7. Pick the joining date in the date box at the bottom.
8. Click **Save**. The new row appears in the list with status **Active**.

### B. Complete the profile

1. On the employee's row click **Actions → View**.
2. **Personal** tab — date of birth, **Gender**, **Marital status**, **Blood group**, **Emergency contact name / phone**, **Address**, **City**, **Country**, **National ID**. Click **Save personal**.
3. **Job** tab — **Employee code**, **Employment type** (for example Permanent, Probation, Contract), department, designation, **No section / line**, **Category** (**WORKER**, **STAFF**, **MANAGEMENT**) and **Reporting manager**. The three date boxes are, in order: **joining date**, **confirmation date** and (full width) **exit date**. Click **Save job**.
4. **Documents** tab — for each paper you hold (NID, birth certificate, certificates, warning letters): **Document type**, **Document number**, issue date, expiry date, **Notes**, then **Add document record**.
5. Click **Generate document** (top right) → **ID card (PDF)**, **Appointment letter** or **Age verification cert** to download a PDF.

### C. Many employees at once

- **Export Excel** downloads the current list (\`employees.xlsx\`) — use it as the template.
- **Import Excel** uploads a filled sheet. The message shows how many were created and updated.

## What happens next

- The employee appears in Roster, Daily Entry, leave forms, payroll **Structure Assignments** and production crew screens.
- If a login is linked, the person can open **Self-Service** pages.
- **Production** tab shows the worker's line, IE skills and 30-day attendance trend; **Salary** tab points to payroll payslips.
- **Age verification** and **Medical records** tabs appear only when the compliance flags are on.

## Tips

- The **Employee ID** asked for on attendance, roster and leave forms is the number at the end of the web address when you **View** the employee (for example \`/app/hr/employees/12\`).
- Use **Edit** in the row **Actions** menu to change basic fields quickly without opening the profile.
- Never delete people — use **Deactivate** on the profile when they leave (see **Employee exit**).

## Common problems

- **Save does nothing** → **Employee code** or **First name** is empty.
- **"Save failed" / code already exists** → another employee (maybe inactive) has that code. Tick **Show inactive** and search.
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
        "ID card",
        "appointment letter",
        "NID",
        "national ID",
        "import employees",
        "excel",
        "link user",
        "karmi",
      ],
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/hr-employees.jpg",
      videos: [
        {
          src: "/tutorials/videos/hr-add-employee.webm",
          poster: "/tutorials/videos/hr-add-employee-poster.jpg",
          title: "Add a new employee",
          caption: "Search first, open Add employee, fill code, name, phone and department, link the login, then Save (the demo cancels).",
          durationSeconds: 49,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Add and complete an employee",
          steps: [
            {
              title: "Fill the Add employee form",
              body: "**Employee code** and **First name** are required. Choose department, designation and **Linked app user (ESS / login)**, then **Save**.",
              imageSrc: "/tutorials/screens/hr-emp-add-form.jpg",
              imageAlt: "Add employee dialog filled with code EMP-0201, Rahima Akter, phone and department D-PROD Production",
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
              title: "Documents tab",
              body: "Record NID, certificates and expiry dates with **Add document record**.",
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
      relatedArticleIds: ["hr-org-setup", "hr-ai-onboarding", "hr-ess", "hr-employee-exit", "hr-pay-setup", "hr-overview", "mfg-scan-station"],
    },
    {
      id: "hr-ai-onboarding",
      title: "AI employee onboarding from CV and NID",
      summary: "Upload a CV, NID, birth or medical certificate, let AI read the fields, check them, then create the employee in one click.",
      estimatedMinutes: 4,
      content: `## Overview

**AI Onboarding** reads scanned HR papers and fills the new-employee form for you. You always check the fields before anything is saved. Files are only read, not stored.

**Who uses it:** HR officers onboarding many new workers.

## Before you start

- The screen appears in the sidebar only when at least one OCR flag is on: \`ocr_cv_extraction_enabled\` (CV / Resume), \`ocr_id_extraction_enabled\` (National ID and Birth certificate) or \`ocr_medical_extraction_enabled\` (Medical certificate). Your admin turns them on in **Settings → Configuration**.
- If all are off, the page shows "Document OCR is off. Enable CV, ID, or medical OCR under Settings → Configuration."
- Have a clear photo or PDF of each paper.

## Steps

1. Open **HR → Core HR → AI Onboarding** (\`/app/hr/employees/ai-onboard\`).
2. In a card (**CV / Resume**, **National ID**, **Birth certificate**, **Medical certificate**) choose the file and wait for the reading to finish.
3. Click **Apply … fields to form** under the card. The message "Extracted fields applied — review before creating employee." appears.
4. Repeat for the other papers.
5. In **Employee details (edit before save)** check every field. Type the **Employee code** and **First name** (both required) if they are empty, and correct anything the AI misread.
6. Click **Confirm & create employee**. The new employee profile opens.

Click **Cancel** to go back to Employees without saving.

## What happens next

The employee is created like a normal **Add employee**. Continue on the profile: **Job** tab (department, designation, category), **Documents** tab and the login link — see **Add an employee and complete the profile**.

## Tips

- Upload the NID first: it gives the National ID number and date of birth.
- Check Bangla names carefully — OCR can mix up similar letters.

## Common problems

- **AI Onboarding is not in the sidebar** → no OCR flag is on for your company.
- **Confirm & create employee is greyed out** → **Employee code** or **First name** is empty.
- **Reading fails** → the file is too dark, blurred or not a supported image/PDF. Scan again.`,
      tags: ["HR", "AI", "OCR", "onboarding", "employees"],
      keywords: ["scan CV", "resume", "NID scan", "national ID", "birth certificate", "medical certificate", "OCR", "auto fill", "AI onboard"],
      lastUpdated: "2026-11-06",
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
      relatedArticleIds: ["hr-add-employee", "hr-overview", "settings-overview"],
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

1. Open **HR → Time & Attendance → Shifts** (\`/app/hr/attendance/shifts\`).
2. Click **Add shift**.
3. Type **Code** (for example \`GEN\`), **Name**, **Start time (HH:MM)** and **End time (HH:MM)**.
4. Tick **Night shift** if the shift crosses midnight. Keep **Active** ticked.
5. Click **Save**.

### B. Add a holiday

1. Open **HR → Time & Attendance → Holidays** (\`/app/hr/attendance/holidays\`).
2. Pick the **Date** and type the **Name**.
3. Click **Add holiday**.
4. To mark it optional or add a note, use **Actions → Edit** → tick **Optional holiday** → **Save**.

### C. Put a worker on the roster

1. Open **HR → Time & Attendance → Roster** (\`/app/hr/attendance/roster\`).
2. Type the **Employee ID**, pick the date and type the **Shift ID**.
3. Tick **Week off** instead if the person is off that day. Add a **Note** if useful.
4. Click **Add roster entry**.
5. To change a day, use **Actions → Edit** on the row.

## What happens next

- **Daily Entry** records the actual in and out time against the employee and date.
- Holidays and week-offs are used by overtime rules (holiday and weekend multipliers).

## Tips

- **Employee ID** = the number at the end of the employee's web address (**Employees → Actions → View** → \`/app/hr/employees/12\`).
- The **Shifts** list does not show the Shift ID. Once a roster row exists, its **Shift** column shows the number; otherwise ask your admin for the ID of each shift and write it on your shift chart.
- Enter all of next year's public holidays in December so nobody forgets.

## Common problems

- **"Shift code already exists"** → pick another code or edit the existing shift.
- **"Roster already exists for employee and date"** → that day is already planned; use **Actions → Edit** on that row.
- **"Holiday already exists for this date"** → edit the existing holiday instead.
- **"Only manager/admin can perform this action"** on Holidays → ask a manager.
- **"Employee not found" / "Shift not found"** → the ID number is wrong; check it again.`,
      tags: ["HR", "attendance", "shifts", "roster", "holidays"],
      keywords: ["shift", "duty time", "night shift", "roster", "duty roster", "week off", "weekly holiday", "holiday", "chhutir din", "Eid", "public holiday"],
      lastUpdated: "2026-11-06",
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
              imageAlt: "Add shift dialog with code GEN, name General shift, 08:00 to 17:00",
              href: "/app/hr/attendance/shifts",
            },
            {
              title: "Add holidays",
              body: "Pick the **Date**, type the **Name**, click **Add holiday**.",
              imageSrc: "/tutorials/screens/hr-attendance-holidays.jpg",
              imageAlt: "Holidays page with Date, Name and Add holiday button",
              href: "/app/hr/attendance/holidays",
            },
            {
              title: "Roster the worker",
              body: "**Employee ID**, date, **Shift ID** (or **Week off**), **Note** → **Add roster entry**.",
              imageSrc: "/tutorials/screens/hr-roster-form.jpg",
              imageAlt: "HR Roster form filled with employee 1, a date, shift 1 and a note",
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

**HR → HR Settings** (\`/app/hr/settings\`) holds company-wide HR rules. The **Weekend (weekly holiday)** box lists the seven days; tick the days that are off every week.

## Steps

1. Open **HR Settings**.
2. Tick the weekend days (default **Friday** until you save).
3. Click **Save weekend**.

## Rules

- At least one day must be a weekend day and at least one a working day.
- Leave requests (HR leave and **My Leave**) skip weekend days and company **Holidays** when counting days.
- Only a **manager / admin** or a role with **hr.attendance.manage** can change the weekend; everyone in HR can see it.
- The production planning calendar has its own weekend and does not change leave days.`,
      tags: ["HR", "settings", "weekend", "leave", "holiday"],
      keywords: ["weekly holiday", "friday", "saturday", "off day"],
      lastUpdated: "2026-11-06",
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
- Anyone in HR can add a new entry. **Changing a saved entry** (**Actions → Edit**) needs a manager / admin role or the permission \`hr.attendance.manage\`.
- **Upload batch** (bulk import) needs a manager or admin.
- Once a payroll period is **locked**, its attendance cannot be added or changed.

## Steps

### A. Type one entry (missed punch, manual register)

1. Open **HR → Time & Attendance → Daily Entry** (\`/app/hr/attendance/entries\`).
2. Type the **Employee ID** and pick the date.
3. Type **In time (HH:MM:SS)** and **Out time (HH:MM:SS)**, for example \`08:02:00\` and \`17:05:00\`.
4. Check the status box — it starts as **PRESENT**. Type \`ABSENT\`, \`LATE\`, \`HALF_DAY\` or \`LEAVE\` when needed (capital letters).
5. Leave the source as **MANUAL** and write **Remarks** (why it was typed by hand).
6. Click **Save entry**. The row appears in the table below.

### B. Upload a biometric batch

1. Ask IT for the device export in the JSON layout shown on the page (\`employee_id\`, \`attendance_date\`, \`in_time\`, \`out_time\`, \`status\`, \`source\`).
2. In **Bulk import (JSON)** click **Load sample JSON** to see the layout, then paste your file's text over it.
3. Click **Upload batch**. The message shows "Created N entries."

> **Tip:** If you have fingerprint / card machines, register them on **Attendance Devices** instead — punch files are imported (or pushed) and turned into daily entries for you. See **Attendance devices and punch import**.

### C. Correct a saved entry

1. Find the row and click **Actions → Edit**.
2. Change **In time**, **Out time**, **Status** or **Remarks** and click **Save** (or **Cancel**).

### D. Approve punch corrections

1. Open **Regularizations** (\`/app/hr/attendance/regularizations\`). Requests show **Entry ID**, **Status** and **Reason**.
2. For a **PENDING** row click **Actions → Approve** or **Actions → Reject**. Click **Refresh** to reload.

### E. Check the summary

Open **Summary** (\`/app/hr/attendance/summary\`) to see **Present**, **Absent**, **Late** and **Leave** per employee. **Present** includes LATE and HALF_DAY entries.

## What happens next

- Payroll auto-calculate reads attendance for the period (daily-wage workers are paid per day present; **LATE** still counts as a worked day, late penalties are separate).
- Employees see their own rows in **Self-Service → My Attendance**.
- **HR Reports** and the **HR Dashboard** "Today attendance" card use the same entries.

## Tips

- Type statuses exactly in capitals. Words the summary does not know are not counted.
- The **Summary** counts every saved entry (it is not filtered by month on screen yet); use **HR Reports** or payroll for a month view.
- For approved leave days, also save a Daily Entry with status \`LEAVE\` so the Summary's **Leave** column is right.

## Common problems

- **"Attendance already exists for employee and date"** → use **Actions → Edit** on the existing row.
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
      lastUpdated: "2026-11-06",
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
              body: "**Employee ID**, date, **In time (HH:MM:SS)**, **Out time (HH:MM:SS)**, status, source **MANUAL**, **Remarks** → **Save entry**.",
              imageSrc: "/tutorials/screens/hr-att-entry-form.jpg",
              imageAlt: "Daily attendance entry form filled with employee 1, in 08:02, out 17:05, PRESENT, MANUAL and a remark",
              href: "/app/hr/attendance/entries",
            },
            {
              title: "Approve corrections",
              body: "**Regularizations** → **Actions → Approve / Reject** on PENDING rows.",
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

**HR → Time & Attendance → Attendance Devices** (\`/app/hr/attendance/devices\`) turns machine punches into daily attendance. Each punch is stored once; attendance for that day is then rebuilt from all punches of the day with source **DEVICE**.

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

The device user number (PIN) is matched to the employee's **Device PIN** (employee page → **Job** tab) when one is filled in, otherwise to the **employee code**. The summary shows new punches, punches already imported, attendance days created / updated, unknown employee codes and lines that could not be read. Importing the same file again adds nothing.

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
      lastUpdated: "2026-11-06",
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

1. Open **HR → Time & Attendance → Overtime Rules** (\`/app/hr/attendance/overtime-rules\`).
2. Type **Code** and **Name**. Optionally type **Employee category (optional)** (for example \`WORKER\`).
3. Check the three multiplier boxes: **Weekday mult** (starts at 1.5), **Weekend mult** (2) and **Holiday mult** (2).
4. Click **Add rule**.
5. To change a rule later: **Actions → Edit** → change the multipliers or untick **Active** → **Save**.

### B. Approve overtime

1. Open **HR → Time & Attendance → Overtime** (\`/app/hr/attendance/overtime\`).
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
      lastUpdated: "2026-11-06",
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

1. Open **HR → Leave → Leave Types** (\`/app/hr/leave/types\`).
2. Click **Add leave type**.
3. Type **Code** (for example \`CL\`) and **Name** (Casual leave).
4. Tick or untick **Paid leave**, **Requires approval** and **Active**.
5. Click **Save**.

### B. Check policies

1. Open **HR → Leave → Policies** (\`/app/hr/leave/policies\`).
2. Each row shows the **Leave type**, **Employment** type and **Annual quota**.
3. To change one: **Actions → Edit** → **Employment type**, **Annual quota (days)**, **Max carry-forward (days)**, **Effective from / to**, **Active** → **Save**.

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
- **Leave encashment (preview)** takes an **Employee ID** and **Days** and is still a preview — check with payroll before using it.

## Common problems

- **"Leave type code already exists"** → the code is used; pick another or edit the existing type.
- **"Only manager/admin can perform this action"** → you need a manager / admin role or \`hr.leave.types.manage\`.
- **Policies list is empty and there is no Add button** → policies are created by your system administrator today; ask them to load your quotas.
- **Balances show nothing** → no leave has been requested or allocated yet; a balance row is created with the first request.`,
      tags: ["HR", "leave", "leave types", "policies", "balances", "setup"],
      keywords: ["leave type", "casual leave", "CL", "sick leave", "SL", "earned leave", "EL", "annual leave", "maternity", "quota", "carry forward", "encashment", "leave balance", "chhuti", "hr.leave.types.manage"],
      lastUpdated: "2026-11-06",
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
              imageAlt: "Add leave type dialog with code ML, name Maternity leave and three ticked boxes",
              href: "/app/hr/leave/types",
            },
            {
              title: "Check policies",
              body: "Annual quota and carry-forward per type; change with **Actions → Edit**.",
              imageSrc: "/tutorials/screens/hr-leave-policies.jpg",
              imageAlt: "Leave policies table with ID, Leave type, Employment, Annual quota and Actions columns",
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
- You know the **Employee ID** (number at the end of the employee's web address) and the **Leave Type ID** (ask your HR admin; it also shows in the **Leave type** column of **Policies** and **Balances**).
- Approving or rejecting needs a **manager or admin** role.

## Steps

### A. Enter the request (HR)

1. Open **HR → Leave → Requests** (\`/app/hr/leave/requests\`).
2. Scroll to **Add leave request**. Fields marked with two stars are mandatory.
3. Type **Employee ID** and **Leave Type ID** (both required).
4. Pick **From Date** and **To Date** (required).
5. Type **Days requested** (for example \`2\`, or \`0.5\` for a half day) and a **Reason**. The app counts the real days from the dates (see below), so the number only matters for a half day.
6. Click **Save**. "Saved successfully." appears and the request shows in the list with status **PENDING** (or **APPROVED** if no approval is needed).

Employees can do the same themselves in **Self-Service → My Leave** (no Employee ID needed).

### How leave days are counted (HR leave and My Leave)

- Every date from **From** to **To** counts, except **weekend** days and **holidays** from **Time & Attendance → Holidays** (optional holidays still count). The weekend is **Friday** unless a manager changes it on **HR → HR Settings** (\`/app/hr/settings\`) — the production planning calendar does not change leave days.
- A single working day can be a **half day** (0.5). The number typed in "days" is otherwise ignored.
- The request is refused with a message when **To** is before **From**; when the dates are all weekends / holidays; when the dates **overlap** your own pending or approved leave; or when the leave **crosses the year end** — apply separately for each year.

### B. Approve or reject (manager)

1. Open **HR → Leave → Approvals** (\`/app/hr/leave/approvals\`). Only **PENDING** requests are listed.
2. Check **Employee ID**, **Leave Type ID**, **From**, **To** and **Days**.
3. Click **Actions → Approve** or **Actions → Reject**. The row disappears from the list.
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
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/hr-leave-request-form.jpg",
      videos: [
        {
          src: "/tutorials/videos/hr-leave-application.webm",
          poster: "/tutorials/videos/hr-leave-application-poster.jpg",
          title: "Enter a leave application and find it for approval",
          caption: "Fill Add leave request (not saved in the demo), then open Leave Approvals where managers use Actions → Approve or Reject.",
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
              body: "**Employee ID**, **Leave Type ID**, **From Date**, **To Date**, **Days requested**, **Reason** → **Save**.",
              imageSrc: "/tutorials/screens/hr-leave-request-form.jpg",
              imageAlt: "Leave Requests page with the Add leave request form filled for two days",
              href: "/app/hr/leave/requests",
            },
            {
              title: "Manager approves",
              body: "**Leave → Approvals** → **Actions → Approve** or **Reject**.",
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

**Self-Service** (ESS) gives each employee their own pages:

- **My Profile** — see your code, department and designation; update **Email**, **Phone** and **Address**.
- **My Attendance** — your own attendance rows (**Date**, **In**, **Out**, **Status**, **Remarks**).
- **My Leave** — apply for leave and follow the status.
- **My Payslips** — your payslips (**Gross**, **Deduction**, **Net**, **Status**).
- **My Tickets** — send a **Query**, **Complaint** or **Request** to HR.

**My Leave**, **My Attendance** and **My Payslips** have an **English / বাংলা** switch at the top right.

## Before you start

- HR must link your login to your employee record: **Employees → Edit** (or **Add employee**) → **Linked app user (ESS / login)**.
- Without the link you see "Employee profile not linked with current user" (or, on My Profile, "Your login account is not linked to an employee record yet…").

## Steps

### A. Apply for leave yourself

1. Open **HR → Self-Service → My Leave** (\`/app/hr/ess/leave\`).
2. In **Request leave** type the **Leave Type ID** (required — your HR office gives you the number for Casual, Sick…).
3. Pick **From Date** and **To Date**, check **Days requested** (all required) and write a **Reason**. Weekend days and company holidays inside the dates are not counted; a single working day can be a half day (0.5).
4. Click **Save**. Your request appears in the list with status **PENDING** until your manager decides.

### B. Switch to Bangla

1. On **My Leave**, **My Attendance** or **My Payslips**, open the language box at the top right (next to **Refresh**).
2. Choose **বাংলা**. Headings, labels and buttons change to Bangla. Choose **English** to switch back. The choice is remembered on this device.

### C. Update your contact details

1. Open **My Profile** (\`/app/hr/ess/profile\`).
2. Change **Email**, **Phone** or **Address** and click **Save profile**.

### D. Raise a ticket to HR

1. Open **My Tickets** (\`/app/hr/ess/tickets\`).
2. Choose **Query**, **Complaint** or **Request**, type a **Subject** and **Details**.
3. Click **Submit ticket**. It appears in the list with its status.

## What happens next

- Your leave goes to **HR → Leave → Approvals** for your manager.
- Payslips appear in **My Payslips** after payroll is approved.
- HR answers tickets; check the status in **My Tickets**.

## Tips

- Use **Refresh** to see the latest status.
- For IT or system problems (not HR questions) use **Support → My tickets** instead.

## Common problems

- **"Employee profile not linked with current user"** → ask HR to set **Linked app user (ESS / login)** on your employee record.
- **"Insufficient leave balance…"** → you have used this leave type's allocation; talk to HR.
- **"Leave type not found"** → the Leave Type ID is wrong; ask HR for the right number.
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
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/hr-ess-leave-form.jpg",
      infographics: [
        {
          type: "steps",
          title: "Self-Service in practice",
          steps: [
            {
              title: "Apply on My Leave",
              body: "**Leave Type ID**, **From Date**, **To Date**, **Days requested**, **Reason** → **Save**.",
              imageSrc: "/tutorials/screens/hr-ess-leave-form.jpg",
              imageAlt: "My Leave page with the Request leave form filled for one day, and a not-linked warning for the demo user",
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
          alt: "My Attendance page with the English language box, Refresh, a not-linked warning for the demo user and an empty list",
          caption: "My Attendance lists your own days with In, Out, Status and Remarks.",
        },
        {
          src: "/tutorials/screens/hr-ess-payslips.jpg",
          alt: "My Payslips page with the language box, Refresh and the not-linked warning shown to the demo user",
          caption: "My Payslips shows Gross, Deduction, Net and Status for each payroll run.",
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

Recruitment in P7 ERP has four simple lists under **HR → Talent**:

1. **Job Requisitions** — an approved vacancy (title, number of vacancies, department).
2. **Candidates** — the people who applied.
3. **Interviews** — when each candidate was interviewed, by whom, and the result.
4. **Offers** — the position and salary offered.

**Who uses it:** HR / admin officers.

## Before you start

- Departments exist (the requisition asks for an optional department number).
- Forms link to each other by ID numbers: the **Requisition ID** is shown in the **ID** column of Job Requisitions.

## Steps

### A. Open a vacancy

1. Open **HR → Talent → Job Requisitions** (\`/app/hr/recruitment/requisitions\`).
2. Type the **Title** (for example "Sewing Operator"), the number of vacancies, and optionally **Department ID (optional)**.
3. Click **Add requisition** ("Requisition created.").
4. Later, type a new status in **New status** (for example \`open\`, \`filled\`, \`cancelled\`) and click **Apply**.

### B. Add a candidate

1. Open **Candidates** (\`/app/hr/recruitment/candidates\`).
2. In **Add candidate** type **Candidate Code** and **Full Name** (required), then **Email**, **Phone** and the **Requisition ID**.
3. Click **Save**.

### C. Record an interview

1. Open **Interviews** (\`/app/hr/recruitment/interviews\`).
2. In **Add interview** type **Candidate ID** and pick **Interview Date** (both required), then type **Interviewer** and **Result** (for example \`pending\`, \`passed\`, \`failed\`).
3. Click **Save**.

### D. Make an offer

1. Open **Offers** (\`/app/hr/recruitment/offers\`).
2. In **Add offer** type **Candidate ID**, **Position** and **Offered Salary**, and pick **Offer Date** (all required).
3. Click **Save**.

## What happens next

When the candidate joins, add them in **Core HR → Employees → Add employee** (or **AI Onboarding** from their CV). The **HR Dashboard** "Open hiring" card counts open requisitions.

## Tips

- Use a simple candidate code pattern such as \`CAN-0012\`.
- Keep the interview **Result** words consistent so lists are easy to read.

## Common problems

- **Save does nothing** → a field marked with two stars is empty.
- **I cannot find the Candidate ID** → the Candidates list shows the code, not the ID number. Ask your admin, or note the order in which candidates were added.
- **Status not changing** → type the status in **New status** on that row and click **Apply**.`,
      tags: ["HR", "recruitment", "hiring", "candidates", "interviews", "offers"],
      keywords: ["recruit", "hiring", "vacancy", "job opening", "requisition", "applicant", "candidate", "interview", "offer letter", "niyog"],
      lastUpdated: "2026-11-06",
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
          alt: "Candidates page with the Add candidate form filled with code CAN-0012, Nasima Begum and a phone number",
          caption: "Add candidate: Candidate Code and Full Name are mandatory (marked with two stars).",
        },
        {
          src: "/tutorials/screens/hr-recruitment-interviews.jpg",
          alt: "Interviews page with the Add interview form",
          caption: "Interviews: Candidate ID and Interview Date are mandatory.",
        },
        {
          src: "/tutorials/screens/hr-recruitment-offers.jpg",
          alt: "Offers page with the Add offer form",
          caption: "Offers: Candidate ID, Position, Offered Salary and Offer Date are mandatory.",
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

- Employees exist. Reviews ask for the **Employee ID** (number at the end of the employee's web address).

## Steps

### A. Create a cycle

1. Open **HR → Talent → Performance Cycles** (\`/app/hr/performance/cycles\`).
2. Type **Name** (for example "2026 Annual appraisal") and **Description**, pick the start and end dates.
3. Click **Add cycle**.

### B. Submit goals

1. Open **Goals** (\`/app/hr/performance/goals\`).
2. For a goal with status \`draft\`, click **Actions → Submit**. The message "Goal submitted." appears.

### C. Add a review

1. Open **Reviews** (\`/app/hr/performance/reviews\`).
2. In **Add review** type **Employee ID** (required), **Reviewer Employee ID**, **Review Period** (required, for example \`2026\`) and **Overall Rating** (required, for example 1–5).
3. Click **Save**.

### D. Watch progress

Open **Performance Dashboard** (\`/app/hr/performance/dashboard\`) and click **Refresh**.

## What happens next

Use ratings when you plan increments in payroll salary structures. There is no automatic link to pay.

## Tips

- Agree one rating scale (for example 1 = poor … 5 = excellent) for the whole company.

## Common problems

- **There is no form to create goals** → new goals are created by your system administrator today (the page says "New goals must be created via API…"). Use **Submit** on draft goals.
- **Submit is missing** → the goal is no longer \`draft\`.`,
      tags: ["HR", "performance", "appraisal", "goals", "reviews"],
      keywords: ["appraisal", "performance review", "KPI", "goal", "rating", "increment", "promotion", "evaluation"],
      lastUpdated: "2026-11-06",
      coverImage: "/tutorials/screens/hr-performance-cycles.jpg",
      images: [
        {
          src: "/tutorials/screens/hr-performance-goals.jpg",
          alt: "Performance goals page with Refresh and a note that goals are created via API",
          caption: "Goals: use Actions → Submit on draft goals.",
        },
        {
          src: "/tutorials/screens/hr-performance-reviews.jpg",
          alt: "Performance Reviews page with the Add review form",
          caption: "Reviews: Employee ID, Review Period and Overall Rating are mandatory.",
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

1. Open **HR → Core HR → Employees** and find the person (**Search by code/name**). Click **Actions → View**.
2. **Documents** tab — add a record for the resignation letter or termination order (**Document type**, **Document number**, date, **Notes**) and click **Add document record**.
3. **Status history** tab — type the **Status label** (for example \`RESIGNED\`, \`TERMINATED\`, \`RETIRED\`), pick the effective date, write **Remarks**, then click **Add status change**.
4. **Job** tab — set the third date box (full width) to the **exit date** and click **Save job**.
5. Process the final settlement (last salary, leave encashment, dues and deductions) in **Payroll** — see **Final settlement when an employee leaves** (linked below).
6. Back on the profile, click **Deactivate** (top right). The header now shows **Inactive** and the person disappears from normal lists.

To bring someone back (re-join), open them with **Show inactive** ticked on Employees and click **Activate**.

## What happens next

- Inactive employees are hidden from the Employees list unless **Show inactive** is ticked.
- Their attendance, leave and payslip history stays for reports and audits.
- If their login is linked, ask the admin to disable the user under **Settings → User Mgmt**.

## Tips

- Deactivate **after** final pay is done, so the person is still available in the payroll run.
- Use the same status words every time (RESIGNED, TERMINATED, RETIRED, ABSCONDED) so reports stay clean.

## Common problems

- **Add status change does nothing** → the effective date is empty.
- **I cannot find a person who left** → tick **Show inactive** on Employees.
- **The leaver still logs in** → disable their user in **Settings → User Mgmt**.`,
      tags: ["HR", "exit", "separation", "resignation", "termination", "employees"],
      keywords: ["resign", "resignation", "termination", "separation", "exit", "left job", "final settlement", "deactivate", "inactive", "absconding", "retire", "chakri chhara"],
      lastUpdated: "2026-11-06",
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
              title: "Final pay, then Deactivate",
              body: "Settle final pay in Payroll, then click **Deactivate** at the top right of the profile.",
              imageSrc: "/tutorials/screens/hr-emp-detail-personal.jpg",
              imageAlt: "Employee profile header with Generate document and Deactivate buttons",
              href: "/app/hr/payroll/runs",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/hr/employees", "/app/hr/payroll/runs", "/app/settings/users"],
      relatedArticleIds: ["hr-pay-final-settlement", "hr-add-employee", "hr-leave-setup", "hr-overview"],
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

1. Open **HR → Overview → HR Dashboard**.
2. If **Pending leave** is above 0, click **Leave approvals** in **Quick links**.
3. If **Today attendance** is low, check **Daily Entry** for missing punches.

### B. Monthly reports

1. Open **HR → Analytics → HR Reports** and click **Refresh**.
2. Read the **Attendance Report** (Present / Absent / Leave per employee), **Leave Report** (Total / Approved / Pending / Rejected per leave type) and **Payroll Report** (Gross / Deductions / Net per period).
3. For printable summaries also see **Reports → Employee Summary** and **Reports → Payroll Summary**.

### C. Compliance audit readiness

1. Open **HR → Analytics → Compliance**.
2. Under **Frameworks** click **Activate** on BSCI, WRAP or SEDEX (once), then click the framework name.
3. Read the **Score** and the **Requirements** table.
4. In **Audit readiness gaps**, fix the missing documents, then use **Actions → Mark compliant** (or **Mark non-compliant**).

### D. AI insights

1. Open **HR → Analytics → AI Insights**. **Critical alerts** are shown at the top.
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
      lastUpdated: "2026-11-06",
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
  ],
};

import type { TutorialSection } from "../types";

export const qualitySection: TutorialSection = {
  id: "quality",
  title: "Quality",
  description:
    "Shop-floor inline QC, inspections, lab tests, NCR and CAPA, material returns and the QC dashboard.",
  articles: [
    {
      id: "quality-overview",
      title: "Quality overview: which screen for which check",
      summary:
        "Map of every quality screen — inline QC on the line, formal inspections, lab tests, NCR/CAPA follow-up, returns and the dashboard — and how they connect to shipment.",
      content: `## Overview

The **Quality** menu records whether garments and materials meet the buyer's standard, and makes sure every problem gets a fix. It is used by **QC inspectors**, **QA managers**, **line QC checkers** and **production managers**.

Quality work happens in three layers:

1. **Record** the check — on the line every hour (**Shop-floor QC**), at in-process or final stage (**Inspections**), or in the lab (**Lab Tests**).
2. **Follow up** problems — raise an **NCR** (non-conformance report) and a **CAPA** (corrective and preventive action) on the **CAPA** page. **Returns** shows material sent back from production.
3. **Review** — **QC Dashboard** and **Reports → QC Summary**.

## Before you start

- Inspections, lab tests and NCRs are linked to a **manufacturing work order (WO)** by its number (**Work Order ID**). Work orders come from **Planning → Plan history → Generate WOs**.
- Shop-floor QC uses the **sewing lines** and **shifts** from **Production setup**.
- Incoming fabric and trims are inspected in **Inventory → GRN Inspection** (only when your company enables GRN quality inspection) — not here.

## Steps — where to go

1. **Hourly inline check on a sewing line:** **Manufacturing → Shop floor → Shop-floor QC** (\`/app/production/quality\`).
2. **In-process or final inspection:** **Quality → Inspections** (\`/app/quality/inspections\`). **QC (Classic)** (\`/app/quality/qc\`) opens the same screen.
3. **Lab test result** (fabric, trim or garment): **Quality → Lab Tests** (\`/app/quality/lab-tests\`).
4. **Something failed:** **Quality → CAPA** (\`/app/quality/capa\`) — create the **NCR**, then the **CAPA**.
5. **Material returned from the floor:** **Quality → Returns** (\`/app/quality/returns\`) to view returns.
6. **How are we doing?** **Quality → QC Dashboard** (\`/app/quality/dashboard\`) and **Reports → QC Summary** (\`/app/reports/qc-summary\`).

## What happens next

- Failed checks and defect codes feed the dashboard's **Pass Rate**, **Defect Distribution** and **Today's High-Risk Lines**.
- If an admin turned on **Open CAPA blocks challan** (\`capa_blocks_challan\`), an order with an open CAPA cannot post its **delivery challan** until the CAPA is closed.

## Tips

- Agree one list of **defect codes** with your team (for example \`OPEN-SEAM\`, \`BROKEN-STITCH\`, \`SHADE\`, \`MEASUREMENT\`) and use the same spelling everywhere — the Pareto and distribution charts group by exact code.
- P7 ERP records the result of your AQL sampling (pass / fail, defects). It does not calculate the AQL sample size — use your buyer's AQL table for that.

## Common problems

- **"Work order ID is required."** → Every inspection needs a work order number.
- **Dashboard shows zero** → No checks recorded for the date range; widen **From / To** and click **Refresh**.`,
      tags: ["quality", "QC", "inspection", "CAPA", "NCR", "overview"],
      keywords: [
        "quality control",
        "QA",
        "QC",
        "inspection",
        "final inspection",
        "inline",
        "AQL",
        "defect",
        "NCR",
        "CAPA",
        "lab test",
        "buyer inspection",
        "challan",
      ],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      featured: true,
      audience: "quality",
      coverImage: "/tutorials/screens/quality-dashboard.jpg",
      videos: [
        {
          src: "/tutorials/videos/qc-inspection-tour.webm",
          poster: "/tutorials/videos/qc-inspection-tour-poster.jpg",
          title: "Quality tour: dashboard, inspection, NCR and CAPA",
          caption: "From the QC Dashboard to a filled failed inspection, then an NCR and CAPA form. Nothing is saved.",
          durationSeconds: 73,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "Quality map",
          caption: "Record → follow up → review. Open CAPA can block the delivery challan.",
          imageSrc: "/tutorials/diagrams/quality/quality-map.svg",
          imageAlt:
            "Quality map: Shop-floor QC, Inspections and Lab Tests record checks; NCR, CAPA and Returns follow up; QC Dashboard reviews; challan gate at the end.",
        },
        {
          type: "flow",
          title: "When a check fails",
          steps: [
            { label: "Inspections (Fail / Reject)", href: "/app/quality/inspections" },
            { label: "Create NCR", href: "/app/quality/capa" },
            { label: "Create CAPA", href: "/app/quality/capa" },
            { label: "Close CAPA" },
            { label: "Delivery Challan", href: "/app/inventory/delivery-challans" },
          ],
        },
      ],
      relatedAppRoutes: [
        "/app/quality/dashboard",
        "/app/quality/inspections",
        "/app/quality/lab-tests",
        "/app/quality/capa",
        "/app/quality/returns",
        "/app/quality/qc",
        "/app/production/quality",
      ],
      relatedArticleIds: [
        "qc-shop-floor-inline",
        "qc-inspections",
        "qc-ncr-capa",
        "qc-lab-tests",
        "qc-dashboard",
        "mfg-overview",
      ],
    },
    {
      id: "qc-shop-floor-inline",
      title: "Shop-floor QC: hourly inline checks on a sewing line",
      summary:
        "Record how many pieces were checked, passed and failed for one line and hour, and read the defect Pareto for the day.",
      content: `## Overview

**Shop-floor QC** (\`/app/production/quality\`, sidebar **Manufacturing → Shop floor → Shop-floor QC**) is for the **inline QC checker** who walks the line and checks pieces every hour. It records totals per line per hour and builds a simple **Defect Pareto** (most frequent defect codes first).

## Before you start

- Sewing lines and shifts exist in **Production setup**.
- Works well on a tablet; the page is in English.

## Steps

1. Open **Manufacturing → Shop floor → Shop-floor QC**.
2. Check **Date**, choose **Shift** and **Line**.
3. Set **Hour slot** — the clock hour of the check (0–23, for example **10** for the 10 am check).
4. Type **Total checked**, **Pass qty** and **Fail qty**.
5. Click **Save check**. The message *"Saved QC entry."* confirms it.
6. Read **Recent checks** (line, hour, pass, fail) and **Defect Pareto (from loaded checks)** below.

## What happens next

- Fail quantities are stored with the defect code **MISC** from this screen. For named defects and follow-up, record a formal check on **Quality → Inspections** and raise an **NCR** if needed.
- The **Predictive manufacturing** card on Planning and **Today's High-Risk Lines** on the QC Dashboard use recent QC data.

## Tips

- Pass qty + Fail qty should equal Total checked.
- Saving the same line, date, shift and hour again updates that check.

## Common problems

- **"Select shift and line."** → Choose both before **Save check**.
- **"Could not save."** → Check the network and try again.
- **"No defect codes recorded for this filter."** → No failed pieces for this date, shift and line.`,
      tags: ["inline QC", "shop floor", "hourly", "defect", "pareto"],
      keywords: ["inline inspection", "roaming QC", "end line QC", "hourly QC", "defect pareto", "DHU", "pass", "fail", "sewing line"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      audience: "quality",
      coverImage: "/tutorials/screens/production-quality.jpg",
      infographics: [
        {
          type: "steps",
          title: "One inline check",
          steps: [
            {
              title: "Pick date, shift, line and hour",
              body: "Top row of the form. **Hour slot** is the clock hour (0–23).",
              imageSrc: "/tutorials/screens/production-quality.jpg",
              imageAlt: "Shop-floor QC page with Date, Shift, Line, Hour slot and quantity fields.",
              href: "/app/production/quality",
            },
            {
              title: "Type the counts and save",
              body: "**Total checked**, **Pass qty**, **Fail qty** → **Save check**.",
              imageSrc: "/tutorials/screens/qc-shopfloor-inline-form.jpg",
              imageAlt: "Shop-floor QC form filled with 50 checked, 47 pass and 3 fail.",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/production/quality"],
      relatedArticleIds: ["quality-overview", "qc-inspections", "mfg-supervisor-tablet", "mfg-hourly-deep"],
    },
    {
      id: "qc-inspections",
      title: "Step-by-step: record an in-process or final inspection",
      summary:
        "Record a quality check against a work order — In Process or Final, Pass / Fail / Reject, defect code and remarks — and know what to do when it fails.",
      content: `## Overview

**Quality Inspections** (\`/app/quality/inspections\`) records formal checks against a manufacturing **work order**: **In Process** checks during production and **Final** checks before packing or buyer inspection. The QC inspector fills it; the QA manager reviews the list and the dashboard. **QC (Classic)** (\`/app/quality/qc\`) opens the same screen.

## Before you start

- Know the **Work Order ID** (from Planning → Plan history or the shop-floor queue, column **MO**).
- Optional: the **Operation ID** if the check is for one specific step.
- Agree defect codes with your team.

## Steps

1. Open **Quality → Inspections**.
2. Under **New Inspection**, type the **Work Order ID**.
3. Optional: type **Operation ID (optional)**.
4. Choose the check type: **In Process** or **Final**.
5. Choose the result:
   - **Pass** — meets the standard.
   - **Fail** — does not meet the standard; can be repaired or re-checked.
   - **Reject** — not acceptable; the lot or pieces are rejected.
6. For Fail or Reject, type a **Defect code (optional)** such as \`OPEN-SEAM\` and **Remarks** (what, where, how many).
7. Click **Create**. The check appears in the list below with **ID**, **WO**, **Operation**, **Type**, **Result** and **Defect**.

## What happens next

- **Fail / Reject** → open **Quality → CAPA** and create an **NCR** with the same work order and defect code, then a **CAPA**.
- The **QC Dashboard** updates **Total Inspections**, **Pass Rate**, **Pass / Fail by Inspection Stage** and **Defect Distribution**.

## Tips

- One inspection = one result. If you check two lots, create two inspections.
- Write remarks a buyer would understand: *"6 pcs open seam at side seam, carton 12"*.

## Common problems

- **"Work order ID is required."** → Type the work order number before **Create**.
- **"Failed to create quality check"** → The work order number does not exist for your company. Check it on the shop-floor queue.
- **"No inspections found."** → Nothing recorded yet.`,
      tags: ["inspection", "final inspection", "in-process", "QC", "work order"],
      keywords: ["final inspection", "inline inspection", "pre-final", "buyer inspection", "AQL", "pass", "fail", "reject", "defect code", "QC classic"],
      estimatedMinutes: 5,
      lastUpdated: "2026-11-06",
      audience: "quality",
      coverImage: "/tutorials/screens/quality-inspections.jpg",
      videos: [
        {
          src: "/tutorials/videos/qc-inspection-tour.webm",
          poster: "/tutorials/videos/qc-inspection-tour-poster.jpg",
          title: "Record a failed inspection and start NCR / CAPA",
          caption: "Fill a Final / Fail inspection, then the NCR and CAPA forms. Create is not clicked.",
          durationSeconds: 73,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Record an inspection",
          steps: [
            {
              title: "Open Inspections",
              body: "**Quality → Inspections** (or **QC (Classic)**).",
              imageSrc: "/tutorials/screens/quality-inspections.jpg",
              imageAlt: "Quality Inspections page with the New Inspection form and an empty list.",
              href: "/app/quality/inspections",
            },
            {
              title: "Fill the form",
              body: "Work Order ID, **In Process / Final**, **Pass / Fail / Reject**, defect code, remarks.",
              imageSrc: "/tutorials/screens/qc-inspection-form.jpg",
              imageAlt: "New Inspection form filled: work order 1, Final, Fail, defect OPEN-SEAM, remarks.",
            },
            {
              title: "Click Create",
              body: "The check is added to the list. If it failed, raise an NCR next.",
              href: "/app/quality/capa",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/quality/inspections", "/app/quality/qc"],
      relatedArticleIds: ["qc-ncr-capa", "quality-overview", "qc-dashboard", "qc-lab-tests"],
    },
    {
      id: "qc-ncr-capa",
      title: "Step-by-step: NCR and CAPA (fix a quality problem)",
      summary:
        "Raise an NCR for a failed check, add a CAPA with corrective and preventive actions and a due date, move both to In Progress and Close, and understand the challan block.",
      content: `## Overview

The **CAPA** page (\`/app/quality/capa\`, title **NCR and CAPA**) is where a quality problem is written down and fixed.

- **NCR** (non-conformance report) — *what went wrong*: work order, defect code, severity, description.
- **CAPA** (corrective and preventive action) — *how we fix it now* (corrective) and *how we stop it happening again* (preventive), with a due date.

Each NCR can have one CAPA. QA managers own them; line chiefs and maintenance carry out the actions.

## Before you start

- Have the **Work Order ID** and the **defect code** from the failed inspection.
- Ask your admin whether **Open CAPA blocks challan** is on — then an open CAPA can hold up shipment.

## Steps

### 1. Create the NCR

1. Open **Quality → CAPA**.
2. Under **Create NCR**, type **Work Order ID** and **Defect Code** (both required).
3. Choose **Minor**, **Major** or **Critical**.
4. Type a short **Description** and click **Create NCR**.
5. The NCR appears in **NCR List** with its **Code**, **WO**, **Severity** and **Status** (**open**).

### 2. Create the CAPA

6. Under **Create CAPA**, type the **NCR ID** and the **Corrective Action** (both required), the **Preventive Action** and a due date.
7. Click **Create CAPA**. It appears in **CAPA List**.
8. Shortcut: **Quick CAPA** on an NCR row creates a CAPA with standard text (root-cause investigation, SOP update and training). Edit the actions later if needed.

### 3. Work and close

9. When work starts, click **In Progress** on the NCR and on the CAPA.
10. When the fix is done and checked, click **Close** on the CAPA, then on the NCR.
11. If the problem comes back, click **Reopen** and type the **Reopen note (required)**.

## What happens next

- **Pending CAPA** and **Open NCR** counts update on the **QC Dashboard**.
- With **Open CAPA blocks challan** on, the delivery challan for that order is refused with a message like *"Cannot post delivery challan: order … has N open CAPA(s)."* Closing the CAPA lifts the block.

## Tips

- Write actions that someone can check: *"Change needle size to 11 on side-seam machines; QC to check 20 pcs per hour for 3 days."*
- Use **Critical** only for safety or buyer-stopping issues; it helps the team prioritise.

## Common problems

- **"Work order ID and defect code are required."** → Fill both before **Create NCR**.
- **"NCR ID and corrective action are required."** → Fill both before **Create CAPA**.
- **"CAPA already exists for this NCR."** → Each NCR has one CAPA. Update the existing one.
- **Challan will not post** → An open or in-progress CAPA exists for the order. Close it, or ask your admin about the switch.`,
      tags: ["CAPA", "NCR", "corrective action", "preventive action", "quality"],
      keywords: ["CAPA", "NCR", "non-conformance", "corrective action", "preventive action", "root cause", "8D", "challan block", "quality issue", "complaint"],
      estimatedMinutes: 6,
      lastUpdated: "2026-11-06",
      audience: "quality",
      coverImage: "/tutorials/screens/quality-capa.jpg",
      videos: [
        {
          src: "/tutorials/videos/qc-inspection-tour.webm",
          poster: "/tutorials/videos/qc-inspection-tour-poster.jpg",
          title: "From failed inspection to NCR and CAPA",
          caption: "The second half shows the Create NCR and Create CAPA forms filled in. Nothing is saved.",
          durationSeconds: 73,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "NCR and CAPA lifecycle",
          caption: "open → in_progress → closed (Reopen needs a note). Open CAPA can block the challan.",
          imageSrc: "/tutorials/diagrams/quality/ncr-capa-lifecycle.svg",
          imageAlt: "NCR and CAPA status rows open, in_progress, closed with reopen arrows, and the challan gate box.",
        },
        {
          type: "steps",
          title: "Fill both forms",
          steps: [
            {
              title: "Create NCR and CAPA",
              body: "Left: **Create NCR**. Right: **Create CAPA** with the NCR ID.",
              imageSrc: "/tutorials/screens/qc-ncr-capa-forms.jpg",
              imageAlt: "Create NCR form (work order, OPEN-SEAM, Major, description) and Create CAPA form (NCR ID, actions) filled in.",
              href: "/app/quality/capa",
            },
            {
              title: "Track and close",
              body: "Use **In Progress**, **Close** and **Reopen** in **NCR List** and **CAPA List**.",
              imageSrc: "/tutorials/screens/quality-capa.jpg",
              imageAlt: "NCR and CAPA page with both forms and both lists.",
            },
          ],
        },
      ],
      relatedAppRoutes: ["/app/quality/capa", "/app/quality/inspections", "/app/inventory/delivery-challans", "/app/settings/config"],
      relatedArticleIds: ["qc-inspections", "qc-dashboard", "quality-overview", "inv-overview"],
    },
    {
      id: "qc-lab-tests",
      title: "Lab tests: record fabric, trim and garment test results",
      summary:
        "Record a lab test result (Pass / Fail / Reject) against a work order with a defect code and remarks, and see all lab tests in one list.",
      content: `## Overview

**Lab Tests** (\`/app/quality/lab-tests\`) stores results from your in-house or third-party lab — for example shrinkage, colour fastness, pilling, seam strength or GSM — linked to a work order. Lab technicians and QA managers use it.

## Before you start

- Know the **Work Order ID** the material or garments belong to.
- Keep the full lab report (PDF) in your document system; put the key result in **Remarks**.

## Steps

1. Open **Quality → Lab Tests**.
2. Under **New Lab Test**, type **Work Order ID** and optional **Operation ID (optional)**.
3. Choose **Pass**, **Fail** or **Reject**.
4. Type a **Defect code (optional)** (for example \`SHRINKAGE\`) and **Remarks** (test name, standard, result, report number).
5. Click **Create**.
6. The list shows **ID**, **Work Order**, **Operation**, **Result**, **Defect**, **Remarks** and **Date**.

## What happens next

- Lab tests count in the **QC Dashboard** and in **Pass / Fail by Inspection Stage** as type *lab*.
- A failed test usually needs an **NCR** and **CAPA** (for example re-dye or reject the fabric lot).

## Tips

- Start remarks with the test name: *"Shrinkage ISO 6330: L −4.5%, W −3% (limit ±3%) — report LAB-0921"*.
- For buyer approvals of lab dips, use Merchandising samples / Follow-up; Lab Tests is for test results.

## Common problems

- **"Work order ID is required."** → Type it before **Create**.
- **"No lab tests found. Create one above or ensure checks use type "lab"."** → Only checks saved from this page (type lab) are listed here; inspections from the Inspections page are not.`,
      tags: ["lab test", "fabric test", "quality", "work order"],
      keywords: ["lab", "shrinkage", "colour fastness", "color fastness", "GSM", "pilling", "seam strength", "test report", "fabric test"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      audience: "quality",
      coverImage: "/tutorials/screens/quality-lab-tests.jpg",
      images: [
        {
          src: "/tutorials/screens/quality-lab-tests.jpg",
          alt: "Lab Tests page with the New Lab Test form (Work Order ID, Operation ID, result, defect code, remarks) and the lab test list.",
          caption: "Record the result and key figures; keep the full report in your document system.",
        },
      ],
      relatedAppRoutes: ["/app/quality/lab-tests"],
      relatedArticleIds: ["qc-inspections", "qc-ncr-capa", "quality-overview"],
    },
    {
      id: "qc-returns",
      title: "Returns: view material returned from production",
      summary:
        "See material that production returned to the warehouse (issue, quantity, warehouse, time) and filter by work order.",
      content: `## Overview

**Quality / Material Returns** (\`/app/quality/returns\`, sidebar **Quality → Returns**) is a **view-only** list of materials that production issued and then returned to a warehouse — for example extra fabric, wrong trims or rejected accessories. Store keepers and QA use it to check what came back.

## Before you start

- Returns are created from the production execution flow when issued material is returned for a work order — not on this page.

## Steps

1. Open **Quality → Returns**.
2. To see one work order, type the **Work order ID** and click **Filter**.
3. Click **Clear** to show all returns again.
4. Read the columns **ID**, **Issue ID**, **Qty returned**, **Warehouse** and **Returned at**.

## What happens next

- Returned quantities go back to warehouse stock (see **Inventory**).
- If the return was because of a quality problem, raise an **NCR** on the CAPA page.

## Tips

- Compare returns with the order's consumption to spot over-issue.

## Common problems

- **"No material returns found."** → No returns recorded, or your filter work order has none. Click **Clear**.`,
      tags: ["returns", "material return", "quality", "inventory"],
      keywords: ["material return", "return to store", "excess fabric", "reject return", "issue return", "MRN"],
      estimatedMinutes: 2,
      lastUpdated: "2026-11-06",
      audience: "warehouse",
      coverImage: "/tutorials/screens/quality-returns.jpg",
      images: [
        {
          src: "/tutorials/screens/quality-returns.jpg",
          alt: "Quality / Material Returns page with Work order ID filter, Filter and Clear buttons and the returns table.",
          caption: "View-only list; filter by work order.",
        },
      ],
      relatedAppRoutes: ["/app/quality/returns"],
      relatedArticleIds: ["quality-overview", "qc-ncr-capa", "inv-overview"],
    },
    {
      id: "qc-dashboard",
      title: "QC Dashboard and QC Summary report",
      summary:
        "Read pass rate, open NCR, pending CAPA, defect distribution and high-risk lines for a date range, and use the QC Summary report for the same figures.",
      content: `## Overview

The **QC Dashboard** (\`/app/quality/dashboard\`) gives QA managers and production heads a quick picture of quality for any date range. **Reports → QC Summary** (\`/app/reports/qc-summary\`) shows the same figures as a simple report.

## Before you start

- Figures come from Inspections, Lab Tests, NCR / CAPA and shop-floor QC. Record checks first.

## Steps

1. Open **Quality → QC Dashboard**.
2. Choose **From** and **To** dates, then click **Refresh**.
3. Read the cards:
   - **Total Inspections** (passed / failed).
   - **Pass Rate**.
   - **Pending CAPA** (in progress / closed below).
   - **Open NCR**.
   - **Defect Codes** logged in the period.
4. **Recent Inspections** lists the latest checks — click **View All** to open Inspections.
5. **Quick Actions** open **Inspections**, **Lab Tests**, **CAPA** and **Returns**.
6. **Pass / Fail by Inspection Stage** compares in-process, final and lab checks.
7. **Defect Distribution** shows the top defect codes.
8. **Today's High-Risk Lines** scores each line 0–100 (green ≤30, yellow 31–70, red ≥71). Click a line to read the suggestion and top defects; click **Refresh risk** to recalculate.
9. For a printable view, open **Reports → QC Summary** (pass rate, NCR, CAPA, failed inspections, by check type, defect distribution).

## What happens next

Use the red lines and top defects to plan extra inline checks or a CAPA.

## Tips

- Review weekly with the same date range so trends are comparable.
- The **Quality Reports** cards (Quality Summary, Defect Analysis, Trend Report) at the bottom are not active yet — use **Reports → QC Summary** instead.

## Common problems

- **"No inspection data in this period."** → Widen the dates or record inspections.
- **"No elevated line risk in the lookback window."** → Good news, or no recent QC data.`,
      tags: ["QC dashboard", "pass rate", "defects", "NCR", "CAPA", "report"],
      keywords: ["quality dashboard", "pass rate", "defect rate", "DHU", "QC report", "QC summary", "high risk line", "defect distribution"],
      estimatedMinutes: 4,
      lastUpdated: "2026-11-06",
      audience: "quality",
      coverImage: "/tutorials/screens/quality-dashboard.jpg",
      images: [
        {
          src: "/tutorials/screens/quality-dashboard.jpg",
          alt: "QC Dashboard with From / To dates, Refresh, KPI cards (Total Inspections, Pass Rate, Pending CAPA, Open NCR, Defect Codes), Recent Inspections and Quick Actions.",
          caption: "QC Dashboard: pick From / To and click Refresh. Scroll down for stage, defect and high-risk line panels.",
        },
        {
          src: "/tutorials/screens/reports-qc-summary.jpg",
          alt: "QC Summary report with pass rate, NCR, CAPA and failed inspection cards, by check type and defect distribution tables.",
          caption: "Reports → QC Summary.",
        },
      ],
      relatedAppRoutes: ["/app/quality/dashboard", "/app/reports/qc-summary"],
      relatedArticleIds: ["quality-overview", "qc-inspections", "qc-ncr-capa", "reports-overview"],
    },
  ],
};

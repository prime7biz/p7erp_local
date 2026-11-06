import type { TutorialSection } from "../types";

export const workflowSection: TutorialSection = {
  id: "workflow",
  title: "Workflow",
  description: "One inbox for approvals across modules, and the digital signatures that print on approved documents.",
  articles: [
    {
      id: "wf-approvals",
      title: "All Approvals: one inbox for everything waiting on you",
      summary:
        "What appears in Workflow → All Approvals (vouchers, POs, requisitions, BOMs, leave, payroll, payment runs, reconciliations, periods) and how to filter, open and act on it.",
      estimatedMinutes: 5,
      audience: "manager",
      featured: true,
      coverImage: "/tutorials/screens/approvals.jpg",
      videos: [
        {
          src: "/tutorials/videos/wf-approvals-tour.webm",
          poster: "/tutorials/videos/wf-approvals-tour-poster.jpg",
          title: "Work through All Approvals",
          caption: "Counters, document-type filter, the row Actions menu and the voucher approval queue link. Nothing is approved in this video.",
          durationSeconds: 43,
        },
      ],
      infographics: [
        {
          type: "diagram",
          title: "What shows up, and what each step does",
          caption: "Voucher approval chain on top; other document types and their actions below.",
          imageSrc: "/tutorials/diagrams/workflow/approval-paths.svg",
          imageAlt: "Voucher statuses Draft, Submitted, Checked, Recommended, Approved, Posted with reject loop, and a table of other documents with waiting status, actions and who can act",
        },
        {
          type: "flow",
          title: "Approval screens",
          steps: [
            { label: "All Approvals", href: "/app/approvals" },
            { label: "Voucher Approvals", href: "/app/accounts/vouchers/approval-queue" },
            { label: "Leave Approvals", href: "/app/hr/leave/approvals" },
            { label: "Payroll Approvals", href: "/app/hr/payroll/approvals" },
            { label: "Purchase & AP", href: "/app/accounts/purchase-workflow" },
          ],
        },
      ],
      images: [
        {
          src: "/tutorials/screens/wf-approvals-filter-po.jpg",
          alt: "All Approvals filtered to Purchase Order with the counters Total Queue Items, Actionable Now and Shown by Filters",
          caption: "Filter by document type to work through one queue at a time.",
        },
        {
          src: "/tutorials/screens/wf-voucher-approval-queue.jpg",
          alt: "Voucher Approval Queue page with search, queue status filter, date range, Print Queue, Export CSV and Refresh",
          caption: "Quick link Voucher Approvals: the finance-only queue with date range (last 3 months by default).",
        },
      ],
      content: `## Overview

**Workflow → All Approvals** (\`/app/approvals\`) is one inbox for every document waiting for a decision, from every module. Managers, accountants, HR and store heads use it so nothing waits unseen.

| Document | In the list when status is | Actions |
|---|---|---|
| **Voucher** | Submitted, Checked, Recommended, Approved | Check, Recommend, Approve, Post, Reject |
| **Purchase Order** | Draft | Approve, Cancel (reason) |
| **Requisition** (if procurement is switched on) | Submitted | Approve, Reject (reason) |
| **BOM** | Submitted | Approve |
| **Leave Request** | Pending | Approve, Reject (reason) |
| **Payroll Run** | Finalized, Checked | Approve, Reject (reason) |
| **Payment Run** | Draft, Approved, Processed | Approve, Process, Execute |
| **Bank Reconciliation** | Not finalized | Finalize |
| **Accounting Period** | Open / Closed | Close, Reopen |

The **Pending approvals** tile on the dashboard and the bell count the same queues.

## Before you start

- Most actions need the **admin** or **manager** role. HR roles can also act on **Leave Request** and **Payroll Run**. Voucher steps follow your company's voucher approval setup.
- Rows you can see but not act on show **No action** (or only **Open**).

## Steps

1. Open **Workflow → All Approvals**, or click **Pending approvals** on the dashboard, or **Open all approvals** in the bell.
2. Read the three counters: **Total Queue Items**, **Actionable Now** (what *you* can act on) and **Shown by Filters**.
3. Narrow the list:
   - **Search number/details...** — type a voucher, PO or run number, or a supplier name.
   - **All Documents** — pick one type, for example **Voucher** or **Purchase Order**.
   - **All Statuses** — for example **Submitted** or **Pending**.
4. Read each row: **Doc Type**, **Number**, **Date**, **Status**, **Amount**, **Details** (type, supplier, employee, days…).
5. Click **Actions** on a row. Choose **Open** first to check the document, then come back and pick the next step (**Approve**, **Check**, **Post**…). See *Step-by-step: approve or reject a document*.
6. A green line confirms, for example *Voucher action completed: Approve.* The list reloads.
7. Use **Print** or **Export CSV** to share the current queue (for example in a weekly meeting).

### Quick links

At the top: **Voucher Approvals** (the finance queue), **Leave Approvals**, **Payroll Approvals** and **Purchase & AP**. These pages show more detail for their own document type.

## What happens next

- Each step moves the document to its next status and records who did it and when (shown in the document history).
- On printed documents your name, designation and signature fill the matching block (**Checked By**, **Approved By**, **Posted By**…). See *Digital signatures on approved documents*.
- For vouchers, the person who prepared it gets a bell notification when it is approved or rejected (payroll officers are notified when a run is sent back).

## Tips

- Work one document type at a time with the **All Documents** filter.
- **Reject** and **Cancel** always ask for a reason. Write something the submitter can act on, e.g. *Wrong cost centre — use Sewing Line 3*.

## Common problems

- **"No approvals found for the current filters."** → set **All Documents** and **All Statuses** back to *All*, and clear the search box.
- **A row shows No action** → your role cannot act on it, or it is waiting for an earlier step by someone else.
- **Bank reconciliation asks for a "Finalize reason (optional)"** → a browser box opens; you may leave it empty and click OK.`,
      tags: ["approvals", "workflow", "inbox", "voucher", "purchase order", "leave", "payroll", "requisition", "bom"],
      keywords: ["approve", "pending approvals", "approval queue", "checker", "maker checker", "authorize", "sign off", "payment run", "accounting period", "anumodon"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: [
        "/app/approvals",
        "/app/accounts/vouchers/approval-queue",
        "/app/hr/leave/approvals",
        "/app/hr/payroll/approvals",
        "/app/accounts/purchase-workflow",
      ],
      relatedArticleIds: ["wf-approve-or-reject", "wf-digital-signatures", "fin-voucher-approval-queue", "gs-bell-and-ai-assistant"],
    },
    {
      id: "wf-approve-or-reject",
      title: "Step-by-step: approve or reject a document",
      summary:
        "Open the document from All Approvals, check it, then approve it or reject it with a clear reason.",
      estimatedMinutes: 3,
      audience: "manager",
      coverImage: "/tutorials/screens/wf-approvals-actions-open.jpg",
      infographics: [
        {
          type: "steps",
          title: "Approve safely",
          steps: [
            {
              title: "Find the row",
              body: "**Workflow → All Approvals**. Filter by document type or search the number.",
              imageSrc: "/tutorials/screens/approvals.jpg",
              imageAlt: "All Approvals page with counters, filters and the approval table",
              href: "/app/approvals",
            },
            {
              title: "Actions → Open",
              body: "Check amounts, accounts, quantities, dates and attachments on the document itself.",
              imageSrc: "/tutorials/screens/wf-approvals-actions-open.jpg",
              imageAlt: "Row Actions menu open in All Approvals with Open and approval steps",
            },
            {
              title: "Actions → Approve (or the next step)",
              body: "For vouchers the step may be **Check**, **Recommend**, **Approve** or **Post**.",
            },
            {
              title: "Or Reject / Cancel with a reason",
              body: "Type the reason in **Reason (required)** and confirm. The submitter sees it.",
            },
          ],
        },
      ],
      content: `## Overview

Approving means you take responsibility: your name and signature print on the document. This guide shows a safe routine for any document in **All Approvals**.

## Before you start

- You need the right role (admin / manager, or HR for leave and payroll).
- Set your **designation and signature image** first (your name → **My Signature**).

## Steps

1. Open **Workflow → All Approvals** (\`/app/approvals\`).
2. Find the document: choose its type in **All Documents** or type its number in **Search number/details...**.
3. Click **Actions → Open**. The document opens in its own page (voucher, PO list, BOM, leave or payroll approvals).
4. Check it carefully:
   - **Vouchers:** date, ledger accounts, debit = credit, cost centre, narration, attached bills.
   - **Purchase orders:** supplier, items, quantities, rates, delivery date.
   - **Leave:** dates, number of days, leave balance.
   - **Payroll runs:** totals compared with last month, new joiners and leavers.
5. Go back to **All Approvals** (browser **Back** or the sidebar).
6. To approve: click **Actions** → **Approve** (for vouchers the next step may be **Check**, **Recommend** or **Post**). A green message confirms the action.
7. To refuse: click **Actions** → **Reject** (or **Cancel** for a purchase order). A box opens titled with the action and document number.
   - Type a clear reason in **Reason (required)** (*Enter a short reason for audit visibility…*).
   - Click the confirm button (it has the same name as the action). The button stays grey until you type a reason.

## What happens next

- **Approved:** the document moves to its next status. If more steps remain it stays in the inbox for the next person.
- **Rejected voucher:** it goes back to draft; earlier Checked / Recommended / Approved signatures are cleared, and the preparer can fix and resubmit.
- **Cancelled PO:** it can no longer be received.
- Voucher preparers get a bell notification with the result; for other documents, tell the submitter or let them check the list.

## Tips

- Never approve from the list alone when the amount is large — always **Open** first.
- Short, specific reasons save a round trip.

## Common problems

- **The action button says "Working…"** → wait; another action is still running.
- **Red error after Approve** → read it. Common causes: the accounting period is closed, the budget is exceeded, or someone else already acted. Refresh the page.`,
      tags: ["approvals", "approve", "reject", "workflow", "reason"],
      keywords: ["how to approve", "reject voucher", "cancel po", "decline", "authorise", "approve leave", "approve payroll", "check voucher", "post voucher"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app/approvals", "/app/accounts/vouchers/approval-queue"],
      relatedArticleIds: ["wf-approvals", "wf-digital-signatures", "fin-voucher-approval-queue"],
    },
    {
      id: "wf-digital-signatures",
      title: "Digital signatures on approved documents",
      summary:
        "Set your designation and signature image once; they print automatically in the signature blocks of vouchers, challans, gate passes, GRNs and other documents you approve, next to a QR code and Verification ID.",
      estimatedMinutes: 4,
      audience: "everyone",
      coverImage: "/tutorials/screens/wf-voucher-print-signatures.jpg",
      infographics: [
        {
          type: "steps",
          title: "From signature to signed print",
          steps: [
            {
              title: "My Signature",
              body: "Your name → **My Signature**. Save your **Designation** and upload a signature image.",
              imageSrc: "/tutorials/screens/my-signature.jpg",
              imageAlt: "My Signature page with Name, Designation and Signature image sections",
              href: "/app/my-signature",
            },
            {
              title: "Approve in All Approvals",
              body: "Each step you complete (Check, Approve, Post…) records your name and time.",
              href: "/app/approvals",
            },
            {
              title: "Print the document",
              body: "The signature blocks fill automatically. In this demo voucher only **Prepared By** is signed; blocks for steps not done in P7 ERP stay blank for a hand signature. The **Verification ID** is printed at the bottom.",
              imageSrc: "/tutorials/screens/wf-voucher-print-signatures.jpg",
              imageAlt: "Printed voucher with QR code, Verification ID and Prepared By, Checked By, Approved By and Posted By signature blocks",
            },
          ],
        },
      ],
      content: `## Overview

When you complete an approval step, P7 ERP puts your **digital signature** in that step's block on the printed document: your **name**, **designation**, the **date and time** you signed, and your **signature image** if you uploaded one. Blocks for steps nobody has done yet stay as a blank line, so they can still be signed by hand.

## Before you start

- Everyone who prepares or approves documents should set **My Signature** once.

## Steps

### Set up your signature (once)

1. Click your name in the top bar → **My Signature** (or **Settings → My Signature** in the sidebar), \`/app/my-signature\`.
2. Type your **Designation** (for example *Finance Manager*) and click **Save designation**. Your **Name** comes from your user account.
3. Click **Upload image** and choose a **PNG, JPG or WEBP** up to **2 MB**. Sign on white paper, scan or photograph it and crop tightly; a PNG with a transparent background looks best.
4. Use **Replace image** or **Remove image** at any time. Printed documents always show your current image.

### Which block gets filled

| Document | Block | Filled by |
|---|---|---|
| Voucher | **Prepared By** | User who created the voucher |
| Voucher | **Checked By / Recommended By / Approved By / Posted By** | User who moved the voucher to that status |
| Delivery challan, warehouse transfer, production material issue | **Approved** | User who posted it |
| Gate pass | **Approved** | User who approved it (or released it, if it skipped approval) |
| GRN | **Approved** | User who received it |
| Process order | **Approved** | User who approved it (issuer until then) |
| GRN, challan, transfer, material issue | **Prepared** | User who created it |

If a voucher is **rejected** and sent back to draft, the earlier Checked / Recommended / Approved signatures are cleared and the next approval cycle signs again. **Cancel posting** clears the Posted By signature.

### QR code and Verification ID

Printed vouchers and inventory documents (delivery challan, gate pass, GRN, material issue, process order, warehouse transfer) carry a **QR code** (*Scan to verify*) and a **Verification ID**. They tie the paper to the record in P7 ERP.

To check a paper copy, open the same document in the app, click **Print** to see its print preview, and compare the **Verification ID**. If the IDs match, the paper came from P7 ERP.

Proforma invoices have their own public verification link that buyers can open without signing in.

## What happens next

- Every new print shows the latest signatures and your current image.

## Tips

- Check **Designation** spelling — it prints exactly as typed.
- Ask everyone in an approval chain (checker, recommender, approver) to set their signature before go-live, otherwise their blocks print as blank lines.
- Documents approved before this feature have blank blocks until they go through an approval step again.

## Common problems

- **My block is blank on the print** → you have not done that step (someone else did), or you have no signature image. The name and date still print; upload an image in **My Signature**.
- **"Image is too large (max 2 MB)."** → crop or save as a smaller JPG.
- **Scanning the QR code on a phone shows an error or raw text** → the link needs a signed-in P7 ERP session. Compare the **Verification ID** in the app instead.`,
      tags: ["signature", "digital signature", "approval", "print", "voucher", "delivery challan", "gate pass", "GRN", "QR"],
      keywords: [
        "sign",
        "designation",
        "approved by",
        "prepared by",
        "posted by",
        "checked by",
        "signatory",
        "e-signature",
        "verification id",
        "qr code",
        "scan to verify",
        "challan",
        "gate pass",
      ],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: [
        "/app/my-signature",
        "/app/approvals",
        "/app/accounts/vouchers",
        "/app/inventory/delivery-challans",
        "/app/inventory/goods-receiving",
      ],
      relatedArticleIds: ["gs-profile-and-signature", "wf-approvals", "wf-approve-or-reject", "fin-voucher-approval-queue"],
    },
  ],
};

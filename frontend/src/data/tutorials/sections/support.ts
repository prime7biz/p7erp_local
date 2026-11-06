import type { TutorialSection } from "../types";

export const supportSection: TutorialSection = {
  id: "support",
  title: "Support",
  description: "Ask the P7 team for help: raise a ticket, follow replies and close the loop.",
  articles: [
    {
      id: "sup-tickets",
      title: "Support tickets: overview",
      summary:
        "Where to raise problems with the P7 operations team, how the ticket list works and what each status means.",
      estimatedMinutes: 3,
      audience: "everyone",
      coverImage: "/tutorials/screens/support-tickets.jpg",
      infographics: [
        {
          type: "diagram",
          title: "Life of a support ticket",
          caption: "Write → Submit → talk in the thread → closed. If the problem comes back, open a new ticket.",
          imageSrc: "/tutorials/diagrams/support/ticket-lifecycle.svg",
          imageAlt: "Four steps: write the ticket, submit (status open), talk in the thread (in progress), closed; with a loop back to open a new ticket",
        },
        {
          type: "flow",
          title: "Support screens",
          steps: [
            { label: "My tickets", href: "/app/support/tickets" },
            { label: "New ticket", href: "/app/support/tickets/new" },
            { label: "Ticket thread (View thread)" },
          ],
        },
      ],
      content: `## Overview

**Support** (second item in the sidebar) is how your company talks to the **P7 operations team** about billing, user access, bugs or "how do I…?" questions. Every message is kept in a ticket thread, so nothing gets lost in phone calls or chat.

The list page is called **Platform support** (\`/app/support/tickets\`).

## Before you start

- Any signed-in user can open tickets.
- For questions about *your company's own process* (which buyer, which price, who approves), ask your manager first — the P7 team supports the software.

## Steps

1. Open **Support → My tickets**.
2. Despite the name, the list shows tickets raised by **everyone in your company**, so you can see if a colleague already reported the same problem.
3. Use **Filter** to choose **All statuses**, **Open**, **In progress** or **Closed**. The number next to it shows the **total**.
4. Read the table: **ID** (#number), **Title**, **Status**, **Priority**, **Updated** (last change).
5. Click **View thread** on a row to read replies and answer.
6. Click **New ticket** (orange button, top right) to raise a new problem. With no tickets yet you see *No tickets yet. Create your first ticket*.

### Status meanings

| Status | Meaning | What you do |
|---|---|---|
| **open** | Received, waiting for the team | Wait, or add detail in the thread |
| **in progress** | The team is working on it / waiting for your answer | Check the thread and reply |
| **closed** (or resolved) | Finished | Nothing. If it comes back, open a new ticket |

## What happens next

- Replies from the **Platform team** appear in the ticket thread. Check **My tickets** — the **Updated** time changes when there is a new message.

## Tips

- One problem per ticket. Several problems in one ticket are slower to solve and hard to close.
- Mention the ticket **#number** when you call or email the P7 team.

## Common problems

- **"Failed to load tickets"** → check your internet, then refresh. If it continues, tell your admin.
- **I cannot find a colleague's ticket** → the list shows tickets from everyone in your company. Set **Filter** to **All statuses**; closed tickets are hidden when the filter is **Open**.`,
      tags: ["support", "tickets", "help", "platform support"],
      keywords: ["helpdesk", "help desk", "complaint", "bug report", "problem", "issue", "contact support", "ticket status"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app/support/tickets", "/app/support/tickets/new"],
      relatedArticleIds: ["sup-create-ticket", "sup-reply-to-ticket", "gs-at-a-glance"],
    },
    {
      id: "sup-create-ticket",
      title: "Step-by-step: raise a support ticket",
      summary:
        "Fill Title, Category, Priority and Description so the P7 team can understand and fix your problem quickly.",
      estimatedMinutes: 3,
      audience: "everyone",
      featured: true,
      coverImage: "/tutorials/screens/sup-new-ticket-filled.jpg",
      videos: [
        {
          src: "/tutorials/videos/sup-create-ticket.webm",
          poster: "/tutorials/videos/sup-create-ticket-poster.jpg",
          title: "Raise a support ticket",
          caption: "Open New ticket, fill Title, Category, Priority and Description, then click Submit ticket.",
          durationSeconds: 44,
        },
      ],
      infographics: [
        {
          type: "steps",
          title: "Raise a ticket",
          steps: [
            {
              title: "Open Support → New ticket",
              body: "Or click **New ticket** on **My tickets**.",
              imageSrc: "/tutorials/screens/support-tickets-new.jpg",
              imageAlt: "Empty New support ticket form with Title, Category, Priority and Description",
              href: "/app/support/tickets/new",
            },
            {
              title: "Fill the four fields",
              body: "Short **Title**, the right **Category** and **Priority**, and a clear **Description** with steps and the exact error.",
              imageSrc: "/tutorials/screens/sup-new-ticket-filled.jpg",
              imageAlt: "New support ticket form filled with a title about a blank delivery challan print, category Technical and priority High",
            },
            {
              title: "Click Submit ticket",
              body: "The ticket thread opens with its **#number**. Keep that number.",
            },
          ],
        },
      ],
      content: `## Overview

Use this when you need help from the P7 team: you cannot sign in, a screen shows an error, a number looks wrong, you need a new user or module, or you have a billing question.

## Before you start

- Note **which screen** (menu path, or copy the address from the browser bar), **what you clicked**, and the **exact red error text**.
- If you can, check whether a colleague sees the same problem.

## Steps

1. Open **Support → New ticket** (\`/app/support/tickets/new\`). The page title is **New support ticket**.
2. **Title** — one short line that names the problem, for example *Delivery challan print preview is blank*. (Max 255 characters.)
3. **Category**:
   - **General** — questions and anything else.
   - **Billing** — subscription, invoices, payments to P7.
   - **Technical** — errors, wrong numbers, slow or broken screens.
   - **Access / users** — sign-in problems, new users, roles, locked accounts.
4. **Priority**:
   - **Low** — question or small issue, no deadline.
   - **Medium** (default) — work is slower but possible.
   - **High** — a team cannot do an important job today.
   - **Urgent** — the whole company is blocked (for example nobody can sign in, shipment documents cannot be printed).
5. **Description** — write:
   - the steps (*Inventory → Delivery challans → open DC-0012 → Print*),
   - what you expected and what happened,
   - the exact error text,
   - since when, and who else is affected.
6. Click **Submit ticket** (it shows **Submitting…** while saving).
7. The ticket thread opens: **#number — Title**, with your **Original request**. Note the #number.

## What happens next

- The ticket appears in **My tickets** with status **open**. The team replies in the thread; see *Read replies and answer a ticket*.

## Tips

- One problem per ticket.
- Never write passwords in a ticket. The team never needs your password.
- If a record is involved, include its number (order, PO, voucher, challan).

## Common problems

- **"Title and description are required."** → both boxes must have text.
- **"Failed to create ticket"** → your internet dropped or the session ended. Copy your description, refresh, sign in and try again.`,
      tags: ["support", "ticket", "how-to", "new ticket"],
      keywords: ["raise ticket", "open ticket", "report bug", "report problem", "contact p7", "priority", "urgent", "category", "access request"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app/support/tickets/new", "/app/support/tickets"],
      relatedArticleIds: ["sup-tickets", "sup-reply-to-ticket"],
    },
    {
      id: "sup-reply-to-ticket",
      title: "Read replies and answer a ticket",
      summary:
        "Open a ticket thread, read the Platform team's replies, send more information, and know when a ticket is closed.",
      estimatedMinutes: 2,
      audience: "everyone",
      coverImage: "/tutorials/screens/support-tickets.jpg",
      infographics: [
        {
          type: "diagram",
          title: "Where replies happen",
          caption: "All conversation stays in the ticket thread until the ticket is closed.",
          imageSrc: "/tutorials/diagrams/support/ticket-lifecycle.svg",
          imageAlt: "Support ticket lifecycle from writing the ticket to closed",
        },
      ],
      content: `## Overview

Each ticket has a **thread** — like a short chat — between your company and the **Platform team**. You read their answers and reply on the ticket page (\`/app/support/tickets/<number>\`).

## Before you start

- You need an existing ticket. See *Step-by-step: raise a support ticket*.

## Steps

1. Open **Support → My tickets**.
2. Find the ticket (use **Filter** if the list is long) and click **View thread**.
3. At the top you see **#number — Title** and a line with **status · priority · category**.
4. **Original request** shows what you wrote first.
5. **Thread** lists every message in time order. Your messages are labelled **You** (left, tinted); the P7 team's are labelled **Platform team** (right). Each shows the date and time. If nobody has answered yet you see *No replies yet — the team will respond here.*
6. To answer, type in **Reply** (*Add a message…*) and click **Send reply**. The thread refreshes with your message.
7. Click **All tickets** (top left) to go back to the list.

## What happens next

- When the team closes the ticket, the reply box disappears and you see: *This ticket is closed. Open a new ticket if you need further help.*

## Tips

- Answer the team's questions in the same thread, not in a new ticket, so the history stays together.
- If the fix works, reply "Confirmed, working now" so the team can close the ticket.

## Common problems

- **The Send reply button is grey** → the Reply box is empty.
- **"Failed to send reply"** → check your connection and try again; copy your text first so you do not lose it.
- **"Invalid ticket"** → the address was typed wrongly. Open the ticket from **My tickets** instead.`,
      tags: ["support", "ticket", "reply", "thread"],
      keywords: ["answer ticket", "ticket reply", "support response", "view thread", "closed ticket", "follow up"],
      lastUpdated: "2026-11-06",
      relatedAppRoutes: ["/app/support/tickets"],
      relatedArticleIds: ["sup-tickets", "sup-create-ticket"],
    },
  ],
};

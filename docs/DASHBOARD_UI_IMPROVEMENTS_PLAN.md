# Dashboard UI Improvements Plan

Improvements to apply in `frontend/src/pages/Dashboard.tsx` and related patterns.

**Status:** Implemented (via subagents). See summaries below.

## 1. Loading state
- Add a `loading` state (true until first batch of dashboard API calls completes).
- Show a skeleton or spinner for the main content area (welcome + KPI cards + first section) while loading.
- Set loading false after `Promise.allSettled` resolves.

## 2. Fix or hide "Inventory Items" KPI
- The fourth KPI card is hardcoded to `value: 0`. Either wire it to real data (e.g. count from items/inventory API if available) or remove the card / show "—" with a tooltip "Coming soon" so it doesn’t look broken.
- Prefer: check if an API exists for item count; if yes use it; if no, keep one card but show "—" and optional "Coming soon" subtitle.

## 3. Stronger empty states
- For "No orders yet", "No employee data yet", "No revenue data yet": add a short CTA (e.g. "Create first order" → `/app/orders`, "Add employees" → appropriate HR path, "Revenue appears when you have orders" or link to reports).
- Use a small primary or secondary button/link so the dashboard guides the next action.

## 4. Last updated / refresh
- After data fetch completes, store a timestamp (e.g. `lastUpdated: Date`).
- Display "Last updated: X min ago" near the welcome area or below tenant block (update every minute via existing clock effect or on mount).
- Optionally add a refresh button that re-runs the dashboard fetch and updates `lastUpdated`.

## 5. Time-based greeting
- Replace static "Welcome back, {firstName}" with "Good morning|afternoon|evening, {firstName}" based on `currentTime` (e.g. morning < 12, afternoon < 17, else evening).

## 6. Highlight Critical Alerts
- When "Critical Alerts" count in secondary stats is > 0, give that card stronger emphasis: e.g. red left border, AlertTriangle icon, or subtle red background.
- Optionally add a "View alerts" or "View follow-ups" link on that card to `/app/merchandising/followups` or relevant alerts page.

## 7. Deduplicate Quick Actions
- "Settings" and "Users" both point to `/app/settings/users`. Keep a single entry (e.g. "Settings" or "User management") in the quickActions array.

## 8. Section headings
- Use semantic `<h2>` for section titles ("Key Metrics", "Summary Cards", "Charts & Analytics", etc.) for accessibility and hierarchy.
- Keep existing visual style (uppercase, tracking); ensure only one h1 (the welcome line).

## 9. "View all" links on lists
- For "Recent Orders" card: add a "View all" link (top-right of card header) to `/app/orders`.
- For "Follow-up Tasks" card: add a "View all" link to `/app/merchandising/followups`.

## 10. Tenant block on small screens
- On very small viewports, make the tenant block (tenant name + company code) stack or center: e.g. use `text-center sm:text-right` and ensure the block doesn’t overflow; optionally full-width on mobile.

---

## Implementation summary (Dashboard.tsx)

| # | Item | Done |
|---|------|------|
| 1 | Loading state | `loading` state; skeleton for welcome + KPIs; cleared after `Promise.allSettled`. |
| 2 | Inventory Items KPI | Card shows "—" with "Coming soon" subtitle (no items API). |
| 3 | Empty states | "No orders" → Create first order; "No employee data" → Manage users; "No revenue" → View reports. |
| 4 | Last updated / refresh | `lastUpdated` stored; "Last updated: X min ago" + Refresh button. |
| 5 | Time-based greeting | "Good morning \| afternoon \| evening, {firstName}" via `getTimeBasedGreeting`. |
| 6 | Critical Alerts | Red left border, `AlertTriangle`, subtle red background; "View" link to followups. |
| 7 | Quick Actions | Single "Settings" entry (no duplicate Users). |
| 8 | Section headings | Semantic `<h2>` for Key Metrics, Summary Cards, Charts & Analytics, Quick Actions, Intelligence, AI Insights; one `<h1>` (welcome). |
| 9 | View all links | Recent Orders and Follow-up Tasks cards have "View all" in header. |
| 10 | Tenant block responsive | `w-full sm:w-auto`, `text-center sm:text-right` on tenant block. |

---

## File to modify
- `frontend/src/pages/Dashboard.tsx` — all changes in this single file unless a shared skeleton component is added (can be inline for simplicity).

## Order of implementation
Can be done in parallel by subagents; merge conflicts are possible only in Dashboard.tsx, so agents can work on different sections (e.g. Agent A: loading + greeting + lastUpdated; Agent B: KPI + empty states + quick actions; Agent C: critical alerts + view all links; Agent D: headings + tenant block responsive).

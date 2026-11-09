# Mobile responsive audit (2026-11-09)

What was wrong when using P7 ERP on a phone, what was fixed, and how to re-check it.
Frontend only: no backend, database or `.env` change. Rollback: `git revert <sha>`.

## Root causes and fixes

| Problem | Cause | Fix |
|---|---|---|
| Pages looked broken in dark mode | The app turned dark whenever the phone was dark, but only about 29 of roughly 480 pages have dark styles | App is **always light**: `frontend/public/theme-init.js`, `frontend/src/lib/theme.ts` (all helpers force light), `color-scheme: light` in `index.html` and `index.css`, Dark mode menu item removed from `ShellTopHeader.tsx` |
| Print showed only the visible screen | The shell fixed the page height and scrolled inside `<main>`; print kept that | `@media print` reset in `frontend/src/index.css` (`.erp-app-shell`, `.erp-main-content`); header, sidebar, breadcrumbs, footer, bottom menu, quick-create button, AI panel, banners marked `no-print` |
| Save / Export did not work on phones | Download links were removed immediately (cancels the download on mobile browsers); iPhone browsers often ignore the download attribute | One helper `frontend/src/lib/fileSave.ts` (`saveBlob`, `openOrSaveBlob`): normal download, iPhone/iPad share sheet ("Save to Files"), cancel handling, PDF pop-up fallback, link kept alive 60 s. All 30 download call sites use it; Excel exports now go through it too |
| Mobile menu differed from the sidebar | `AppBottomNav.tsx` (and the Ctrl+K palette in `Layout.tsx`) had their own copies of the filtering rules | One shared `filterVisibleMenuSections` / `isMenuPermissionAllowed` in `frontend/src/components/shell/sidebarNavUtils.ts`, used by the sidebar, the More drawer and the search palette; bottom tabs carry `permissionKey`; shortcuts appear only when their module is visible; drawer filter matches page names; Escape closes and returns focus to **More**; Tab stays inside the open drawer; 44px tap targets |
| Panels went off the screen | Bell and Help panels were right-aligned to their button | Full width on phones (`BellPanel.tsx`, `PageHelpButton.tsx`) |
| Row "Actions" menus were cut off inside sideways-scrolling tables | Inline dropdown inside `overflow-x: auto` | `RowActionsMenu.tsx` floats the menu on phones/tablets automatically (above dialogs, `z-[120]`), bigger tap targets |
| Tall dialogs hid their Save button | Centered overlays could not scroll | Phone/tablet CSS in `index.css` lets centered overlays scroll (short dialogs stay centered). Padding and `max-width` fallbacks use `:where()` (zero specificity), so a dialog's own `p-*` / `max-w-*` classes still win: a `max-w-md` dialog stays 448px on a 768px tablet |
| Single-area print modes could add blank pages | `body.print-list` / `print-timeline` / `print-tutorial` hide the rest with `visibility`, which still takes space once the shell is not clipped | In those modes everything that is not the print area or its ancestor is `display: none` |
| iPhone zoomed into small inputs | Inputs under 16px | Inputs, selects and textareas are 16px below 1024px width |
| Quick-create `+` covered Save buttons | Button floats over the page | Hidden on `/new`, `/edit` and shop-floor entry screens (hourly production, scan station, gate scan) |
| Bottom menu covered the page end on tablets | `sm:p-4` cancelled the bottom padding | Bottom padding includes the safe area on every width below desktop |
| KPI cards stacked one per row | Shared list-page grid used 1 column on phones | `listPageLayout.ts` KPI grids use 2 columns on phones |
| Printable documents (`/print` pages) cramped on phones | Fixed A4 layout | Screen-only phone rules in `quotation-print.css`; printed copy unchanged |

## How to re-run the audit

The tool opens each route in `tools/tutorial-capture/mobile-audit-routes.json` at 360px and 390px with the
browser in **dark** system mode, and also checks print media.

```powershell
# Docker stack running; capture user from backend/scripts/seed_tutorial_capture_user.py
cd tools/tutorial-capture
$env:CAPTURE_PASSWORD = "<capture user password>"
node mobile-audit.mjs                    # or --viewport=phone-390 / --route=/app/orders
```

Screenshots and `report.json` go to `tools/tutorial-capture/.mobile-audit/` (git-ignored).

Severity rules: **high** = whole page scrolls sideways, app turned dark, page crashed, or print still clips
the page / shows the menus; **medium** = a control sticks out past the right edge and cannot be scrolled to;
**low** = tap targets smaller than 32px (count only).

## Result on 2026-11-09 (26 routes, 360px and 390px, dark system mode)

- Before the AI-panel fix: every route reported 4 "clipped" controls. They were the closed AI assistant
  panel sitting off-screen but still reachable by keyboard; it is now `invisible` + `aria-hidden` when closed.
- After the fixes: **0 high, 0 medium**. 23 routes are "low" (small tap targets only), 3 are "ok".
- Extra checks at 390px: the More drawer opens, filters pages by name, closes with Escape and returns focus;
  the voucher list prints as a 2-page A4 PDF (full list, no menus).

Most small tap targets (low) are in dense tables:

| Route | Targets under 32px |
|---|---|
| `/app/accounts/reports/trial-balance` | 116 |
| `/app/hr/employees` | 65 |
| `/app/orders` | 39 |
| `/app/tutorials` | 36 |
| `/app/accounts/vouchers/approval-queue` | 32 |
| `/app/customers` | 32 |

## Still open (documented, not fixed in this round)

- **Small tap targets in dense tables** (above). Fix page by page, or offer a Cards view like
  `useInventoryListView.ts` / `InventoryMobileList.tsx`.
- **Page-specific inline "Actions" dropdowns** (pages that do not use `RowActionsMenu`, for example the
  Quotations / Customers pattern) can still be cut off near the bottom of a sideways-scrolling table.
  Move them to `RowActionsMenu` when the page is next touched.
- **Sticky Save/Cancel footers** in individual modals: the overlay now scrolls so the buttons are reachable,
  but each modal still scrolls as a whole.
- **`inputmode`** on number and date fields is per page (there is no shared input component yet).
- **Hourly production**: the *Sewing line* select is slightly wider than its card at 360px.
- **Header scrolls away on phones**: same as before this change (the page itself scrolls below desktop width).
  A sticky header would sit on top of page-level `sticky top-0` bars, so it was left as is.
- **Row menus decide "narrow screen" once per page open**; rotating the phone keeps the first choice until
  the page is reopened.
- **Real devices**: `navigator.share` and native downloads cannot be tested in jsdom or headless Chrome.
  Check by hand on Android Chrome and iPhone Safari with the system set to dark (see below).

## Manual phone checklist

1. Phone in **dark** mode → sign in → the app stays light.
2. **More** → filter "ledger" → only matching pages show → tap outside / ×: drawer closes.
3. Voucher list → **Print** → the print preview shows the whole list and no menus → Save as PDF.
4. Any report → **Export CSV** / **Excel** → Android: file in Downloads. iPhone: share sheet → Save to Files.
5. Payslip PDF → opens or saves; nothing happens silently.
6. Open a long dialog (for example quick-add customer) → scroll → **Save** is reachable.

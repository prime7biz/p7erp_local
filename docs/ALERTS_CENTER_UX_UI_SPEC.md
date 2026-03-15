# Advanced Critical Alert Center — UX/UI Design Spec

**Route:** `/app/merchandising/alerts`  
**Audience:** Enterprise ERP power users (merchandising, planners, managers).  
**Tone:** Clean, premium, calm but powerful; easy to scan; no visual noise.

---

## 1. PAGE LAYOUT

### Section hierarchy (top to bottom)

| # | Section | Purpose |
|---|--------|--------|
| 1 | **Top Header** | Page identity, counts, last scan, primary actions, secondary actions |
| 2 | **KPI / Summary Band** | At-a-glance numbers (Critical, High, Medium, Low, Total) |
| 3 | **Smart Filter Panel** | Severity, category, date range, status; collapsible |
| 4 | **View Switcher** | Toggle: Table | Cards | Both (split) |
| 5 | **Main Content** | Table and/or card grid; bulk selection when applicable |
| 6 | **Right Drawer** | Alert detail: summary, timeline, comments, related alerts, actions |

### 1.1 Top Header

- **Left:**
  - **Page title:** “Critical Alerts” (or “Alert Center”) — single line.
  - **Subtitle (optional):** One line, e.g. “Overdue and at-risk merchandising follow-ups.” Muted color.
- **Center-right (inline or compact row):**
  - **Counts:** “X critical · Y high · Z total” (or badges); link to filter by severity.
  - **Last scan:** “Last scan: 2 min ago” (or timestamp); muted, small.
  - **Refresh:** Icon button, label “Refresh” on hover/focus.
  - **Run scan:** Primary button “Run scan” (if backend supports on-demand scan).
- **Right:**
  - **Save view:** Secondary action “Save view” (name current filters/layout).
  - **Export:** Dropdown or button “Export” (CSV/Excel).
  - **Settings:** Icon button (e.g. gear) for page settings (columns, default view, notification preferences).

**Layout:** Single horizontal bar; wrap on narrow viewports (see Responsive). No second row unless necessary.

### 1.2 KPI / Summary Band

- **Content:** Five KPI cards in one row (desktop):
  1. **Critical** (count)
  2. **High** (count)
  3. **Medium** (count)
  4. **Low** (count)
  5. **Total** (count)
- **Arrangement:** Equal-width cards, horizontal, with subtle separator or gap. Each card: number prominent, label below (“Critical”, “High”, etc.). Optional micro sparkline or “vs last run” only if data exists; otherwise keep minimal.
- **Placement:** Directly under the header; no redundant title (header already names the page).

### 1.3 Smart Filter Panel

- **Position:** Below KPI band; **horizontal bar on desktop** (left-aligned filters, “Clear filters” on the right).
- **Collapsible:** Yes. Default **expanded** on first visit; state (open/closed) persisted per user. Collapsed: show “Filters” label + active filter count (e.g. “Filters (3)”) and a chevron; one click expands.
- **Content:** Chips/dropdowns for:
  - **Severity:** Multi-select (Critical, High, Medium, Low, Informational).
  - **Category:** Multi-select (e.g. T&A, Sample, Wastage, Delivery, etc. from backend).
  - **Date range:** Presets (Last 24h, Last 7 days, Last 30 days) + optional custom range.
  - **Status (if added):** New, In progress, Resolved, Dismissed.
- **Active state:** When any filter is non-default, show “Clear all” and display active filters as removable chips above or inline with the panel.

### 1.4 View Switcher

- **Placement:** Between filter panel and main content; right-aligned.
- **Options:** Segmented control or icon toggle: **Table** | **Cards** | **Split** (table left, selected alert card/detail right). Default: Table on desktop, Cards on mobile (see Responsive).
- **Persistence:** Remember last choice per user.

### 1.5 Main Content

- **Table (when Table or Split):**
  - Columns: Severity (with color badge), Category, Title, Description (truncated), Date/Time, Status (if any), Actions (e.g. Open).
  - Sticky header on scroll; optional **sticky first column** (Severity + Category or Severity only) for wide tables.
  - Row expand: Optional expand row for full description and quick actions without opening drawer.
  - Row click: Opens right drawer with full alert detail.
  - Checkbox column for bulk actions when “bulk action” mode is supported.
- **Cards (when Cards or Split):**
  - Card grid; each card shows: severity accent (left border or top bar), category badge, title, short description, date, “View” or tap to open drawer.
- **Split view:** Table (or list) on left (~60%); detail (card or drawer content) on right (~40%) for selected alert.

### 1.6 Right Drawer

- **Width:** 400px desktop; 100% on tablet/mobile (or bottom sheet — see Responsive).
- **Sections (top to bottom):**
  1. **Summary:** Severity badge, category, title, full description, source/date.
  2. **Timeline:** Key events (created, updated, status changes) — if data exists.
  3. **Comments:** Thread or “Add comment” — if feature exists.
  4. **Related alerts:** List of links to alerts tied to same order/style/entity.
  5. **Actions:** Primary CTA (e.g. “Mark in progress”, “Resolve”, “Go to order”) and secondary (Dismiss, Snooze if supported).
- **Header:** Alert title + close button. Optional “Previous / Next” to step through list without closing drawer.

---

## 2. RESPONSIVE

### Breakpoints

| Breakpoint | Width | Layout notes |
|------------|--------|----------------|
| **Desktop** | ≥ 1024px | Default layout as above; drawer 400px right. |
| **Tablet** | 768px – 1023px | Simplified columns; drawer as overlay or bottom sheet. |
| **Mobile** | &lt; 768px | Cards only; filters in modal; single-column KPI. |

### Desktop (≥ 1024px)

- Full layout: Header, KPI band (5 columns), horizontal filter bar, view switcher, table (or cards/split).
- Table: All columns visible; sticky header + optional sticky first column.
- Drawer: Right side, 400px; content scrolls inside drawer.

### Tablet (768px – 1023px)

- **Header:** Same elements; “Save view” and “Export” may move to overflow menu.
- **KPI band:** 2 columns (e.g. row 1: Critical, High, Medium; row 2: Low, Total) or 3 + 2.
- **Filters:** Same horizontal bar; collapsible; fewer chips visible, rest in “More filters”.
- **Table:** Simplify columns: Severity, Title, Category, Date; Description in row expand or drawer only. Sticky header; no sticky column if space is tight.
- **Drawer:** Either same 400px right overlay, or **bottom sheet** (e.g. 60% viewport height) with drag handle. Prefer bottom sheet if touch is primary.

### Mobile (&lt; 768px)

- **Header:** Title + subtitle; counts as single line or compact badges; Refresh + Run scan; Export and Settings in kebab menu.
- **KPI band:** **Single column** stack; one KPI per row (or 2 small cards per row).
- **Filters:** **Modal** or bottom sheet. Trigger: “Filters” button showing active count; opening shows all filter controls; “Apply” closes and applies.
- **View:** **Cards only** (no table); list of cards, one per alert; tap card opens detail.
- **Detail:** **Full-screen overlay** or **bottom sheet** (e.g. 90% height) with Summary, Timeline, Comments, Related, Actions. Close button prominent.

---

## 3. COMPONENTS

| Component | Description | Where it appears |
|-----------|-------------|------------------|
| **KPI card** | Soft shadow, rounded corners (e.g. 8px), optional left or top color accent by severity (Critical=red, High=orange, etc.); number large, label small. | KPI band. |
| **Filter chips** | Removable pills for active filters (e.g. “Severity: Critical ×”). | Filter panel (inline or below panel title). |
| **Dropdown filters** | Multi-select or single-select dropdowns for Severity, Category, Date range, Status. | Filter panel. |
| **Table** | Striped or alternating row tint (very subtle); sticky header; optional sticky first column; row hover highlight. | Main content (Table / Split view). |
| **Row expand** | Chevron or “Expand” control per row; expanded area shows full description + quick actions. | Table rows. |
| **Card (alert)** | Rounded (8px), soft shadow; left border or top bar in severity color; category badge; title; truncated description; date; “View” link. | Main content (Cards view; list on mobile). |
| **Drawer** | Fixed right (or bottom on tablet/mobile); sections: Summary, Timeline, Comments, Related alerts, Actions. | Right drawer / bottom sheet. |
| **Drawer sections** | Summary (severity, category, title, description, date); Timeline (events); Comments (thread); Related alerts (links); Actions (buttons). | Inside drawer. |
| **Bulk action toolbar** | Appears above table when one or more rows selected; “Resolve”, “Dismiss”, “Export selected”; “Clear selection”. | Main content (when bulk selection supported). |
| **Empty state** | Illustration or icon + “No alerts” + short explanation + optional “Run scan” or “Adjust filters”. | Main content when alerts list is empty. |
| **Loading skeleton** | Table: skeleton rows with shimmer; Cards: skeleton cards in grid; KPI: skeleton blocks for numbers. | Header counts, KPI band, table/cards. |
| **Error state** | Inline banner below header: icon + message + “Retry” button. | Below header when API fails. |
| **No results (filter)** | Same area as table/cards: “No alerts match your filters” + “Clear filters” button. | Main content when filters return zero. |

---

## 4. COLOR & SEVERITY

### Severity palette (background + text/border)

Use for badges, KPI accents, table/card severity indicator. Prefer **muted backgrounds** and **darker text** for readability and calm feel.

| Severity | Background | Text / border | Usage |
|----------|------------|---------------|--------|
| **Critical** | red-50 (#FEF2F2) | red-700 (#B91C1C) | KPI card accent, badge, table/card indicator |
| **High** | orange-50 (#FFF7ED) | orange-700 (#C2410C) | Same |
| **Medium** | amber-50 (#FFFBEB) | amber-700 (#B45309) | Same |
| **Low** | blue-50 (#EFF6FF) | blue-700 (#1D4ED8) | Same |
| **Informational** | gray-50 (#F9FAFB) | gray-600 (#4B5563) | Same |

- **Accessibility:** Ensure contrast ≥ 4.5:1 for text (e.g. red-700 on white, or on red-50). Avoid red/green only for differentiation; pair with icon or label.
- **Safe usage:** Use severity color for **accent** (left border, badge, icon), not full row background, to keep the UI calm.

### Status colors (if used: New, In progress, Resolved, Dismissed)

Keep **distinct from severity** so users don’t confuse “Critical severity” with “Resolved status.”

| Status | Suggested treatment |
|--------|---------------------|
| **New** | Blue accent or dot (blue-500) |
| **In progress** | Amber or orange accent (amber-500) |
| **Resolved** | Gray with optional check (gray-500) |
| **Dismissed** | Gray, muted (gray-400) |

---

## 5. EMPTY / LOADING / ERROR

### Copy and behavior

| State | Location | Copy (exact or pattern) | Behavior |
|-------|----------|--------------------------|----------|
| **No alerts (empty)** | Main content (table or cards) | **Title:** “No alerts” **Body:** “There are no critical alerts right now. New alerts will appear here after the next scan.” **Action (optional):** “Run scan” button. | Show when `alerts.length === 0` and not loading, no filter applied (or explicit “no results” state). |
| **No results (filter)** | Main content | **Title:** “No matching alerts” **Body:** “No alerts match your current filters.” **Action:** “Clear filters” button. | When filters are applied and result set is empty. |
| **Loading** | Header counts, KPI band, table/cards | No copy; use **skeleton**: header counts “—”, KPI numbers as skeleton blocks, table as 5–8 skeleton rows (or card skeletons). | During initial load and refresh. |
| **API error** | Below header, full width | **Title:** “Couldn’t load alerts” **Body:** “[API error message or] Something went wrong. Please try again.” **Action:** “Retry” button. | On request failure; dismissible optional. |

### Visual pattern

- **Empty / No results:** Centered block; icon (e.g. inbox or filter-off) above title; body text muted; primary button for main action.
- **Loading:** Skeleton only; no “Loading…” text in main content (optional small “Loading…” in header if needed).
- **Error:** Banner with left icon (alert), message, and “Retry”; background red-50, border red-200, text red-800.

---

## 6. DESIGN TOKENS

### Border radius

| Element | Radius | Notes |
|---------|--------|--------|
| Cards (KPI, alert card) | 8px | Consistent card feel |
| Buttons | 6px | Slightly softer than 4px |
| Badges, chips | 6px (or full pill) | Pill for filter chips optional |
| Table container | 8px | Match cards |
| Drawer header / panels | 0 (or 8px top-only) | Drawer often full-height edge |

### Shadow

| Level | Use | Example (conceptual) |
|-------|-----|----------------------|
| **sm** | Table container, dropdowns | 0 1px 2px rgba(0,0,0,0.05) |
| **md** | KPI cards, alert cards, drawer | 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05) |
| **lg** | Modals, bottom sheet | 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.05) |

Keep shadows **soft and low** for premium, calm look.

### Typography

| Use | Token / style | Notes |
|-----|----------------|--------|
| Page title | 1.25rem–1.5rem, font-weight 600–700, gray-900 | “Critical Alerts” |
| Subtitle | 0.875rem, gray-500 | One line under title |
| Table header | 0.75rem, font-medium, gray-500 or gray-600 | Uppercase optional |
| Table cell | 0.875rem, gray-700 (default), gray-900 (title column) | |
| KPI number | 1.5rem–1.875rem, font-semibold, gray-900 | |
| KPI label | 0.75rem, gray-500 | |
| Badge (severity) | 0.75rem, font-medium | |
| Drawer section title | 0.75rem, font-medium, gray-500 | Section labels inside drawer |
| Body in drawer | 0.875rem, gray-700 | |

### Spacing

| Context | Value | Notes |
|---------|--------|--------|
| Between KPI cards | 16px (gap) | Flex/grid gap |
| Between filter row and table | 24px | Section separation |
| Between table rows | 0 (border) or 1px divider | Avoid large row height |
| Table cell padding | 12px 16px (py px) | Comfortable tap/click |
| Page padding (content area) | 24px (desktop), 16px (mobile) | From app chrome |
| Drawer section spacing | 16px between sections | Summary, Timeline, Comments, etc. |

---

## Summary for architect

- **Layout:** Six sections in order: Header → KPI band → Filters → View switcher → Table/Cards → Drawer (on selection).
- **Responsive:** Desktop full layout; tablet simplified columns + drawer as overlay or bottom sheet; mobile cards only, filters in modal, detail in full-screen or bottom sheet.
- **Components:** KPI cards, filter chips/dropdowns, table (sticky header, optional sticky column, row expand), cards, drawer with five sections, bulk toolbar, empty/loading/error/no-results states.
- **Color:** Severity = red / orange / amber / blue / gray (50 bg + 700 text); status separate (blue, amber, gray).
- **Copy:** Defined for no alerts, no results, loading (skeleton), API error.
- **Tokens:** 8px cards, 6px buttons; soft shadows (sm/md/lg); typography and spacing as above for enterprise, calm, premium feel.

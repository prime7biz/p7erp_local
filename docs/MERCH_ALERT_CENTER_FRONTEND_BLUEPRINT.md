# Merch Alert Center – Frontend Blueprint (Sub-Agent 3)

**Route:** `/app/merchandising/alerts` → `MerchCriticalAlertsPage`  
**Stack:** React + TypeScript, Vite.  
**Purpose:** Architecture and contracts only; no full code.

---

## 1. Component Tree

Proposed React component hierarchy and responsibilities.

```
MerchCriticalAlertsPage (container)
├── AlertsPageHeader
├── AlertsKpiBand
├── AlertsToolbar
│   ├── AlertsFilterPanel
│   ├── AlertsViewSwitcher
│   └── AlertsSavedViewsDropdown
├── AlertsBulkToolbar (conditional: when selection.length > 0)
├── AlertsTable | AlertsCardGrid (switch by view mode)
├── AlertsDetailDrawer
├── SaveViewModal
└── AlertSettingsModal
```

### Component contracts

| Component | Responsibility | Main props / state |
|-----------|----------------|--------------------|
| **MerchCriticalAlertsPage** | Layout, URL sync, data fetch (or React Query), orchestration. | Reads URL params; holds `selectedIds`, `drawerAlertId`, `viewMode` in state; passes filter state from URL to children. |
| **AlertsPageHeader** | Title, description, primary actions (e.g. Refresh, Settings, Save view). | `title`, `subtitle?`, `onRefresh?`, `onOpenSettings?`, `onSaveView?`. |
| **AlertsKpiBand** | Summary KPIs (critical / warning / total / by type). | `summary: { critical, warning, total }`; optional `byType?: Record<string, number>`. |
| **AlertsFilterPanel** | Severity, type, buyer, date range, status, assignee. Collapsible. | `filters: AlertFilters`, `onChange: (f: AlertFilters) => void`, `onClear`. |
| **AlertsViewSwitcher** | Toggle table vs card grid. | `viewMode: 'table' \| 'cards'`, `onChange: (v) => void`. |
| **AlertsSavedViewsDropdown** | Load / delete saved filter presets. | `views: SavedView[]`, `activeViewId?: string`, `onSelect(id)`, `onDelete(id)`. |
| **AlertsBulkToolbar** | Shown when rows selected; bulk Assign, Snooze, Resolve, Clear selection. | `selectedIds: string[]`, `onAssign`, `onSnooze`, `onResolve`, `onClearSelection`. |
| **AlertsTable** | Sortable, multi-select, expandable rows, sticky columns, inline actions. | `alerts`, `sort`, `selectedIds`, `onSelect`, `onSort`, `onRowClick`, `onInlineAction`. |
| **AlertsCardGrid** | Card layout for same data; select + click to open drawer. | `alerts`, `selectedIds`, `onSelect`, `onCardClick`. |
| **AlertsDetailDrawer** | Slide-over with sections; some lazy-loaded. | `alertId: string \| null`, `open: boolean`, `onClose`, `onUpdate` (refetch/invalidate). |
| **SaveViewModal** | Name + optional description for current filter state. | `open`, `onClose`, `onSave(name, description?)`. |
| **AlertSettingsModal** | User preferences (e.g. default view, columns, notification). | `open`, `onClose`, `onSave(settings)`. |

---

## 2. State Management

| State | Where it lives | Rationale |
|-------|----------------|-----------|
| **Filters (severity, type, buyer, date range, status, assignee, pagination)** | **URL query** (`useSearchParams` / `useQueryParams` pattern) | Shareable links, back/forward, bookmark. Sync one-way: URL → initial fetch params. |
| **Sort (field + direction)** | URL query (optional) or local state | Prefer URL if we want shareable “sorted” views; else `useState` in page. |
| **Pagination (page, pageSize)** | URL query | Same as filters. |
| **View mode (table vs cards)** | Local state or `localStorage` | No need in URL; optional persist in `localStorage` for UX. |
| **Selected row IDs** | React state in page | Ephemeral; no need in URL. |
| **Drawer open + alert ID** | React state in page | `drawerAlertId: string \| null`. Optional: encode in URL as `?detail=id` for deep link. |
| **Bulk selection** | Same as selected row IDs | Derived: bulk toolbar visible when `selectedIds.length > 0`. |
| **Saved view list** | Server state (React Query) + local “active” id | Fetch saved views on mount; “active view” can be URL or state. |
| **Alerts list + summary** | Server state | **React Query** recommended: `useQuery` for list + summary, `useQuery` for detail by `alertId` when drawer open. Enables cache, refetch, loading/error. |
| **Error / loading** | React Query state + optional local error for mutations | No global store needed. |

**Recommendation:** No global store (Redux/Zustand) for this page. Use **URL for shareable filters/pagination**, **React state for UI (drawer, selection, view mode)**, **React Query for server state**. If other app areas need “current alert” or “alerts unread count”, consider a small context or React Query only.

---

## 3. Reusable Widgets

Place under e.g. `frontend/src/components/merch/` or `frontend/src/components/alerts/`. Each widget is presentational; types can live in a shared `alerts/types.ts`.

| Widget | Purpose | Props interface (TypeScript) |
|--------|----------|------------------------------|
| **SeverityBadge** | Severity pill (critical / warning / info). | `severity: 'critical' \| 'warning' \| 'info' \| string`, `size?: 'sm' \| 'md'`, `className?` |
| **StatusBadge** | Alert status (open, in_progress, resolved, snoozed). | `status: string`, `size?: 'sm' \| 'md'`, `className?` |
| **AgingIndicator** | Days overdue or at-risk (e.g. “3d overdue”). | `daysOverdue?: number`, `daysUntilDue?: number`, `variant?: 'overdue' \| 'at_risk' \| 'ok'`, `className?` |
| **SLACountdown** | Countdown to SLA breach (e.g. “2d left”). | `dueAt: string` (ISO), `slaHours?: number`, `className?` |
| **AssigneeAvatar** | User avatar + optional name for owner/assignee. | `userId?: number`, `name?: string`, `size?: 'sm' \| 'md'`, `className?` |
| **AlertTypeIcon** | Icon per alert type (delay, wastage, quality, etc.). | `type: string`, `size?: number`, `className?` |

Extend existing `Badge` from `@/components/ui/badge` via composition or variants for SeverityBadge / StatusBadge. Use existing `Avatar` from `@/components/ui/avatar` inside AssigneeAvatar.

---

## 4. Table Behavior

### Columns (suggested order)

| Column | Content | Sticky | Notes |
|--------|---------|--------|--------|
| Checkbox | Multi-select | Yes (first column) | Select one / all on page. |
| Severity | SeverityBadge | Yes | |
| Priority | Optional priority label | No | If backend supports. |
| Title | Alert title (truncate) | No | Link or click → drawer. |
| Type | AlertTypeIcon + type name | No | |
| Buyer | Buyer/customer name | No | |
| Order No | Order code link | No | Link to order detail. |
| Style | Style code/name | No | |
| Shipment date | Formatted date | No | |
| Owner | AssigneeAvatar | No | |
| Status | StatusBadge | No | |
| Aging | AgingIndicator | No | |
| Last update | Relative or absolute time | No | |
| Root cause (summary) | Truncated text | No | Optional column. |
| Recommended action | Truncated text | No | Optional column. |
| Actions | Inline: Assign, Snooze, Resolve | Yes (last column) | Dropdown or icon buttons. |

### Sort

- **Recommendation:** Prefer **server-side sort** (sort param in list API) when list is paginated. Pass `sort: { field: string, dir: 'asc' \| 'desc' }` from URL or state to API. If backend does not support sort yet, use **client-side sort** on current page only (limited usefulness with pagination).

### Multi-select

- Checkbox per row; “Select all on page” in header. Selection stored in page state (`selectedIds: string[]`). Bulk toolbar appears when `selectedIds.length > 0`.

### Row expand

- Optional expandable row: one extra row below that shows **summary of Root cause + Recommended action + quick actions**. Keep payload small (already in list response). No need to load full detail until drawer opens.

### Sticky columns

- Sticky: **checkbox (first)**, **Severity**, **Actions (last)** so they stay visible on horizontal scroll.

### Inline actions

- Per row: **Assign** (opens small assignee picker or modal), **Snooze** (snooze until date), **Resolve** (with optional comment). Call mutation APIs then invalidate list + detail query.

---

## 5. Drawer Sections

**AlertsDetailDrawer** content sections. Split by **loaded with alert detail** vs **lazy-loaded** (fetch when section is visible or tab is selected).

### Loaded with alert detail (single detail API response)

- **AlertSummary** – Title, severity, status, type, created/updated, owner.
- **LinkedOrderSummary** – Order code, style, buyer, shipment date (from alert or linked entity).
- **RootCause** – Text/summary.
- **RecommendedAction** – Text/summary.
- **AssignmentPanel** – Current assignee, reassign action.
- **StatusUpdateActions** – Buttons: Resolve, Snooze, Reopen.

Backend contract: one “alert detail” endpoint returning the above (or list item already contains enough for summary + order + root cause + action; then drawer can use list item by id and optionally refetch for fresh data).

### Lazy-loaded (separate API or same detail with nested “lazy” fields)

- **Timeline** – Activity timeline (comments, status changes, assignments). Fetch when “Timeline” tab/section is visible.
- **DependencyChain** – Related alerts or blocking items. Fetch when section is visible.
- **CommentsPanel** – Thread of comments. Fetch when “Comments” tab is selected; submit new comment via mutation.
- **HistoryLog** – Audit log (who changed what when). Fetch when section is visible.
- **RelatedAlerts** – Alerts for same order/style. Fetch when section is visible.
- **EscalationControls** – Escalate to role/user; fetch escalation options when section visible, submit via mutation.

Recommendation: **AlertSummary, LinkedOrderSummary, RootCause, RecommendedAction, AssignmentPanel, StatusUpdateActions** in initial detail payload (or from list cache). **Timeline, DependencyChain, CommentsPanel, HistoryLog, RelatedAlerts, EscalationControls** lazy-loaded (fetch on tab/section focus or when drawer opens with a “sections” param).

---

## 6. Route & Integration

### Route

- **Primary:** `/app/merchandising/alerts` → `MerchCriticalAlertsPage` (unchanged).
- **Sub-routes (optional):**
  - `/app/merchandising/alerts/settings` → same page with `AlertSettingsModal` open, or a dedicated tiny settings page. Prefer **modal from main page** to avoid extra route.
  - Deep link to drawer: e.g. `/app/merchandising/alerts?detail=<alertId>` so opening link opens drawer for that alert.

No mandatory sub-routes; keep single page + modals and query param for detail.

### API client (frontend perspective)

- **Extend** `getMerchCriticalAlerts` to accept full filter/sort/pagination params (see below). **Or** add a new method `getMerchAlerts(params)` and keep `getMerchCriticalAlerts` for backward compatibility / simple summary.
- **New endpoints to add on client:**
  - **Alert list (with filters):** `GET /api/v1/merch/alerts` (or keep `critical-alerts` and extend query). Params: `severity`, `type`, `buyer_id`, `assignee_id`, `status`, `date_from`, `date_to`, `sort`, `page`, `page_size`. Response: `{ items: MerchCriticalAlert[], summary: {...}, total: number }`.
  - **Alert detail:** `GET /api/v1/merch/alerts/:id` – full detail for drawer (summary, order, root cause, recommended action, assignee, status). Optional: lazy endpoints for timeline, comments, history, related, escalation.
  - **Alert mutations:** `PATCH /api/v1/merch/alerts/:id` (assign, snooze, resolve, status, comment). Or dedicated: `POST .../alerts/:id/assign`, `.../snooze`, `.../resolve`, `.../comments`.
  - **Saved views:** `GET /api/v1/merch/alert-views`, `POST .../alert-views`, `DELETE .../alert-views/:id`. Response shape: `{ id, name, description?, filters (JSON), is_default? }`.
  - **Alert settings (user):** `GET /api/v1/merch/alert-settings`, `PUT .../alert-settings` (e.g. default view, notification prefs).

### Required API calls (frontend list)

1. **Page load:**  
   - `getMerchCriticalAlerts(params)` or `getMerchAlerts(params)` with params from URL (filters, sort, pagination).  
   - Optional: `getMerchAlertViews()` for saved views dropdown.
2. **Open drawer:**  
   - `getMerchAlertDetail(id)` when `drawerAlertId` is set (or use list item + optional refetch).
3. **Lazy in drawer:**  
   - Timeline, comments, history, related alerts, escalation options – each on section focus if backend supports.
4. **Mutations:**  
   - Assign, Snooze, Resolve, Add comment – then invalidate list and detail queries.
5. **Saved views:**  
   - Load views on mount; save (POST) / delete (DELETE) from SaveViewModal and dropdown.
6. **Settings:**  
   - Load/save user alert settings when opening AlertSettingsModal.

---

## Summary

- **Component tree:** Page → Header, KPI band, Toolbar (filters, view switcher, saved views), Bulk toolbar, Table/Cards, Drawer, SaveView modal, Settings modal.
- **State:** URL for filters/pagination/sort; React state for selection, drawer, view mode; React Query for alerts, detail, saved views.
- **Widgets:** SeverityBadge, StatusBadge, AgingIndicator, SLACountdown, AssigneeAvatar, AlertTypeIcon with small, consistent props.
- **Table:** Sort (prefer server), multi-select, sticky first/last columns, inline Assign/Snooze/Resolve, optional row expand for root cause + action.
- **Drawer:** Core sections with detail payload; Timeline, Comments, History, Related, Escalation lazy-loaded.
- **Route:** Keep `/app/merchandising/alerts`; optional `?detail=id`; settings via modal. Extend or add list/detail/mutation/saved-views/settings API methods in `api/client.ts`.

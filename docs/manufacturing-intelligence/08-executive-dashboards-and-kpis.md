# 08 - Executive dashboards and KPIs

## 1. Control Tower panels

The existing Operations Control Tower (`/app/operations/control-tower`, flag `control_tower_enabled`) is the
single executive screen. Manufacturing Intelligence adds panels when `manufacturing_intelligence_v1` is ON.

| Panel | Contents | Drill-down | Phase |
|---|---|---|---|
| A Factory capacity | Practical capacity, firm load, soft load, firm available, utilization, legacy vs corrected | Line -> day | 1 |
| B Order book | Confirmed orders, ready / blocked / in production / at risk counts | Order readiness | 1 (counts), 2 (pipeline demand) |
| C Line loading | Line x day grid (up to 180 days), overloaded and idle days | Line plan row | 1 |
| D Material readiness | Orders with material blockers, shortage lines, STYLE_ESTIMATE flag | Order -> BOM line | 1 (read-only) |
| E Delivery risk | On track / at risk / late / unknown, delay days vs ex-factory | Order delivery prediction | 1 |
| F Financial readiness | Cost to complete, margin, cash coverage | Source vouchers | 3 |
| G Recommendations | Prioritised actions and outcomes | Evidence | 4 |

Filters (Phase 1): date range (max 180 days), factory unit, line. Later: buyer, style, order, Export LC /
contract, status, scenario. Financial and commercially sensitive figures are never shown in Phase 1.

## 2. KPI dictionary

Every KPI response carries `value`, `unit`, `as_of`, `formula_version`, `missing_inputs` and reason codes.

| # | KPI | Definition | Formula | Data source | Refresh | Owner | Missing data | Validation |
|---|---|---|---|---|---|---|---|---|
| 1 | Practical capacity | SMV minutes a line can earn on a day | `sum_h(M_h x O_h) x calendar_factor x E x L x C` | shifts, calendar, sewing lines, line plans | On request | Production | UNKNOWN | Hand-check one line-day against IE sheet |
| 2 | Available capacity (firm) | Practical minus firm load | `practical_smv - firm_smv` | KPI 1, line plans | On request | Production | UNKNOWN if 1 unknown | Sum over lines = factory total |
| 3 | Booked capacity | Load of all live bookings | `sum(remaining_qty x SMV)` spread per working day; split firm / soft / draft | `sewing_line_style_configs`, OB | On request | Planning | Row listed in `missing_inputs` if no SMV | Total spread = total booking minutes |
| 4 | Confirmed load | Firm load of confirmed orders | firm rows where order status in NEW, CONFIRMED, IN_PROGRESS | line plans, orders | On request | Planning | Excluded with reason | Cancelled / draft orders never counted |
| 5 | Production-ready load | Confirmed load whose order passes all mandatory gates | confirmed load where readiness = READY | readiness | On request | Planning | Not ready = excluded | Matches readiness list |
| 6 | Capacity utilization | Share of practical capacity firmly booked | `firm_smv / practical_smv` | 1, 3 | On request | Production | Null when practical 0 / UNKNOWN | 0-100 % normally; > 100 % = overload |
| 7 | Line efficiency | Earned minutes over attended minutes | `good_qty x SMV / (present_operators x shift_minutes)` | hourly entries, crew daily, OB | Daily (P2) | Production | UNKNOWN without SMV | Compare with production dashboard |
| 8 | Line idle hours | Working hours with capacity but no firm load | `practical > 0 and firm = 0` per day x shift hours | 1, 3 | On request | Planning | UNKNOWN if capacity unknown | Idle days listed per line |
| 9 | Machine utilization | Productive / available machine minutes | needs machine-line assignments | machines, downtime | P2 | Maintenance | UNKNOWN | - |
| 10 | Operator productivity | Earned SMV per attended operator hour | `earned_smv / operator_hours` | hourly, attendance | P2 | Production | UNKNOWN | - |
| 11 | Planned vs actual output | Actual good qty minus planned qty | `actual - planned` per line-day | hourly, plan | P2 | Production | Shows reconciliation status | - |
| 12 | Remaining quantity | Quantity still to sew | `max(0, planned_qty - completed_qty)` per plan row; order: `max(0, order_qty - produced)` | line plans, hourly entries | On request | Planning | Plan rows only | Never negative |
| 13 | Material readiness | Share of BOM lines with no shortage, plus blocking list | `ready_lines / total_lines`; blocking list | Order BOM, availability | On request | Merchandising | STYLE_ESTIMATE when no Order BOM | Same as readiness detail |
| 14 | Procurement lead time | Working days from PO approval to accepted GRN | `GRN accepted date - PO date` | PO, GRN | P2 | Procurement | Item / supplier fallback labelled | - |
| 15 | Schedule adherence | Milestones done on or before plan | `on_time_done / due` | TNA, revisions | P2 | Merchandising | - | - |
| 16 | On-time delivery probability | Chance ex-factory meets `delivery_date` | Phase 1: band ON_TRACK / AT_RISK / LATE; Phase 4: calibrated probability | delivery prediction | On request | Planning | UNKNOWN | Back-test vs actual challans (P4) |
| 17 | Cost per piece | Classified order cost / good pieces | posted + allocated (labelled) | vouchers, FIFO, payroll | P3 | Finance | Classification mandatory | Reconcile to ledger |
| 18 | Forecast cost to complete | Actual + remaining estimate | see doc 09 section 6 | cost facts | P3 | Finance | Interval | - |
| 19 | Projected order margin | Revenue minus forecast cost | base currency | PI / order, cost | P3 | Finance | Hidden without finance permission | - |
| 20 | Cash coverage | Confirmed funding / dated cash need | `confirmed_funding / cash_need` | bank, facility, PO, payroll | P3 | Finance | Proposed financing excluded | - |

## 3. Role-based access

| Data | Permission |
|---|---|
| Panels A-E | `production.planning.read` (new router dependency) |
| Readiness material detail | also needs inventory access when RBAC enforcement is on |
| Person-level HR detail | `hr.access` + existing sensitive HR keys (P2) |
| Financial panel F | new fail-closed `mfg_intelligence.finance.view` (P3) |
| Recommendation decision | `ai.agents.confirm` + source module key (P4) |

Hiding a panel in the UI is never the security control; the API enforces permissions.

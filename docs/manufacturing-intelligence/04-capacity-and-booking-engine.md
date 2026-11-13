# 04 - Capacity and booking engine

Capacity is never a fixed number. It is calculated per **line, shift and day** from the calendar, shifts,
people, machines and the style's SMV, and every result says which inputs it used and which were missing.

## 1. SMV source hierarchy

1. Approved operation bulletin (OB) for the order's style - `operation_bulletins.total_smv` is the **per-piece**
   garment SMV (sum of operation SMVs, `production/ie_router.py:108`).
2. SMV already stored on the line plan row (`sewing_line_style_configs.smv_per_piece`) when it is consistent.
3. (Phase 2) Governed `garment_styles.standard_smv` with source and confidence.
4. (Phase 4) Empirical style-family estimate from history.
5. Otherwise **UNKNOWN**. No silent 12-minute fallback.

## 2. Inputs (line l, shift h, day d)

| Symbol | Meaning | Source |
|---|---|---|
| `M_h` | Net shift minutes after breaks | `production_shifts` (start, end, break) via `calendar_service.net_shift_minutes` |
| `calendar_factor` | 0 on closed days, else 1 | `factory_calendar_overrides`, weekend days in `tenant_production_settings` |
| `O_h` | Eligible operators | Phase 1: `sewing_lines.default_operator_count`; Phase 2: dated assignments; same day: `line_crew_daily.actual_present` |
| `A_h` | Forward attendance factor | Phase 1: 1 (not applied); Phase 2+: 1 - historical absence rate |
| `E` | Target efficiency | Line plan `target_efficiency_pct`, else tenant default if configured, else UNKNOWN |
| `L` | Learning-curve factor | Phase 1: 1; Phase 2: configured ramp |
| `C` | Changeover factor | Phase 1: 1; Phase 2: `max(0, 1 - changeover_minutes / scheduled_line_minutes)` |
| `S` | SMV per piece | Hierarchy above |

## 3. Corrected formulas (verified by Claude Opus 4.8)

Operator minutes (future day):

`operator_minutes = sum_h (M_h x O_h x A_h) x calendar_factor`

Operator minutes (today or past, when attendance known):

`operator_minutes = sum_h (M_h x actually_present_h) x calendar_factor`

Shifts are **summed**, never averaged. An employee in two overlapping shifts is counted once. Phase 1 rules,
decided **per line-day** (never from the requested window, so the same day gives the same capacity in any window
and in delivery prediction):

- **Which shifts:** the shifts named (`shift_id`) by the live plan rows active that day. Only when no row names a
  shift that day (no row, or rows without a shift) are all active shifts used (`SHIFT_ASSUMED_ALL_ACTIVE`).
- **Operators per shift:** `sum_h (M_h x O_h)`. `O_h` is the `operator_count` of the plan row active that day on
  that shift (`OPERATORS_FROM_PLAN_ROW`), else the line default (`OPERATORS_FROM_LINE_DEFAULT`). Two named shifts are
  two separate operator pools.
- **Shared pool (fallback / rows without a shift):** one operator count; overlapping clock intervals (midnight
  crossing handled) are merged and counted once. A merged group works `union minutes - longest break in the group`
  (each break once). Reason `SHIFTS_OVERLAP_MERGED`. Example: 08:00-17:00 and 08:00-18:00 (60 min breaks each)
  give 540 minutes, not 480 + 540.
- A shift without usable times is skipped with `SHIFT_TIMES_MISSING`; if none is usable the day is UNKNOWN with
  missing input `shift_times`.

- Theoretical units: `operator_minutes / S` (perfect-efficiency ceiling, never labelled "available").
- Practical SMV minutes: `operator_minutes x E x L x C` (de-rated **once**).
- Practical units: `practical_smv_minutes / S`.
- Machine constraint (Phase 2, when machine profile is known):
  `machine_units = min over required operations ( available_machine_minutes[type] / operation_smv )`.
  Machines are never multiplied by operators.
- Skill constraint (Phase 2): `min over operation groups ( eligible_operator_minutes x skill_equivalence / operation_smv )`.
- Bottleneck capacity: `min(practical_units, machine_units, skill_units)`; missing machine map returns the
  operator result with reason `MACHINE_PROFILE_INCOMPLETE` and lower confidence.
- Empirical (Phase 4): `weighted_median(good_qty / scheduled_line_hours) x scheduled_hours`. Not de-rated again.
- Hybrid (Phase 4): `(1 - w) x bottleneck + w x empirical`; `w = 0` below 5 comparable days,
  `min(0.5, n/40)` for 5-19, up to 0.7 for 20+, capped at 0.3 on high dispersion, OB revision, new line or
  machine mismatch.

**UNKNOWN** is returned (never a number) when there is no shift, no SMV, no operator source, an invalid SMV,
or no efficiency. Closed days return 0 with reason `CLOSED_DAY`.

## 4. Load and availability

- Booking load: `booking_smv_minutes = remaining_qty x S`, where `remaining_qty = max(0, planned_qty - completed_qty)`.
- Spread over the working days between `start_date` and `planned_end_date` (inclusive), skipping closed days.
  If the window has no working day, the load goes on the first working day on or after `start_date` with
  reason `NO_WORKING_DAY_IN_WINDOW`.
- Demand classes by `reservation_status`:
  - **Firm**: FIRM_BOOKED, IN_PROGRESS.
  - **Soft (tentative)**: SOFT_BOOKED.
  - **Draft**: DRAFT (scenario only).
  - COMPLETED and CANCELLED consume nothing.
- Confirmed load = firm load whose order has legacy status NEW, CONFIRMED or IN_PROGRESS.
- `firm_available = practical_smv - firm_smv`. Soft load **never** reduces firm availability.
- `potential_available = practical_smv - firm_smv - soft_smv` (stress view).
- `utilization = firm_smv / practical_smv` (null when practical is 0 or UNKNOWN).
- Overloaded day: firm load > practical. Idle day: practical > 0 and firm load = 0.
- **Unresolved load:** a firm or soft row with unknown SMV adds no minutes but is counted on every day it would
  load (`unresolved_firm_rows`, `unresolved_soft_rows`; reasons `UNRESOLVED_FIRM_LOAD`, `UNRESOLVED_SOFT_LOAD`).
  A day with an unresolved firm row is never IDLE: status UNKNOWN (missing input `smv`), unless the known firm
  load already exceeds practical (OVERLOADED). Its `firm_available` and `utilization` are null, and it is left out
  of totals and the idle list.
- Rows that ended up to 60 days before the window are fetched too, because a row with no working day moves its
  load to the first working day after it, which can fall inside the window.
- Efficiency fallback uses the most recent non-DRAFT, non-cancelled row starting on or before the day.
- SMV from a row's own OB is "high" only when that OB is approved. Otherwise the style's latest approved OB is
  preferred; an unapproved row OB is still used with confidence "low" and `SMV_FROM_UNAPPROVED_OB`.
- Delivery prediction starts at the earliest live (not cancelled / completed) plan row of the order.

## 5. Legacy versus corrected display

Under `planning_math_v2`, the capacity API returns for each line `legacy_value` (the current advisory formula,
reproduced read-only), `corrected_value`, `difference`, `formula_version`, `reason_codes` and `missing_inputs`.
The UI shows "Legacy" and "Corrected preview" side by side. The owner decides when corrected becomes primary.

## 6. Booking categories (Phase 2)

| Category | Stored as | Consumes firm capacity? |
|---|---|---|
| Tentative inquiry booking | SOFT_BOOKED + inquiry id + confidence + expiry | No |
| Quotation reservation | SOFT_BOOKED + quotation id + confidence + expiry | No |
| Confirmed order, material-dependent | SOFT_BOOKED or FIRM_BOOKED (owner policy) | Only if FIRM |
| Production-ready booking | FIRM_BOOKED and all mandatory gates READY | Yes |
| Active production | IN_PROGRESS | Yes |
| Completed | COMPLETED | No |

Phase 2 adds nullable `inquiry_id`, `quotation_id`, `demand_class`, `confidence_pct`, `expires_at`,
`schedule_version`, `lock_version`, `source_smv_type` to `sewing_line_style_configs`; plan revisions
(`mfg_plan_revisions`, `mfg_plan_revision_items`) with before/after, reason, user, approval and impact; optimistic
locking (stale confirm returns 409); split and multi-line allocation; in-memory scenario simulation that only
commits through an authorised confirm call.

## 7. Worked example

Line L1, one shift 08:00-17:00 with 60-minute break (`M = 480`), 30 operators, efficiency 60 %, SMV 12.5.

- operator_minutes = 480 x 30 = 14,400
- practical SMV minutes = 14,400 x 0.60 = 8,640
- practical units = 8,640 / 12.5 = 691 pieces/day
- legacy advisory formula would give 30 machines x 30 operators x 480 = 432,000 "minutes" (30x too high)

Two shifts of 480 minutes each with 30 operators give 28,800 operator minutes (the legacy average would give 14,400).

# 05 — Canonical Analytics Model (Phase B)

Logical dimensions and facts mapped to **real P7 models**. No parallel warehouse.

## Dimensions

| Logical dim | P7 source | Notes |
|---|---|---|
| company | `tenants` | tenant_id = company |
| factory | `sewing_lines.factory_unit` (text) | Not a master; normalize in filters |
| department | HR dept masters / free text | Partial |
| buyer | customers / order.buyer | Tenant-scoped |
| supplier | vendors | Tenant-scoped |
| employee | `hr_employees` | Sensitive fields masked |
| product / style | `garment_styles` | SMV current value only |
| order | `orders` | Primary commercial spine |
| colour / size | order / style matrices | Where enabled |
| material | `items` | + BOM lines |
| machine | production machines / assignments | Partial |
| location | `warehouses` | |
| currency | `currencies` + tenant base | Effective FX rates |
| calendar | system dates + factory_calendar_overrides | |

## Facts

| Logical fact | P7 table / service | Grain | Mutable? | Event time |
|---|---|---|---|---|
| enquiry | `inquiries` | inquiry | Yes | created_at |
| opportunity | inquiry/quotation | same | Yes | |
| order | `orders` | order | Yes (status, dates) | updated_at |
| order commitment revision | **NEW** `order_commitment_revisions` | revision | Append-only | changed_at |
| order amendment (advisory) | `order_amendments` | amendment | Append | created_at |
| TNA milestone | `order_followups` / actions | action | Yes | due/completed |
| sample event | `merch_sample_*` | request/task | Yes | |
| costing | quotation materials / CM | line | Yes | |
| purchase order | `purchase_orders` | PO/line | Statused | |
| receipt | `goods_receiving` | GRN/line | Statused | accepted_at |
| inventory movement | `stock_movements` | movement | Append-ish | movement_date |
| material allocation | inventory reservation services | hold/peg | Statused | |
| capacity / line plan | `sewing_line_style_configs` | plan row | Yes + lock_version | |
| hourly sewing | `hourly_production_entries` | line-hour | Yes | entry date |
| cutting | `cut_tickets`, bundles, markers | ticket/bundle | Yes | |
| QC inspection | `production_qc_checks` | check | Yes | Free-text risk |
| defect | JSON on QC + defect codes | partial | | |
| shipment | `shipments` (trade) | shipment | Yes | |
| commercial doc | trade/commercial docs | doc | Yes | |
| LC / BTB | `master_contracts`, `btb_lcs` | LC | Overwritable (COM-02) | |
| invoice / voucher | `vouchers`, bills | voucher | Posted immutable | posting_date |
| payment / proceeds | party ledger / FX receipts | payment | | |
| attendance | `hr_attendance_*` | employee-day | | |
| payroll | `hr_payroll_*` | run/line | Frozen registers | |
| commission | `commission_*` | entry/shipment | | |

## Approved new tables (for later migrations)

| Table | Phase | Justification |
|---|---|---|
| `order_commitment_revisions` | C2 | Gaming-proof OTIF; delivery_date currently overwritten |
| KPI registry tables | C1 | Governed definitions/results |
| `kpi_predictions` | K | Store predictive snapshots |

**Not approved yet:** `factories` master, EPCIS event store, SMV effective-dated history (track as follow-up; use OB version + style current SMV with `missing_inputs: SMV_NOT_EFFECTIVE_DATED`).

## Time / money / UOM rules

- Store timestamps UTC; report in tenant timezone (default Asia/Dhaka).
- Money Decimal; convert with effective-dated FX to `tenants.base_currency`.
- UOM: prefer `item_units`; free-text uom labelled in `missing_inputs` when ambiguous.

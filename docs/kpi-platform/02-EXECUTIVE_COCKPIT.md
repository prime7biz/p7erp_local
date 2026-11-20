# 02 — Executive Cockpit (~20 measures)

Primary MD/CEO screen. Diagnostics stay behind drill-down. Cards respect tenant type F/A/B and report sensitivity.

| # | Code | Executive KPI | Why | Owner | Cadence | Drill path | P7 basis |
|---|---|---|---|---|---|---|---|
| 1 | MKT-04 | Order-book value | Pipeline | Sales | D | buyer → order | Orders open value |
| 2 | FINA-02 | Order-book contribution margin % | Quality of sales | CFO | W | order → cost elements | MI CAC / mgmt contrib |
| 3 | MER-08 | Order risk exposure | Early warning | Merch | D | risk reason → order | Merch tower / MI bands |
| 4 | COM-01 | OTIF | Customer service | Commercial | D | buyer → shipment | Needs C2; else LATEST_DATE_BASIS |
| 5 | MKT-08 | Buyer retention | Relationship | Commercial | M | buyer | Orders by period |
| 6 | INV-01 | Material readiness | Production risk | PPC | D | order → BOM line | MI readiness |
| 7 | PPC-02 | Capacity loading | Forward utilisation | PPC | D | factory_unit → line | MI capacity |
| 8 | SEW-01 | Sewing efficiency | Productivity | IE | D | line → style | empirical_efficiency |
| 9 | PPC-03 | Production plan attainment | Execution | Production | D | line → hour | Hourly vs plan |
| 10 | QA-01 | RFT | Quality | QA | D | line → defect | **BLOCKED** — card shows `NO_DATA` until QA-04 |
| 11 | QA-02 | DHU | Defect intensity | QA | D | operation → defect | **BLOCKED** — card shows `NO_DATA` until QA-04 |
| 12 | MKT-12 | Shipment claims % | Customer-quality loss | QA/Merch | M | claim → style | GAP until claims |
| 13 | INV-07 | Inventory days | Working capital | CFO | M | RM/WIP/FG | Ratios |
| 14 | FINA-08 | Cash conversion cycle | Cash efficiency | Treasury | M | DIO/DSO/DPO | Compose ratios |
| 15 | FINA-09 | Receivable overdue % | Cash risk | Credit | D | buyer ageing | Control tower |
| 16 | FINA-01 | Order / company gross margin % | Financial outcome | CFO | M | buyer → order | ratio_service |
| 17 | AGT-03 | Commission realisation % | Agent economics | Agent Finance | M | buyer ageing | Commission (A tenants) |
| 18 | HR-03 | Employee turnover | Workforce | HR | M | dept | Employees |
| 19 | ESG-11 | Lost-time incident frequency | Safety | HSE | M | dept | GAP until HSE facts |
| 20 | ESG-03 | GHG intensity | Sustainability | Sustainability | M | facility | GAP until energy facts |

## Display rules

- Show RAG vs target when a `kpi_target` exists; else show value + `NO_TARGET`.
- Show `NO_DATA` + `missing_inputs` when facts missing (never invent).
- Hide AGT-03 for pure manufacturer tenants; hide sewing/DHU for pure buying_house unless `both`.
- Confidential finance cards need Class 1 or fail-closed finance keys.
- Freshness: `source_event_time` / `kpi_computed_time` on every card.

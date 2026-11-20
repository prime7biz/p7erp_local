# 01 — Master KPI Catalogue (192)

**Status legend:** EXISTS = computed today · PARTIAL = related data/UI, formula incomplete · GAP = not computed · N_A = not applicable to tenant type  
**F/A/B:** Factory / Agent / Buying office · **Tier:** C core · A+ advanced · P predictive  
**Evidence:** code path or blocker noted in Notes.

Formulas match the apparel KPI blueprint (governed objects). Targets are never hard-coded industry benchmarks.

---

## Family 1 — Business development / marketing / buyer (12)

| Code | KPI | Formula (short) | F/A/B | Tier | Status | Evidence / notes |
|---|---|---|---|---|---|---|
| MKT-01 | Qualified lead conversion | converted / qualified ×100 | FAB | C | GAP | No CRM lead entity |
| MKT-02 | Enquiry-to-order conversion | orders from enquiries / valid enquiries ×100 | FAB | C | PARTIAL | Inquiry + Order exist |
| MKT-03 | Quotation win rate | accepted / closed quotations ×100 | FAB | C | PARTIAL | Quotation statuses |
| MKT-04 | Pipeline value | Σ expected order value | FAB | C | PARTIAL | Inquiry/quotation value |
| MKT-05 | Weighted pipeline | Σ value × probability | FAB | C | GAP | No stage probability |
| MKT-06 | Buyer concentration | largest buyer rev / total ×100 | FAB | A+ | PARTIAL | Invoice/order by buyer |
| MKT-07 | Top-5 buyer concentration | top5 / total ×100 | FAB | A+ | PARTIAL | Same |
| MKT-08 | Buyer retention | active both periods / prior ×100 | FAB | C | PARTIAL | Order by buyer-period |
| MKT-09 | Buyer churn | lost / prior ×100 | FAB | C | PARTIAL | Same |
| MKT-10 | Buyer revenue growth | (curr−prior)/prior ×100 | FAB | C | PARTIAL | Same |
| MKT-11 | New buyer revenue mix | new-buyer rev / total ×100 | FAB | A+ | PARTIAL | First-order date |
| MKT-12 | Customer claim rate | valid claims / shipped ×100 | FAB | C | GAP | Claims not first-class |

## Family 2 — Merchandising / order management (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| MER-01 | Order confirmation lead time | confirm − enquiry | FAB | C | PARTIAL | Timestamps on inquiry/order |
| MER-02 | PO entry accuracy | POs w/o correction / entered ×100 | FAB | C | GAP | No correction audit KPI |
| MER-03 | PO amendment frequency | amendments / confirmed POs | FAB | A+ | PARTIAL | `order_amendments` advisory |
| MER-04 | Buyer-caused change rate | buyer amendments / all ×100 | FAB | A+ | PARTIAL | Needs origin on amendment |
| MER-05 | Internal change rate | internal / all ×100 | FAB | C | PARTIAL | Same |
| MER-06 | T&A milestone adherence | on-time milestones / due ×100 | FAB | C | PARTIAL | Followups + alerts; not % KPI |
| MER-07 | Critical-path delay days | Σ max(actual−plan,0) | FAB | C | PARTIAL | Followup due dates |
| MER-08 | Order risk exposure | amber/red value / open value ×100 | FAB | P | PARTIAL | Merch tower / MI delivery bands |
| MER-09 | Order cancellation rate | cancelled value / confirmed ×100 | FAB | C | PARTIAL | Order status |
| MER-10 | Order quantity variance | (shipped−confirmed)/confirmed ×100 | FAB | A+ | PARTIAL | Order qty vs shipment |
| MER-11 | Merchandiser workload | styles-orders / FTE | FAB | A+ | GAP | No FTE assignment link |
| MER-12 | Revenue per merchandiser | shipped rev / FTE | FAB | A+ | GAP | Same |

## Family 3 — Sampling / PD / costing (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| SMP-01 | Sample on-time submission | submitted by due / due ×100 | FAB | C | PARTIAL | Merch samples |
| SMP-02 | Sample first-pass approval | first-pass / submitted ×100 | FAB | C | PARTIAL | Sample task statuses |
| SMP-03 | Sample approval cycle time | final approval − first request | FAB | C | PARTIAL | Sample events |
| SMP-04 | Sample iteration count | submissions to approval | FAB | A+ | PARTIAL | Task history |
| SMP-05 | Development hit rate | bulk styles / developed ×100 | FAB | A+ | PARTIAL | Style→order link |
| SMP-06 | Proto-to-production lead time | prod approval − proto | FAB | A+ | PARTIAL | Sample types |
| CST-01 | Costing turnaround | quote − costing request | FAB | C | PARTIAL | Quotation timestamps |
| CST-02 | Costing accuracy | 1 − \|actual−approved\|/approved | FAB | C | PARTIAL | Cost-at-completion vs quote |
| CST-03 | Cost variance % | (actual−standard)/standard ×100 | F | C | PARTIAL | MI cost; no formal std cost |
| CST-04 | CM variance | actual CM − quoted CM | FA | C | PARTIAL | Alerts CM overrun |
| CST-05 | Material cost ratio | material / sales ×100 | FAB | C | PARTIAL | Cost sheet + CAC |
| CST-06 | Quote margin leakage | quoted GP − realised GP | FAB | A+ | PARTIAL | Needs recognised revenue |

## Family 4 — Sourcing / procurement / supplier (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| PRC-01 | PO on-time placement | placed by required / required ×100 | FAB | C | PARTIAL | PO dates vs material need |
| PRC-02 | Supplier OTIF | on-time complete / due ×100 | FAB | C | PARTIAL | `supplier_lateness_service` on_time_rate |
| PRC-03 | Supplier lead-time variance | actual − contracted | FAB | C | PARTIAL | Same |
| PRC-04 | Purchase price variance | (actual−std)×qty | FAB | C | PARTIAL | PO vs item cost |
| PRC-05 | Supplier defect rate | rejected / inspected ×100 | FAB | C | PARTIAL | GRN QC |
| PRC-06 | Supplier claim recovery | recovered / approved ×100 | FAB | A+ | GAP | Claims incomplete |
| PRC-07 | Supplier capacity utilisation | allocated / declared ×100 | AB | P | GAP | No declared capacity |
| PRC-08 | Supplier capacity reliability | delivered / committed ×100 | AB | A+ | GAP | Same |
| PRC-09 | Approved supplier spend | approved / total ×100 | FAB | C | PARTIAL | Vendor flags |
| PRC-10 | Supplier concentration | largest / spend ×100 | FAB | A+ | PARTIAL | PO by vendor |
| PRC-11 | Sourcing conversion | factories with PO / quoted ×100 | AB | C | PARTIAL | Quotation→PO |
| PRC-12 | Vendor score | weighted OTIF+quality+cost+compliance | FAB | C | GAP | No scorecard engine |

## Family 5 — Raw materials / inventory / warehouse (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| INV-01 | Material readiness | ready qty / planned ×100 | F | C | EXISTS | MI readiness |
| INV-02 | Fabric readiness | fabric-ready orders / due ×100 | F | C | PARTIAL | BOM + stock |
| INV-03 | Trim readiness | trim-ready / due ×100 | F | C | PARTIAL | Same |
| INV-04 | Inventory accuracy | matched / counted ×100 | F | C | PARTIAL | Cycle count if used |
| INV-05 | Stock variance value | Σ\|phys−book\|×cost | F | C | PARTIAL | Adjustments |
| INV-06 | Inventory turnover | COGS / avg inventory | FAB | C | EXISTS | Ratio analysis |
| INV-07 | Inventory days | avg inv / COGS ×365 | FAB | C | EXISTS | Ratio / DIO |
| INV-08 | Dead-stock % | non-moving / inv ×100 | FAB | C | PARTIAL | Ageing possible |
| INV-09 | Excess inventory % | above max ×cost / inv ×100 | F | C | GAP | No max policy table |
| INV-10 | Stock-out rate | stock-outs / demands ×100 | F | C | PARTIAL | Shortage lines |
| INV-11 | Warehouse pick accuracy | correct picks / picks ×100 | F | C | GAP | No pick audit |
| INV-12 | Material traceability completeness | traceable / consumed ×100 | FAB | A+ | PARTIAL | Traceability flag |

## Family 6 — Planning / PPC / capacity (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| PPC-01 | Capacity utilisation | used / available SMV ×100 | F | C | EXISTS | MI capacity |
| PPC-02 | Capacity booking load | booked / future available ×100 | FAB | C | EXISTS | MI load |
| PPC-03 | Production plan attainment | good / planned ×100 | F | C | PARTIAL | Hourly vs plan |
| PPC-04 | Schedule adherence | on-schedule ops / scheduled ×100 | F | C | PARTIAL | TNA / plan |
| PPC-05 | Line loading adherence | starts in tolerance / planned ×100 | F | C | PARTIAL | Line plan |
| PPC-06 | Start-date slippage | actual start − planned | F | C | PARTIAL | Plan dates |
| PPC-07 | Required-vs-available gap | required − available | F | P | EXISTS | MI available capacity |
| PPC-08 | Order capacity risk | lacking capacity / total ×100 | FAB | P | PARTIAL | MI overload |
| PPC-09 | Line changeover loss | changeover / scheduled ×100 | F | A+ | PARTIAL | Flag `changeover_loss_pct` |
| PPC-10 | WIP days | WIP / daily throughput | F | C | PARTIAL | Stock + output |
| PPC-11 | Bottleneck load ratio | bottleneck req / avail ×100 | F | P | PARTIAL | MI bottleneck |
| PPC-12 | Forecast capacity accuracy | 1 − \|fcst−actual\|/actual | FAB | A+ | PARTIAL | Forward plan |

## Family 7 — Cutting (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| CUT-01 | Fabric utilisation | net pattern / spread ×100 | F | C | PARTIAL | Marker plans |
| CUT-02 | Marker efficiency | utilised / total marker ×100 | F | C | PARTIAL | MarkerPlan |
| CUT-03 | Cut plan attainment | cut good / planned ×100 | F | C | PARTIAL | CutTicket |
| CUT-04 | Cutting rejection | rejected / inspected ×100 | F | C | PARTIAL | QC + cut |
| CUT-05 | Cutting re-cut rate | re-cut / cut ×100 | F | C | PARTIAL | Needs reason codes |
| CUT-06 | End-bit waste % | end-bit / issued ×100 | F | A+ | PARTIAL | Wastage module |
| CUT-07 | Spreading loss % | spreading waste / issued ×100 | F | A+ | PARTIAL | Same |
| CUT-08 | Cut-piece accuracy | conforming / inspected ×100 | F | C | PARTIAL | QC |
| CUT-09 | Cut-to-sew handover time | sew issue − cut complete | F | A+ | PARTIAL | Bundle events |
| CUT-10 | Bundle traceability | identified / produced ×100 | F | C | PARTIAL | CuttingBundle |
| CUT-11 | Fabric relaxation compliance | compliant lots / required ×100 | F | A+ | GAP | Spec not enforced |
| CUT-12 | Cutting throughput | good pieces / labour-hour | F | A+ | PARTIAL | Cut + attendance |

## Family 8 — Sewing / IE (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| SEW-01 | Sewing efficiency | earned SAM / attended ×100 | F | C | EXISTS | empirical_efficiency |
| SEW-02 | Operator efficiency | op earned / attended ×100 | F | C | PARTIAL | Needs operator grain |
| SEW-03 | Labour productivity | good pieces / DLH | F | C | PARTIAL | Hourly + attendance |
| SEW-04 | Earned minutes | Σ good × SAM | F | C | EXISTS | Same |
| SEW-05 | Line balance efficiency | work content / (stations×bottleneck) | F | A+ | PARTIAL | OB |
| SEW-06 | Balance loss | 100 − balance efficiency | F | A+ | PARTIAL | Same |
| SEW-07 | Pitch variance | actual cycle − pitch | F | P | GAP | No RT cycle capture |
| SEW-08 | Hourly target attainment | hourly good / target ×100 | F | C | PARTIAL | Hourly entries |
| SEW-09 | WIP imbalance index | (max−min WIP)/avg | F | P | GAP | Station WIP |
| SEW-10 | Skill coverage | qualified / required ×100 | F | A+ | PARTIAL | Manpower / skills |
| SEW-11 | Learning-curve attainment | actual eff / planned day-N | F | P | PARTIAL | Style start + eff |
| SEW-12 | Lost-minute ratio | lost / attended ×100 | F | C | PARTIAL | Needs loss codes |

## Family 9 — Finishing / wet process / print / emb (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| FIN-01 | Finishing plan attainment | finished / planned ×100 | F | C | PARTIAL | Process orders |
| FIN-02 | Finishing RFT | first-pass / inspected ×100 | F | C | PARTIAL | QC (QA-04) |
| FIN-03 | Packing accuracy | correct cartons / inspected ×100 | F | C | PARTIAL | Packing lists |
| FIN-04 | Carton shortage rate | shortage / required ×100 | F | C | PARTIAL | Packing |
| FIN-05 | Washing recipe adherence | in-spec batches / batches ×100 | F | C | GAP | Recipe params |
| FIN-06 | Wash reprocess rate | reprocessed / processed ×100 | F | C | PARTIAL | Process orders |
| FIN-07 | Shade pass rate | first-pass shade / lots ×100 | F | C | GAP | Lab module thin |
| FIN-08 | Printing RFT | first-pass print / inspected ×100 | F | C | PARTIAL | Process + QC |
| FIN-09 | Print reject rate | rejected / processed ×100 | F | C | PARTIAL | Same |
| FIN-10 | Embroidery RFT | first-pass / inspected ×100 | F | C | PARTIAL | Same |
| FIN-11 | Decoration cycle time | complete − receipt | FAB | A+ | PARTIAL | Process order dates |
| FIN-12 | Subcontract process OTIF | on-time complete / due ×100 | FAB | C | PARTIAL | External process |

## Family 10 — Quality assurance (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| QA-01 | RFT | first-pass good / inspected ×100 | FAB | C | PARTIAL | QC exist; formula GAP; QA-04 |
| QA-02 | DHU | defects / inspected ×100 | FAB | C | PARTIAL | fail_qty/JSON; no DHU KPI |
| QA-03 | Defective-unit rate | defective / inspected ×100 | FAB | C | PARTIAL | Same |
| QA-04 | Repair rate | repaired / inspected ×100 | F | C | GAP | Repair qty weak |
| QA-05 | Reject rate | rejected / produced ×100 | F | C | PARTIAL | hourly reject_qty |
| QA-06 | End-line pass rate | passed / end-line inspected ×100 | F | C | PARTIAL | check_type free text |
| QA-07 | Final inspection pass rate | first-pass finals / finals ×100 | FAB | C | PARTIAL | Same |
| QA-08 | Audit failure rate | failed audits / audits ×100 | AB | C | GAP | Audit entity thin |
| QA-09 | Claim incidence | claims / shipments ×100 | FAB | C | GAP | Claims |
| QA-10 | Cost of poor quality | scrap+repair+reinspect+claims+freight | FAB | A+ | GAP | Cost aggregation |
| QA-11 | Defect recurrence | repeated / detected ×100 | FAB | A+ | PARTIAL | CAPA flag |
| QA-12 | CAPA closure on time | closed by due / due ×100 | FAB | C | PARTIAL | CAPA blocks challan flag |

## Family 11 — Maintenance / utilities / IT (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| MNT-01 | OEE | A×P×Q | F | A+ | GAP | No downtime MES |
| MNT-02 | Availability | runtime / planned ×100 | F | C | GAP | Same |
| MNT-03 | MTBF | operating / failures | F | A+ | GAP | Facility thin |
| MNT-04 | MTTR | repair time / incidents | F | A+ | GAP | Same |
| MNT-05 | Breakdown rate | breakdown / planned ×100 | F | C | GAP | Same |
| MNT-06 | PM compliance | PM on time / due ×100 | F | C | PARTIAL | Facility module |
| MNT-07 | Maintenance cost/unit | maint cost / good units | F | A+ | PARTIAL | GL + output |
| MNT-08 | Energy intensity | kWh / production denom | F | C | GAP | No energy facts |
| MNT-09 | Utility downtime | interruption / scheduled ×100 | F | C | GAP | Same |
| MNT-10 | ERP availability | up minutes / scheduled ×100 | FAB | C | GAP | Ops metrics OPS-02 |
| MNT-11 | Critical incident MTTR | resolve / critical | FAB | C | GAP | Same |
| MNT-12 | Data-sync latency | analytics − source event | FAB | A+ | PARTIAL | Freshness fields planned |

## Family 12 — Commercial / import-export / logistics (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| COM-01 | Shipment OTIF | complete+on-time / due ×100 | FAB | C | PARTIAL | Needs C2 commitment history |
| COM-02 | On-time ex-factory | ex-factory on/before plan / due ×100 | FAB | C | PARTIAL | Shipment + delivery_date |
| COM-03 | Booking lead-time compliance | timely bookings / required ×100 | FAB | C | GAP | Booking entity thin |
| COM-04 | Documentation first-pass accuracy | accepted w/o correction / sets ×100 | FAB | C | PARTIAL | Trade docs |
| COM-05 | Document cycle time | docs complete − shipment | FAB | C | PARTIAL | Timestamps |
| COM-06 | LC discrepancy rate | discrepant / presentations ×100 | FAB | C | PARTIAL | Commercial LC |
| COM-07 | Export proceeds ageing | realisation − due basis | FAB | C | PARTIAL | Finance FX receipts |
| COM-08 | Freight cost per unit | freight / shipped units | FAB | C | PARTIAL | Logistics costs |
| COM-09 | Air-freight dependency | air value / shipped ×100 | FAB | C | PARTIAL | Mode on shipment |
| COM-10 | Delay premium freight | premium freight / sales ×100 | FAB | A+ | PARTIAL | Same |
| COM-11 | Customs clearance lead time | release − declaration | F | C | PARTIAL | Trade milestones |
| COM-12 | Bond entitlement utilisation | consumption / entitlement ×100 | F | C | PARTIAL | BD bond registers |

## Family 13 — Finance / accounting / treasury (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| FINA-01 | Gross margin % | (rev−COGS)/rev ×100 | FAB | C | EXISTS | ratio_service |
| FINA-02 | Contribution margin % | (rev−variable)/rev ×100 | FAB | C | PARTIAL | Mgmt performance / CAC |
| FINA-03 | EBITDA margin | EBITDA / rev ×100 | FAB | C | PARTIAL | P&L build |
| FINA-04 | Order profitability | order rev − attributable cost | FAB | C | EXISTS | MI CAC / GL profit |
| FINA-05 | Budget variance | actual − budget | FAB | C | EXISTS | Budget vs actual |
| FINA-06 | DSO | AR / credit sales × days | FAB | C | EXISTS | Receivable days |
| FINA-07 | DPO | AP / purchases × days | FAB | C | PARTIAL | Payables ageing |
| FINA-08 | Cash conversion cycle | DIO+DSO−DPO | FAB | C | PARTIAL | Compose ratios |
| FINA-09 | Overdue AR % | overdue AR / total AR ×100 | FAB | C | EXISTS | Control tower |
| FINA-10 | Cash forecast accuracy | 1 − \|fcst−actual\|/floor | FAB | A+ | PARTIAL | MI cash |
| FINA-11 | FX exposure | unmatched FC flows | FAB | A+ | PARTIAL | FX receipts |
| FINA-12 | Inventory NRV exposure | above NRV / carrying ×100 | FAB | A+ | PARTIAL | IAS 2 path thin |

## Family 14 — HR / payroll / admin / social (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| HR-01 | Attendance rate | attended / scheduled ×100 | FAB | C | PARTIAL | Attendance entries |
| HR-02 | Absenteeism | absent / scheduled ×100 | FAB | C | PARTIAL | Same |
| HR-03 | Employee turnover | separations / avg HC ×100 | FAB | C | PARTIAL | Employee status |
| HR-04 | New-hire attrition | early leavers / new hires ×100 | FAB | A+ | PARTIAL | Join dates |
| HR-05 | Overtime ratio | OT / regular ×100 | F | C | PARTIAL | OT entries + BD rules |
| HR-06 | Payroll accuracy | corrects-free payslips / issued ×100 | FAB | C | PARTIAL | Payroll runs |
| HR-07 | Wage-compliance rate | ≥ statutory / covered ×100 | FAB | C | PARTIAL | BD wage grades |
| HR-08 | Leave compliance | compliant cases / applicable ×100 | FAB | C | PARTIAL | Leave module |
| HR-09 | Training completion | completed / required ×100 | FAB | C | PARTIAL | Onboarding tasks |
| HR-10 | Supervisor span | reports / supervisor | FAB | A+ | PARTIAL | Organogram |
| HR-11 | Grievance closure time | avg closure days | FAB | C | PARTIAL | Discipline / cases |
| HR-12 | Statutory licence validity | valid / required ×100 | FAB | C | GAP | Licence register |

## Family 15 — Sustainability / EHS (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| ESG-01 | Scope 1 emissions | Σ activity × factor | FAB | C | GAP | No energy facts |
| ESG-02 | Scope 2 emissions | purchased energy × factor | FAB | C | GAP | Same |
| ESG-03 | GHG intensity | S1+S2 / production denom | F | C | GAP | Same |
| ESG-04 | Renewable electricity % | renewable / total ×100 | F | C | GAP | Same |
| ESG-05 | Water intensity | m³ / denom | F | C | GAP | Same |
| ESG-06 | Recycled water % | reused / total ×100 | F | A+ | GAP | Same |
| ESG-07 | Waste intensity | kg / denom | F | C | GAP | Same |
| ESG-08 | Waste diversion | recovered / total ×100 | F | A+ | GAP | Same |
| ESG-09 | ZDHC-conformant chemical share | conformant / total ×100 | F | A+ | GAP | Chemicals |
| ESG-10 | Wastewater conformance | meeting tests / required ×100 | F | C | GAP | ETP |
| ESG-11 | Lost-time incident frequency | LTI × factor / hours | FAB | C | GAP | HSE |
| ESG-12 | Near-miss closure | closed on time / due ×100 | FAB | C | GAP | HSE |

## Family 16 — Sourcing-agent / buying-office (12)

| Code | KPI | Formula | F/A/B | Tier | Status | Notes |
|---|---|---|---|---|---|---|
| AGT-01 | Commission earned | Σ eligible × rate | A | C | PARTIAL | Commission engine |
| AGT-02 | Commission billed | Σ invoices | A | C | PARTIAL | Commission entries |
| AGT-03 | Commission realisation % | cash received / due ×100 | A | C | PARTIAL | Needs payment link |
| AGT-04 | Commission DSO | avg AR / commission rev × days | A | C | PARTIAL | Same |
| AGT-05 | Sourcing conversion | confirmed / opportunities ×100 | AB | C | PARTIAL | Inquiry→order |
| AGT-06 | Quote competitiveness | accepted supplier quotes / submitted ×100 | AB | C | PARTIAL | Quotations |
| AGT-07 | Supplier match success | shipped sourced / awarded ×100 | AB | A+ | PARTIAL | Style→shipment |
| AGT-08 | Supplier OTIF portfolio | weighted supplier OTIF | AB | C | PARTIAL | Supplier lateness |
| AGT-09 | Supplier quality portfolio | weighted inspection success | AB | C | PARTIAL | GRN QC / finals |
| AGT-10 | Buyer retention (agent) | retained / prior ×100 | AB | C | PARTIAL | Same as MKT-08 |
| AGT-11 | Claim exposure | open claims / shipped ×100 | AB | C | GAP | Claims |
| AGT-12 | Buying-office milestone compliance | on-time buyer milestones / due ×100 | B | C | PARTIAL | TNA |

---

## Summary counts

| Status | Count (approx) |
|---|---|
| EXISTS | ~25 |
| PARTIAL | ~110 |
| GAP | ~55 |
| N_A | 0 (codes apply by F/A/B filter at runtime) |

**Total rows:** 192 (16 × 12).

# Bangladesh RMG HR — official source manifest (catalog `BD-RMG-2026.1`)

This file is the **hard gate** for every Bangladesh HR feature in Prime7. Code reads the same values
from `backend/app/modules/hr_localization/bd_rmg_catalog.py`; the test
`backend/tests/test_hr_bd_source_manifest.py` checks that the code matches this manifest.

Rules:
- A value is used only when its source below is marked **PASS**.
- A new Gazette / Act amendment becomes a **new catalog version**. An effective version is never rewritten.
- Items marked **PENDING** may only be used as editable configuration or read-only previews, never as
  "statutory enforcement".
- This review was performed by software agents against official government publications. It is not legal
  advice. Before go-live, the factory's compliance officer or labour-law counsel should countersign the
  **Human sign-off** section at the end.

## 1. Garments minimum wage Gazette (PASS)

| Field | Value |
|---|---|
| Publication | Bangladesh Gazette, Extraordinary, Wednesday 20 December 2023, pages 28201–28211 |
| Notification | No. 40.00.0000.016.32.021.13.30, dated 18 December 2023 (Ministry of Labour and Employment, Minimum Wage Board branch) |
| Legal basis | Declared under Labour Act 2006 s.140(1) on the Minimum Wage Board's recommendation for the sector under s.139 |
| Effective | 1 December 2023 (১৬ অগ্রহায়ণ ১৪৩০; final condition, printed "০২", the 18th condition, page 28211) |
| Official URL | https://www.dpp.gov.bd/upload_file/gazettes/51593_44441.pdf |
| Retrieved | 2026-11-07 |
| PDF SHA-256 | `5CE08DA8E846D3EABD1D93318D91B47BA05DFC51A1A3CBDAF9990957C77012FD` (176,936 bytes, 11 pages) |

Fixed allowances in every row: medical **750**, transport **450**, food **1,250**; house rent = **50% of basic**.

### Schedule Ka — workers (pages 28201–28205)

| Code | Grade | Basic | House rent | Gross | Page |
|---|---|---:|---:|---:|---|
| W-G1 | 1 | 8,390 | 4,195 | 15,035 | 28201–28202 |
| W-G2 | 2 | 7,882 | 3,941 | 14,273 | 28202–28203 |
| W-G3 | 3 | 7,400 | 3,700 | 13,550 | 28203–28204 |
| W-G4 | 4 | 6,700 | 3,350 | 12,500 | 28204–28205 |
| W-APP | Apprentice worker (3 months, extendable by 3) | 4,950 | 2,475 | 9,875 | 28205 |

### Schedule Kha — employees (pages 28206–28208)

| Code | Grade | Basic | House rent | Gross | Page |
|---|---|---:|---:|---:|---|
| E-G1 | 1 | 10,900 | 5,450 | 18,800 | 28206 |
| E-G2 | 2 | 9,000 | 4,500 | 15,950 | 28206 |
| E-G3 | 3 | 8,500 | 4,250 | 15,200 | 28207 |
| E-G4 | 4 | 6,900 | 3,450 | 12,800 | 28207–28208 |
| E-APP | Apprentice employee (6 months) | 5,000 | 2,500 | 9,950 | 28208 |

Designations for every grade are transcribed in full (English rendering of the Bangla text) in
`bd_rmg_catalog.py` → `WAGE_RATES[*].designations`.

### Conditions used by Prime7 (pages 28209–28211)
- Condition 3 / 14: after one year, annual increment of **5% of basic**, compounding (worked example page 28211: 6,700 → 7,035 → 7,386.75).
- Condition 4: former Grade 6 merged into new Grade 3.
- Condition 7: employers must place staff in the correct grade in the wage register and issue wage slips.
- Condition 8: schedule amounts are monthly minimum wages; existing higher wages may not be reduced.
- Condition 12: piece-rate workers must not earn below the grade minimum.
- Condition 17: anything conflicting with the Labour Act 2006 / Labour Rules 2015 is void.

## 2. Bangladesh Labour Act 2006 as amended by Act 43 of 2026 (PASS)

Source: official consolidated text, https://bdlaws.minlaw.gov.bd/act-952.html, retrieved 2026-11-07.
Amending Act: Bangladesh Labour (Amendment) Act 2026, Act 43 of 2026, 10 April 2026
(https://bdlaws.minlaw.gov.bd/act-1672.html), which repealed the 2025 Ordinance 65.

| Rule | Value | Section (official URL) |
|---|---|---|
| Casual leave | 10 days/calendar year, full wages, no accumulation | s.115 (section-29442) |
| Sick leave | 14 days/calendar year, full wages, physician certificate, no carry-forward | s.116 (section-29443) |
| Earned leave (adult factory) | 1 day per 18 days worked after 1 year; stops accruing at 40 days; maternity up to 120 days counts as continuous service | s.117 (section-29444) |
| Festival holidays | **13** paid days/calendar year; work on one = 1 alternative day + 2 days' compensatory wages | s.118 (section-29445) |
| Maternity | **60 + 60 = 120** days; ≥6 months' service before delivery; not payable with ≥2 surviving children (other leave still allowed) | s.45–47 (section-26451, 26452, act-1672/section-58566) |
| Maternity pay | Daily average = last monthly gross wage ÷ **26** | s.48 (section-26454) |
| Overtime | 2× basic + dearness / ad-hoc wage; not for piece-rate workers | s.108 (section-29435) |
| Hours | 8/day; 48/week; up to 60/week with OT, annual average ≤56 | s.100, s.102 |
| Gratuity | 30 days' last wage per completed year (or >6 months); **45 days** for service over 10 years | s.2(10) (section-29070) |
| Resignation notice | Permanent 60 days; temporary 30 (monthly) / 14 days; or wages in lieu | s.27(1)–(3) (section-29914) |
| Resignation benefit | Per completed year: ≤3 yrs 7 days; >3 and <10 yrs 15 days; ≥10 yrs 30 days — or gratuity, whichever higher | s.27(4) as replaced by Act 43/2026 s.13 |
| Unauthorized absence | Absent >10 days without notice/permission → 10-day explain-and-rejoin notice → if no written explanation or no rejoining, a further 7 days to defend → if still neither, deemed resigned from the first day of absence | s.27(3A) |
| Termination by employer | Permanent: 120 days (monthly) / 60 days notice or wages in lieu; 30 days per year or gratuity, whichever higher | s.26 (section-29913) |
| Retrenchment | 1 month notice; 30 days per year or gratuity, whichever higher | s.20 (section-30090) |
| Dismissal (misconduct) | Removal under s.23(2)(a): 15 days per year if ≥1 year service; none for s.23(4)(b) theft/fraud or (g) riot | s.23 (section-30093) |
| Death in service | >1 year service: 30 days per year (45 if death at work / work accident) or gratuity, whichever higher | s.19 as amended 2026 (section-30089) |
| Retirement | Age 60; dues per s.26(4) or approved service rules | s.28 (section-29915) |
| Final dues | Within 30 working days of separation | s.30 (section-29917), s.123(2) |
| Wage payment | Within 7 working days after the wage period; wage period ≤1 month | s.122, s.123(1) |

## 3. Personal Data Protection Act 2026 (PASS for design constraints)

Source: Act 63 of 2026, 10 April 2026, https://bdlaws.minlaw.gov.bd/act-1692.html, retrieved 2026-11-07.

- s.2(14), s.2(21): **fingerprints and face images are biometric, sensitive personal data**; NID and mobile numbers are personal data (s.2(17)).
- s.2(20), s.5(2): consent must be informed, explicit, specific, voluntary and withdrawable; the person is told the purpose, retention period, transfers and how to withdraw.
- s.5(3)(ঙ), s.7(গ): processing needed for employment / labour-law obligations is a lawful basis, subject to necessity and proportionality.
- s.5(4): the employer must be able to prove consent.
- s.13: consent may be withdrawn at any time; data must then be erased unless retention is legally required.

Prime7 design consequences: biometric templates stay on the attendance terminal; Prime7 stores only an
enrollment reference plus a consent record (notice version, lawful basis, purpose, retention, transfer
disclosure, captured/withdrawn); employee photos (biometric) require the same consent record; identity
numbers are masked except for authorized HR roles.

## 4. PENDING (not yet verified against an official PDF)

| Item | Current use in Prime7 |
|---|---|
| Labour Rules 2015 (as amended) Rule 111(5) festival allowance (two per year after 1 year; each ≤ monthly basic) — text seen only on a secondary site | Festival bonus is **company configuration**; flag `hr_festival_bonus_enabled` default OFF; no "statutory" label |
| Labour Rules Forms 6/6A, 8, 9, 19, 34, 38 exact column layouts | Prime7 registers are labelled "Prime7 layout — verify against official Form"; not presented as the official form |
| Revenue-stamp signature requirement by payment method (Rule 111(1) proviso) | Acknowledgement records the evidence type; cash payments default to requiring signature evidence |

## 5. Agent review record

| Reviewer | Date | Scope | Result |
|---|---|---|---|
| Implementing agent (transcription) | 2026-11-07 | All rows/rules above, from rendered Gazette pages and official bdlaws pages | Transcribed |
| Independent reviewer agent | 2026-11-07 | Section 1 compared against all 11 rendered Gazette pages | PASS (section 6) |

## 6. Independent review result

**Verdict: PASS** (independent reviewer agent, 2026-11-07; read all 11 Gazette pages, 28201–28211).

- Header: Extraordinary issue of Wednesday 20 December 2023, notification 40.00.0000.016.32.021.13.30 dated 18 December 2023,
  Ministry of Labour and Employment (Wage Board branch), pages 28201–28211 — all match.
- Every wage row (W-G1…W-G4, W-APP, E-G1…E-G4, E-APP): basic, house rent (50% of basic), medical 750, transport 450,
  food 1,250 and the printed total match; the five components add up to the printed total in every row.
- Apprentices: worker 3 months, extendable by 3 (page 28205); employee 6 months, no extension (page 28208) — match.
- Designation lists: order, count and meaning checked item by item against the Bangla text — match.
- Conditions 3, 4, 7, 8, 12, 14, 17 and the worked increment example (6,700 → 7,035 → 7,386.75, cumulative 5%, piece-rate
  workers included) — match. Effective date ১৬ অগ্রহায়ণ ১৪৩০ = 1 December 2023 — match.
- Corrections applied after review (wording only, no numbers changed): the effective-date condition label (printed "০২",
  the 18th and last condition, not "21"); the legal-basis wording (s.140(1) declaration on the Wage Board's s.139
  recommendation); "Thread Cutting Assistant" renamed "Thread Trimming Assistant" (সুতা ঝাড়া সহকারী) in worker grade 4.
- Not verifiable from the page images (out of scope): the PDF SHA-256 and URL. Conditions 5, 6 and 10 are not summarised
  here (grade retention for employees, minimum pay for removed supervisory titles, contractor-supplied workers).

A human compliance sign-off (section 7) is still required before any enforcement flag is switched on in production.

## 7. Human sign-off (required before production enforcement)

| Name | Role | Date | Result (PASS / BLOCK) |
|---|---|---|---|
| | Compliance officer / labour counsel | | |

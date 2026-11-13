# Keyword strategy and page mapping (2026-11-13)

## Data sources and limits

- **No search-volume or ranking data was available** (no Google Search Console, Keyword Planner,
  Ahrefs or Semrush access in this session). Volumes below are not given; priorities are
  judgments based on intent and business value. Replace them with Search Console data after 4–8 weeks.
- **Verified (qualitative):** web searches on 2026-11-13 for "garments ERP software Bangladesh" and
  "back to back LC management software garments buying house ERP". Ranking pages are competitor
  keyword landing pages (Mysoft Heaven, MultiTech, Invento, PrismERP, Infocrat, Vastra ERP, Newgen,
  eGarment), comparison lists ("Top 10 Garments ERP Software in Bangladesh") and buyer guides
  ("How to Choose Garments ERP Software in Bangladesh"). Competitors win with one focused page per
  module or intent plus guides.

## Rules

1. One primary keyword per page; related phrases appear naturally, never repeated as lists.
2. The homepage targets the brand and the broad head term; module pages own module terms; articles
   own "how to / what is" questions.
3. No superlatives we cannot prove ("best", "only", "No. 1"). "Best garments ERP software in Bangladesh"
   is answered by a buyer's checklist, not by claiming to be the best.

## Page mapping

| Page | Primary keyword | Secondary / related | Intent |
|------|-----------------|---------------------|--------|
| `/` | garments ERP software | AI-powered garment ERP, Prime7 ERP | Brand + broad commercial |
| `/erp-bangladesh` | Garments ERP Software Bangladesh | RMG ERP software Bangladesh, garment ERP Dhaka | Commercial, local |
| `/garments-erp` | Garment Manufacturing ERP Software | ERP software for garments industry, apparel manufacturing ERP, garment factory management software | Commercial |
| `/buying-house-erp` | Buying House ERP Software | garment sourcing office software | Commercial |
| `/garment-merchandising-software` | Garment Merchandising Software | garment order management software, TNA software | Commercial |
| `/garment-production-management-software` | Garments Production Management Software | line balancing, hourly production tracking | Commercial |
| `/garment-inventory-management-software` | Garments Inventory Management Software | garment warehouse software, fabric stock software | Commercial |
| `/back-to-back-lc-management-software` | Back-to-Back LC Management Software | Garments Commercial Management Software, export LC software | Commercial |
| `/garment-costing-software` | Garment Costing and Consumption Software | garment cost sheet software | Commercial |
| `/garment-accounting-software` | garment accounting software | ERP accounts for garment factories, Tally alternative | Commercial |
| `/ai-garment-erp` | AI-Powered Garment ERP Software | AI in garment manufacturing | Commercial / research |
| `/features` | garment ERP features | garment ERP modules | Research |
| `/erp-comparison` | garment ERP vs generic ERP | ERP vs spreadsheets | Research / comparison |
| `/resources/how-to-choose-garments-erp-software-bangladesh` | how to choose garments ERP software | best garments ERP software in Bangladesh, garment ERP checklist | Informational (buyer guide) |
| `/resources/lc-management-guide-garment-export` | back-to-back LC management (guide) | master LC, UD, export LC documents | Informational |
| `/resources/accurate-garment-costing-bangladesh` | garment costing and consumption calculation | CM calculation, fabric consumption per dozen | Informational |
| `/resources/consumption-control-garments` | garment consumption control | BOM vs actual | Informational |
| `/resources/what-is-erp-garment-manufacturing` | what is garment ERP | | Informational |
| `/resources/excel-vs-erp-rmg-production-planning` | Excel vs ERP production planning | ERP vs spreadsheet, garment line planning | Informational / comparison |
| `/resources/choosing-erp-buying-house` | how to choose buying house ERP | buying office ERP | Informational (buyer guide) |
| `/resources/buying-house-tna-workflow` | buying house T&A workflow | time and action calendar buying house | Informational |
| `/resources/tna-calendar-guide-for-merchandisers` | TNA calendar for merchandisers | TNA template garments | Informational |
| `/resources/po-sample-shipment-tracking` | sample shipment tracking buying house | PO tracking | Informational |
| `/resources/avoid-lc-deadline-misses` | LC expiry / document discrepancy | latest shipment date | Informational |
| `/resources/multi-currency-erp-exporters` | multi-currency accounting for exporters | exchange gain loss BDT USD | Informational |
| `/resources/stock-valuation-tally-style` | stock valuation methods (FIFO vs weighted average) | Tally style accounting | Informational |
| `/resources/stock-valuation-accounting-integration` | inventory accounting entries | stock ledger vs general ledger, GRN not invoiced | Informational |
| `/resources/wip-costing-rmg` | WIP costing garments | work in progress valuation | Informational |
| `/resources/consumption-control-approvals-in-garments` | excess material approval | over-issue approval | Informational |
| `/resources/digital-transformation-fashion-supply-chain` | digital transformation garment industry | ERP implementation sequence | Informational |

The two stock articles target different intents (methods vs ledger entries) and link to each other; the two T&A
articles target buying houses vs factory merchandisers.

**Not mapped yet – Textile Manufacturing ERP.** Prime7 has optional knitting, dyeing, printing, AOP,
embroidery and washing units, but no evidence of spinning or full textile-mill workflows. A textile
page should wait until the product owner confirms the scope (see `SEO-ROADMAP.md`).

## Cannibalization checks

- "Garments ERP Software Bangladesh" appears as the H1/title only on `/erp-bangladesh`; the homepage
  title says "AI-Powered Garments ERP Software" without "Bangladesh".
- `/garments-erp` targets "manufacturing / factory" wording; `/erp-bangladesh` targets the country.
- Product pages ("…software") and guides ("guide", "how to") target different intents for the same topic
  (for example BTB LC page vs LC guide) and link to each other.
- Unit test `src/config/solutionPages.test.ts` fails if two indexable pages share a title or description.

## Internal linking model

- Footer "Modules" → each module page. Landing module cards → module pages.
- `/features` sections → module pages. `/garments-erp` → "Explore Each Garment ERP Module" grid.
- Each module page → 4 related pages (other modules, guides, Bangladesh page) and Book a demo.
- Guides → matching module page + Book a demo.

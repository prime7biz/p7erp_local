/**
 * Resources/Blog articles ported from legacy PrimeX ERP.
 * Used by ResourcesPage for /resources and /resources/:slug.
 */

export interface ResourceArticle {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  readTime: string;
  category: string;
  keywords: string;
  author: string;
  authorRole: string;
  /** Date of the last substantial rewrite, same text format as `date` (e.g. "November 13, 2026"). */
  updated?: string;
}

/** Author name for articles written by the company team; Article JSON-LD then names the organization. */
export const ORGANIZATION_AUTHOR = "Prime7 ERP Team";

/**
 * Articles shorter than this are summaries, not guides: they stay readable on /resources but are
 * kept out of the sitemap and marked noindex (src/utils/seoRobots.ts) until they are written in full.
 */
export const MIN_INDEXABLE_WORDS = 300;

export const resourceArticles: ResourceArticle[] = [
  {
    slug: "how-to-choose-garments-erp-software-bangladesh",
    title: "How to Choose Garments ERP Software in Bangladesh: A Buyer's Checklist",
    excerpt:
      "A practical checklist for RMG factories and buying houses comparing garments ERP software in Bangladesh: the workflows to test, questions to ask in a demo, red flags and the real cost of ownership.",
    date: "November 13, 2026",
    readTime: "9 min read",
    category: "Buying Guide",
    keywords:
      "how to choose garments ERP software, best garments ERP software in Bangladesh, RMG ERP software Bangladesh, garment ERP checklist, ERP vs spreadsheets",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## Start with your workflow, not a feature list

Almost every ERP brochure lists merchandising, inventory, production and accounts. The difference between systems shows up only when you run one of your own orders through them. Before you compare vendors, write down how an order really moves through your company today: who receives the buyer's inquiry, who prepares the cost sheet, how the BOM becomes purchase orders, how the floor reports output, and how the commercial team prepares shipping documents.

Use that description as the test script for every demo. The questions below follow the same order.

## 1. Styles, colours and sizes are handled natively

A garment order is a grid of colours and sizes, often with several delivery dates. Check that the system stores a style with its colourways and size scale, that order quantities are entered as a colour-size breakdown, and that consumption and purchase quantities are calculated from that breakdown instead of from one total.

## 2. One chain from inquiry to shipment

Ask the vendor to show one order moving from inquiry to quotation, confirmed order, BOM, purchase orders, goods receiving, production, quality inspection and shipment without exporting to Excel in between. Each step should open the next one from the same record, so a change in quantity or delivery date is visible to every team.

## 3. Costing that carries into purchasing

The cost sheet should hold consumption per dozen, wastage and prices for every material, plus CM and commercial costs. After the order is confirmed, the same figures should drive the BOM and purchase orders, and the system should be able to compare planned and actual consumption after shipment.

## 4. Commercial and LC management

For Bangladesh exporters this is often the deciding test. The system should record export LCs or master sales contracts, link proforma invoices and orders to them, track back-to-back LCs and remaining BTB capacity, and produce commercial invoices from shipped quantities. Ask how it keeps the records you need for the Utilization Declaration and bond registers.

## 5. Production tracking at line and hour level

Factory managers need to see output by line and by hour, not only at the end of the day. Check cutting, sewing and finishing entry, line planning, efficiency against SMV and how quality defects are recorded on the floor.

## 6. Inventory and consumption control

Look for store-wise stock, goods receiving with inspection, issues against orders, transfers, stock adjustments with approval, and a clear stock valuation method. Ask how the system flags issues above the BOM quantity.

## 7. Accounts that match how your accountants work

Bangladeshi accounts teams often come from Tally. Check voucher entry speed, voucher approval, accounting period locks, multi-currency for USD export sales, bank reconciliation and standard reports such as trial balance, financial statements and receivable and payable ageing. Purchases and goods receipts should reach accounts without being typed again.

## 8. HR and payroll for Bangladesh

If you need HR and payroll, ask how the system handles wage grades, attendance from your devices, overtime, leave and the payroll registers your auditors ask for. Rules change, so ask who updates them and how changes are approved.

## 9. Security and data ownership

- Each company's data should be kept separate from other customers.
- Users should see only what their role allows.
- Important changes should be recorded in an audit log.
- You should be able to export your own data at any time.
- Ask how backups are taken and how often a restore is tested.

## 10. Implementation, migration and support

Ask who will import your masters (buyers, suppliers, items, chart of accounts and opening balances), how long a typical go-live takes for a company of your size, and whether training and support are available locally and in Bangla.

## Questions to ask in every demo

- Can we run one of our real orders from inquiry to shipment in the demo?
- What happens to the BOM and purchase orders when the buyer changes quantities?
- How do we see remaining back-to-back LC capacity for a contract?
- Which reports can a factory manager see on a phone?
- What is included in the price, and what is charged as customisation?
- How do we get our data out if we leave?

## Red flags

- Every garment-specific requirement is answered with "we can customise that".
- Production, commercial and accounts are separate products that need manual transfers.
- The demo only uses prepared sample data and avoids your real order.
- There is no clear answer about data export, backups or who owns the data.

## Count the full cost of ownership

Compare more than the licence price. Add per-user fees, implementation and data migration, hosting, customisation, training, support and the internal time your team will spend. A cheaper licence that needs months of customisation can cost more than a product built for garments.

## How Prime7 ERP fits this checklist

Prime7 ERP is a cloud ERP built for garment manufacturers and buying houses. It covers the chain described above in one system: styles, quotations with costing, orders, BOM and consumption plans, purchasing and inventory, production and quality, export and back-to-back LC records, accounts and HR. The best way to check the fit is to use the questions above in a live demo with one of your own orders.

[Book a demo of Prime7 ERP](/book-demo)

[See garments ERP software for Bangladesh](/erp-bangladesh)

[Compare Prime7 with generic ERP and spreadsheets](/erp-comparison)
`,
  },
  {
    slug: "consumption-control-garments",
    title: "Mastering Consumption Control in Garment Manufacturing",
    excerpt:
      "Learn how to track BOM vs actual consumption, reduce fabric and accessories wastage, and leverage ERP automation for precise consumption calculations across size and color breakdowns.",
    date: "January 15, 2026",
    readTime: "8 min read",
    category: "Manufacturing",
    keywords:
      "consumption control garments, BOM vs actual, fabric wastage tracking, garment ERP consumption, size color breakdown",
    updated: "November 13, 2026",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## Understanding Consumption Control in Garment Manufacturing

Consumption control is one of the most critical — and most frequently mismanaged — aspects of garment manufacturing. Raw materials are usually the largest part of a garment's cost, so even a small gap between planned and actual consumption adds up across thousands of garments and many orders. For Bangladesh's export-driven RMG sector, mastering consumption control isn't just about efficiency — it decides whether thin margins survive in a very competitive global market.

## BOM vs Actual Consumption: The Core Challenge

Every garment style begins with a Bill of Materials (BOM) — a detailed specification of every fabric, trim, accessory, and packaging material needed to produce one unit (or one dozen) of the product. The BOM defines the theoretical consumption: how much fabric per garment, how many buttons, meters of thread, and pieces of polybag are needed.

However, the reality on the production floor is always different from the theory. Fabric arrives with width variations. Cutting generates unavoidable waste. Defective trims need replacement. Thread breaks mean additional consumption. The gap between the BOM quantity and the actual quantity used is where consumption control lives.

**Key metrics every manufacturer should track:**
- **Planned consumption**: The BOM quantity × order quantity
- **Issued quantity**: Materials actually issued from the warehouse to the production floor
- **Actual consumption**: Materials confirmed as used in finished goods
- **Wastage percentage**: (Issued − Actual) ÷ Issued × 100
- **Variance**: Actual vs BOM consumption per unit

Without a system to track these metrics in real time, manufacturers rely on post-production reconciliation — by which time the damage is already done.

## Fabric Wastage: The Biggest Cost Driver

Fabric is typically the single largest cost component in garment manufacturing and often the biggest share of the FOB price. Fabric wastage comes from multiple sources:

**Cutting waste** is inherent in the process. Marker efficiency — the percentage of fabric area actually used in cut pieces versus total fabric laid — depends on the garment style, the size mix and the fabric width, so track it for every marker and compare styles over time.

**End-of-roll waste** occurs when fabric rolls don't perfectly match the required lay length. **Defect-related waste** happens when fabric quality issues force rejection of portions of the fabric. **Spreading waste** occurs during the laying process.

A well-managed factory sets a wastage target for each fabric and style and measures actual wastage against it. Without systematic tracking, wastage creeps up without anyone noticing, silently eroding margins.

## How ERP Automates Consumption Calculation

Modern ERP systems like Prime7 transform consumption control from a manual, error-prone process into an automated, real-time discipline:

**Automatic BOM explosion**: When a production order is created, the system automatically calculates material requirements based on the BOM, order quantity, and configured wastage allowances — broken down by size and color.

**Real-time issue tracking**: Every material issue from the warehouse to the production floor is recorded with reference to the production order, department, and style.

**Variance alerts**: When actual consumption exceeds the BOM allowance by a configurable threshold, the system triggers alerts to the production manager and merchandiser.

**Consumption matrix**: Prime7 ERP handles the complexity of size-color matrices that make garment consumption unique. A single style might have 6 sizes × 4 colors = 24 SKUs, each with slightly different fabric consumption due to size grading.

## Benefits of Real-Time Consumption Tracking

1. **Reduced material costs**: Lower raw material costs through better wastage control and more accurate procurement
2. **Improved procurement accuracy**: BOM-based material requirements planning ensures you order what you need — not more, not less
3. **Faster reconciliation**: End-of-order material reconciliation that took days with spreadsheets takes hours with an ERP
4. **Data-driven negotiation**: Historical consumption data provides leverage when negotiating fabric prices with mills
5. **Reduced inventory carrying costs**: Accurate consumption tracking prevents over-procurement and reduces dead stock

By bringing consumption control into a structured ERP workflow, garment manufacturers can move from reactive cost management to proactive cost optimization — a critical competitive advantage in Bangladesh's export-driven garment industry.
    `,
  },
  {
    slug: "what-is-erp-garment-manufacturing",
    title: "What is ERP for Garment Manufacturing? A Complete Guide",
    excerpt:
      "Understand what ERP means for garment manufacturers, why specialized solutions are essential, the key modules you need, common implementation pitfalls, and how to evaluate the right system for your factory.",
    date: "January 5, 2026",
    readTime: "10 min read",
    category: "Education",
    keywords:
      "what is garment ERP, ERP for garment industry, garment manufacturing software guide, apparel ERP system",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## What is ERP and Why Does It Matter for Garment Manufacturing?

Enterprise Resource Planning (ERP) is a class of software that integrates all the core business processes of an organization into a single, unified system. Instead of running separate tools for finance, inventory, production, human resources, and sales, an ERP brings everything together — creating a single source of truth that eliminates data silos, reduces manual effort, and enables real-time decision-making.

For garment manufacturers, the need for ERP goes far beyond general business efficiency. The apparel industry has unique complexities that generic ERP systems — designed for discrete or process manufacturing — simply cannot handle. Size and color matrices, Bill of Materials (BOM) with hundreds of components, seasonal demand cycles, complex supply chains spanning multiple countries, and razor-thin margins all demand a purpose-built solution.

## Why Generic ERP Falls Short for Apparel

**Size-color matrix handling** is the most obvious gap. A single style in garment manufacturing can have 8 sizes × 6 colors = 48 SKUs, each requiring separate tracking through cutting, sewing, finishing, packing, and shipment.

**BOM complexity** in garments is multi-dimensional. Fabric consumption varies by size (graded patterns), trims vary by color, and packaging varies by destination country. **Buyer-driven workflows** — sample approval cycles, T&A calendars, buyer-specific quality standards, and LC-based payment terms — are unique to apparel. **Seasonal and fast-fashion cycles** mean that the product lifecycle is measured in weeks, not years.

## Key Modules Every Garment ERP Must Have

- **Merchandising & Order Management**: Style creation, costing sheets, buyer communication, sample management, and order booking.
- **Production Planning & Control**: Converting orders into production plans, scheduling cutting, sewing, and finishing, tracking daily output.
- **Inventory & Warehouse Management**: Tracking raw materials, work-in-progress, and finished goods with lot traceability and weighted average costing.
- **Supply Chain & Procurement**: Purchase orders for fabric and trims, supplier evaluation, delivery tracking, goods receiving.
- **Financial Accounting**: General ledger, AP/AR, bank reconciliation, multi-currency and LC management integration.
- **Commercial & Export Documentation**: LC registration, amendment tracking, export document generation.
- **Quality Control**: Inline inspection, endline inspection, defect tracking and analysis.
- **Human Resources & Payroll**: Employee records, attendance, leave, payroll for garment factories with thousands of workers.

## How to Evaluate and Select the Right ERP

1. **Industry specificity**: Does the system handle size-color matrices, garment BOMs, and buyer-driven workflows natively?
2. **Deployment model**: Cloud-based SaaS solutions like Prime7 ERP offer lower upfront costs and accessibility from anywhere.
3. **Implementation timeline**: A garment-specific ERP should be deployable in 8-16 weeks, not 12-18 months.
4. **Total cost of ownership**: Consider license fees, implementation, training, customization, and ongoing support.
5. **Vendor expertise**: Does the vendor understand the garment industry and speak your language — FOB, CM, T&A, LC, BOM?

Prime7 ERP is purpose-built for the garment and apparel industry, offering all the core modules described above with an implementation timeline measured in weeks, not months.
    `,
  },
  {
    slug: "signs-factory-needs-erp",
    title: "5 Signs Your Garment Factory Needs an ERP System",
    excerpt:
      "Recognize the telltale signs that your garment factory has outgrown spreadsheets and manual processes. From growing pains and missed deadlines to inventory discrepancies and compliance challenges — learn when it's time to invest in ERP.",
    date: "January 25, 2026",
    readTime: "8 min read",
    category: "Business",
    keywords:
      "when to get ERP, signs need ERP system, garment factory ERP benefits, manufacturing ERP ROI",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## Is Your Factory Ready for ERP? Five Clear Warning Signs

Every garment factory reaches a tipping point where the tools and processes that got it started become the very things holding it back. Spreadsheets that once managed a handful of orders now struggle with dozens. Recognizing when your factory has crossed this threshold is critical. Here are five unmistakable signs that your garment factory needs an ERP system.

## Sign 1: Growing Pains with Spreadsheets

**Version control chaos**: When multiple people edit the same spreadsheet, version conflicts are inevitable. **Formula fragility**: Complex spreadsheets are brittle; a single accidental deletion can cascade errors. **No real-time visibility**: Spreadsheets are snapshots, not live systems. **Scalability ceiling**: At 100+ orders, it becomes impossible to maintain data accuracy using flat files.

**How ERP solves it**: An ERP system like Prime7 replaces disconnected spreadsheets with a centralized database where every department works on the same data in real time, with full audit trails and validated business logic.

## Sign 2: Consistently Missed Deadlines

**No early warning system**: Without systematic tracking, problems surface too late. **Dependency blind spots**: A two-day delay in fabric arrival can cascade through cutting, sewing, finishing, and packing. **Capacity overcommitment**: Without a clear view of factory loading, sales teams accept orders the factory cannot realistically produce on time.

**How ERP solves it**: ERP provides a structured T&A framework, automated alerts, capacity planning tools, and critical path analysis so you can intervene proactively.

## Sign 3: Inventory Discrepancies

**Unknown stock positions**: Merchandisers and planners don't know what's available. **Phantom inventory**: Records show fabric in stock, but the physical shelf is empty. **Excess and dead stock**: Slow-moving inventory accumulates unnoticed. **No traceability**: When a quality issue is traced to a fabric lot, can you identify which orders used that lot?

**How ERP solves it**: ERP maintains perpetual inventory with real-time updates, lot traceability, and streamlined physical inventory reconciliation.

## Sign 4: Financial Visibility Gaps

**Delayed costing**: Actual production costs are calculated only at month-end. **Unknown order-level profitability**: You don't know which orders made money and which lost money. **Cash flow surprises**: Without real-time visibility into receivables and payables, cash flow surprises are common.

**How ERP solves it**: An integrated ERP records financial impacts as they occur; order-level profitability and cash flow projections are available in real time.

## Sign 5: Compliance Challenges

**Buyer audit readiness**: Producing documentation from scattered files is time-consuming and error-prone. **Export documentation complexity**: Errors in export documents lead to customs holds and payment delays. **Sustainability reporting**: Collecting sustainability data from manual systems is practically impossible.

**How ERP solves it**: An ERP maintains a complete, timestamped, auditable record of every transaction and generates export documents and compliance reports automatically.

## The ROI Case for ERP

Garment factories that implement purpose-built ERP systems like Prime7 typically recover their investment within 12-18 months through reduced material waste, improved on-time delivery, lower administrative overhead, and better pricing decisions.
    `,
  },
  {
    slug: "ai-transforming-apparel-industry",
    title: "How AI is Transforming the Apparel Industry in 2026",
    excerpt:
      "Explore how artificial intelligence is revolutionizing garment manufacturing — from demand forecasting and inventory optimization to quality control automation, production scheduling, and predictive cost analysis.",
    date: "January 12, 2026",
    readTime: "9 min read",
    category: "AI & Technology",
    keywords:
      "AI in apparel industry, artificial intelligence garment manufacturing, AI demand forecasting fashion, smart manufacturing AI",
    updated: "November 13, 2026",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## The AI Revolution in Fashion and Apparel Manufacturing

Artificial intelligence is no longer a futuristic concept for the apparel industry — it is a present-day reality that is fundamentally reshaping how garments are designed, manufactured, and delivered. In 2026, AI adoption across the global fashion supply chain has accelerated beyond pilot projects into production-grade implementations that deliver measurable ROI.

For garment manufacturers and buying houses, the question is no longer "Should we adopt AI?" but "How quickly can we integrate AI into our operations before our competitors do?"

## AI-Powered Demand Forecasting

AI transforms demand forecasting by analyzing historical sales patterns, external data (weather, economic indicators, social media sentiment), and enabling real-time adjustment and granular SKU-level predictions. Better forecasts let teams plan materials and capacity earlier; measure the improvement on your own order history rather than relying on published averages.

## Inventory Optimization with Machine Learning

**Dynamic safety stock calculation**: ML models calculate optimal safety stock levels per SKU based on demand variability and lead times. **Automated reorder point optimization**: AI continuously adjusts reorder points. **Dead stock prediction**: ML identifies inventory at risk of becoming dead stock early enough for markdown or redistribution. **Multi-location optimization**: AI optimizes inventory distribution across warehouses and factories.

## Quality Control Automation

AI-powered computer vision is revolutionizing quality inspection: fabric inspection for defects at speeds and accuracy levels that exceed human inspection; inline sewing inspection; pattern matching and measurement verification; and defect classification and root cause analysis.

## Smart Production Scheduling

AI scheduling engines consider machine availability, operator skills, order priority, delivery deadlines, fabric availability, and line changeover times to generate optimal production schedules. When disruptions occur, AI systems recalculate the optimal schedule within minutes.

## How Prime7 ERP Leverages AI

Prime7 ERP integrates AI capabilities into its core modules: AI-powered demand forecasting dashboard, intelligent inventory recommendations, quality insights automation, smart production scheduling, and a natural language AI assistant for querying data. The integration of AI into garment manufacturing ERP is about augmenting human expertise with computational capabilities for faster, more accurate, and more proactive decision-making.
    `,
  },
  {
    slug: "stock-valuation-tally-style",
    title: "Stock Valuation Methods: Weighted Average & Tally-Style Accounting",
    excerpt:
      "FIFO, weighted average and standard cost explained with simple examples, how garment stock value reaches the ledger, and how a Draft to Posted voucher workflow keeps stock and accounts in agreement.",
    date: "January 18, 2026",
    updated: "November 13, 2026",
    readTime: "9 min read",
    category: "Accounting",
    keywords: "stock valuation methods, FIFO vs weighted average, Tally style accounting, garment inventory valuation",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## Why stock valuation matters in a garment business

Fabric, yarn and trims are often the largest current asset on a garment factory's balance sheet. The value you put on that stock decides the cost of goods sold, the gross margin of each order and the closing stock in your financial statements. Two factories with the same physical stock can report different profits simply because they value it differently, so the method should be chosen deliberately and applied consistently.

## The common valuation methods

### FIFO (first in, first out)

FIFO assumes the oldest stock is used first. When fabric is issued to cutting, its cost is taken from the earliest receipts still in stock. Closing stock is therefore valued at the most recent purchase prices.

Example with sample numbers: you receive 1,000 metres at 2.00 USD and later 1,000 metres at 2.20 USD. If you issue 1,200 metres, FIFO charges 1,000 × 2.00 + 200 × 2.20 = 2,440 USD, and the remaining 800 metres are valued at 2.20 USD.

### Weighted average

Weighted average spreads the cost of all units in stock evenly. After the two receipts above, the average cost is 2.10 USD per metre, so issuing 1,200 metres costs 2,520 USD and the 800 metres left are valued at 2.10 USD. Prices move more smoothly, which some accountants prefer for monthly reports.

### Standard cost

Standard cost values items at a planned price fixed in advance. Differences between the standard and the real purchase price are recorded as price variances. It suits factories with stable, repeated items, but the standards must be reviewed whenever prices change.

### LIFO

LIFO assumes the newest stock is used first. It is rarely used for financial reporting and is not permitted under IFRS, so most exporters use FIFO or weighted average for their books.

## Choosing a method

- Use one method consistently and explain it in your accounting policies.
- FIFO follows the physical flow of most fabric and trims and is easy to explain to auditors.
- Weighted average is simpler when the same item is bought many times at small price differences.
- Whatever you choose, valuation must be calculated by the system from real receipts and issues, not typed in at month end.

## How stock value reaches the ledger

In a connected ERP, each stock movement can create an accounting entry: goods received increase inventory and the supplier liability, issues to production move value from raw material stock to work in progress, and finished goods move to cost of sales when they are shipped. If stores and accounts use separate systems, the stock register and the inventory ledger drift apart and must be reconciled by hand.

## Tally-style voucher workflow

Accountants who come from Tally are used to vouchers, ledgers and groups. A controlled ERP adds a workflow around the voucher so that entries are checked before they change the books:

1. Draft: the voucher is prepared and can still be edited.
2. Submitted or pending approval: it waits for a person with approval rights.
3. Approved: it has been checked.
4. Posted: it is in the books and can no longer be edited. A mistake is corrected with a reversal voucher, which keeps a clear audit trail.

## A month-end checklist for stock and accounts

- Compare the stock ledger value with the inventory balance in the trial balance.
- Investigate receipts without supplier bills and bills without receipts.
- Review stock adjustments and make sure each one was approved.
- Check slow-moving and old stock for possible write-down.
- Lock the accounting period once the figures are agreed.

## How Prime7 ERP handles stock valuation

Prime7 ERP values stock on FIFO by default and can also show valuation on LIFO, weighted average or standard cost. The stock ledger, FIFO inventory summary and stock valuation reports come from real receipts and issues, and stock movements are linked to accounting. Vouchers move from draft through approval to posted, posted vouchers are corrected by reversal, and accounting periods can be locked at month end.

[See Prime7 garment accounting software](/garment-accounting-software)

[See Prime7 garment inventory management](/garment-inventory-management-software)
`,
  },
  {
    slug: "wip-costing-rmg",
    title: "WIP Costing in RMG: From Cutting to Shipment",
    excerpt:
      "How work-in-progress costing works in garment manufacturing: what counts as WIP, how cost builds up from cutting to finishing, how to value it at month end and how to reconcile WIP with the ledger.",
    date: "January 22, 2026",
    updated: "November 13, 2026",
    readTime: "10 min read",
    category: "Accounting",
    keywords: "WIP costing, work in progress RMG, garment costing stages, WIP valuation",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## What work in progress means in a garment factory

Work in progress (WIP) is everything the factory has started but not finished: fabric that has been cut, bundles waiting on a sewing line, garments at washing or in finishing. It is no longer raw material, but it cannot be shipped yet. At any month end a busy factory can have a large share of its inventory value sitting in WIP, so leaving it out, or guessing it, distorts both the balance sheet and the profit of the month.

## How cost builds up stage by stage

A garment collects cost as it moves through the factory:

1. Materials issued: fabric and trims issued to cutting for an order move from raw material stock into WIP.
2. Cutting: cutting labour and overhead are added. Cut panels are counted in pieces or bundles.
3. Sewing: the largest share of labour and overhead is added, usually measured by standard minutes produced.
4. Washing, printing or embroidery: in-house or subcontracted process costs are added.
5. Finishing and packing: ironing, checking, poly and carton costs are added, together with packing trims.
6. Finished goods: completed and packed garments leave WIP and become finished goods stock until shipment.

## Valuing WIP at month end

There are two practical approaches:

- By stage: count quantities at each stage (cut not sewn, sewn not finished, finished not packed) and value each at its material cost plus the conversion cost added so far.
- By equivalent units: express partly finished work as a share of a finished garment. For example, 1,000 garments that are half sewn may be treated as 500 equivalent units of sewing cost.

Both need reliable quantities from the floor. Hourly or daily production entries for cutting, sewing and finishing give those quantities without a physical count of every bundle.

## Where conversion cost comes from

Conversion cost is labour plus factory overhead. A common approach is to calculate a cost per minute (monthly factory cost divided by productive minutes) and multiply it by the standard minutes produced at each stage. The same cost per minute is used when quoting CM, which keeps quotations and WIP valuation consistent.

## Recording WIP in the accounts

In the ledger, WIP is usually a separate inventory account:

- Issue of materials: debit WIP, credit raw material stock.
- Conversion cost absorbed: debit WIP, credit production overhead or wages absorbed.
- Completion: debit finished goods, credit WIP.
- Shipment: debit cost of sales, credit finished goods.

Entries should be reviewed and approved like any other voucher before they are posted.

## Reconciling WIP with the ledger

At month end, compare the WIP value from production records with the WIP balance in the trial balance. Differences usually come from materials issued to the wrong order, production not recorded, or completions not moved to finished goods. Investigate them before closing the period.

## Common mistakes

- Treating all issued fabric as consumed, so WIP is never shown.
- Valuing WIP at selling price instead of cost.
- Forgetting process loss and rejects when counting quantities.
- Mixing orders on one bundle record, so cost cannot be traced to the order.

## How Prime7 ERP supports WIP costing

Prime7 ERP records hourly output for cutting, sewing, ironing and finishing, and its production costing creates WIP journals that become draft vouchers for review and posting. A WIP stock summary and a WIP-versus-ledger reconciliation help finance check the balance at month end, and post-costing and order profitability show the final cost of each order.

[See Prime7 garment production management](/garment-production-management-software)

[Read the garment costing and consumption guide](/resources/accurate-garment-costing-bangladesh)
`,
  },
  {
    slug: "buying-house-tna-workflow",
    title: "T&A Workflow for Buying Houses: Best Practices",
    excerpt:
      "Time and action (T&A) best practices for buying houses: which milestones to track, how to plan backwards from the ship date, how to work with factories on dates, and how to react when a milestone slips.",
    date: "January 28, 2026",
    updated: "November 13, 2026",
    readTime: "8 min read",
    category: "Buying House",
    keywords: "T&A workflow, buying house TNA, time and action calendar, buying house order management",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## Why T&A is the backbone of buying house work

A buying house does not sew garments, but it is responsible to the buyer for every date between order confirmation and shipment. The time and action plan (T&A, also called TNA) is the list of those dates. When it is kept up to date, merchandisers can see which orders need attention today. When it lives in scattered spreadsheets, the first sign of a delay is often a missed shipment.

## Plan backwards from the ship date

Start with the buyer's ex-factory or shipment date and work backwards. Each milestone gets a planned date based on the lead time the factory and suppliers need:

1. Shipment or ex-factory date (fixed by the buyer).
2. Final inspection and booking with the forwarder.
3. Production finish, then production start and sewing input.
4. Bulk fabric and trims in-house at the factory.
5. Pre-production (PP) sample approval.
6. Fabric and trims booking, lab dip and strike-off approvals.
7. Fit and size-set sample approvals.
8. Order confirmation and costing approval.

If the backward plan puts any milestone in the past, the delivery date is at risk before work has even started, and the conversation with the buyer should happen now, not later.

## Milestones worth tracking

- Approvals: lab dips, strike-offs, fit, size-set, PP samples and trims.
- Materials: fabric booking, fabric in-house, trims in-house, test reports.
- Production: cutting start, sewing input, sewing finish, finishing.
- Quality: inline and final inspections.
- Shipment: booking, handover, shipping documents sent.

Keep the list short enough that people actually update it. A template per buyer or product type helps, because each buyer has its own approval steps.

## Working with factories on dates

- Agree lead times with each factory before the order is confirmed, not after.
- Give the factory the same milestone list you show the buyer.
- Record who owns each milestone: the buying house, the factory or a supplier.
- Update actual dates as soon as they happen, with a short note when a date moves.

## When a milestone slips

1. See the slip early: milestones due in the next few days should appear on a dashboard, not only in a weekly meeting.
2. Check the knock-on effect: a late lab dip pushes fabric, then cutting, then shipment.
3. Decide the recovery: overtime, a second line, air freight, a split shipment or a new date.
4. Tell the buyer with facts and the new plan.
5. Record the reason, so recurring problems with one supplier or step become visible.

## Measuring T&A performance

- On-time rate per milestone type (for example, how many PP samples were approved on plan).
- Average delay by factory and by supplier.
- Orders shipped on the original date versus a revised date.

## How Prime7 ERP supports T&A

Prime7 ERP has TNA templates, TNA plans linked to orders and a follow-up dashboard where merchandisers record planned and actual dates. Sample development and sample requests sit next to the order, and the merchandising control tower and critical alerts help managers see orders that need attention. Buyers can be given access to the customer portal to see their orders, approvals and shipments, if the company switches it on.

[See Prime7 buying house ERP](/buying-house-erp)

[See garment merchandising and order management](/garment-merchandising-software)
`,
  },
  {
    slug: "po-sample-shipment-tracking",
    title: "PO and Sample Shipment Tracking for Buying Houses",
    excerpt:
      "How buying houses can keep buyer orders, sample dispatches and bulk shipments visible across many factories: what to record for each order and sample, which statuses matter and how to avoid lost samples and late shipments.",
    date: "February 1, 2026",
    updated: "November 13, 2026",
    readTime: "7 min read",
    category: "Buying House",
    keywords: "PO tracking buying house, sample shipment tracking, buying house shipment tracking, order follow-up",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## The tracking problem in a buying house

A buying house typically follows many buyer orders, each split across factories, colours and delivery dates, while samples travel between factories, the office and buyers' offices abroad. Merchandisers spend much of the day answering the same questions: where is this order, which sample did the buyer receive, when will it ship? The answers usually exist, but they are spread across email, messaging apps and personal spreadsheets.

## What to record for every buyer order

- Buyer, buyer's order number, style and season.
- Factory and, where relevant, the supplier of main fabric.
- Quantity by colour and size, unit price and delivery date.
- Commercial terms (FOB, CIF and so on) and the LC or contract it belongs to.
- The T&A plan with planned and actual dates.
- Status: confirmed, in production, inspected, shipped, closed.

One record per order, shared by everyone, removes most "where is it" questions.

## What to record for every sample

Samples are small but costly to lose: a missing PP sample can delay bulk production by weeks.

- Sample type (proto, fit, size-set, PP, shipment sample) and the order or style it belongs to.
- Who sent it, to whom, and the date.
- Courier and tracking (air waybill) number.
- Buyer comments and approval status, with the date of approval.
- Next action and owner if the sample was rejected.

## Statuses that matter

Keep statuses few and clear, for example:

- Requested, in development, sent, received by buyer, approved, rejected.
- For bulk shipments: booked, handed over, shipped, documents sent, payment received.

Each status change should carry a date, so delays can be measured later.

## Bulk shipment tracking

For each shipment, record the forwarder, booking, shipment date, bill of lading or air waybill number, quantities shipped against the order, and the shipping documents sent to the buyer or bank. Compare shipped quantity with ordered quantity to catch short shipments early.

## Practical habits that prevent delays

1. Update the record when something happens, not at the end of the week.
2. Review a short list every morning: samples awaiting buyer comments, milestones due this week, shipments due this month.
3. Make one person the owner of each order, with a backup.
4. Share the same information with factories, so both sides work from one plan.
5. Keep a history of comments and approvals with the order, not in personal inboxes.

## How Prime7 ERP helps

In Prime7 ERP, orders, styles, sample development and sample requests, and TNA plans are kept together, and logistics records store shipment details such as BL or AWB numbers. Suppliers can be invited to the supplier portal to see their purchase orders, and buyers can be invited to the customer portal to follow their orders, approvals and shipments, when the company switches these portals on.

[See Prime7 buying house ERP](/buying-house-erp)

[Read T&A workflow best practices for buying houses](/resources/buying-house-tna-workflow)
`,
  },
  {
    slug: "multi-currency-erp-exporters",
    title: "Multi-Currency ERP for Garment Exporters",
    excerpt:
      "Why garment exporters need multi-currency accounting: USD sales with BDT costs, which exchange rate to use, realized and unrealized exchange gains and losses, and month-end revaluation of foreign currency balances.",
    date: "February 5, 2026",
    updated: "November 13, 2026",
    readTime: "8 min read",
    category: "Commercial",
    keywords: "multi-currency ERP, garment export currency, exchange gain loss, foreign currency accounting Bangladesh",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## Why currency is a daily issue for exporters

A typical Bangladesh garment exporter sells in US dollars or euros, buys imported fabric and trims in foreign currency through back-to-back LCs, and pays wages, utilities and local suppliers in taka. The books are kept in taka, but a large part of the business happens in other currencies. If each foreign currency transaction is converted by hand, the receivable and payable balances never quite match the bank and the profit includes unexplained currency differences.

## Functional and transaction currency

- Functional (base) currency: the currency the books are kept in, usually BDT for a Bangladesh company.
- Transaction currency: the currency on the invoice or LC, for example USD.

Each foreign currency transaction is recorded in both: the original amount in USD and its value in BDT at the exchange rate of the transaction date.

## Which exchange rate to use

Decide and document a policy:

- For invoices and bills: the rate on the transaction date, from a consistent source such as your bank or the central bank.
- For receipts and payments: the actual rate the bank applied.
- For month-end balances: the closing rate on the last day of the month.

Using one source consistently matters more than which source you choose.

## Realized exchange gains and losses

A realized gain or loss appears when money actually changes hands at a different rate from the one used when the invoice was recorded.

Example with sample numbers: an export invoice of 100,000 USD is recorded at 118 BDT per USD (11,800,000 BDT). The buyer pays when the bank rate is 119 BDT per USD, so the bank credits 11,900,000 BDT. The extra 100,000 BDT is a realized exchange gain. If the rate had fallen, the difference would be a loss.

## Unrealized gains and losses and revaluation

At month end, open foreign currency balances (receivables, payables, foreign currency bank accounts, BTB LC liabilities) are revalued at the closing rate. The difference from their recorded BDT value is an unrealized gain or loss. It shows the real position in the monthly accounts and is adjusted again when the balance is settled.

## Export proceeds and retention

Exporters in Bangladesh can keep part of their export proceeds in a foreign currency retention account under Bangladesh Bank rules, and convert the rest to taka. Your accounts should show which part of each receipt went where, so the foreign currency bank ledger agrees with the bank statement. Check the current retention rules with your bank.

## Practical checklist

1. Set up each foreign currency and its rate source.
2. Record invoices, bills and LCs in their own currency.
3. Record receipts at the bank's actual rate and book the difference as realized gain or loss.
4. Revalue open foreign currency balances at month end.
5. Reconcile foreign currency bank accounts in both currencies.
6. Review currency gains and losses as a separate line in management reports.

## How Prime7 ERP handles multiple currencies

Prime7 ERP supports multi-currency accounting with BDT and foreign currencies, foreign currency receipts for export proceeds, bank reconciliation and a multi-currency revaluation summary. Export LCs, proforma invoices and back-to-back LCs are recorded in the commercial module in their own currency, and the finance team works from the same records.

[See Prime7 garment accounting software](/garment-accounting-software)

[See back-to-back LC management](/back-to-back-lc-management-software)
`,
  },
  {
    slug: "lc-management-guide-garment-export",
    title: "Complete Guide to LC Management in Garment Export",
    excerpt:
      "A comprehensive guide to Letter of Credit management for garment exporters — covering LC types, documentation requirements, common mistakes, back-to-back LCs, amendment handling, and how ERP systems streamline the entire process.",
    date: "January 20, 2026",
    updated: "November 13, 2026",
    readTime: "11 min read",
    category: "Commercial",
    keywords:
      "back to back LC management, LC management garment export, master LC, sales contract, utilization declaration, export LC processing",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## Why LC management decides cash flow in a garment factory

For an export-oriented garment factory, the letter of credit (LC) chain is where sales, purchasing and finance meet. The buyer's export LC or sales contract secures payment for the garments. Back-to-back LCs opened against it pay for fabric, yarn and trims. If one date, amount or document in that chain is wrong, the result is a delayed payment, a discrepancy fee or raw material that cannot be imported on time.

This guide explains the documents in the chain, the dates that matter, the most common mistakes and a simple workflow your commercial team can follow. It is general guidance, not banking or legal advice: always confirm current rules with your bank and your trade association.

## The documents in the chain

### Export LC or master sales contract

The chain starts when the buyer's bank opens an export LC in the factory's favour, or when the buyer and factory sign a master sales contract. Either document states the goods, quantity, unit price, total value, latest shipment date, expiry date and the documents the factory must present to get paid.

### Proforma invoice

A proforma invoice (PI) lists the goods and prices before shipment. Buyers use it to open or amend the LC, and suppliers send their own PIs to the factory before the factory opens back-to-back LCs for materials.

### Back-to-back LC

A back-to-back (BTB) LC is opened by the factory's bank in favour of a fabric or trims supplier, using the export LC or sales contract as security. The total value of BTB LCs is limited to a share of the export value; the limit that applies depends on current regulations and your bank, so confirm it before you plan purchases.

### Utilization Declaration

In Bangladesh, bonded export factories need a Utilization Declaration (UD) from their trade association (BGMEA or BKMEA) to import raw materials duty-free against an export LC or contract. The UD links the export order, the materials and the quantities, so the numbers in your BOM, PIs and BTB LCs must agree with it.

### Shipping and payment documents

After shipment the factory presents the documents the LC asks for, usually the commercial invoice, packing list, bill of lading or air waybill, certificate of origin and any inspection or test certificates. The bank checks them against the LC terms before paying or accepting.

## The dates you must watch

- Latest shipment date: the last day goods may ship under the export LC.
- LC expiry date: the last day documents can be presented.
- Presentation period: under UCP 600, documents must be presented within 21 calendar days after shipment unless the LC states another period, and never after expiry.
- BTB LC shipment and expiry dates: your suppliers must ship in time for your production plan.
- BTB LC maturity dates: for usance (deferred payment) BTB LCs, the date your bank must pay the supplier.
- Amendment dates: every amendment changes at least one of the dates or amounts above.

## Common mistakes and how to avoid them

1. Amounts that do not match: the commercial invoice, packing list and LC must agree on quantity, unit price and total value. Prepare all three from one order record instead of retyping figures.
2. Descriptions that differ from the LC: the goods description on the invoice should follow the LC wording.
3. Amendments that are not recorded: when the buyer amends quantity, price or dates, update the order, the PI and the BTB LC plan at the same time.
4. Opening more BTB value than allowed: track how much of each export LC or contract has already been used by BTB LCs before opening a new one.
5. Late material arrival: a BTB LC opened late or with a late supplier shipment date pushes the whole production plan.
6. Missed maturity payments: usance BTB LCs create real payment obligations; finance needs to see them in the cash plan.

## A simple LC workflow for the commercial team

1. Record the export LC or sales contract with its value, dates and required documents.
2. Link the buyer orders and proforma invoices it covers.
3. Plan material purchases from the order BOM and check the remaining BTB capacity.
4. Open BTB LCs for each supplier and record their shipment, expiry and maturity dates.
5. Follow material arrival through goods receiving and inspection.
6. Prepare the commercial invoice and packing list from the shipped quantities.
7. Present documents within the presentation period and record acceptance and realization.
8. Close the LC once proceeds are realized and BTB payments are settled.

## What to look for in LC management software

- One record per export LC or contract with linked orders, PIs and BTB LCs.
- Remaining BTB capacity calculated from the BTB LCs already opened.
- Shipment, expiry and maturity dates visible in one place, with reminders.
- Commercial invoices built from order and shipment data rather than retyped.
- A link to accounts, so BTB obligations and export proceeds appear in finance reports.
- Registers for bond and utilization records your team maintains.

## How Prime7 ERP handles the LC chain

Prime7 ERP keeps master contracts and export LCs, proforma invoices, back-to-back LCs and commercial invoices in one commercial module. Proforma invoices link to orders, and BTB LCs link to the master contract, so the commercial team can see how much of each contract has been used. An LC performance view summarises contracts, and bond, UD and Mushak registers help keep compliance records in order. Prime7 ERP does not file e-UD or customs returns for you; it keeps the records your team needs to prepare them.

[See Prime7 back-to-back LC management software](/back-to-back-lc-management-software)

[Read the garment costing and consumption guide](/resources/accurate-garment-costing-bangladesh)
`,
  },
  {
    slug: "choosing-erp-buying-house",
    title: "How to Choose the Right ERP for Your Buying House",
    excerpt:
      "A practical guide for buying houses evaluating ERP software: the workflows a sourcing office really needs, questions to ask in a demo, red flags, and how to estimate the return without inflated promises.",
    date: "February 3, 2026",
    updated: "November 13, 2026",
    readTime: "9 min read",
    category: "Buying House",
    keywords:
      "buying house ERP selection, buying house ERP software, garment buying house software, buying office ERP",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## A buying house is not a small factory

Most garment ERP software is designed around a factory: cutting, sewing lines and payroll for thousands of workers. A buying house has different work. It manages buyers, develops and approves samples, places orders with several factories, follows every milestone, handles commercial documents and often earns commission. An ERP that forces a buying house through factory screens creates work instead of saving it.

## The workflows to check first

### Buyer and order management

One record per buyer order with style, quantities by colour and size, price, delivery dates and the factory placed with. Changes to quantities or dates should be visible to everyone following the order.

### Sampling

Sample requests and development by style and type (proto, fit, size-set, PP), with sent and received dates, courier numbers, buyer comments and approval status.

### Time and action (T&A)

Templates per buyer or product type, planned and actual dates for each milestone, and a dashboard of what is due or late. This is where a buying house spends most of its day, so the screen must be fast to update.

### Factory and supplier follow-up

A clear view of which factory has which orders and how each is progressing, and a way for factories and suppliers to see the information that concerns them without access to the rest of the system.

### Commercial and commission

Proforma invoices, LCs or contracts, shipping documents and commission records linked to the orders they belong to.

### Accounts

If the buying house keeps its books in the same system, look for commission income, expenses, multi-currency and standard financial reports.

## Questions to ask in a demo

1. Can you follow one of our real orders from inquiry to shipment, including two samples and a change of delivery date?
2. How does a merchandiser see everything due this week in one screen?
3. How do factories and buyers see their own information, and only theirs?
4. How are commission and multi-currency handled?
5. Which reports can management see without asking the merchandiser?
6. How do we export all our data if we leave?

## Red flags

- The demo spends most of its time on factory production screens you will not use.
- T&A is a static spreadsheet upload rather than live planned and actual dates.
- Sample tracking is just a note field on the order.
- Every buying-house requirement is answered with paid customisation.
- No clear answer on data ownership, backups or user permissions.

## Estimating the return honestly

Avoid vendor percentages that you cannot check. Instead, estimate from your own numbers: how many hours merchandisers spend each week compiling status reports and chasing updates, how many samples or shipments were late last season and what that cost, and how much time month-end commission and document work takes. Compare that with the full cost of the system, including implementation and training. An ROI calculator that uses your own inputs is more useful than any published average.

## How Prime7 ERP fits a buying house

Prime7 ERP covers the buying-house chain in one system: buyers, inquiries and quotations, orders, styles and samples, TNA templates and follow-up, proforma invoices, LCs and commission, logistics and accounts. Buyers and suppliers can be invited to their own portals, which show only their records, when the company switches them on. The best test is a live demo with one of your own orders.

[See Prime7 buying house ERP](/buying-house-erp)

[Try the ROI calculator with your own numbers](/roi-calculator)

[Book a demo](/book-demo)
`,
  },
  {
    slug: "digital-transformation-fashion-supply-chain",
    title: "Digital Transformation in the Fashion Supply Chain",
    excerpt:
      "What digital transformation means in practice for a garment manufacturer or buying house: which records to digitize first, how to sequence the change, and how to avoid buying software that nobody uses.",
    date: "February 8, 2026",
    updated: "November 13, 2026",
    readTime: "8 min read",
    category: "Industry",
    keywords: "digital transformation garment industry, supply chain digitization, garment ERP implementation",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## Digital transformation is about decisions, not screens

For a garment business, "going digital" is useful only when it helps people make better decisions sooner: accepting the right orders at the right price, buying the right quantity of fabric, spotting a late line before the shipment is lost, and knowing the cash position without waiting for month end. Software is the tool; the goal is one reliable set of numbers that every department uses.

## Why the garment supply chain is hard to digitize

- Many parties: buyers, buying houses, factories, fabric mills, trims suppliers, washing and printing units, forwarders and banks.
- Many variants: every order is a grid of styles, colours and sizes with its own dates.
- Fast changes: quantities, colours and delivery dates change after the order is confirmed.
- Paper and messaging habits: approvals, comments and production counts are often shared on paper or in chat groups.

## Start with the records that drive everything

Digitize in the order that information flows, so each step reuses the one before it:

1. Masters: buyers, suppliers, items, styles and the chart of accounts. Clean, consistent masters prevent most later problems.
2. Orders and costing: one record per order with its cost sheet.
3. BOM and purchasing: material requirements and purchase orders built from the order.
4. Stores: goods receiving, issues and stock by store.
5. Production: daily or hourly output by line, then quality.
6. Commercial and accounts: LCs, invoices and vouchers built from the same records.

Each step removes a set of spreadsheets and a round of retyping.

## Sequence the change

- Choose one area and one group of orders to start, run it fully in the system, then expand.
- Set a cut-off date for opening balances and open orders, rather than migrating years of history.
- Decide which old spreadsheets are switched off and when. If both continue, people trust neither.
- Train by role: a store keeper needs three screens, not the whole system.

## Measure what changed

Pick a few numbers before you start and check them every month:

- Time to answer "where is this order?"
- Late shipments and their causes.
- Difference between quoted and actual fabric consumption.
- Days to close the monthly accounts.
- Stock differences found at physical counts.

## Avoiding software that nobody uses

- Involve the people who will enter the data, not only managers, when you choose a system.
- Prefer a product built for garments over heavy customisation of a generic ERP.
- Make data entry part of the work: record output where it happens, on a phone or shop-floor screen.
- Show each team a report that helps them, so entering data is worth the effort.

## Where AI fits

AI assistants and automatic alerts are most useful after the basic records are digital and reliable. They can answer questions from your data, read documents into forms and flag exceptions, but they cannot fix missing or wrong data. Treat AI as a second step, with a person confirming any action.

## How Prime7 ERP supports the journey

Prime7 ERP connects masters, orders and costing, BOM and purchasing, stores, production, commercial, accounts and HR in one cloud system, so each step reuses the data from the step before. Shop-floor screens and employee self-service have Bangla text, and AI features such as the assistant and exception alerts work on your own data with a person in control.

[Read the buyer's checklist for garments ERP software](/resources/how-to-choose-garments-erp-software-bangladesh)

[See how Prime7 ERP goes live](/how-it-works)
`,
  },
  {
    slug: "avoid-lc-deadline-misses",
    title: "How to Avoid LC Deadline Misses in Garment Export",
    excerpt:
      "Practical ways to avoid missed LC shipment and expiry dates and document discrepancies in garment export: link LC dates to the production plan, prepare documents early and check them against the LC.",
    date: "February 12, 2026",
    updated: "November 13, 2026",
    readTime: "7 min read",
    category: "Commercial",
    keywords: "LC deadline, LC expiry, document discrepancy, garment export LC, latest shipment date",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## Why LC deadlines are missed

Most missed LC deadlines are not commercial mistakes. They start earlier: a late lab dip, fabric that arrives after the planned cutting date, a line that falls behind. By the time the commercial team sees the problem, the latest shipment date is days away. Avoiding misses means connecting the LC dates to the production plan and preparing documents before the goods are ready.

## The dates that matter

- Latest shipment date: goods must ship on or before this date.
- Expiry date: documents must be presented on or before this date.
- Presentation period: under UCP 600, documents must be presented within 21 calendar days after shipment unless the LC states another period, and never after expiry.
- Back-to-back LC dates: your suppliers' shipment and expiry dates decide when materials arrive.

## 1. Plan production backwards from the LC

When the export LC or contract arrives, compare its latest shipment date with the order's time and action plan. If the plan does not fit, ask the buyer for an amendment immediately, while there is still time, rather than in the last week.

## 2. Open back-to-back LCs on time

Material delays are a common cause of late shipments. Open BTB LCs as soon as the BOM is approved, with supplier shipment dates that leave enough time for inspection and cutting.

## 3. Watch a short list every day

Keep one list of LCs whose latest shipment date falls in the next 30 days, with the production status of each order. Review it daily in the last two weeks before shipment.

## 4. Prepare documents before shipment

Many discrepancies come from documents prepared in a hurry after shipment. Prepare draft commercial invoices, packing lists and certificate requests while the goods are still in finishing, using the order and LC data, then update the final quantities.

## 5. Check documents against the LC, line by line

Common discrepancies include:

- Goods description that differs from the LC wording.
- Amounts or quantities that do not match between invoice, packing list and transport document.
- Late shipment or late presentation.
- Missing documents or missing signatures.
- Wrong names or addresses of the parties.

A simple checklist per LC, ticked by a second person, prevents most of them.

## 6. Track amendments

Every amendment changes something: a date, a quantity, a price or a document. Record it against the LC, update the order and the BTB plan, and make sure the latest version is used for the documents.

## When a deadline cannot be met

- Ask the buyer for an amendment to the shipment and expiry dates as early as possible.
- If shipping late, agree in writing how the buyer and bank will treat the documents.
- Consider a partial shipment if the LC allows it.
- Record the cause, so the same problem is avoided on the next order.

## How Prime7 ERP helps

Prime7 ERP keeps master contracts and export LCs, proforma invoices, back-to-back LCs and commercial invoices in one commercial module linked to orders. The order's TNA plan and production output are in the same system, so the commercial team can see whether an order will be ready before its LC dates, and the LC performance view summarises contracts.

[Read the complete LC management guide](/resources/lc-management-guide-garment-export)

[See back-to-back LC management software](/back-to-back-lc-management-software)
`,
  },
  {
    slug: "excel-vs-erp-rmg-production-planning",
    title: "Excel vs ERP for RMG Production Planning",
    excerpt:
      "Excel or ERP for garment production planning? Where spreadsheets work, where they break down as orders and lines grow, a side-by-side comparison, and how to move planning into an ERP without disrupting the floor.",
    date: "February 15, 2026",
    updated: "November 13, 2026",
    readTime: "9 min read",
    category: "Manufacturing",
    keywords: "Excel vs ERP, ERP vs spreadsheet, production planning RMG, garment line planning software",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## Excel is where most planning starts

Almost every garment factory plans production in Excel at first, and for good reason: it is flexible, everyone knows it and it costs nothing extra. A planner can build a line loading sheet in an afternoon. The trouble starts when the number of orders, lines and changes grows faster than one person can keep the sheet correct.

## Where spreadsheets work well

- A small number of lines and styles.
- One planner who owns the file.
- Stable orders with few changes after confirmation.
- Planning that does not need live data from stores or the floor.

## Where spreadsheets break down

- Several copies: the planner, the production manager and merchandising each keep their own version.
- Manual updates: order changes, fabric arrival dates and daily output are typed in by hand, often a day late.
- No link to materials: the plan shows a style on a line, but not whether its fabric and trims are in the store.
- Hidden formulas: capacity and efficiency calculations break when rows are added, and nobody notices.
- No history: it is hard to see what the plan was last week and why it changed.
- Limited sharing: the floor sees a printout, not the current plan.

## Side-by-side comparison

- Orders and changes: in Excel they are copied in by hand; in an ERP the plan reads the confirmed order and its delivery date.
- Materials: in Excel they are checked by phone or a separate sheet; in an ERP fabric and trims status comes from purchasing and the store.
- Capacity: in Excel it depends on the planner's formulas; in an ERP it uses the factory calendar, line set-up and standard minutes.
- Actual output: in Excel it is typed in later; in an ERP hourly entries from the floor update progress during the day.
- Visibility: in Excel one person sees the latest version; in an ERP every authorised user sees the same plan.
- Audit trail: in Excel changes are invisible; in an ERP changes are recorded.

## What an ERP planning setup needs

1. A factory calendar with working days, holidays and shifts.
2. Lines with their operators and machines.
3. Standard minutes (SMV) per style from operation bulletins.
4. Confirmed orders with delivery dates and quantities.
5. Material availability from purchasing and the store.
6. Daily or hourly output recorded on the floor.

Without reliable SMV and output data, any planning tool will give poor answers, so these come first.

## Moving from Excel to ERP without disruption

- Keep the current spreadsheet for one or two weeks while the same orders are planned in the ERP, then compare.
- Start with output recording on the floor, because it improves every later report.
- Load the factory calendar and line set-up before the first plan.
- Agree who may change the plan, and how changes are approved.
- Switch off the spreadsheet on a fixed date.

## How Prime7 ERP supports production planning

Prime7 ERP has a factory calendar and production set-up, a line plan board, a planning screen with pipeline and what-if views, an operations library with operation bulletins and line balancing, and hourly output entry for cutting, sewing, ironing and finishing. Plans use the confirmed orders and BOMs from merchandising, and material status comes from purchasing and inventory.

[See Prime7 garment production management](/garment-production-management-software)

[Compare garment ERP with generic ERP and spreadsheets](/erp-comparison)
`,
  },
  {
    slug: "accurate-garment-costing-bangladesh",
    title: "Accurate Garment Costing in Bangladesh: A Practical Guide",
    excerpt:
      "How to build accurate cost sheets for garment export: fabric, trims, labor, overhead, and margin. Learn how Prime7 ERP supports costing with BOM and historical data.",
    date: "February 18, 2026",
    updated: "November 13, 2026",
    readTime: "10 min read",
    category: "Manufacturing",
    keywords:
      "garment costing Bangladesh, garment consumption calculation, cost sheet RMG, FOB costing, CM calculation, fabric consumption per dozen",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## Why accurate costing matters

A garment quotation is a promise: once the buyer accepts the price, every extra metre of fabric, every forgotten test fee and every slow production line comes out of the factory's margin. Accurate costing is not about one perfect spreadsheet. It is about using the same consumption, prices and efficiency assumptions from the quotation through to production, and then checking what really happened.

This guide walks through the parts of a garment cost sheet, the usual way to calculate fabric consumption and cost of making (CM), and how to compare pre-costing with post-costing.

## What a garment cost sheet should include

- Fabric: consumption per dozen multiplied by the fabric price, plus a wastage allowance.
- Trims and accessories: thread, labels, buttons, zippers, interlining, hangtags, poly bags and cartons, each with its own consumption and price.
- Value-added processes: washing, printing, embroidery or dyeing, whether done in-house or by a subcontractor.
- Cost of making (CM): the labour and factory overhead needed to cut, sew, finish and pack the garment.
- Commercial costs: testing and inspection fees, inland transport, bank and LC charges, and documentation costs.
- Commission: buying agent or buying house commission, if the order has one.
- Profit margin: added on top to reach the FOB price you quote.

## Calculating fabric consumption

### Knit garments (weight based)

Knit fabric is bought by weight, so consumption is usually worked out from the garment measurements and the fabric weight (GSM). A commonly used approximation for a basic T-shirt, with all measurements in centimetres, is:

Consumption per dozen (kg) = (body length + sleeve length + allowances) × (half chest + allowance) × 2 × GSM × 12 ÷ 10,000,000

Add the agreed wastage percentage for cutting loss and fabric faults. Different styles need different formulas, so many factories keep a formula per garment type and check it against a marker.

### Woven garments (length based)

Woven fabric is bought by length. The most reliable method is the CAD marker: divide the marker length by the number of garments in the marker, then add end loss and wastage. Without a marker, merchandisers estimate from pattern areas, then correct the figure once the production marker is ready.

### Use the size ratio

Consumption changes with size. Instead of costing only the base size, calculate consumption for each size and take a weighted average using the order's size ratio. A large XL share can change the fabric requirement noticeably.

## Calculating cost of making (CM)

CM depends on how many minutes the garment takes to make and what each minute of factory time costs.

- Standard minute value (SMV): the time an operator at standard pace needs to complete the garment, taken from the operation breakdown.
- Cost per minute (CPM): the factory's monthly labour and overhead cost divided by the productive minutes available in the month.
- Line efficiency: real lines do not run at 100%, so divide by the expected efficiency.

CM per garment = SMV × cost per minute ÷ expected efficiency

Example with sample numbers, not benchmarks: a garment with an SMV of 12 minutes, a cost per minute of 0.05 USD and an expected efficiency of 60% gives 12 × 0.05 ÷ 0.60 = 1.00 USD per garment, or 12.00 USD per dozen.

## Pre-costing and post-costing

Pre-costing is the quotation: planned consumption, planned prices and planned efficiency. Post-costing uses what really happened: fabric issued and returned, purchase prices actually paid, the real line efficiency and extra costs such as air freight. Comparing the two order by order shows where margins are lost and gives better numbers for the next quotation.

## Common costing mistakes

1. Using last season's fabric and trims prices without checking current supplier quotations.
2. Costing only the base size instead of the real size ratio.
3. Forgetting wastage, or using one wastage percentage for every material.
4. Leaving out testing, inspection and bank charges.
5. Using an efficiency the lines have never reached.
6. Mixing currencies without fixing the exchange rate used for the quotation.
7. Never comparing the quotation with actual consumption once the order is shipped.

## How Prime7 ERP supports garment costing

In Prime7 ERP, quotations hold costing lines for materials, CM and other costs, together with the size ratio. Each material line carries its consumption per dozen and wastage percentage. When an order is confirmed, its BOM and consumption plan hold the material quantities, and purchase orders can be generated from the BOM. Consumption reconciliation, the wastage report, process-loss standards, post-costing and the order profitability report then show how actual consumption and cost compare with the plan.

[See Prime7 garment costing and consumption software](/garment-costing-software)

[Read the consumption control guide](/resources/consumption-control-garments)
`,
  },
  {
    slug: "tna-calendar-guide-for-merchandisers",
    title: "TNA Calendar Guide for Merchandisers",
    excerpt:
      "How factory merchandisers build a TNA calendar: setting up templates with standard lead times, finding the critical milestones, keeping actual dates current and running a weekly TNA review that prevents late shipments.",
    date: "February 22, 2026",
    updated: "November 13, 2026",
    readTime: "8 min read",
    category: "Merchandising",
    keywords: "TNA calendar, time and action calendar garments, merchandising TNA template, TNA software",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## What a TNA calendar is for

A time and action (TNA) calendar lists every task an order needs before it ships, with a planned date and an owner. For a factory merchandiser it answers three questions every morning: what is due today, what is already late, and which late task puts the shipment date at risk. A good calendar is short, current and shared with everyone who has a task on it.

## Build templates, not one-off calendars

Most orders of the same product type follow the same steps. Create a template per product group or buyer, then apply it to each new order and adjust only what is different.

Each template line needs:

- Task name, such as lab dip approval or fabric in-house.
- The department or person responsible.
- A standard lead time, in days, measured back from the shipment date or forward from the order date.
- Whether the task depends on another task.

## A typical knit or woven order template

1. Order confirmation and costing approval.
2. Fit sample sent and approved.
3. Lab dip and strike-off sent and approved.
4. Fabric and trims booked, back-to-back LC opened.
5. Size-set sample approved.
6. Bulk fabric in-house and inspected.
7. PP sample approved and PP meeting held.
8. Cutting start.
9. Sewing input and sewing finish.
10. Washing or printing, if required.
11. Finishing and packing.
12. Final inspection.
13. Ex-factory and shipment.

Lead times depend on your factory and suppliers. Measure them from past orders instead of copying a generic template.

## Find the critical milestones

Some tasks have room to slip; others move the shipment date directly. In most orders the critical ones are fabric in-house, PP approval and sewing input. Mark them in the template so a delay on these lines is treated as urgent.

## Keep actual dates current

- Enter the actual date when a task is done, the same day.
- When a planned date moves, record the new date and a one-line reason.
- Do not overwrite the original plan; keeping it shows how much the order slipped and why.

## Run a weekly TNA review

Hold a short weekly meeting with merchandising, purchasing, production planning and quality:

1. Late critical milestones, order by order.
2. Critical milestones due in the next two weeks.
3. Decisions: recovery actions, buyer communication, revised dates.
4. Repeated causes, for example one supplier or one approval step.

## Common mistakes

- Templates with too many lines, so nobody updates them.
- Planned dates copied from the buyer's ship date without checking real lead times.
- Actual dates entered only when the buyer asks.
- Each merchandiser keeping a private calendar.

## How Prime7 ERP supports TNA calendars

Prime7 ERP has TNA templates that are applied to orders as TNA plans, a follow-up screen for planned and actual dates, and a TNA dashboard. Orders, samples, BOM and purchase orders sit in the same system, and the merchandising control tower and critical alerts highlight orders that need attention.

[See garment merchandising and order management](/garment-merchandising-software)

[Read T&A best practices for buying houses](/resources/buying-house-tna-workflow)
`,
  },
  {
    slug: "stock-valuation-accounting-integration",
    title: "Stock Valuation and Accounting Integration in Garment ERP",
    excerpt:
      "How stock movements become accounting entries in a garment business: goods received but not billed, issues to production, returns and adjustments, and a month-end reconciliation of the stock ledger with the general ledger.",
    date: "February 25, 2026",
    updated: "November 13, 2026",
    readTime: "9 min read",
    category: "Accounting",
    keywords: "inventory accounting entries, stock ledger vs general ledger, GRN not invoiced, garment ERP accounting",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## Two records of the same stock

Every garment company keeps two records of its stock: the stock ledger in the store (quantities and values by item) and the inventory accounts in the general ledger. They describe the same fabric and trims, so at month end they should agree. When stores and accounts work in separate systems, they rarely do, and the difference is usually written off without anyone knowing why. This guide shows the entries that keep the two in step. For valuation methods such as FIFO and weighted average, see the stock valuation guide linked below.

## The entries behind each movement

### Goods received

When fabric is received against a purchase order, stock increases before the supplier's bill arrives. A common approach is:

- Debit raw material inventory.
- Credit "goods received not invoiced" (GRNI), a temporary liability.

### Supplier bill matched

When the bill is checked against the purchase order and the receipt:

- Debit GRNI.
- Credit the supplier's account.

Any price difference between the receipt and the bill is booked as a price variance or adjusts the stock value, depending on your policy.

### Issue to production

When materials are issued to an order:

- Debit work in progress (or the order's production cost).
- Credit raw material inventory.

### Returns, adjustments and transfers

- Return to supplier: reverse the receipt entries for the returned quantity.
- Stock adjustment after a count: debit or credit an inventory adjustment expense, with approval.
- Transfer between stores of the same company: no profit or loss, but both stores' stock must move together.

### Finished goods and shipment

- Completion: debit finished goods, credit work in progress.
- Shipment: debit cost of sales, credit finished goods.

## Month-end reconciliation

1. Run the stock valuation report for the last day of the month.
2. Compare it with the inventory balances in the trial balance.
3. Review the GRNI balance: old items mean receipts without bills or bills posted without receipts.
4. Check adjustments and write-offs, and make sure each was approved.
5. Explain every difference before closing the period, then lock the period.

## Why differences appear

- Receipts entered in the store but bills posted directly to expense.
- Issues not recorded, or recorded against the wrong order.
- Manual journal entries to inventory accounts that bypass the stock ledger.
- Price differences between purchase order, receipt and bill.
- Backdated stock entries after the accounts were closed.

The best prevention is to let stock movements create the accounting entries automatically, and to block manual journals on inventory control accounts except for approved adjustments.

## How Prime7 ERP keeps stock and accounts in step

In Prime7 ERP, inventory movements post to accounting, vendor bills are created from goods receipts in the purchase-to-pay workflow, and posted vouchers can only be corrected by reversal. Stock reconciliation and stock-to-ledger reports help finance compare the two records at month end, and accounting periods can be locked once they agree.

[Read the stock valuation methods guide](/resources/stock-valuation-tally-style)

[See Prime7 garment accounting software](/garment-accounting-software)
`,
  },
  {
    slug: "consumption-control-approvals-in-garments",
    title: "Consumption Control Approvals in Garments: Workflow and Best Practices",
    excerpt:
      "How to approve extra fabric and trims in a garment factory without slowing production: when an approval is needed, who should approve, what evidence to ask for, and how to learn from every excess issue.",
    date: "March 1, 2026",
    updated: "November 13, 2026",
    readTime: "11 min read",
    category: "Manufacturing",
    keywords: "consumption control approvals, excess material approval, over issue approval garments, material control",
    author: ORGANIZATION_AUTHOR,
    authorRole: "Product and implementation team",
    content: `
## Why excess issues need an approval step

Every order's BOM says how much fabric and trims it should use. In practice, cutting asks for more: a shade problem, a marker change, damaged rolls, re-cutting after a quality issue. Some of these requests are justified; some hide poor planning or leakage. Without an approval step, extra material is simply issued and the cost appears only when the order is closed. With a well-designed approval step, the factory decides consciously, records the reason and learns from it.

## When an approval should be required

- Issue above the BOM quantity for the order, beyond a small tolerance.
- Receipt above the purchase order quantity.
- Receipt without a purchase order.
- Stock adjustments that reduce stock after a count.

Set tolerances by material type. A small tolerance on thread is reasonable; on main fabric it should be tight.

## Who should approve

- The person who requests should not be the person who approves.
- Small excesses can be approved by the production or store manager; large ones by the factory manager or merchandising head.
- The approver should be able to see the order's BOM, what has already been issued and the reason given.
- Keep the list of approvers short, so requests do not wait for days.

## What evidence to ask for

1. The order, style and colour affected.
2. The quantity already issued against the BOM.
3. The extra quantity requested and the reason (shade, defect, marker, re-cut, sample).
4. Where possible, proof: an inspection report for defective rolls, a revised marker for a marker change.
5. Who caused the excess, if it is a supplier problem, so a claim can be raised.

## Keep production moving

An approval step fails if cutting stops while waiting. Agree a response time, notify approvers immediately, and allow an emergency issue with approval recorded afterwards only for clearly defined cases.

## Learn from every excess

Review approved excesses monthly:

- Excess by reason: are shade problems growing?
- Excess by supplier: which supplier's fabric causes re-cutting?
- Excess by line or cutting table.
- Orders where actual consumption is far above the cost sheet: was the costing wrong or the process?

Feed the findings back into costing (wastage percentages), purchasing (supplier claims) and production (process changes).

## Measures worth watching

- Actual consumption versus BOM per order and per material.
- Number and value of excess issue approvals per month.
- Share of excess caused by supplier defects.
- Process loss against your process-loss standards.

## How Prime7 ERP supports consumption approvals

Prime7 ERP compares issues with each order's BOM through consumption control. Over-issues, over-receipts and receipts without a purchase order can be set to need approval from an admin, a manager or a user with the matching permission. Consumption reconciliation, the wastage report, process-loss standards and the process loss report show where material goes over plan.

[Read the consumption control guide](/resources/consumption-control-garments)

[See garment costing and consumption software](/garment-costing-software)
`,
  },
];

export function articleWordCount(article: ResourceArticle): number {
  return article.content.split(/\s+/).filter(Boolean).length;
}

/** Full guides only; short summaries are noindex and left out of the sitemap. */
export function isIndexableArticle(article: ResourceArticle): boolean {
  return articleWordCount(article) >= MIN_INDEXABLE_WORDS;
}

/** Reading time from the real length (about 200 words a minute). */
export function articleReadTime(article: ResourceArticle): string {
  return `${Math.max(1, Math.round(articleWordCount(article) / 200))} min read`;
}

export function getArticleBySlug(slug: string): ResourceArticle | undefined {
  return resourceArticles.find((a) => a.slug === slug);
}

export function getAllArticles(): ResourceArticle[] {
  return [...resourceArticles];
}

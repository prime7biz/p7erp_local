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
}

const STUB = (excerpt: string) =>
  `${excerpt}\n\n*Full article content is available on the Resources index.*`;

export const resourceArticles: ResourceArticle[] = [
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
    author: "Kamal Rahman",
    authorRole: "ERP Implementation Specialist, 12+ years in garment manufacturing",
    content: `
## Understanding Consumption Control in Garment Manufacturing

Consumption control is one of the most critical — and most frequently mismanaged — aspects of garment manufacturing. In an industry where raw materials can account for 60-70% of the total cost of goods, even a 2-3% variance between planned and actual consumption can translate to millions of taka in lost profits annually. For Bangladesh's RMG sector, which processes billions of dollars worth of orders each year, mastering consumption control isn't just about efficiency — it's about survival in an increasingly competitive global market.

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

Fabric is typically the single largest cost component in garment manufacturing, often representing 50-60% of the FOB price. Fabric wastage comes from multiple sources:

**Cutting waste** is inherent in the process. Marker efficiency — the percentage of fabric area actually used in cut pieces versus total fabric laid — typically ranges from 80-88% depending on the garment style.

**End-of-roll waste** occurs when fabric rolls don't perfectly match the required lay length. **Defect-related waste** happens when fabric quality issues force rejection of portions of the fabric. **Spreading waste** occurs during the laying process.

A well-managed factory targets total fabric wastage of 3-5% above the BOM allowance. Without systematic tracking, this figure can easily creep to 8-12%, silently eroding margins.

## How ERP Automates Consumption Calculation

Modern ERP systems like Prime7 transform consumption control from a manual, error-prone process into an automated, real-time discipline:

**Automatic BOM explosion**: When a production order is created, the system automatically calculates material requirements based on the BOM, order quantity, and configured wastage allowances — broken down by size and color.

**Real-time issue tracking**: Every material issue from the warehouse to the production floor is recorded with reference to the production order, department, and style.

**Variance alerts**: When actual consumption exceeds the BOM allowance by a configurable threshold, the system triggers alerts to the production manager and merchandiser.

**Consumption matrix**: Prime7 ERP handles the complexity of size-color matrices that make garment consumption unique. A single style might have 6 sizes × 4 colors = 24 SKUs, each with slightly different fabric consumption due to size grading.

## Benefits of Real-Time Consumption Tracking

1. **Reduced material costs**: Typical savings of 3-5% on raw material costs through better wastage control and more accurate procurement
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
    author: "Md. Faisal Ahmed",
    authorRole: "Senior Manufacturing Systems Analyst",
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
    author: "Sarah Chen",
    authorRole: "Supply Chain & Technology Consultant",
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
    author: "Priya Sharma",
    authorRole: "Digital Transformation Advisor, Apparel Industry",
    content: `
## The AI Revolution in Fashion and Apparel Manufacturing

Artificial intelligence is no longer a futuristic concept for the apparel industry — it is a present-day reality that is fundamentally reshaping how garments are designed, manufactured, and delivered. In 2026, AI adoption across the global fashion supply chain has accelerated beyond pilot projects into production-grade implementations that deliver measurable ROI.

For garment manufacturers and buying houses, the question is no longer "Should we adopt AI?" but "How quickly can we integrate AI into our operations before our competitors do?"

## AI-Powered Demand Forecasting

AI transforms demand forecasting by analyzing historical sales patterns, external data (weather, economic indicators, social media sentiment), and enabling real-time adjustment and granular SKU-level predictions. Manufacturers using AI-powered demand forecasting report 20-35% improvements in forecast accuracy.

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
      "Explore FIFO vs weighted average valuation, understand Tally-like voucher workflows (Draft→Approved→Posted), and learn how Prime7 ERP bridges inventory and accounting for garment manufacturers.",
    date: "January 18, 2026",
    readTime: "9 min read",
    category: "Accounting",
    keywords: "stock valuation, weighted average, Tally accounting, garment ERP accounting",
    author: "Kamal Rahman",
    authorRole: "ERP Implementation Specialist",
    content: STUB(
      "Explore FIFO vs weighted average valuation, understand Tally-like voucher workflows (Draft→Approved→Posted), and learn how Prime7 ERP bridges inventory and accounting for garment manufacturers.",
    ),
  },
  {
    slug: "wip-costing-rmg",
    title: "WIP Costing in RMG: From Cutting to Shipment",
    excerpt:
      "How work-in-progress costing works in garment manufacturing, how to track cost by stage (cutting, sewing, finishing), and how Prime7 ERP automates WIP valuation and transfer to finished goods.",
    date: "January 22, 2026",
    readTime: "10 min read",
    category: "Accounting",
    keywords: "WIP costing, work in progress RMG, garment costing stages",
    author: "Md. Faisal Ahmed",
    authorRole: "Senior Manufacturing Systems Analyst",
    content: STUB(
      "How work-in-progress costing works in garment manufacturing, how to track cost by stage (cutting, sewing, finishing), and how Prime7 ERP automates WIP valuation and transfer to finished goods.",
    ),
  },
  {
    slug: "buying-house-tna-workflow",
    title: "T&A Workflow for Buying Houses: Best Practices",
    excerpt:
      "Time & Action calendar best practices for buying houses: milestone tracking, factory coordination, and how Prime7 ERP streamlines T&A from order to shipment.",
    date: "January 28, 2026",
    readTime: "8 min read",
    category: "Buying House",
    keywords: "T&A workflow, buying house TNA, time and action calendar",
    author: "Sarah Chen",
    authorRole: "Supply Chain & Technology Consultant",
    content: STUB(
      "Time & Action calendar best practices for buying houses: milestone tracking, factory coordination, and how Prime7 ERP streamlines T&A from order to shipment.",
    ),
  },
  {
    slug: "po-sample-shipment-tracking",
    title: "PO and Sample Shipment Tracking for Buying Houses",
    excerpt:
      "Track POs and sample shipments across factories and buyers. How to maintain visibility and avoid delays with integrated PO and shipment tracking in Prime7 ERP.",
    date: "February 1, 2026",
    readTime: "7 min read",
    category: "Buying House",
    keywords: "PO tracking, sample shipment, buying house shipment",
    author: "Priya Sharma",
    authorRole: "Digital Transformation Advisor",
    content: STUB(
      "Track POs and sample shipments across factories and buyers. How to maintain visibility and avoid delays with integrated PO and shipment tracking in Prime7 ERP.",
    ),
  },
  {
    slug: "multi-currency-erp-exporters",
    title: "Multi-Currency ERP for Garment Exporters",
    excerpt:
      "Why multi-currency support is essential for garment exporters, how to handle USD/BDT/EUR and exchange rate gains and losses, and how Prime7 ERP manages multi-currency ledgers.",
    date: "February 5, 2026",
    readTime: "8 min read",
    category: "Commercial",
    keywords: "multi-currency ERP, garment export currency, forex in ERP",
    author: "Kamal Rahman",
    authorRole: "ERP Implementation Specialist",
    content: STUB(
      "Why multi-currency support is essential for garment exporters, how to handle USD/BDT/EUR and exchange rate gains and losses, and how Prime7 ERP manages multi-currency ledgers.",
    ),
  },
  {
    slug: "lc-management-guide-garment-export",
    title: "Complete Guide to LC Management in Garment Export",
    excerpt:
      "A comprehensive guide to Letter of Credit management for garment exporters — covering LC types, documentation requirements, common mistakes, back-to-back LCs, amendment handling, and how ERP systems streamline the entire process.",
    date: "January 20, 2026",
    readTime: "11 min read",
    category: "Commercial",
    keywords:
      "LC management garment export, letter of credit garment industry, LC documentation apparel, export LC processing",
    author: "Kamal Rahman",
    authorRole: "ERP Implementation Specialist, 12+ years in garment manufacturing",
    content: STUB(
      "A comprehensive guide to Letter of Credit management for garment exporters — covering LC types, documentation requirements, common mistakes, back-to-back LCs, amendment handling, and how ERP systems streamline the entire process.",
    ),
  },
  {
    slug: "choosing-erp-buying-house",
    title: "How to Choose the Right ERP for Your Buying House",
    excerpt:
      "A practical guide for buying houses evaluating ERP systems — covering essential features like T&A management, PO tracking, and sample workflows, key questions to ask vendors, red flags to watch for, and realistic ROI expectations.",
    date: "February 3, 2026",
    readTime: "9 min read",
    category: "Buying House",
    keywords:
      "buying house ERP selection, garment buying house software, merchandising software selection, buying office ERP",
    author: "Md. Faisal Ahmed",
    authorRole: "Senior Manufacturing Systems Analyst",
    content: STUB(
      "A practical guide for buying houses evaluating ERP systems — covering essential features like T&A management, PO tracking, and sample workflows, key questions to ask vendors, red flags to watch for, and realistic ROI expectations.",
    ),
  },
  {
    slug: "digital-transformation-fashion-supply-chain",
    title: "Digital Transformation in the Fashion Supply Chain",
    excerpt:
      "How digitization is changing the fashion and garment supply chain: from design to delivery, and how ERP forms the backbone of a connected, data-driven operation.",
    date: "February 8, 2026",
    readTime: "8 min read",
    category: "Industry",
    keywords: "digital transformation fashion, supply chain digitization, garment ERP",
    author: "Priya Sharma",
    authorRole: "Digital Transformation Advisor",
    content: STUB(
      "How digitization is changing the fashion and garment supply chain: from design to delivery, and how ERP forms the backbone of a connected, data-driven operation.",
    ),
  },
  {
    slug: "avoid-lc-deadline-misses",
    title: "How to Avoid LC Deadline Misses in Garment Export",
    excerpt:
      "Practical strategies to prevent LC expiry and document discrepancy: T&A alignment, document preparation workflows, and how Prime7 ERP keeps you on track.",
    date: "February 12, 2026",
    readTime: "7 min read",
    category: "Commercial",
    keywords: "LC deadline, document discrepancy, garment export LC",
    author: "Kamal Rahman",
    authorRole: "ERP Implementation Specialist",
    content: STUB(
      "Practical strategies to prevent LC expiry and document discrepancy: T&A alignment, document preparation workflows, and how Prime7 ERP keeps you on track.",
    ),
  },
  {
    slug: "excel-vs-erp-rmg-production-planning",
    title: "Excel vs ERP for RMG Production Planning",
    excerpt:
      "Why spreadsheets fall short for production planning at scale. Compare Excel-based planning with ERP-driven planning and see how Prime7 ERP improves accuracy and visibility.",
    date: "February 15, 2026",
    readTime: "9 min read",
    category: "Manufacturing",
    keywords: "Excel vs ERP, production planning RMG, garment planning",
    author: "Md. Faisal Ahmed",
    authorRole: "Senior Manufacturing Systems Analyst",
    content: STUB(
      "Why spreadsheets fall short for production planning at scale. Compare Excel-based planning with ERP-driven planning and see how Prime7 ERP improves accuracy and visibility.",
    ),
  },
  {
    slug: "accurate-garment-costing-bangladesh",
    title: "Accurate Garment Costing in Bangladesh: A Practical Guide",
    excerpt:
      "How to build accurate cost sheets for garment export: fabric, trims, labor, overhead, and margin. Learn how Prime7 ERP supports costing with BOM and historical data.",
    date: "February 18, 2026",
    readTime: "10 min read",
    category: "Manufacturing",
    keywords: "garment costing Bangladesh, cost sheet RMG, FOB costing",
    author: "Sarah Chen",
    authorRole: "Supply Chain & Technology Consultant",
    content: STUB(
      "How to build accurate cost sheets for garment export: fabric, trims, labor, overhead, and margin. Learn how Prime7 ERP supports costing with BOM and historical data.",
    ),
  },
  {
    slug: "tna-calendar-guide-for-merchandisers",
    title: "TNA Calendar Guide for Merchandisers",
    excerpt:
      "Build and maintain Time & Action calendars that keep orders on track. Best practices for merchandisers and how Prime7 ERP automates TNA tracking.",
    date: "February 22, 2026",
    readTime: "8 min read",
    category: "Merchandising",
    keywords: "TNA calendar, merchandising T&A, time and action",
    author: "Priya Sharma",
    authorRole: "Digital Transformation Advisor",
    content: STUB(
      "Build and maintain Time & Action calendars that keep orders on track. Best practices for merchandisers and how Prime7 ERP automates TNA tracking.",
    ),
  },
  {
    slug: "stock-valuation-accounting-integration",
    title: "Stock Valuation and Accounting Integration in Garment ERP",
    excerpt:
      "How inventory valuation flows into the general ledger: journal entries, period-end closing, and how Prime7 ERP keeps inventory and accounting in sync.",
    date: "February 25, 2026",
    readTime: "9 min read",
    category: "Accounting",
    keywords: "stock valuation accounting, inventory GL, garment ERP accounting",
    author: "Kamal Rahman",
    authorRole: "ERP Implementation Specialist",
    content: STUB(
      "How inventory valuation flows into the general ledger: journal entries, period-end closing, and how Prime7 ERP keeps inventory and accounting in sync.",
    ),
  },
  {
    slug: "consumption-control-approvals-in-garments",
    title: "Consumption Control Approvals in Garments: Workflow and Best Practices",
    excerpt:
      "Excess material approval workflows, variance tracking, and how Prime7 ERP enables structured consumption control with multi-level approvals and real-time dashboards.",
    date: "March 1, 2026",
    readTime: "11 min read",
    category: "Manufacturing",
    keywords: "consumption control approvals, excess material approval, garment ERP consumption",
    author: "Sarah Chen",
    authorRole: "Manufacturing Technology Analyst",
    content: STUB(
      "Excess material approval workflows, variance tracking, and how Prime7 ERP enables structured consumption control with multi-level approvals and real-time dashboards.",
    ),
  },
];

export function getArticleBySlug(slug: string): ResourceArticle | undefined {
  return resourceArticles.find((a) => a.slug === slug);
}

export function getAllArticles(): ResourceArticle[] {
  return [...resourceArticles];
}

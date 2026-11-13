/**
 * Text for the public solution pages listed in src/config/solutionPages.ts.
 *
 * Only describe what Prime7 ERP really does today (check the app menu or backend module before adding
 * a claim). Features that are switched on per company are described that way. No customer names,
 * numbers of customers, ratings or certifications.
 */

export interface SolutionFeature {
  title: string;
  text: string;
  points: string[];
}

export interface SolutionPageContent {
  path: string;
  eyebrow: string;
  h1: string;
  /** Opening paragraph(s) under the H1; the first sentence states what the page is about. */
  intro: string[];
  challengesHeading: string;
  challenges: { title: string; text: string }[];
  featuresHeading: string;
  features: SolutionFeature[];
  workflowHeading: string;
  workflow: string[];
  faqs: { q: string; a: string }[];
  /** Other public pages that continue the topic (internal links). */
  related: { to: string; label: string; text: string }[];
}

export const SOLUTION_PAGE_CONTENT: readonly SolutionPageContent[] = [
  {
    path: "/erp-bangladesh",
    eyebrow: "Built for Bangladesh RMG",
    h1: "Garments ERP Software for Bangladesh RMG Factories and Buying Houses",
    intro: [
      "Prime7 ERP is a cloud garments ERP built for Bangladesh's ready-made garment industry. It connects merchandising, costing, purchasing, production, export and back-to-back LC records, accounts in BDT and foreign currency, and HR and payroll set up for Bangladesh labour rules.",
      "Factories and buying houses in Dhaka, Gazipur, Narayanganj and Chattogram can work from one set of numbers instead of separate spreadsheets for each department.",
    ],
    challengesHeading: "What Bangladesh garment exporters need from an ERP",
    challenges: [
      {
        title: "An LC chain that adds up",
        text: "Export LCs or sales contracts, proforma invoices, back-to-back LCs and the Utilization Declaration all have to agree. Checking them across spreadsheets is slow and error-prone.",
      },
      {
        title: "USD sales, BDT costs",
        text: "Export sales are billed in US dollars while wages, utilities and many purchases are paid in taka. Accounts need both without manual conversions.",
      },
      {
        title: "Bangladesh labour rules",
        text: "Wage grades, overtime, leave, attendance and payroll registers must follow the Bangladesh Labour Act and the RMG minimum wage.",
      },
      {
        title: "Accountants used to Tally",
        text: "Accounts teams expect fast voucher entry, ledger-wise reports and familiar statements, not a generic ERP screen.",
      },
    ],
    featuresHeading: "How Prime7 ERP supports Bangladesh garment businesses",
    features: [
      {
        title: "Export and back-to-back LC records",
        text: "The commercial module keeps the whole export chain in one place.",
        points: [
          "Master contracts and export LCs with proforma invoices linked to orders",
          "Back-to-back LCs linked to the master contract, with utilization percentage and an opening limit",
          "Commercial invoices, export cases and an LC performance view",
          "Bond, UD and Mushak registers for the records your team maintains",
        ],
      },
      {
        title: "Accounts in BDT and foreign currency",
        text: "Double-entry accounting designed for teams moving from Tally.",
        points: [
          "Vouchers with approval queues and accounting period locks",
          "Multi-currency, foreign currency receipts and bank reconciliation",
          "Day book, trial balance, financial statements, cash flow and AR/AP ageing",
          "TDS settings and reports",
        ],
      },
      {
        title: "HR and payroll for Bangladesh",
        text: "Employee records, attendance and payroll with Bangladesh rules available as company settings.",
        points: [
          "Bangladesh RMG rule set with the 2023 minimum wage grades",
          "Attendance from ZKTeco devices, file import or manual entry",
          "Overtime, allowances, bonuses, salary registers and final settlement",
          "Employee self-service for leave, attendance and payslips, with Bangla text",
        ],
      },
      {
        title: "Merchandising and production in the same system",
        text: "The commercial and finance records connect to the orders and the factory floor.",
        points: [
          "Styles, quotations with costing, orders, BOM and TNA follow-up",
          "Line planning, hourly cutting, sewing and finishing output, and shop-floor QC",
          "Purchase orders, goods receiving and stock by store",
        ],
      },
    ],
    workflowHeading: "From buyer inquiry to export proceeds",
    workflow: [
      "Record the buyer inquiry and prepare the quotation cost sheet",
      "Confirm the order and build its BOM and consumption plan",
      "Record the export LC or sales contract and open back-to-back LCs for materials",
      "Receive and inspect fabric and trims against purchase orders",
      "Plan lines and record hourly cutting, sewing and finishing output",
      "Inspect, pack and deliver with delivery challans and gate passes",
      "Prepare the commercial invoice, present documents and record realization in accounts",
    ],
    faqs: [
      {
        q: "Is Prime7 ERP made for Bangladesh garment factories?",
        a: "Yes. Prime7 ERP was built for RMG factories and buying houses in Bangladesh, with BDT and multi-currency accounts, export and back-to-back LC records, and Bangladesh HR and payroll settings. Exporters in other countries can use it with their own currency.",
      },
      {
        q: "Does Prime7 ERP handle back-to-back LCs?",
        a: "Yes. Back-to-back LCs are linked to the master contract or export LC they are opened against. Each contract shows how much has been used by BTB LCs, and the system blocks a new BTB LC that would go above the opening limit.",
      },
      {
        q: "Does Prime7 ERP file e-UD or customs returns?",
        a: "No. Prime7 ERP keeps bond, UD and Mushak registers and the order, purchase and shipment records your team needs, but filing with BGMEA, BKMEA, customs or NBR is still done in their own systems.",
      },
      {
        q: "Can we move from Excel and Tally?",
        a: "Yes. Customers, vendors and items can be imported from CSV files, a standard chart of accounts is set up for you, and the implementation team helps move opening balances and other data from Excel and Tally.",
      },
      {
        q: "Is the software available in Bangla?",
        a: "Screens used on the factory floor, such as the scan station and hourly production entry, and employee self-service for leave, attendance and payslips have Bangla text. The rest of the system is in English.",
      },
    ],
    related: [
      { to: "/garments-erp", label: "Garment manufacturing ERP", text: "The full module overview for RMG factories." },
      { to: "/back-to-back-lc-management-software", label: "Back-to-back LC management", text: "Master contracts, BTB LCs and commercial invoices." },
      { to: "/garment-accounting-software", label: "Accounts and finance", text: "Vouchers, period locks and Tally-style reports." },
      { to: "/resources/how-to-choose-garments-erp-software-bangladesh", label: "How to choose garments ERP software", text: "A buyer's checklist for Bangladesh factories." },
    ],
  },
  {
    path: "/garment-merchandising-software",
    eyebrow: "Merchandising and order management",
    h1: "Garment Merchandising and Order Management Software",
    intro: [
      "Prime7 ERP gives garment merchandisers one place to manage buyers, inquiries, quotations, styles, samples, orders and TNA follow-up, from the first inquiry until the order ships.",
      "Because purchasing, production and commercial teams work in the same system, a change to an order is visible to everyone who depends on it.",
    ],
    challengesHeading: "Why merchandising slips when it runs on email and Excel",
    challenges: [
      { title: "Orders spread across files", text: "Each merchandiser keeps their own order sheets, so managers cannot see the full order book or who is late." },
      { title: "TNA dates missed silently", text: "Time and action plans in spreadsheets do not warn anyone when a sample, approval or material date slips." },
      { title: "Changes that do not travel", text: "When a buyer changes quantity or delivery, purchasing and production often hear about it too late." },
      { title: "No view of profit per order", text: "Without one record per order it is hard to compare the quoted margin with what the order really earned." },
    ],
    featuresHeading: "Merchandising features in Prime7 ERP",
    features: [
      {
        title: "Buyers, inquiries and quotations",
        text: "Capture every inquiry and turn it into a costed quotation.",
        points: [
          "Customer records with contacts and linked orders",
          "Quotations created from inquiries and linked to them",
          "Quotations with costing lines for materials, CM and other costs",
        ],
      },
      {
        title: "Styles and samples",
        text: "Keep the style library and the sampling work behind each order.",
        points: ["Garment style records", "Sample development and sample requests", "Parties for buyers, suppliers and agents"],
      },
      {
        title: "Orders, BOM and purchasing",
        text: "A confirmed order becomes the source for materials and purchasing.",
        points: [
          "Orders with style, quantity and delivery date",
          "Order BOM and consumption plans",
          "Purchase orders generated from the BOM",
          "Document flow that shows the records linked to an order",
        ],
      },
      {
        title: "TNA follow-up and control tower",
        text: "See which orders need attention before a date is missed.",
        points: [
          "TNA templates, TNA plans and follow-up dashboard",
          "Merchandising control tower, order pipeline and pipeline analytics",
          "Critical alerts, wastage report and order profitability",
        ],
      },
    ],
    workflowHeading: "The merchandising workflow in Prime7 ERP",
    workflow: [
      "Record the buyer inquiry",
      "Prepare and send the quotation with its cost sheet",
      "Develop and approve samples",
      "Confirm the order and create the TNA plan",
      "Build the BOM and generate purchase orders",
      "Follow TNA milestones until production and shipment",
    ],
    faqs: [
      { q: "What is garment merchandising software?", a: "It is software that manages the merchandiser's work on each order: buyer inquiries, costing, samples, order confirmation, materials and the time and action plan until shipment. In Prime7 ERP this is part of the same ERP that runs purchasing, production, commercial and accounts." },
      { q: "Does Prime7 ERP include a TNA calendar?", a: "Yes. You can create TNA templates, apply them to orders as TNA plans and follow milestones from the follow-up dashboard." },
      { q: "Can buyers see their order status?", a: "Yes, if your company switches on the customer portal. Invited buyers can sign in to see their orders, approvals and shipments, and only their own records." },
      { q: "Is it suitable for buying houses?", a: "Yes. Buying houses use the same merchandising, TNA and commercial features to follow orders placed with their factories. See the buying house ERP page for details." },
    ],
    related: [
      { to: "/garment-costing-software", label: "Costing and consumption", text: "Cost sheets, consumption and wastage." },
      { to: "/buying-house-erp", label: "Buying house ERP", text: "Order follow-up for sourcing offices." },
      { to: "/garment-production-management-software", label: "Production management", text: "Line planning and hourly output." },
      { to: "/resources/tna-calendar-guide-for-merchandisers", label: "TNA calendar guide", text: "How merchandisers use time and action plans." },
    ],
  },
  {
    path: "/garment-production-management-software",
    eyebrow: "Production management",
    h1: "Garment Production Management Software for Cutting, Sewing and Finishing",
    intro: [
      "Prime7 ERP helps garment factories plan sewing lines, balance operations, record hourly output for cutting, sewing, ironing and finishing, and track quality on the floor.",
      "Managers see line output during the day instead of waiting for evening reports, and planning uses the same orders and BOMs as merchandising.",
    ],
    challengesHeading: "Common production management problems in garment factories",
    challenges: [
      { title: "Output known too late", text: "When hourly production is written on paper and typed in at night, problems on a line are found after the day is lost." },
      { title: "Line plans in spreadsheets", text: "Line loading and changeovers are hard to plan when orders, capacity and calendars live in different files." },
      { title: "Unbalanced lines", text: "Without operation bulletins and SMV, it is hard to see bottleneck operations or set realistic targets." },
      { title: "Quality data on paper", text: "Defects and inspections recorded on paper are difficult to analyse by line, style or buyer." },
    ],
    featuresHeading: "Production management features",
    features: [
      {
        title: "Planning",
        text: "Plan work against real capacity and the factory calendar.",
        points: ["Manufacturing orders", "Factory calendar and production setup", "Line plan board", "Production planning with pipeline and what-if views"],
      },
      {
        title: "Industrial engineering",
        text: "Standard minutes and line balance for every style.",
        points: ["Operations library", "Operation bulletins with SMV", "Line balancing", "IE and efficiency reports"],
      },
      {
        title: "Shop floor",
        text: "Record work where it happens.",
        points: [
          "Cutting and cutting pipeline",
          "Scan station and hourly entry for cutting, sewing, iron and finishing",
          "Daily crew sheet and weekly crew roster",
          "Finishing and packing",
        ],
      },
      {
        title: "Quality and optional units",
        text: "Quality checks and the extra processes some factories run in-house.",
        points: [
          "Shop-floor QC, inspections, lab tests, CAPA and returns",
          "Optional knitting, dyeing, printing, AOP, embroidery, elastic and washing units with hourly entry",
          "Cost and CM view for production",
        ],
      },
    ],
    workflowHeading: "From confirmed order to packed cartons",
    workflow: [
      "Take the confirmed order and its BOM from merchandising",
      "Prepare the operation bulletin and balance the line",
      "Load the order on the line plan board",
      "Cut and record cutting output",
      "Record sewing output by line and hour",
      "Iron, finish and pack with hourly entry",
      "Inspect and hand over for delivery",
    ],
    faqs: [
      { q: "Can operators or supervisors record hourly production?", a: "Yes. Hourly entry screens exist for cutting, sewing, ironing and finishing, plus a scan station. The floor screens have Bangla text." },
      { q: "Does Prime7 ERP support line balancing?", a: "Yes. The IE section has an operations library, operation bulletins with standard minutes and a line balancing tool." },
      { q: "We also knit, dye or print. Is that covered?", a: "Knitting, dyeing, printing, AOP, embroidery, elastic and washing are optional units that a factory can switch on, each with its own hourly entry." },
      { q: "How is production linked to the rest of the ERP?", a: "Production uses the orders and BOMs from merchandising, materials come from inventory, and finished goods leave through delivery challans and gate passes." },
    ],
    related: [
      { to: "/garment-inventory-management-software", label: "Inventory and warehouse", text: "Materials issued to the floor." },
      { to: "/garment-merchandising-software", label: "Merchandising and orders", text: "Where production orders come from." },
      { to: "/garments-erp", label: "Garment manufacturing ERP", text: "All modules for RMG factories." },
      { to: "/resources/excel-vs-erp-rmg-production-planning", label: "Excel vs ERP for production planning", text: "Why spreadsheets fall short at scale." },
    ],
  },
  {
    path: "/garment-inventory-management-software",
    eyebrow: "Inventory and warehouse",
    h1: "Garment Inventory and Warehouse Management Software",
    intro: [
      "Prime7 ERP tracks fabric, trims, accessories and finished goods by store, from purchase order and goods receiving to issue, transfer and delivery, with stock valued on FIFO by default.",
      "Stores, purchasing, production and accounts see the same stock figures, and issues can be checked against each order's BOM.",
    ],
    challengesHeading: "Where garment inventory control usually breaks down",
    challenges: [
      { title: "Stock nobody trusts", text: "When stores keep their own registers, physical stock, system stock and accounts rarely agree." },
      { title: "Materials issued above plan", text: "Without a link to the BOM, extra fabric and trims are issued without anyone noticing until the order is costed." },
      { title: "Slow receiving and inspection", text: "Fabric that waits for inspection delays cutting, and rejected lots are hard to trace back to the supplier." },
      { title: "Leftover and slow-moving stock", text: "Old stock ties up cash when nobody can see its age or value." },
    ],
    featuresHeading: "Inventory and warehouse features",
    features: [
      {
        title: "Masters and procurement",
        text: "Organise items and buy against real requirements.",
        points: [
          "Stock groups, item hierarchy and store (godown) stock",
          "Requisitions with comparative statements",
          "Purchase orders, with a colour and size grid where needed",
          "Vendor records and vendor scorecard",
        ],
      },
      {
        title: "Receiving and quality",
        text: "Receive and inspect materials before they reach the floor.",
        points: ["Goods receiving (GRN)", "GRN inspection and quality dashboard", "Process orders", "Lot traceability and certificates"],
      },
      {
        title: "Stock control",
        text: "Keep movements controlled and explained.",
        points: [
          "Store transfers, batch transfers and inter-department transfers",
          "Stock adjustments, cycle counts and reconciliation",
          "Consumption control against the BOM, with approvals for over-issue",
          "Serial tracking, kit builder and consignment stock",
        ],
      },
      {
        title: "Planning, valuation and outbound",
        text: "Know what to buy, what stock is worth and what has left the factory.",
        points: [
          "MRP run, reorder suggestions, ABC analysis, EOQ and stock ageing",
          "FIFO inventory summary, stock ledger and stock valuation linked to accounts",
          "Delivery challans and gate passes with QR codes that can be checked online",
        ],
      },
    ],
    workflowHeading: "Material flow in Prime7 ERP",
    workflow: [
      "Raise a requisition or generate purchase orders from the order BOM",
      "Receive goods against the purchase order and inspect them",
      "Store materials by store and lot",
      "Issue materials to production against the order",
      "Transfer, adjust or count stock with approvals",
      "Deliver finished goods with a delivery challan and gate pass",
    ],
    faqs: [
      { q: "Which stock valuation method does Prime7 ERP use?", a: "FIFO by default. Stock valuation can also be shown on LIFO, average or standard cost. Stock movements are linked to accounting so the stock value in accounts follows the stock ledger." },
      { q: "Can we manage several stores or warehouses?", a: "Yes. Stock is kept by store (godown), and you can transfer between stores and departments." },
      { q: "Can issues above the BOM quantity be stopped?", a: "Consumption control compares issues with the order's BOM. Over-issues, over-receipts and receipts without a purchase order can be set to need approval from an authorised person." },
      { q: "Can someone check that a printed gate pass is genuine?", a: "Yes. Printed delivery challans, gate passes and other inventory documents carry a QR code that opens a verification page." },
    ],
    related: [
      { to: "/garment-costing-software", label: "Costing and consumption", text: "Planned versus actual consumption." },
      { to: "/garment-production-management-software", label: "Production management", text: "Where materials are used." },
      { to: "/garment-accounting-software", label: "Accounts and finance", text: "Stock value in the books." },
      { to: "/resources/consumption-control-garments", label: "Consumption control guide", text: "Reduce fabric and trims wastage." },
    ],
  },
  {
    path: "/back-to-back-lc-management-software",
    eyebrow: "Commercial and LC management",
    h1: "Back-to-Back LC and Commercial Management Software for Garment Exporters",
    intro: [
      "Prime7 ERP keeps the garment export chain in one commercial module: master contracts and export LCs, proforma invoices, back-to-back LCs, commercial invoices and the registers your commercial team maintains.",
      "Each master contract shows how much of its value has been used by back-to-back LCs, so the team can open new BTB LCs within the limit.",
    ],
    challengesHeading: "Commercial management problems the system is built to prevent",
    challenges: [
      { title: "BTB capacity tracked by hand", text: "Working out how much BTB value is left on a contract from bank letters and spreadsheets invites mistakes." },
      { title: "Documents that do not match", text: "Retyped invoice and packing list figures cause discrepancies and delayed payment." },
      { title: "Dates spread across files", text: "Shipment, expiry and maturity dates for many LCs are hard to follow without one list." },
      { title: "Commercial and accounts apart", text: "When LC data never reaches finance, BTB payments and export proceeds surprise the cash plan." },
    ],
    featuresHeading: "Commercial and LC features",
    features: [
      {
        title: "Master contracts and export LCs",
        text: "One record for each buyer contract or export LC.",
        points: ["Master contracts and export cases", "Proforma invoices linked to orders", "LC performance view across contracts"],
      },
      {
        title: "Back-to-back LCs",
        text: "Open and follow BTB LCs against the right contract.",
        points: [
          "BTB LCs linked to their master contract",
          "Utilization amount and percentage per contract, with warning bands",
          "An opening limit that blocks a BTB LC above the allowed share of the contract",
        ],
      },
      {
        title: "Invoices, commission and logistics",
        text: "Shipping documents and the costs around them.",
        points: ["Commercial invoices", "Commission records", "Logistics records for shipments"],
      },
      {
        title: "Registers and finance",
        text: "Compliance records and the link to accounts.",
        points: [
          "Bond, UD and Mushak registers (records, not e-filing)",
          "Foreign currency receipts in finance",
          "Bank facility records alongside accounts",
        ],
      },
    ],
    workflowHeading: "The export LC chain step by step",
    workflow: [
      "Record the export LC or master sales contract",
      "Link the orders and proforma invoices it covers",
      "Open back-to-back LCs for fabric and trims within the limit",
      "Receive materials against purchase orders",
      "Prepare commercial invoices from shipped quantities",
      "Record document submission, acceptance and realization",
    ],
    faqs: [
      { q: "What is a back-to-back LC?", a: "A back-to-back LC is opened by the exporter's bank in favour of a raw material supplier, using the buyer's export LC or sales contract as security. It lets a garment factory import fabric and trims for an export order." },
      { q: "How does Prime7 ERP stop us from opening too much BTB value?", a: "Each master contract keeps its BTB utilization amount and percentage. When a new BTB LC would take utilization above the opening limit, the system refuses it and shows the maximum allowed." },
      { q: "Does Prime7 ERP submit e-UD or customs data?", a: "No. It keeps bond, UD and Mushak registers and the supporting records, but submission to BGMEA, BKMEA, customs or NBR happens in their own systems." },
      { q: "Do buying houses use the commercial module?", a: "Yes. Buying houses use proforma invoices, LCs and commission records to follow the orders they place with factories." },
    ],
    related: [
      { to: "/resources/lc-management-guide-garment-export", label: "LC management guide", text: "Documents, dates and common mistakes." },
      { to: "/garment-accounting-software", label: "Accounts and finance", text: "BTB obligations and export proceeds." },
      { to: "/erp-bangladesh", label: "Garments ERP Bangladesh", text: "Built for Bangladesh exporters." },
      { to: "/buying-house-erp", label: "Buying house ERP", text: "Commercial work for sourcing offices." },
    ],
  },
  {
    path: "/garment-costing-software",
    eyebrow: "Costing and consumption",
    h1: "Garment Costing and Consumption Software",
    intro: [
      "Prime7 ERP lets merchandisers build garment cost sheets with consumption per dozen, wastage, CM and other costs, then carries the same figures into the order BOM, purchasing and post-order checks.",
      "Planned and actual consumption can be compared order by order, so the next quotation starts from real numbers.",
    ],
    challengesHeading: "Why garment costing goes wrong",
    challenges: [
      { title: "Cost sheets on separate files", text: "Each merchandiser's spreadsheet uses different formulas, prices and wastage, so costs are hard to compare or review." },
      { title: "Costing and purchasing disconnected", text: "Purchase quantities are worked out again from scratch instead of from the approved cost sheet." },
      { title: "Wastage found after shipment", text: "Excess consumption is discovered only when the order is closed, too late to act." },
      { title: "No post-costing", text: "Without comparing actual cost with the quotation, the same mistakes repeat in the next order." },
    ],
    featuresHeading: "Costing and consumption features",
    features: [
      {
        title: "Quotation cost sheets",
        text: "Price an order before you accept it.",
        points: [
          "Costing lines for materials, CM and other costs",
          "Consumption per dozen and wastage percentage for each material",
          "Size ratio on the quotation",
        ],
      },
      {
        title: "BOM and consumption plans",
        text: "Turn the approved costing into material requirements.",
        points: [
          "BOM builder and order consumption plans",
          "BOM approval and freeze, with controlled price overrides",
          "Purchase orders generated from the BOM",
        ],
      },
      {
        title: "Consumption control",
        text: "Watch materials while the order is running.",
        points: ["Consumption reconciliation", "Wastage report", "Process-loss standards and process loss report"],
      },
      {
        title: "Post-costing and profitability",
        text: "Learn from every shipped order.",
        points: ["Post-costing", "Costing variance", "Order profitability", "Production cost and CM view"],
      },
    ],
    workflowHeading: "From cost sheet to post-costing",
    workflow: [
      "Build the quotation cost sheet with consumption, wastage, CM and other costs",
      "Agree the price with the buyer and confirm the order",
      "Approve and freeze the order BOM",
      "Generate purchase orders from the BOM",
      "Issue materials and reconcile consumption against the BOM",
      "Review post-costing and order profitability after shipment",
    ],
    faqs: [
      { q: "Does Prime7 ERP calculate fabric consumption for me?", a: "Merchandisers enter consumption per dozen and wastage for each material on the cost sheet and BOM, using their own formula or marker. Prime7 ERP then multiplies these by order quantities for purchasing and compares them with actual issues." },
      { q: "Can we stop people changing BOM prices?", a: "Yes. BOMs can be approved and frozen, and price overrides can be limited to people with the right permission." },
      { q: "Can we compare quoted and actual cost?", a: "Yes. Consumption reconciliation, the wastage report, post-costing, costing variance and order profitability compare planned figures with what really happened." },
      { q: "Where can I learn the costing formulas?", a: "Our garment costing guide explains cost sheet parts, consumption for knit and woven garments, and how CM is calculated from SMV and cost per minute." },
    ],
    related: [
      { to: "/resources/accurate-garment-costing-bangladesh", label: "Garment costing guide", text: "Cost sheets, consumption and CM explained." },
      { to: "/garment-merchandising-software", label: "Merchandising and orders", text: "Where quotations and orders live." },
      { to: "/garment-inventory-management-software", label: "Inventory and warehouse", text: "Issues checked against the BOM." },
      { to: "/resources/consumption-control-garments", label: "Consumption control guide", text: "Track BOM versus actual." },
    ],
  },
  {
    path: "/garment-accounting-software",
    eyebrow: "Accounts and financial management",
    h1: "Accounting and Financial Management Software for Garment Companies",
    intro: [
      "Prime7 ERP includes double-entry accounting built for garment factories and buying houses: vouchers with approvals, accounting period locks, multi-currency, banking and Tally-style reports.",
      "Purchases, goods receipts, stock movements, payroll and commercial records reach accounts from the modules where they happen, instead of being typed again.",
    ],
    challengesHeading: "Accounting challenges in garment companies",
    challenges: [
      { title: "Data typed twice", text: "When purchasing, stores and payroll run outside accounts, every bill and salary sheet is entered again." },
      { title: "Edited history", text: "Changing posted entries after the fact makes audits difficult and hides mistakes." },
      { title: "Several currencies", text: "USD export sales, BDT expenses and foreign currency receipts need consistent conversion." },
      { title: "Month-end in spreadsheets", text: "Bank reconciliation, ageing and cash flow prepared by hand delay management reports." },
    ],
    featuresHeading: "Accounts and finance features",
    features: [
      {
        title: "Setup and controls",
        text: "A ledger structure accountants recognise.",
        points: [
          "Account groups, chart of accounts and cost centres",
          "Multi-currency and accounting periods with period locks",
          "Posted vouchers are not edited; corrections are reversals",
          "Budget checks that can warn or block when a voucher exceeds budget",
        ],
      },
      {
        title: "Vouchers and payables",
        text: "Fast entry with approval where it matters.",
        points: [
          "Vouchers with approval queue and voucher print",
          "Recurring vouchers, post-dated register, credit and debit notes",
          "Bills, party ledgers, vendor bills from goods receipts and purchase-to-pay workflow",
          "TDS settings and reports",
        ],
      },
      {
        title: "Banking",
        text: "Keep bank balances and payments under control.",
        points: ["Bank accounts and bank reconciliation", "Payment runs and payment advice", "Foreign currency receipts and settlement audit"],
      },
      {
        title: "Reports",
        text: "Standard statements without exporting to Excel.",
        points: [
          "Day book, trial balance and ledger activity",
          "Financial statements, Tally-style statements and cash flow",
          "AR/AP ageing and a finance control tower",
        ],
      },
    ],
    workflowHeading: "How transactions reach the books",
    workflow: [
      "Goods receipts create vendor bills for approval",
      "Approved bills and payments post as vouchers",
      "Stock movements, payroll and commercial records post from their modules",
      "Bank statements are reconciled against the books",
      "Period locks close the month",
      "Statements, ageing and cash flow are ready for review",
    ],
    faqs: [
      { q: "Is Prime7 ERP accounting similar to Tally?", a: "It uses the same ideas accountants know from Tally, such as account groups, ledgers, voucher types and Tally-style statements, inside a cloud ERP linked to the rest of the business." },
      { q: "Can a posted voucher be edited?", a: "No. Posted vouchers stay as they are and a correction is made with a reversal voucher, which keeps a clear audit trail." },
      { q: "Does it support multiple currencies?", a: "Yes. Prime7 ERP supports multi-currency accounting and records foreign currency receipts for export proceeds." },
      { q: "Can AI post entries on its own?", a: "No. The voucher entry assistant can suggest narration and hints, but a person enters, approves and posts every voucher." },
    ],
    related: [
      { to: "/back-to-back-lc-management-software", label: "Commercial and BTB LC", text: "Export LCs and BTB obligations." },
      { to: "/garment-inventory-management-software", label: "Inventory and warehouse", text: "Stock value in the books." },
      { to: "/erp-bangladesh", label: "Garments ERP Bangladesh", text: "BDT, USD and Bangladesh HR." },
      { to: "/resources/stock-valuation-tally-style", label: "Tally-style stock valuation", text: "Stock valuation for garment accounts." },
    ],
  },
  {
    path: "/ai-garment-erp",
    eyebrow: "AI-powered ERP",
    h1: "AI-Powered Garment ERP Software with a Person in Control",
    intro: [
      "Prime7 ERP uses AI to help garment teams find information, fill in forms and notice exceptions sooner, inside the same ERP that holds their orders, stock and accounts.",
      "AI in Prime7 ERP is advisory: it reads the data a user is already allowed to see, and a person confirms every action. It never posts accounting entries on its own.",
    ],
    challengesHeading: "Where AI helps a garment business",
    challenges: [
      { title: "Information buried in screens", text: "Managers spend time opening reports to answer simple questions about orders, stock or payments." },
      { title: "Typing from documents", text: "Proforma invoices, purchase orders and other documents are retyped into the system by hand." },
      { title: "Exceptions found late", text: "Late materials, unusual costs or slipping orders are noticed only when someone happens to check." },
      { title: "Long weekly reporting", text: "Preparing a weekly summary for owners takes hours of copying numbers." },
    ],
    featuresHeading: "AI features in Prime7 ERP",
    features: [
      {
        title: "AI assistant",
        text: "Ask questions about your own ERP data in plain language.",
        points: [
          "Answers come from read-only lookups in your company's data",
          "Each lookup respects the user's role and module access",
          "Each answer shows which data it checked",
        ],
      },
      {
        title: "Document to form",
        text: "Start a form from a document instead of typing it.",
        points: [
          "Upload a document and the AI suggests values for the form",
          "The user reviews and corrects every field before saving",
          "The uploaded file is used for the extraction and not kept",
        ],
      },
      {
        title: "Exception agents and alerts",
        text: "Let the system watch for problems.",
        points: [
          "Exception agents that flag issues and suggest actions",
          "A person with the right permission must confirm any action",
          "AI metric cards on dashboards",
        ],
      },
      {
        title: "Reports and assistance",
        text: "Less time spent writing summaries.",
        points: [
          "Weekly AI reports",
          "Voucher narration suggestions for accountants",
          "Optional prediction features, such as delivery risk, switched on per company",
        ],
      },
    ],
    workflowHeading: "How AI requests are handled",
    workflow: [
      "A user asks a question or uploads a document",
      "The AI uses only lookups the user is allowed to run",
      "The answer shows which data was checked",
      "Any suggested change waits for a person to review and confirm",
    ],
    faqs: [
      { q: "Does the AI change data on its own?", a: "No. AI answers and suggestions are advisory. Actions suggested by exception agents need confirmation from a person with the right permission, and AI never posts accounting entries on its own." },
      { q: "Can the AI see other companies' data?", a: "No. AI lookups run inside your company's data and respect each user's permissions, like the rest of Prime7 ERP." },
      { q: "Which AI models does Prime7 ERP use?", a: "AI features use external language-model providers configured by Prime7. The AI usage disclaimer and privacy policy explain how prompts are processed." },
      { q: "Are prediction features included?", a: "Some prediction features, such as delivery risk forecasts, are optional and are switched on per company after review." },
    ],
    related: [
      { to: "/legal/ai-disclaimer", label: "AI usage disclaimer", text: "How AI outputs should be used." },
      { to: "/resources/ai-transforming-apparel-industry", label: "AI in the apparel industry", text: "Where AI is useful in garment businesses." },
      { to: "/security", label: "Security and privacy", text: "How data is protected." },
      { to: "/features", label: "All features", text: "Every Prime7 ERP module." },
    ],
  },
];

export function getSolutionPageContent(path: string): SolutionPageContent | undefined {
  return SOLUTION_PAGE_CONTENT.find((p) => p.path === path);
}

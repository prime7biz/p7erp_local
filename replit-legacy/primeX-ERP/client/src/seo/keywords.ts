export interface PageSEO {
  path: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  title: string;
  description: string;
  h1: string;
  suggestedInternalLinks: string[];
}

export const keywordClusters = {
  bangladeshERP: [
    "erp software bangladesh",
    "best erp software in bangladesh",
    "cloud erp bangladesh",
    "erp solution bangladesh",
    "erp software price in bangladesh",
    "inventory management software bangladesh",
    "accounting software bangladesh",
    "hr payroll software bangladesh",
  ],
  garmentsManufacturing: [
    "garments erp software bangladesh",
    "rmg erp software bangladesh",
    "garment factory management software",
    "apparel erp software",
    "garments production management software",
    "wip costing software garments",
    "tally style accounting erp",
  ],
  buyingHouseMerchandising: [
    "buying house erp software bangladesh",
    "garments buying house software",
    "merchandising software garments",
    "tna software garments",
    "po tracking software garments",
    "sample management software garments",
    "shipment management software garments",
    "commercial lc management software garments",
  ],
  global: [
    "cloud ERP for apparel",
    "apparel manufacturing ERP",
    "ERP for garment factories",
    "ERP for buying houses",
    "multi-currency ERP",
    "multi-tenant ERP",
  ],
};

export const pageSEOConfig: Record<string, PageSEO> = {
  "/": {
    path: "/",
    primaryKeyword: "erp software bangladesh",
    secondaryKeywords: [
      "cloud erp bangladesh",
      "garments erp software bangladesh",
      "apparel manufacturing ERP",
      "multi-tenant ERP",
    ],
    title: "Prime7 ERP - AI-Powered Cloud ERP for Garment Manufacturing | Bangladesh & Global",
    description:
      "Prime7 is an AI-driven cloud ERP system for garment manufacturers and buying houses. Manage production, inventory, accounting, HR & more. Trusted in Bangladesh and worldwide.",
    h1: "AI-Powered ERP for Garment Manufacturing & Buying Houses",
    suggestedInternalLinks: ["/features", "/garments-erp", "/buying-house-erp", "/pricing"],
  },
  "/features": {
    path: "/features",
    primaryKeyword: "garment factory management software",
    secondaryKeywords: [
      "erp solution bangladesh",
      "inventory management software bangladesh",
      "accounting software bangladesh",
      "apparel erp software",
    ],
    title: "ERP Features - Production, Inventory, Accounting & HR Modules | Prime7 ERP",
    description:
      "Explore Prime7 ERP's comprehensive modules: production management, inventory control, financial accounting, HR payroll, merchandising, quality management, and AI-powered insights.",
    h1: "Comprehensive ERP Modules for Garment Manufacturing",
    suggestedInternalLinks: ["/garments-erp", "/buying-house-erp", "/pricing", "/contact"],
  },
  "/garments-erp": {
    path: "/garments-erp",
    primaryKeyword: "garments erp software bangladesh",
    secondaryKeywords: [
      "rmg erp software bangladesh",
      "garments production management software",
      "wip costing software garments",
      "garment factory management software",
      "apparel erp software",
    ],
    title: "Garments ERP Software Bangladesh - RMG Production & WIP Costing | Prime7",
    description:
      "Purpose-built garments ERP for Bangladesh RMG factories. Consumption control, stock valuation, WIP costing, process conversion (yarn→knit→dye→finish), audit logs, and multi-warehouse management.",
    h1: "Garments ERP Software for Bangladesh RMG & Global Apparel",
    suggestedInternalLinks: ["/features", "/buying-house-erp", "/pricing", "/contact"],
  },
  "/buying-house-erp": {
    path: "/buying-house-erp",
    primaryKeyword: "buying house erp software bangladesh",
    secondaryKeywords: [
      "garments buying house software",
      "merchandising software garments",
      "tna software garments",
      "po tracking software garments",
      "sample management software garments",
      "shipment management software garments",
      "commercial lc management software garments",
    ],
    title: "Buying House ERP Software Bangladesh - T&A, PO Tracking & Merchandising | Prime7",
    description:
      "Specialized ERP for garment buying houses. Manage T&A calendars, PO tracking, sample management, supplier follow-up, shipment milestones, LC documentation, approvals, and compliance.",
    h1: "Buying House ERP Software for Garment Merchandising & Sourcing",
    suggestedInternalLinks: ["/garments-erp", "/features", "/pricing", "/contact"],
  },
  "/erp-software-bangladesh": {
    path: "/erp-software-bangladesh",
    primaryKeyword: "best erp software in bangladesh",
    secondaryKeywords: [
      "erp software bangladesh",
      "cloud erp bangladesh",
      "erp software price in bangladesh",
      "erp solution bangladesh",
      "hr payroll software bangladesh",
    ],
    title: "Best ERP Software in Bangladesh - Cloud ERP Solution | Prime7",
    description:
      "Prime7 is the best cloud ERP software in Bangladesh. Built for local businesses with multi-currency support, VAT-ready accounting, HR payroll, and AI-powered insights. Works globally.",
    h1: "Best Cloud ERP Software for Bangladesh Businesses",
    suggestedInternalLinks: ["/garments-erp", "/buying-house-erp", "/features", "/pricing"],
  },
  "/pricing": {
    path: "/pricing",
    primaryKeyword: "erp software price in bangladesh",
    secondaryKeywords: [
      "cloud erp bangladesh",
      "erp solution bangladesh",
      "multi-tenant ERP",
    ],
    title: "ERP Pricing Plans - Starter, Growth & Enterprise | Prime7 ERP",
    description:
      "Transparent ERP pricing for every business size. Starter (10-30 users), Growth (31-100 users), and Enterprise (101+ users) plans. Start your free trial today.",
    h1: "Simple, Transparent ERP Pricing",
    suggestedInternalLinks: ["/features", "/garments-erp", "/contact"],
  },
  "/how-it-works": {
    path: "/how-it-works",
    primaryKeyword: "cloud ERP for apparel",
    secondaryKeywords: [
      "erp solution bangladesh",
      "apparel manufacturing ERP",
    ],
    title: "How Prime7 ERP Works - Setup, Deploy & Scale | Prime7",
    description:
      "Get started with Prime7 ERP in 3 simple steps. Sign up, configure your modules, and go live. Cloud-based deployment with zero hardware requirements.",
    h1: "How Prime7 ERP Works",
    suggestedInternalLinks: ["/features", "/pricing", "/contact"],
  },
  "/about": {
    path: "/about",
    primaryKeyword: "ERP for garment factories",
    secondaryKeywords: [
      "apparel manufacturing ERP",
      "cloud erp bangladesh",
    ],
    title: "About Prime7 - AI-Driven ERP for Garment Industry | Prime7",
    description:
      "Prime7 is built by industry experts who understand garment manufacturing. Our mission is to empower RMG businesses with AI-driven ERP solutions.",
    h1: "About Prime7 ERP",
    suggestedInternalLinks: ["/features", "/contact", "/pricing"],
  },
  "/contact": {
    path: "/contact",
    primaryKeyword: "erp software bangladesh",
    secondaryKeywords: [
      "erp solution bangladesh",
      "ERP for buying houses",
    ],
    title: "Contact Us - Get a Demo of Prime7 ERP | Prime7",
    description:
      "Contact Prime7 for a personalized demo of our garment manufacturing ERP. Request a quote, ask questions, or schedule a consultation.",
    h1: "Get in Touch with Prime7",
    suggestedInternalLinks: ["/features", "/pricing", "/garments-erp"],
  },
  "/resources": {
    path: "/resources",
    primaryKeyword: "garment manufacturing ERP",
    secondaryKeywords: [
      "rmg erp software bangladesh",
      "wip costing software garments",
      "apparel manufacturing ERP",
    ],
    title: "Resources & Blog - Garment ERP Insights | Prime7",
    description:
      "Industry insights, best practices, and guides for garment manufacturing ERP. Learn about consumption control, WIP costing, T&A workflows, and more.",
    h1: "Resources & Industry Insights",
    suggestedInternalLinks: ["/garments-erp", "/buying-house-erp", "/features"],
  },
  "/security": {
    path: "/security",
    primaryKeyword: "cloud ERP for apparel",
    secondaryKeywords: ["multi-tenant ERP", "erp solution bangladesh"],
    title: "Security - Enterprise-Grade Data Protection | Prime7 ERP",
    description:
      "Prime7 ERP uses enterprise-grade security: encrypted data, role-based access control, multi-tenant isolation, and SOC 2 compliance-ready infrastructure.",
    h1: "Enterprise-Grade Security",
    suggestedInternalLinks: ["/features", "/pricing", "/contact"],
  },
  "/privacy": {
    path: "/privacy",
    primaryKeyword: "cloud erp bangladesh",
    secondaryKeywords: ["multi-tenant ERP"],
    title: "Privacy Policy | Prime7 ERP",
    description: "Prime7 ERP privacy policy. Learn how we collect, use, and protect your data.",
    h1: "Privacy Policy",
    suggestedInternalLinks: ["/terms", "/security"],
  },
  "/terms": {
    path: "/terms",
    primaryKeyword: "erp software bangladesh",
    secondaryKeywords: ["cloud erp bangladesh"],
    title: "Terms of Service | Prime7 ERP",
    description: "Prime7 ERP terms of service. Read our terms and conditions for using the platform.",
    h1: "Terms of Service",
    suggestedInternalLinks: ["/privacy", "/security"],
  },
  "/modules/merchandising": {
    path: "/modules/merchandising",
    primaryKeyword: "merchandising software garments",
    secondaryKeywords: ["garment merchandising ERP", "style master management", "BOM software garments"],
    title: "Merchandising Software - Style Management & BOM Planning | Prime7 ERP",
    description:
      "Master your garment merchandising with Prime7's comprehensive module. Manage styles, create BOMs, track material consumption, and control costs across your entire supply chain.",
    h1: "Garment Merchandising Software with Style & BOM Management",
    suggestedInternalLinks: ["/modules/inventory", "/modules/production", "/features", "/buying-house-erp"],
  },
  "/modules/inventory": {
    path: "/modules/inventory",
    primaryKeyword: "garment inventory management software",
    secondaryKeywords: ["stock ledger ERP", "warehouse management garments", "lot traceability"],
    title: "Inventory Management Software - Stock Ledger & Warehouse Control | Prime7 ERP",
    description:
      "Complete inventory control for garment factories. Real-time stock ledger, multi-warehouse management, lot traceability, consumption control, and stock valuation with accounting integration.",
    h1: "Garment Inventory Management with Stock Ledger & Lot Traceability",
    suggestedInternalLinks: ["/modules/merchandising", "/modules/accounting", "/modules/production", "/features"],
  },
  "/modules/accounting": {
    path: "/modules/accounting",
    primaryKeyword: "tally style accounting ERP",
    secondaryKeywords: ["double entry accounting garments", "multi-currency accounting", "cost center job costing"],
    title: "Accounting Software - Tally-Style Double Entry Accounting | Prime7 ERP",
    description:
      "Enterprise accounting module with double entry bookkeeping, multi-currency support, cost center allocation, job costing, budget management, and comprehensive financial reporting.",
    h1: "Tally-Style Accounting ERP for Garment Business",
    suggestedInternalLinks: ["/modules/inventory", "/modules/hr-payroll", "/modules/reports-analytics", "/features"],
  },
  "/modules/production": {
    path: "/modules/production",
    primaryKeyword: "garment production management software",
    secondaryKeywords: ["cutting sewing finishing ERP", "WIP tracking", "production order management"],
    title: "Production Management Software - Cutting, Sewing & Finishing | Prime7 ERP",
    description:
      "Optimize factory operations with real-time production tracking. Manage cutting, sewing, and finishing departments, track work-in-progress, monitor efficiency, and control production orders.",
    h1: "Garment Production Management with WIP Tracking",
    suggestedInternalLinks: ["/modules/quality-management", "/modules/merchandising", "/modules/inventory", "/features"],
  },
  "/modules/lc-processing": {
    path: "/modules/lc-processing",
    primaryKeyword: "lc management software garments",
    secondaryKeywords: ["letter of credit ERP", "back to back LC", "commercial export management"],
    title: "LC Processing Software - Letter of Credit & Export Management | Prime7 ERP",
    description:
      "Streamline export operations with integrated LC management. Handle letter of credit processing, back-to-back LCs, commercial documentation, and international payment compliance.",
    h1: "LC Management Software for Garment Export Operations",
    suggestedInternalLinks: ["/modules/crm-support", "/modules/merchandising", "/buying-house-erp", "/features"],
  },
  "/modules/quality-management": {
    path: "/modules/quality-management",
    primaryKeyword: "quality management software garments",
    secondaryKeywords: ["QC inspection ERP", "AQL sampling", "CAPA workflow"],
    title: "Quality Management Software - QC Inspection & CAPA Workflow | Prime7 ERP",
    description:
      "Comprehensive quality control module with AQL sampling, inline and endline inspections, defect tracking, corrective action workflow, and quality analytics for garment manufacturing.",
    h1: "Quality Management Software with QC Inspection & CAPA",
    suggestedInternalLinks: ["/modules/production", "/modules/inventory", "/modules/reports-analytics", "/features"],
  },
  "/modules/hr-payroll": {
    path: "/modules/hr-payroll",
    primaryKeyword: "hr payroll software garments",
    secondaryKeywords: ["attendance management", "salary structure ERP", "payroll processing garments"],
    title: "HR & Payroll Software - Attendance, Salary & Payroll Processing | Prime7 ERP",
    description:
      "Integrated HR and payroll module for garment factories. Manage attendance, create salary structures, process payroll, handle benefits, and maintain compliance with labor regulations.",
    h1: "HR & Payroll Software with Attendance & Salary Management",
    suggestedInternalLinks: ["/modules/accounting", "/modules/reports-analytics", "/features", "/garments-erp"],
  },
  "/modules/reports-analytics": {
    path: "/modules/reports-analytics",
    primaryKeyword: "ERP reports analytics garments",
    secondaryKeywords: ["AI business intelligence", "financial reporting ERP", "custom dashboard"],
    title: "ERP Reports & Analytics - Business Intelligence & Dashboards | Prime7 ERP",
    description:
      "Advanced reporting and analytics with AI-driven insights. Create custom dashboards, financial reports, production analytics, inventory forecasting, and business intelligence for data-driven decisions.",
    h1: "ERP Reports & Analytics with AI Business Intelligence",
    suggestedInternalLinks: ["/modules/accounting", "/modules/production", "/modules/inventory", "/features"],
  },
  "/modules/crm-support": {
    path: "/modules/crm-support",
    primaryKeyword: "CRM software garments",
    secondaryKeywords: ["customer management ERP", "lead tracking garments", "support ticketing"],
    title: "CRM Software - Customer Management & Lead Tracking | Prime7 ERP",
    description:
      "Integrated CRM module for garment businesses. Manage customer relationships, track leads, handle inquiries, process orders, manage support tickets, and analyze customer data.",
    h1: "CRM Software for Garment Business Customer Management",
    suggestedInternalLinks: ["/modules/lc-processing", "/modules/merchandising", "/buying-house-erp", "/features"],
  },
  "/resources/avoid-lc-deadline-misses": {
    path: "/resources/avoid-lc-deadline-misses",
    primaryKeyword: "lc management software garments",
    secondaryKeywords: ["letter of credit ERP", "export deadline tracking", "commercial compliance"],
    title: "How to Avoid LC Deadline Misses in Garment Export | Prime7",
    description:
      "Critical tips and best practices for managing LC deadlines in garment export. Learn how ERP automation helps prevent costly deadline misses and compliance issues.",
    h1: "Avoiding LC Deadline Misses in Garment Export",
    suggestedInternalLinks: ["/modules/lc-processing", "/modules/crm-support", "/resources"],
  },
  "/resources/excel-vs-erp-rmg-production-planning": {
    path: "/resources/excel-vs-erp-rmg-production-planning",
    primaryKeyword: "garment production management software",
    secondaryKeywords: ["production planning ERP", "manufacturing efficiency", "WIP tracking"],
    title: "Excel vs ERP for RMG Production Planning | Prime7 Blog",
    description:
      "Why RMG factories need to move beyond Excel for production planning. Discover how ERP systems improve accuracy, reduce errors, and accelerate production timelines.",
    h1: "Excel vs ERP: Production Planning for Garment Manufacturing",
    suggestedInternalLinks: ["/modules/production", "/modules/inventory", "/garments-erp"],
  },
  "/resources/accurate-garment-costing-bangladesh": {
    path: "/resources/accurate-garment-costing-bangladesh",
    primaryKeyword: "garment costing software",
    secondaryKeywords: ["cost accounting garments", "cost center job costing", "Bangladesh RMG"],
    title: "Accurate Garment Costing in Bangladesh - Best Practices | Prime7",
    description:
      "Master garment costing with accurate cost tracking, material consumption analysis, and cost center allocation. Essential guide for Bangladesh RMG factories optimizing profitability.",
    h1: "Accurate Garment Costing & Cost Control in Bangladesh",
    suggestedInternalLinks: ["/modules/accounting", "/modules/merchandising", "/modules/inventory"],
  },
  "/resources/tna-calendar-guide-for-merchandisers": {
    path: "/resources/tna-calendar-guide-for-merchandisers",
    primaryKeyword: "tna software garments",
    secondaryKeywords: ["time action plan garments", "merchandising calendar", "buying house"],
    title: "T&A Calendar Guide for Garment Merchandisers | Prime7 Blog",
    description:
      "Complete guide to managing T&A (Time & Action) calendars for garment production. Best practices for merchandisers to track deadlines and coordinate with factories.",
    h1: "T&A Calendar Planning Guide for Garment Merchandisers",
    suggestedInternalLinks: ["/modules/merchandising", "/buying-house-erp", "/modules/crm-support"],
  },
  "/resources/stock-valuation-accounting-integration": {
    path: "/resources/stock-valuation-accounting-integration",
    primaryKeyword: "stock valuation accounting software",
    secondaryKeywords: ["inventory accounting integration", "FIFO LIFO valuation", "garment inventory"],
    title: "Stock Valuation & Accounting Integration for Garments | Prime7",
    description:
      "Learn how to integrate stock valuation with accounting for accurate financial reporting. Master FIFO, LIFO, and weighted average methods for garment inventory.",
    h1: "Stock Valuation & Accounting Integration Guide",
    suggestedInternalLinks: ["/modules/inventory", "/modules/accounting", "/modules/reports-analytics"],
  },
  "/resources/consumption-control-approvals-in-garments": {
    path: "/resources/consumption-control-approvals-in-garments",
    primaryKeyword: "consumption control software garments",
    secondaryKeywords: ["consumption planning ERP", "material usage tracking", "approval workflow"],
    title: "Consumption Control & Approval Workflows in Garments | Prime7",
    description:
      "Implement effective consumption control and approval workflows for garment production. Reduce material waste, control costs, and improve profitability with proper processes.",
    h1: "Consumption Control & Approval Workflows in Garment Manufacturing",
    suggestedInternalLinks: ["/modules/merchandising", "/modules/production", "/modules/inventory"],
  },
};

export const currencyMap: Record<string, { currency: string; locale: string }> = {
  BD: { currency: "BDT", locale: "bn-BD" },
  US: { currency: "USD", locale: "en-US" },
  GB: { currency: "GBP", locale: "en-GB" },
  DE: { currency: "EUR", locale: "de-DE" },
  FR: { currency: "EUR", locale: "fr-FR" },
  IT: { currency: "EUR", locale: "it-IT" },
  ES: { currency: "EUR", locale: "es-ES" },
  NL: { currency: "EUR", locale: "nl-NL" },
  BE: { currency: "EUR", locale: "nl-BE" },
  AT: { currency: "EUR", locale: "de-AT" },
  IE: { currency: "EUR", locale: "en-IE" },
  PT: { currency: "EUR", locale: "pt-PT" },
  FI: { currency: "EUR", locale: "fi-FI" },
  GR: { currency: "EUR", locale: "el-GR" },
  AE: { currency: "AED", locale: "ar-AE" },
  SA: { currency: "SAR", locale: "ar-SA" },
  CA: { currency: "CAD", locale: "en-CA" },
  AU: { currency: "AUD", locale: "en-AU" },
  IN: { currency: "INR", locale: "en-IN" },
  JP: { currency: "JPY", locale: "ja-JP" },
  CN: { currency: "CNY", locale: "zh-CN" },
  KR: { currency: "KRW", locale: "ko-KR" },
  SG: { currency: "SGD", locale: "en-SG" },
  HK: { currency: "HKD", locale: "zh-HK" },
  MY: { currency: "MYR", locale: "ms-MY" },
  TH: { currency: "THB", locale: "th-TH" },
  VN: { currency: "VND", locale: "vi-VN" },
  PK: { currency: "PKR", locale: "ur-PK" },
  LK: { currency: "LKR", locale: "si-LK" },
  MM: { currency: "MMK", locale: "my-MM" },
};

export function formatCurrency(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

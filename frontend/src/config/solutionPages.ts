/**
 * Public solution (module) landing pages: one URL per search intent (docs/seo-optimization/KEYWORD-STRATEGY.md).
 *
 * This small list is shared by the router, sitemap, SEO titles and breadcrumbs. The page text lives in
 * src/data/marketing/solutionPageContent.ts and is only downloaded when a solution page is opened.
 * Adding a page: add it here and add its content entry (the test solutionPages.test.ts checks both).
 */
export interface SolutionPageMeta {
  path: string;
  /** Short name for breadcrumbs, footer and related links. */
  label: string;
  /** <title>; keep under about 60 characters. */
  title: string;
  /** Meta description; keep under about 160 characters. */
  description: string;
}

export const SOLUTION_PAGES: readonly SolutionPageMeta[] = [
  {
    path: "/erp-bangladesh",
    label: "Garments ERP Bangladesh",
    title: "Garments ERP Software in Bangladesh for RMG – Prime7 ERP",
    description:
      "Cloud garments ERP for Bangladesh RMG factories and buying houses: costing, BOM, production, export and back-to-back LC, BDT accounts and Bangladesh HR.",
  },
  {
    path: "/garment-merchandising-software",
    label: "Merchandising & Orders",
    title: "Garment Merchandising & Order Management Software – Prime7",
    description:
      "Manage buyers, inquiries, quotations, styles, samples, orders and TNA follow-up in one garment merchandising system, from first inquiry to shipment.",
  },
  {
    path: "/garment-production-management-software",
    label: "Production Management",
    title: "Garment Production Management Software – Prime7 ERP",
    description:
      "Plan sewing lines, balance operations with SMV, record hourly cutting, sewing and finishing output, and track shop-floor quality in one garment ERP.",
  },
  {
    path: "/garment-inventory-management-software",
    label: "Inventory & Warehouse",
    title: "Garment Inventory & Warehouse Management Software – Prime7",
    description:
      "Fabric, trims and finished goods stock by store: purchase orders, goods receiving with inspection, issues against orders, FIFO valuation and gate passes.",
  },
  {
    path: "/back-to-back-lc-management-software",
    label: "Commercial & BTB LC",
    title: "Back-to-Back LC Management Software for Garments – Prime7",
    description:
      "Garments commercial management: master contracts and export LCs, proforma invoices, back-to-back LCs with utilization limits, commercial invoices and registers.",
  },
  {
    path: "/garment-costing-software",
    label: "Costing & Consumption",
    title: "Garment Costing and Consumption Software – Prime7 ERP",
    description:
      "Build garment cost sheets with consumption per dozen, wastage, CM and other costs, carry them into the BOM and compare planned and actual consumption.",
  },
  {
    path: "/garment-accounting-software",
    label: "Accounts & Finance",
    title: "Accounting Software for Garment Companies – Prime7 ERP",
    description:
      "Double-entry accounts for garment factories and buying houses: vouchers with approvals, period locks, multi-currency, bank reconciliation, Tally-style reports.",
  },
  {
    path: "/ai-garment-erp",
    label: "AI-Powered ERP",
    title: "AI-Powered Garment ERP Software – Prime7 ERP",
    description:
      "Practical AI inside a garment ERP: ask questions about your own data, fill forms from documents and get exception alerts, with a person confirming every action.",
  },
];

export const SOLUTION_PAGE_PATHS: readonly string[] = SOLUTION_PAGES.map((p) => p.path);

export function getSolutionPageMeta(path: string): SolutionPageMeta | undefined {
  return SOLUTION_PAGES.find((p) => p.path === path);
}

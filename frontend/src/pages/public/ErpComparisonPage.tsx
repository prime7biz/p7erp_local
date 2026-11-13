import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";

type Column = "sheets" | "generic" | "garment";

/** Fair comparison: generic ERP strengths are stated too. Prime7 claims must match the product. */
const rows: { topic: string; sheets: string; generic: string; garment: string }[] = [
  {
    topic: "Styles, colours and sizes",
    sheets: "One sheet per order; colour-size breakdowns copied by hand.",
    generic: "Product variants exist, but garment-specific screens usually need configuration or custom work.",
    garment: "Styles, size ratios and order quantities are part of the standard order and costing screens.",
  },
  {
    topic: "Costing to purchasing",
    sheets: "Cost sheet, BOM and purchase list are separate files.",
    generic: "Bills of material and purchasing are strong; consumption per dozen and wastage are often custom.",
    garment: "Quotation costing with consumption and wastage, order BOM, and purchase orders generated from the BOM.",
  },
  {
    topic: "Time and action (TNA)",
    sheets: "Calendar in a spreadsheet; delays are found late.",
    generic: "Project or task tools can be adapted.",
    garment: "TNA templates, TNA plans per order and a follow-up dashboard.",
  },
  {
    topic: "Export and back-to-back LC",
    sheets: "LC register in Excel; BTB usage worked out by hand.",
    generic: "Usually needs an extra module or custom development.",
    garment: "Master contracts, proforma invoices, BTB LCs with utilization limits and commercial invoices.",
  },
  {
    topic: "Shop-floor output",
    sheets: "Daily totals typed in after the shift.",
    generic: "Manufacturing orders and work centres; hourly garment line entry often needs custom screens.",
    garment: "Line plan board, operation bulletins, line balancing and hourly cutting, sewing and finishing entry.",
  },
  {
    topic: "Accounts",
    sheets: "Separate accounting package or Tally; figures re-entered.",
    generic: "Mature, broad accounting, often the main strength.",
    garment: "Double-entry vouchers with approvals, period locks, multi-currency and Tally-style reports, linked to stock and purchases.",
  },
  {
    topic: "Bangladesh HR and payroll",
    sheets: "Payroll sheets maintained by HR.",
    generic: "Local wage and labour rules usually need localisation work.",
    garment: "Bangladesh RMG rule set with 2023 wage grades, attendance devices, overtime and salary registers.",
  },
  {
    topic: "Set-up effort",
    sheets: "None at first; grows with every new order and person.",
    generic: "Depends heavily on the implementation partner and customisation.",
    garment: "Garment workflows are built in; masters and opening balances still need to be prepared.",
  },
];

const columns: { key: Column; label: string }[] = [
  { key: "sheets", label: "Spreadsheets" },
  { key: "generic", label: "Generic ERP" },
  { key: "garment", label: "Garment ERP (Prime7)" },
];

const faqs = [
  {
    q: "Is a generic ERP ever the better choice?",
    a: "Yes. A group with many non-garment businesses, or one that already runs a generic ERP well, may prefer to extend it. The test is how much custom work the garment workflows need and who will maintain it.",
  },
  {
    q: "Can we keep using Excel for some reports?",
    a: "Yes. Reports can be exported, and many teams keep Excel for one-off analysis. The aim is to stop maintaining the master data and daily transactions in spreadsheets.",
  },
  {
    q: "How long does it take to move to Prime7 ERP?",
    a: "It depends on the modules you start with and how ready your masters and opening balances are. A pilot with one module and a group of orders is the safest way to find out; we agree the plan with you in the demo.",
  },
  {
    q: "How do we compare vendors fairly?",
    a: "Run the same real order through every system in the demo, from inquiry to shipment, and compare the full cost including implementation, training and support. Our buyer's checklist lists the questions to ask.",
  },
];

export function ErpComparisonPage() {
  return (
    <>
      <section className="relative bg-gradient-to-br from-brand-primary/5 via-surface-raised to-surface-raised py-20 lg:py-24 overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-text-primary leading-tight">
            Garment ERP vs Generic ERP and <span className="text-brand-primary">Spreadsheets</span>
          </h1>
          <p className="mt-6 text-lg text-text-secondary max-w-3xl mx-auto leading-relaxed">
            Most garment factories and buying houses start with Excel, and many consider a generic ERP next. This page compares
            the three approaches on the work that matters in a garment business, including where generic ERP is strong.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link to="/book-demo" className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-base font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 transition-colors">
              Book a demo <ArrowRight className="w-4 h-4" aria-hidden />
            </Link>
            <Link to="/pricing" className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 text-base font-semibold text-text-secondary hover:border-border-strong hover:text-brand-primary hover:bg-brand-primary/5 transition-colors">
              View pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-surface-raised" aria-labelledby="compare-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 id="compare-heading" className="font-display text-3xl font-semibold tracking-tight text-text-primary mb-8">
            Side-by-side comparison
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-[760px] w-full text-left text-sm">
              <caption className="sr-only">Spreadsheets, generic ERP and garment ERP compared by topic</caption>
              <thead className="bg-surface-subtle">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold text-text-primary">Topic</th>
                  {columns.map((c) => (
                    <th key={c.key} scope="col" className="px-4 py-3 font-semibold text-text-primary">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.topic} className="border-t border-border-subtle align-top">
                    <th scope="row" className="px-4 py-3 font-semibold text-text-primary">{row.topic}</th>
                    {columns.map((c) => (
                      <td key={c.key} className={`px-4 py-3 text-text-secondary ${c.key === "garment" ? "bg-brand-primary/5" : ""}`}>
                        {row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-surface-subtle" aria-labelledby="choose-heading">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 id="choose-heading" className="font-display text-3xl font-semibold tracking-tight text-text-primary mb-6">
            Which approach fits your business?
          </h2>
          <div className="space-y-4 text-text-secondary leading-relaxed">
            <p>
              Spreadsheets work for a few orders and one person who owns the file. They break down when several teams need the same
              numbers at the same time, when orders change after confirmation, and when finance needs stock and production to agree with
              the books.
            </p>
            <p>
              A generic ERP brings strong accounting and purchasing, but garment work such as colour-size orders, consumption per dozen,
              TNA calendars, back-to-back LCs and hourly line output usually has to be added through configuration or custom development.
            </p>
            <p>
              A garment ERP such as Prime7 ERP starts with those workflows built in, so the implementation focuses on your masters,
              opening balances and training rather than on building screens.
            </p>
          </div>
          <p className="mt-6 text-text-secondary">
            Planning a decision? Read{" "}
            <Link to="/resources/how-to-choose-garments-erp-software-bangladesh" className="font-semibold text-brand-primary hover:underline">
              how to choose garments ERP software
            </Link>{" "}
            and{" "}
            <Link to="/resources/excel-vs-erp-rmg-production-planning" className="font-semibold text-brand-primary hover:underline">
              Excel vs ERP for production planning
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-surface-raised" aria-labelledby="faq-heading">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 id="faq-heading" className="font-display text-3xl font-semibold tracking-tight text-text-primary mb-8">
            Frequently asked questions
          </h2>
          <div className="space-y-3">
            {faqs.map((faq) => (
              <details key={faq.q} className="group rounded-xl border border-border bg-surface-raised">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <h3 className="text-base font-semibold text-text-primary">{faq.q}</h3>
                  <ChevronDown className="h-5 w-5 shrink-0 text-text-muted transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="border-t border-border-subtle px-5 py-4 text-text-secondary leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-surface-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-text-secondary mb-6">See the garment workflows module by module, or compare plans.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/garments-erp"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-brand-primary-foreground font-semibold hover:bg-brand-primary/90 transition-colors"
            >
              Garment manufacturing ERP
              <ArrowRight className="w-4 h-4" aria-hidden />
            </Link>
            <Link
              to="/features"
              className="inline-flex items-center gap-2 rounded-lg border border-brand-primary text-brand-primary px-6 py-3 font-semibold hover:bg-brand-primary/5 transition-colors"
            >
              All features
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

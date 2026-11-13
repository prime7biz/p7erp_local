import { Link } from "react-router-dom";
import { UserPlus, Settings, Rocket, ArrowRight, CheckCircle2 } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: UserPlus,
    title: "Sign Up & Configure",
    description:
      "Create your company account, set up your organization profile and chart of accounts, and bring in your existing masters.",
    details: [
      "Create your company account with basic details",
      "Set up company profile, logo, and base currency",
      "Start from a standard chart of accounts and adjust it to your ledgers",
      "Import customers, vendors and items from CSV files",
      "Configure fiscal year and accounting periods",
      "Set up stores and processing units",
    ],
  },
  {
    number: "02",
    icon: Settings,
    title: "Connect Your Workflow",
    description:
      "Add team members, assign roles and permissions, and configure the modules that match your manufacturing workflow.",
    details: [
      "Invite team members with role-based access",
      "Configure permissions per department",
      "Enable modules: Merchandising, Production, Inventory, etc.",
      "Set up approval workflows for vouchers and orders",
      "Connect buyers, suppliers, and subcontractors as parties",
    ],
  },
  {
    number: "03",
    icon: Rocket,
    title: "Go Live & Grow",
    description:
      "Start processing orders, track production in real time, get AI-powered insights, and scale your operations with confidence.",
    details: [
      "Start processing inquiries, orders and purchase orders",
      "Record cutting, sewing and finishing output by line and hour",
      "Ask the AI assistant about your data and act on exception alerts",
      "Generate financial statements and registers",
      "Add more factory units, product lines and modules as you grow",
    ],
  },
];

export function HowItWorksPage() {
  return (
    <>
      <section className="relative bg-gradient-to-br from-brand-primary/5 via-surface-raised to-surface-raised py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-text-primary leading-tight">
            How Prime7 ERP <span className="text-brand-primary">Goes Live</span>
          </h1>
          <p className="mt-6 text-lg text-text-secondary max-w-3xl mx-auto leading-relaxed">
            Setting up a garment ERP is mostly about good master data, a careful cut-over and training each team on the screens they use.
            Here is how Prime7 ERP goes from sign-up to daily use in three steps.
          </p>
          <div className="mt-8">
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-base font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 transition-colors">
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-raised">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-20">
            {steps.map((step, idx) => (
              <div key={idx} className="flex flex-col lg:flex-row gap-10 items-start">
                <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                  <step.icon className="w-8 h-8" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-brand-primary">{step.number}</span>
                  <h2 className="text-2xl font-semibold text-text-primary mt-1">{step.title}</h2>
                  <p className="mt-3 text-text-secondary">{step.description}</p>
                  <ul className="mt-4 space-y-2">
                    {step.details.map((d, i) => (
                      <li key={i} className="flex items-center gap-2 text-text-secondary">
                        <CheckCircle2 className="w-5 h-5 text-brand-primary flex-shrink-0" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-surface-subtle" aria-labelledby="prepare-heading">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-10 md:grid-cols-2">
          <div>
            <h2 id="prepare-heading" className="text-2xl font-semibold text-text-primary">What to prepare before go-live</h2>
            <ul className="mt-4 space-y-2 text-text-secondary">
              {[
                "Lists of buyers, suppliers and items, cleaned of duplicates",
                "Your ledger structure and opening balances at a cut-off date",
                "Open orders, open purchase orders and stock on hand at the cut-off date",
                "Users and the role each person needs",
                "Approval rules for vouchers, purchases and stock adjustments",
              ].map((d) => (
                <li key={d} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" aria-hidden />
                  {d}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-text-primary">A safe way to roll out</h2>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-text-secondary">
              <li>Start with one module or one group of orders as a pilot.</li>
              <li>Run it fully in Prime7 ERP and compare with your old reports.</li>
              <li>Train each team on the screens it uses, in short sessions.</li>
              <li>Switch off the old spreadsheets for that area on a fixed date.</li>
              <li>Add the next module once the first one is stable.</li>
            </ol>
            <p className="mt-4 text-text-secondary">
              Choosing a system first? Read our{" "}
              <Link to="/resources/how-to-choose-garments-erp-software-bangladesh" className="font-semibold text-brand-primary hover:underline">
                buyer&apos;s checklist
              </Link>{" "}
              and the{" "}
              <Link to="/resources/digital-transformation-fashion-supply-chain" className="font-semibold text-brand-primary hover:underline">
                guide to sequencing the change
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-surface-raised">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-text-secondary mb-6">Want to plan your go-live with us?</p>
          <Link
            to="/book-demo"
            className="mr-3 inline-flex items-center gap-2 rounded-lg border border-brand-primary px-6 py-3 font-semibold text-brand-primary hover:bg-brand-primary/5 transition-colors"
          >
            Book a demo
          </Link>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-brand-primary-foreground font-semibold hover:bg-brand-primary/90 transition-colors"
          >
            Create your account
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

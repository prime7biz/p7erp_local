import { Link } from "react-router-dom";
import { UserPlus, Settings, Rocket, ArrowRight, CheckCircle2 } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: UserPlus,
    title: "Sign Up & Configure",
    description:
      "Create your company account in minutes. Set up your organization profile, configure your chart of accounts, and import existing data.",
    details: [
      "Create your company account with basic details",
      "Set up company profile, logo, and base currency",
      "Import your chart of accounts (Tally-compatible)",
      "Configure fiscal year and accounting periods",
      "Set up warehouses and processing units",
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
      "Start processing purchase orders and inquiries",
      "Track cutting, sewing, finishing in real time",
      "Get AI-powered demand forecasting and insights",
      "Generate financial statements and compliance reports",
      "Scale to multiple factories and product lines",
    ],
  },
];

export function HowItWorksPage() {
  return (
    <>
      <section className="relative bg-gradient-to-br from-primary/5 via-blue-50 to-white py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight">
            How It <span className="text-primary">Works</span>
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
            Get from sign-up to go-live in three clear steps. P7 ERP is designed for fast setup and ongoing growth.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-20">
            {steps.map((step, idx) => (
              <div key={idx} className="flex flex-col lg:flex-row gap-10 items-start">
                <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <step.icon className="w-8 h-8" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-primary">{step.number}</span>
                  <h2 className="text-2xl font-bold text-gray-900 mt-1">{step.title}</h2>
                  <p className="mt-3 text-gray-600">{step.description}</p>
                  <ul className="mt-4 space-y-2">
                    {step.details.map((d, i) => (
                      <li key={i} className="flex items-center gap-2 text-gray-700">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
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

      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-600 mb-6">Ready to get started?</p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-white font-medium hover:bg-primary/90"
          >
            Create your account
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

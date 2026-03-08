import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  UserPlus,
  Settings,
  Rocket,
  ArrowRight,
  BookOpen,
  Headphones,
  FileText,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import techPatternBg from "../../assets/images/tech-pattern-bg.png";

const steps = [
  {
    number: "01",
    icon: UserPlus,
    title: "Sign Up & Configure",
    description:
      "Create your company account in minutes. Set up your organization profile, configure your chart of accounts, and import existing data.",
    details: [
      "Create your company account with basic details",
      "Set up company profile, logo, and BDT base currency",
      "Import your chart of accounts (Tally-compatible)",
      "Configure fiscal year and accounting periods",
      "Set up warehouses and processing units",
    ],
    color: "bg-primary",
  },
  {
    number: "02",
    icon: Settings,
    title: "Connect Your Workflow",
    description:
      "Add team members, assign roles and permissions, and configure the modules that match your manufacturing workflow.",
    details: [
      "Invite team members with role-based access",
      "Configure RBAC permissions per department",
      "Enable modules: Merchandising, Production, Inventory, etc.",
      "Set up approval workflows for vouchers and orders",
      "Connect buyers, suppliers, and subcontractors as parties",
    ],
    color: "bg-emerald-600",
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
    color: "bg-purple-600",
  },
];

const timeline = [
  {
    week: "Week 1",
    title: "Foundation",
    activities: [
      "Account setup & company configuration",
      "Chart of accounts import",
      "Core team onboarding & training",
    ],
  },
  {
    week: "Week 2",
    title: "Data Migration",
    activities: [
      "Historical data import",
      "Party master setup (buyers, suppliers)",
      "Inventory opening balances",
    ],
  },
  {
    week: "Week 3",
    title: "Workflow Setup",
    activities: [
      "Module configuration & customization",
      "Approval workflow setup",
      "Integration testing with live data",
    ],
  },
  {
    week: "Week 4",
    title: "Go Live",
    activities: [
      "Parallel run with existing systems",
      "Final data verification",
      "Full production go-live & support",
    ],
  },
];

const support = [
  {
    icon: BookOpen,
    title: "Comprehensive Training",
    description:
      "Role-based training sessions for every team member — from floor supervisors to finance managers. Video tutorials and interactive guides included.",
  },
  {
    icon: Headphones,
    title: "Dedicated Support",
    description:
      "A dedicated account manager and support team available via phone, email, and WhatsApp during business hours. Priority support for critical issues.",
  },
  {
    icon: FileText,
    title: "Documentation & Guides",
    description:
      "Detailed documentation covering every module, feature, and workflow. Step-by-step guides, FAQs, and best practices for the garment industry.",
  },
];

export default function HowItWorksPage() {
  return (
    <PublicLayout>
      <SEOHead
        title="How Prime7 ERP Works | Simple 4-Step Setup | Free Trial"
        description="Get started with Prime7 ERP in 4 simple steps. From signup to full deployment in weeks. See how our affordable garment ERP transforms operations today."
        canonical="https://prime7erp.com/how-it-works"
        keywords="ERP implementation, garment ERP setup, RMG software onboarding, ERP go-live"
        breadcrumbs={[{name: "Home", url: "https://prime7erp.com/"}, {name: "How It Works", url: "https://prime7erp.com/how-it-works"}]}
      />

      <section className="relative bg-gradient-to-br from-primary/5 via-blue-50 to-white py-20 lg:py-28 overflow-hidden">
        <div className="absolute top-10 -left-32 w-80 h-80 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -right-20 w-72 h-72 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-primary/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #F97316 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="absolute top-[18%] left-[12%] w-2 h-2 bg-primary/30 rounded-full animate-pulse pointer-events-none" />
        <div className="absolute top-[30%] right-[10%] w-1.5 h-1.5 bg-accent/30 rounded-full animate-pulse pointer-events-none" />
        <div className="absolute bottom-[25%] left-[25%] w-1 h-1 bg-primary/40 rounded-full animate-pulse pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
            Get Started in{" "}
            <span className="text-primary">3 Simple Steps</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
            From sign-up to go-live in as little as 4 weeks. Our structured onboarding process
            ensures a smooth transition with minimal disruption to your operations.
          </p>
        </div>
      </section>

      <section className="relative py-16 lg:py-24 bg-white overflow-hidden">
        <div className="absolute top-20 -right-40 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 -left-32 w-72 h-72 bg-indigo-400/8 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="space-y-16">
            {steps.map((step, idx) => (
              <div key={step.number}>
                <div
                  className={`grid lg:grid-cols-2 gap-8 lg:gap-16 items-center ${idx % 2 === 1 ? "lg:flex-row-reverse" : ""}`}
                >
                  <div className={idx % 2 === 1 ? "lg:order-2" : ""}>
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`w-12 h-12 rounded-xl ${step.color} flex items-center justify-center text-white`}>
                        <step.icon className="h-6 w-6" />
                      </div>
                      <span className="text-5xl font-bold text-gray-100">{step.number}</span>
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 mb-3">{step.title}</h2>
                    <p className="text-gray-600 text-lg mb-6">{step.description}</p>
                    <ul className="space-y-3">
                      {step.details.map((detail) => (
                        <li key={detail} className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-700">{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={`${idx % 2 === 1 ? "lg:order-1" : ""}`}>
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-8 lg:p-12 border border-gray-200">
                      <div className="flex items-center justify-center">
                        <div className={`w-24 h-24 rounded-2xl ${step.color} flex items-center justify-center text-white shadow-lg`}>
                          <step.icon className="h-12 w-12" />
                        </div>
                      </div>
                      <p className="text-center text-gray-500 mt-6 text-sm font-medium uppercase tracking-wide">
                        Step {step.number}
                      </p>
                      <p className="text-center text-gray-900 mt-1 text-xl font-semibold">
                        {step.title}
                      </p>
                    </div>
                  </div>
                </div>
                {idx < steps.length - 1 && (
                  <div className="h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent mt-16" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-16 lg:py-24 bg-gray-50 overflow-hidden">
        <div className="absolute top-10 -left-20 w-72 h-72 bg-blue-400/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -right-32 w-80 h-80 bg-indigo-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Calendar className="h-4 w-4" />
              Implementation Timeline
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Go Live in 4 Weeks
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Our proven implementation methodology gets you up and running quickly without
              compromising on quality.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {timeline.map((item, idx) => (
              <div key={item.week} className="relative">
                {idx < timeline.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-6 border-t-2 border-dashed border-gray-300 z-10" />
                )}
                <div className="bg-white border border-gray-200 rounded-xl p-6 h-full hover:shadow-lg transition-shadow">
                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-3">
                    {item.week}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">{item.title}</h3>
                  <ul className="space-y-2">
                    {item.activities.map((activity) => (
                      <li key={activity} className="flex items-start gap-2 text-sm text-gray-600">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span>{activity}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-16 lg:py-24 bg-white overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #F97316 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              We're With You Every Step
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Comprehensive support from onboarding to ongoing operations.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {support.map((item) => (
              <div
                key={item.title}
                className="bg-gray-50 border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow"
              >
                <div className="inline-flex p-3 rounded-lg bg-primary/10 text-primary mb-4">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-16 lg:py-24 bg-primary text-white overflow-hidden">
        <img src={techPatternBg} alt="Tech Pattern Background Design" width={1920} height={1080} className="absolute inset-0 w-full h-full object-cover opacity-[0.05] pointer-events-none" loading="lazy" />
        <div className="absolute top-10 -left-20 w-72 h-72 bg-blue-300/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -right-20 w-64 h-64 bg-indigo-300/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h2 className="text-3xl sm:text-4xl font-bold">Start Your Journey Today</h2>
          <p className="mt-4 text-lg text-blue-100 max-w-2xl mx-auto">
            Join hundreds of garment manufacturers who have transformed their operations with Prime7
            ERP. Get started with a free trial — no credit card required.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/app/register">
              <Button size="lg" variant="secondary" className="gap-2">
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white/10 gap-2 bg-transparent"
              >
                Talk to Sales
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

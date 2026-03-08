import { Link } from "wouter";
import { PublicLayout } from "@/components/public/public-layout";
import { SEOHead } from "@/components/public/seo-head";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Check,
  X,
  ChevronDown,
  Star,
  Zap,
  Shield,
  Headphones,
  HelpCircle,
  Globe,
} from "lucide-react";
import { useState } from "react";
import { useCurrency } from "@/hooks/useCurrency";

const basePricesBDT = { starter: 15000, growth: 35000 };
const exchangeRates: Record<string, number> = {
  BDT: 1, USD: 0.00833, GBP: 0.00667, EUR: 0.00767, AED: 0.0306, SAR: 0.0313,
  CAD: 0.01167, AUD: 0.013, INR: 0.7, JPY: 1.25, CNY: 0.06, KRW: 11.17,
  SGD: 0.0112, HKD: 0.065, MYR: 0.0373, THB: 0.292, VND: 208.33, PKR: 2.33,
  LKR: 2.5, MMK: 17.5,
};

const additionalUserBDT = { starter: 2500, growth: 2000 };
const annualBDT = { starter: 144000, growth: 336000 };
const annualFullBDT = { starter: 180000, growth: 420000 };

const comparisonCategories = [
  {
    name: "Users & Companies",
    features: [
      { name: "Users", starter: "Up to 5", growth: "Up to 25", enterprise: "Unlimited" },
      { name: "Companies", starter: "1", growth: "3", enterprise: "Unlimited" },
      { name: "Storage", starter: "5 GB", growth: "50 GB", enterprise: "Unlimited" },
    ],
  },
  {
    name: "Core Modules",
    features: [
      { name: "Accounting & Finance", starter: true, growth: true, enterprise: true },
      { name: "Inventory Management", starter: true, growth: true, enterprise: true },
      { name: "Order Management", starter: true, growth: true, enterprise: true },
      { name: "Production & WIP", starter: false, growth: true, enterprise: true },
      { name: "Merchandising", starter: false, growth: true, enterprise: true },
      { name: "Commercial & LC", starter: false, growth: true, enterprise: true },
      { name: "HR & Payroll", starter: false, growth: true, enterprise: true },
      { name: "Quality Management", starter: false, growth: true, enterprise: true },
    ],
  },
  {
    name: "Analytics & AI",
    features: [
      { name: "Basic Reports", starter: true, growth: true, enterprise: true },
      { name: "Financial Statements", starter: true, growth: true, enterprise: true },
      { name: "AI Analytics", starter: false, growth: true, enterprise: true },
      { name: "Demand Forecasting", starter: false, growth: true, enterprise: true },
      { name: "Custom Report Builder", starter: false, growth: false, enterprise: true },
    ],
  },
  {
    name: "Banking & Payments",
    features: [
      { name: "Bank Account Management", starter: true, growth: true, enterprise: true },
      { name: "Bank Reconciliation", starter: false, growth: true, enterprise: true },
      { name: "Payment Runs", starter: false, growth: true, enterprise: true },
      { name: "Multi-bank Integration", starter: false, growth: false, enterprise: true },
    ],
  },
  {
    name: "Support & Security",
    features: [
      { name: "Email Support", starter: true, growth: true, enterprise: true },
      { name: "Priority Support (24/7)", starter: false, growth: true, enterprise: true },
      { name: "Dedicated Account Manager", starter: false, growth: false, enterprise: true },
      { name: "Audit Logs", starter: false, growth: true, enterprise: true },
      { name: "SSO / SAML", starter: false, growth: false, enterprise: true },
      { name: "SLA Guarantee", starter: false, growth: false, enterprise: true },
      { name: "On-premise Option", starter: false, growth: false, enterprise: true },
      { name: "API Access", starter: false, growth: true, enterprise: true },
    ],
  },
];

function CellValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-sm font-medium text-gray-900">{value}</span>;
  }
  return value ? (
    <Check className="w-5 h-5 text-emerald-500 mx-auto" />
  ) : (
    <X className="w-4 h-4 text-gray-300 mx-auto" />
  );
}

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { currency, setCurrency, formatPrice } = useCurrency();

  const rate = exchangeRates[currency] || exchangeRates["USD"];
  const starterPrice = Math.round(basePricesBDT.starter * rate);
  const growthPrice = Math.round(basePricesBDT.growth * rate);
  const addUserStarter = Math.round(additionalUserBDT.starter * rate);
  const addUserGrowth = Math.round(additionalUserBDT.growth * rate);
  const annualStarter = Math.round(annualBDT.starter * rate);
  const annualGrowth = Math.round(annualBDT.growth * rate);
  const annualFullStarter = Math.round(annualFullBDT.starter * rate);
  const annualFullGrowth = Math.round(annualFullBDT.growth * rate);

  const currencies = [
    { code: "BDT", locale: "en-BD", label: "BDT" },
    { code: "USD", locale: "en-US", label: "$ USD" },
    { code: "GBP", locale: "en-GB", label: "£ GBP" },
    { code: "EUR", locale: "en-IE", label: "€ EUR" },
    { code: "AED", locale: "ar-AE", label: "د.إ AED" },
    { code: "INR", locale: "en-IN", label: "₹ INR" },
    { code: "SAR", locale: "ar-SA", label: "﷼ SAR" },
    { code: "CAD", locale: "en-CA", label: "$ CAD" },
    { code: "AUD", locale: "en-AU", label: "$ AUD" },
  ];

  const plans = [
    {
      name: "Starter",
      price: formatPrice(starterPrice),
      period: "/month",
      description: "Perfect for small garment factories getting started with digital management.",
      popular: false,
      features: [
        "Up to 5 users",
        "Core modules (Accounting, Inventory, Orders)",
        "Basic financial reporting",
        "Email support (business hours)",
        "1 company",
        "5 GB storage",
        "Standard security",
        "Monthly data backup",
      ],
      cta: "Start Free Trial",
      href: "/app/register",
    },
    {
      name: "Growth",
      price: formatPrice(growthPrice),
      period: "/month",
      description: "For growing factories that need complete ERP with AI-powered insights.",
      popular: true,
      features: [
        "Up to 25 users",
        "All modules included",
        "AI analytics & forecasting",
        "Priority support (24/7)",
        "Bank reconciliation",
        "3 companies",
        "50 GB storage",
        "Advanced security & audit logs",
        "Weekly data backup",
        "API access",
      ],
      cta: "Start Free Trial",
      href: "/app/register",
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      description: "For large manufacturers and groups needing custom solutions and dedicated support.",
      popular: false,
      features: [
        "Unlimited users",
        "Custom integrations",
        "Dedicated account manager",
        "On-premise deployment option",
        "SLA guarantee (99.9% uptime)",
        "Unlimited companies",
        "Unlimited storage",
        "Enterprise security & SSO",
        "Real-time data backup",
        "Custom API & webhooks",
        "Priority implementation",
        "Custom training program",
      ],
      cta: "Contact Sales",
      href: "/contact",
    },
  ];

  const faqs = [
    {
      q: "Is there a free trial available?",
      a: "Yes! We offer a 14-day free trial on both Starter and Growth plans with no credit card required. You get full access to all features in the selected plan during the trial period.",
    },
    {
      q: "What payment methods do you accept?",
      a: "We accept bank transfers (BEFTN/NPSB), bKash, Nagad, and credit/debit cards (Visa/Mastercard). For Enterprise plans, we also support cheque payments and custom invoicing.",
    },
    {
      q: "Can I upgrade or downgrade my plan anytime?",
      a: "Yes, you can upgrade at any time and the price difference will be prorated for the remaining billing period. Downgrades take effect at the start of the next billing cycle. Your data is never lost during plan changes.",
    },
    {
      q: "What is your refund policy?",
      a: "We offer a 30-day money-back guarantee on all plans. If you're not satisfied within the first 30 days of your paid subscription, we'll refund the full amount — no questions asked.",
    },
    {
      q: "Do you offer annual billing discounts?",
      a: `Yes! Annual billing saves you 20% compared to monthly pricing. That means Starter is ${formatPrice(annualStarter)}/year (instead of ${formatPrice(annualFullStarter)}) and Growth is ${formatPrice(annualGrowth)}/year (instead of ${formatPrice(annualFullGrowth)}).`,
    },
    {
      q: "How much does it cost to add additional users?",
      a: `Additional users beyond your plan limit can be added at ${formatPrice(addUserStarter)}/user/month for Starter and ${formatPrice(addUserGrowth)}/user/month for Growth plans. Enterprise plans include unlimited users.`,
    },
  ];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };

  return (
    <PublicLayout>
      <SEOHead
        title="Prime7 ERP Pricing | Plans from BDT 15,000/mo | Free Trial"
        description="Transparent ERP pricing for Bangladesh garment manufacturers. Starter, Growth & Enterprise plans. 14-day free trial available. No hidden fees."
        canonical="https://prime7erp.com/pricing"
        keywords="garments ERP pricing, RMG software cost Bangladesh, ERP pricing BDT, garment manufacturing software price"
        jsonLd={faqJsonLd}
        breadcrumbs={[{name: "Home", url: "https://prime7erp.com/"}, {name: "Pricing", url: "https://prime7erp.com/pricing"}]}
      />

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-primary/5 via-blue-50 to-white py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            14-Day Free Trial
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Simple, Transparent
            <br />
            <span className="text-primary">Pricing</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-6">
            No hidden fees. No surprise charges. Choose the plan that fits your factory
            and scale as you grow.
          </p>
          <div className="inline-flex items-center gap-2">
            <Globe className="w-4 h-4 text-gray-400" />
            <select
              value={currency}
              onChange={(e) => {
                const sel = currencies.find(c => c.code === e.target.value);
                if (sel) setCurrency(sel.code, sel.locale);
              }}
              className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50"
            >
              {currencies.map(c => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-16 lg:py-24 bg-white -mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl border ${
                  plan.popular
                    ? "border-primary shadow-xl shadow-primary/10 scale-[1.02] lg:scale-105"
                    : "border-gray-200 shadow-sm"
                } bg-white overflow-hidden flex flex-col`}
              >
                {plan.popular && (
                  <div className="bg-primary text-white text-center py-2 text-sm font-semibold flex items-center justify-center gap-1.5">
                    <Star className="w-4 h-4 fill-current" /> MOST POPULAR
                  </div>
                )}
                <div className="p-6 lg:p-8 flex-1 flex flex-col">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h3>
                  <p className="text-sm text-gray-500 mb-6">{plan.description}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                    <span className="text-gray-500 text-sm">{plan.period}</span>
                  </div>
                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={plan.href}>
                    <Button
                      className={`w-full gap-2 ${plan.popular ? "" : "variant-outline"}`}
                      variant={plan.popular ? "default" : "outline"}
                      size="lg"
                    >
                      {plan.cta} <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-8">
            All plans include SSL encryption, daily backups, and 99.9% uptime. VAT applicable as per Bangladesh law.
          </p>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Compare Plans in Detail
            </h2>
            <p className="text-lg text-gray-600">
              See exactly what's included in each plan.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="grid grid-cols-4 border-b border-gray-200 bg-gray-50">
              <div className="p-4 lg:p-6">
                <span className="text-sm font-medium text-gray-500">Features</span>
              </div>
              <div className="p-4 lg:p-6 text-center border-l border-gray-200">
                <span className="text-sm font-bold text-gray-900">Starter</span>
                <p className="text-xs text-gray-500 mt-0.5">{formatPrice(starterPrice)}/mo</p>
              </div>
              <div className="p-4 lg:p-6 text-center border-l border-gray-200 bg-primary/5">
                <span className="text-sm font-bold text-primary">Growth</span>
                <p className="text-xs text-gray-500 mt-0.5">{formatPrice(growthPrice)}/mo</p>
              </div>
              <div className="p-4 lg:p-6 text-center border-l border-gray-200">
                <span className="text-sm font-bold text-gray-900">Enterprise</span>
                <p className="text-xs text-gray-500 mt-0.5">Custom</p>
              </div>
            </div>

            {/* Categories */}
            {comparisonCategories.map((category) => (
              <div key={category.name}>
                <div className="grid grid-cols-4 bg-gray-50/50 border-b border-gray-100">
                  <div className="col-span-4 p-3 lg:px-6">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {category.name}
                    </span>
                  </div>
                </div>
                {category.features.map((feature, i) => (
                  <div
                    key={feature.name}
                    className={`grid grid-cols-4 ${
                      i < category.features.length - 1 ? "border-b border-gray-100" : "border-b border-gray-200"
                    }`}
                  >
                    <div className="p-3 lg:px-6 lg:py-3.5 flex items-center">
                      <span className="text-sm text-gray-700">{feature.name}</span>
                    </div>
                    <div className="p-3 lg:px-6 lg:py-3.5 flex items-center justify-center border-l border-gray-100">
                      <CellValue value={feature.starter} />
                    </div>
                    <div className="p-3 lg:px-6 lg:py-3.5 flex items-center justify-center border-l border-gray-100 bg-primary/[0.02]">
                      <CellValue value={feature.growth} />
                    </div>
                    <div className="p-3 lg:px-6 lg:py-3.5 flex items-center justify-center border-l border-gray-100">
                      <CellValue value={feature.enterprise} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Guarantees */}
      <section className="py-12 bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-3 gap-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">30-Day Money Back</h3>
                <p className="text-sm text-gray-500">Full refund, no questions asked</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center flex-shrink-0">
                <Headphones className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Free Onboarding</h3>
                <p className="text-sm text-gray-500">Setup help & team training included</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <HelpCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Migration Support</h3>
                <p className="text-sm text-gray-500">We help move your data from Excel/Tally</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Pricing FAQ
            </h2>
            <p className="text-lg text-gray-600">
              Common questions about billing, plans, and payments.
            </p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-gray-900 pr-4">{faq.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${
                      openFaq === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-gray-600 text-sm leading-relaxed border-t border-gray-100 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Start Your Free Trial Today
          </h2>
          <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
            No credit card required. Get full access for 14 days and see how Prime7 ERP
            can transform your garment business operations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/app/register">
              <Button size="lg" variant="secondary" className="gap-2 text-base px-8 bg-white text-primary hover:bg-gray-50">
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="gap-2 text-base px-8 text-white border-white hover:bg-white/10 bg-transparent">
                Contact Sales
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

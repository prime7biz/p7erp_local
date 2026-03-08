import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, X, ChevronDown, Star, Zap, Shield, Headphones, HelpCircle, Globe } from "lucide-react";

const basePricesBDT = { starter: 15000, growth: 35000 };
const exchangeRates: Record<string, number> = {
  BDT: 1, USD: 0.00833, GBP: 0.00667, EUR: 0.00767, AED: 0.0306, INR: 0.7,
};

function formatPrice(value: number, currency: string): string {
  if (currency === "BDT") return `BDT ${value.toLocaleString("en-BD")}`;
  if (currency === "USD") return `$ ${value.toLocaleString("en-US")}`;
  if (currency === "GBP") return `£ ${value.toLocaleString("en-GB")}`;
  if (currency === "EUR") return `€ ${value.toLocaleString("en-IE")}`;
  if (currency === "AED") return `AED ${value.toLocaleString("en-AE")}`;
  if (currency === "INR") return `₹ ${value.toLocaleString("en-IN")}`;
  return `${value}`;
}

const comparisonCategories = [
  {
    name: "Core",
    features: [
      { name: "Accounting & Finance", starter: true, growth: true, enterprise: true },
      { name: "Inventory", starter: true, growth: true, enterprise: true },
      { name: "Production & WIP", starter: false, growth: true, enterprise: true },
      { name: "Merchandising", starter: false, growth: true, enterprise: true },
      { name: "AI Analytics", starter: false, growth: true, enterprise: true },
    ],
  },
  {
    name: "Support",
    features: [
      { name: "Email Support", starter: true, growth: true, enterprise: true },
      { name: "Priority Support (24/7)", starter: false, growth: true, enterprise: true },
      { name: "Dedicated Account Manager", starter: false, growth: false, enterprise: true },
    ],
  },
];

function CellValue({ value }: { value: boolean }) {
  return value ? <Check className="w-5 h-5 text-emerald-500 mx-auto" /> : <X className="w-4 h-4 text-gray-300 mx-auto" />;
}

const faqs = [
  { q: "Is there a free trial available?", a: "Yes! We offer a free trial with no credit card required. You get full access to core features during the trial period." },
  { q: "What payment methods do you accept?", a: "We accept bank transfers, bKash, Nagad, and credit/debit cards. For Enterprise plans we support custom invoicing." },
  { q: "Can I upgrade or downgrade anytime?", a: "Yes. Upgrades take effect immediately with prorated billing. Downgrades take effect at the start of the next billing cycle." },
];

export function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [currency, setCurrency] = useState("BDT");
  const rate = exchangeRates[currency] ?? 1;
  const starterPrice = Math.round(basePricesBDT.starter * rate);
  const growthPrice = Math.round(basePricesBDT.growth * rate);

  const plans = [
    {
      name: "Starter",
      price: formatPrice(starterPrice, currency),
      period: "/month",
      description: "Perfect for small garment factories getting started with digital management.",
      popular: false,
      features: ["Up to 5 users", "Core modules (Accounting, Inventory, Orders)", "Email support (business hours)", "1 company", "5 GB storage"],
      cta: "Start Free Trial",
      href: "/signup",
    },
    {
      name: "Growth",
      price: formatPrice(growthPrice, currency),
      period: "/month",
      description: "For growing factories that need complete ERP with AI-powered insights.",
      popular: true,
      features: ["Up to 25 users", "All modules included", "AI analytics & forecasting", "Priority support (24/7)", "Bank reconciliation", "50 GB storage", "API access"],
      cta: "Start Free Trial",
      href: "/signup",
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      description: "For large manufacturers needing custom solutions.",
      popular: false,
      features: ["Unlimited users", "Custom integrations", "Dedicated account manager", "SLA guarantee", "Unlimited storage", "SSO / API"],
      cta: "Contact Sales",
      href: "/contact",
    },
  ];

  const currencies = [
    { code: "BDT", label: "BDT" },
    { code: "USD", label: "$ USD" },
    { code: "GBP", label: "£ GBP" },
    { code: "EUR", label: "€ EUR" },
    { code: "INR", label: "₹ INR" },
  ];

  return (
    <>
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
            No hidden fees. Choose the plan that fits your factory and scale as you grow.
          </p>
          <div className="inline-flex items-center gap-2">
            <Globe className="w-4 h-4 text-gray-400" />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50"
            >
              {currencies.map((c) => (
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
                  plan.popular ? "border-primary shadow-xl shadow-primary/10 scale-[1.02] lg:scale-105" : "border-gray-200 shadow-sm"
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
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-700">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={plan.href}
                    className={`block w-full text-center rounded-xl py-3 font-medium ${plan.popular ? "bg-primary text-white hover:bg-primary/90" : "border border-gray-200 text-gray-700 hover:bg-gray-50"}`}
                  >
                    {plan.cta} <ArrowRight className="inline w-4 h-4 ml-1" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-8">
            All plans include SSL encryption, daily backups, and 99.9% uptime.
          </p>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Compare Plans in Detail</h2>
            <p className="text-lg text-gray-600">See exactly what&apos;s included in each plan.</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="grid grid-cols-4 border-b border-gray-200 bg-gray-50">
              <div className="p-4 lg:p-6"><span className="text-sm font-medium text-gray-500">Features</span></div>
              <div className="p-4 lg:p-6 text-center border-l border-gray-200"><span className="text-sm font-bold text-gray-900">Starter</span></div>
              <div className="p-4 lg:p-6 text-center border-l border-gray-200 bg-primary/5"><span className="text-sm font-bold text-primary">Growth</span></div>
              <div className="p-4 lg:p-6 text-center border-l border-gray-200"><span className="text-sm font-bold text-gray-900">Enterprise</span></div>
            </div>
            {comparisonCategories.map((category) => (
              <div key={category.name}>
                <div className="grid grid-cols-4 bg-gray-50/50 border-b border-gray-100">
                  <div className="col-span-4 p-3 lg:px-6">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{category.name}</span>
                  </div>
                </div>
                {category.features.map((feature, i) => (
                  <div key={feature.name} className={`grid grid-cols-4 ${i < category.features.length - 1 ? "border-b border-gray-100" : ""}`}>
                    <div className="p-3 lg:px-6 lg:py-3.5 flex items-center"><span className="text-sm text-gray-700">{feature.name}</span></div>
                    <div className="p-3 lg:px-6 lg:py-3.5 flex justify-center border-l border-gray-100"><CellValue value={feature.starter} /></div>
                    <div className="p-3 lg:px-6 lg:py-3.5 flex justify-center border-l border-gray-100 bg-primary/[0.02]"><CellValue value={feature.growth} /></div>
                    <div className="p-3 lg:px-6 lg:py-3.5 flex justify-center border-l border-gray-100"><CellValue value={feature.enterprise} /></div>
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
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0"><Shield className="w-6 h-6" /></div>
              <div>
                <h3 className="font-semibold text-gray-900">30-Day Money Back</h3>
                <p className="text-sm text-gray-500">Full refund, no questions asked</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center flex-shrink-0"><Headphones className="w-6 h-6" /></div>
              <div>
                <h3 className="font-semibold text-gray-900">Free Onboarding</h3>
                <p className="text-sm text-gray-500">Setup help & team training included</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center flex-shrink-0"><HelpCircle className="w-6 h-6" /></div>
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Pricing FAQ</h2>
            <p className="text-lg text-gray-600">Common questions about billing and plans.</p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-gray-900 pr-4">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-gray-600 text-sm leading-relaxed border-t border-gray-100 pt-4">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-24 bg-primary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Start Your Free Trial Today</h2>
          <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
            No credit card required. Get full access for 14 days.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-primary px-8 py-3 text-base font-medium hover:bg-gray-50">
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/contact" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white text-white px-8 py-3 text-base font-medium hover:bg-white/10">
              Contact Sales
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

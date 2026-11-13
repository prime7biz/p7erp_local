/**
 * The one list of public price plans, shown on /pricing (PricingPage) and in the homepage pricing teaser (Landing).
 * User limits must match the plans platform admins sell (subscription plan `max_users` in Admin → Billing).
 */
export type PricingPlanId = "starter" | "growth" | "enterprise";

export interface PricingPlan {
  id: PricingPlanId;
  name: string;
  /** Monthly price in BDT; null = custom quote. */
  priceBDT: number | null;
  users: string;
  description: string;
  /** Everything included apart from the user limit; the first items are shown in the homepage teaser. */
  features: string[];
  popular: boolean;
  cta: string;
  href: string;
}

export const PRICING_PLANS: readonly PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    priceBDT: 15000,
    users: "Up to 5 users",
    description: "Perfect for small garment factories getting started with digital management.",
    features: ["Core modules (Accounting, Inventory, Orders)", "Email support (business hours)", "1 company", "5 GB storage"],
    popular: false,
    cta: "Start Free Trial",
    href: "/signup",
  },
  {
    id: "growth",
    name: "Growth",
    priceBDT: 35000,
    users: "Up to 25 users",
    description: "For growing factories that need complete ERP with AI-powered insights.",
    features: [
      "All modules included",
      "AI analytics & forecasting",
      "Priority support (24/7)",
      "Bank reconciliation",
      "50 GB storage",
      "API access",
    ],
    popular: true,
    cta: "Start Free Trial",
    href: "/signup",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceBDT: null,
    users: "Unlimited users",
    description: "For large manufacturers needing custom solutions.",
    features: ["Custom integrations", "Dedicated account manager", "SLA guarantee", "Unlimited storage", "SSO / API"],
    popular: false,
    cta: "Contact Sales",
    href: "/contact",
  },
];

/** Number of features shown per plan in the homepage teaser. */
export const TEASER_FEATURE_COUNT = 4;

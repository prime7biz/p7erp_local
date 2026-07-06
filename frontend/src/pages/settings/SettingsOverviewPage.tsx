import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, CreditCard, ExternalLink, Loader2 } from "lucide-react";

import { api, ApiError } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

const cards = [
  {
    title: "Configuration",
    description: "Company profile, domain, logo, and tenant type.",
    to: "/app/settings/config",
  },
  {
    title: "Users",
    description: "Create users, assign roles, and control account status.",
    to: "/app/settings/users",
  },
  {
    title: "Roles & Permissions",
    description: "Manage role definitions and permission matrix.",
    to: "/app/settings/roles",
  },
  {
    title: "Activity Logs",
    description: "Track settings and operational actions with filters.",
    to: "/app/settings/audit",
  },
  {
    title: "Currency",
    description: "Maintain exchange rates for multi-currency operations.",
    to: "/app/settings/currency",
  },
  {
    title: "Backup & Restore",
    description: "Trigger backups, review history, and start restore actions.",
    to: "/app/settings/backup",
  },
  {
    title: "Statutory compliance",
    description: "Bangladesh VAT/VDS/TDS rates, bonded warehouse UD/UP, and payroll statutory.",
    to: "/app/settings/statutory-compliance",
  },
  {
    title: "Data import",
    description: "CSV migration for customers, vendors, items, and chart of accounts.",
    to: "/app/settings/data-import",
  },
  {
    title: "Bulk tenant onboarding",
    description: "Create customer factory tenants in batches with generated company codes.",
    to: "/app/settings/bulk-tenant-onboarding",
  },
];

const defaultVariantId =
  (import.meta.env.VITE_LEMONSQUEEZY_CHECKOUT_VARIANT_ID as string | undefined)?.trim() ?? "";

export function SettingsOverviewPage() {
  const [variantId, setVariantId] = useState(defaultVariantId);
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const lsSuccess =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ls_success") === "1";

  async function startLemonSqueezyCheckout() {
    const vid = variantId.trim();
    if (!vid) {
      window.alert(
        "Enter a Lemon Squeezy variant ID (from Lemon Squeezy → Products → variant, or match it to a platform plan in admin billing).",
      );
      return;
    }
    setBusy(true);
    try {
      const email = checkoutEmail.trim() || undefined;
      const { checkout_url: checkoutUrl } = await api.createLemonSqueezyCheckout({
        variant_id: vid,
        ...(email ? { email } : {}),
      });
      window.location.href = checkoutUrl;
    } catch (e) {
      logApiError("SettingsOverviewPage.createLemonSqueezyCheckout", e);
      const msg = e instanceof ApiError ? e.message : "Checkout failed";
      window.alert(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary">Settings overview</h2>
        <p className="text-sm text-text-muted">
          Central hub for tenant administration. Billing checkout below is available to tenant admins only.
        </p>
      </div>

      {lsSuccess ? (
        <div
          className="flex gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950 shadow-sm"
          role="status"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          <div>
            <p className="font-medium text-emerald-900">Checkout completed</p>
            <p className="mt-0.5 text-emerald-800/90">
              Thank you. If your Lemon Squeezy webhook is configured, your subscription will update automatically within a
              few moments.
            </p>
          </div>
        </div>
      ) : null}

      <section
        className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.03]"
        aria-labelledby="ls-billing-heading"
      >
        <div className="border-b border-border/80 bg-gradient-to-r from-brand-primary/[0.06] to-transparent px-4 py-3 sm:px-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
              <CreditCard className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 id="ls-billing-heading" className="text-sm font-semibold text-text-primary">
                Subscription and licensing
              </h3>
              <p className="mt-0.5 text-sm text-text-muted">
                Pay securely via Lemon Squeezy (Merchant of Record). Your tenant and user are attached to the checkout so
                webhooks can activate the right plan.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="ls-variant-id" className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Variant ID
              </label>
              <input
                id="ls-variant-id"
                type="text"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary shadow-inner outline-none ring-brand-primary/20 transition focus:border-brand-primary/40 focus:ring-2"
                placeholder="e.g. 123456"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                disabled={busy}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ls-checkout-email" className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Checkout email <span className="font-normal normal-case text-text-muted">(optional)</span>
              </label>
              <input
                id="ls-checkout-email"
                type="email"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary shadow-inner outline-none ring-brand-primary/20 transition focus:border-brand-primary/40 focus:ring-2"
                placeholder="Defaults to your account email"
                value={checkoutEmail}
                onChange={(e) => setCheckoutEmail(e.target.value)}
                disabled={busy}
                autoComplete="email"
              />
            </div>
          </div>

          <p className="text-xs text-text-muted">
            Map each variant to a platform plan in the super-admin billing screen so paid orders sync to your tenant
            subscription.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:pointer-events-none disabled:opacity-50"
              onClick={() => void startLemonSqueezyCheckout()}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Opening checkout…
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Continue to Lemon Squeezy checkout
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="rounded-xl border border-border bg-surface-raised p-4 transition hover:border-brand-primary/30 hover:shadow-sm"
          >
            <h3 className="text-sm font-semibold text-text-primary">{card.title}</h3>
            <p className="mt-1 text-sm text-text-muted">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

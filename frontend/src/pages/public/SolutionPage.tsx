import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { getSolutionPageMeta } from "@/config/solutionPages";
import { getSolutionPageContent } from "@/data/marketing/solutionPageContent";
import { NotFoundPage } from "@/pages/public/NotFoundPage";

const btnPrimary =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-base font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 transition-colors";
const btnOutline =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border px-6 py-3 text-base font-semibold text-text-secondary hover:border-brand-primary hover:text-brand-primary hover:bg-brand-primary/5 transition-colors";

/** One public solution page (route list: src/config/solutionPages.ts, text: solutionPageContent.ts). */
export function SolutionPage({ path }: { path: string }) {
  const page = getSolutionPageContent(path);
  if (!page) return <NotFoundPage />;

  return (
    <>
      <section className="relative bg-gradient-to-br from-brand-primary/5 via-surface-raised to-surface-raised py-16 lg:py-24 overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="mb-6 text-sm text-text-muted">
            <ol className="flex flex-wrap items-center gap-1">
              <li>
                <Link to="/" className="hover:text-brand-primary">
                  Home
                </Link>
              </li>
              <li aria-hidden>
                <ChevronRight className="h-3.5 w-3.5" />
              </li>
              <li>
                <Link to="/features" className="hover:text-brand-primary">
                  Features
                </Link>
              </li>
              <li aria-hidden>
                <ChevronRight className="h-3.5 w-3.5" />
              </li>
              <li aria-current="page" className="text-text-secondary">
                {getSolutionPageMeta(page.path)?.label ?? page.eyebrow}
              </li>
            </ol>
          </nav>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-primary mb-3">{page.eyebrow}</p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-text-primary leading-tight">
            {page.h1}
          </h1>
          {page.intro.map((p) => (
            <p key={p} className="mt-6 text-lg text-text-secondary leading-relaxed max-w-3xl">
              {p}
            </p>
          ))}
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              to="/book-demo"
              className={btnPrimary}
              onClick={() => trackEvent("cta_click", { cta: "book_demo", from: `solution:${page.path}` })}
            >
              Book a demo <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to="/signup"
              className={btnOutline}
              onClick={() => trackEvent("cta_click", { cta: "signup", from: `solution:${page.path}` })}
            >
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-surface-raised" aria-labelledby="challenges-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 id="challenges-heading" className="font-display text-3xl font-semibold tracking-tight text-text-primary mb-10">
            {page.challengesHeading}
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {page.challenges.map((c) => (
              <div key={c.title} className="rounded-xl border border-border bg-surface-subtle p-6">
                <h3 className="text-lg font-semibold text-text-primary">{c.title}</h3>
                <p className="mt-2 text-text-secondary leading-relaxed">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-surface-subtle" aria-labelledby="features-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 id="features-heading" className="font-display text-3xl font-semibold tracking-tight text-text-primary mb-10">
            {page.featuresHeading}
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {page.features.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-surface-raised p-6 shadow-sm">
                <h3 className="text-xl font-semibold text-text-primary">{f.title}</h3>
                <p className="mt-2 text-text-secondary">{f.text}</p>
                <ul className="mt-4 space-y-2">
                  {f.points.map((point) => (
                    <li key={point} className="flex items-start gap-2 text-sm text-text-secondary">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-surface-raised" aria-labelledby="workflow-heading">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 id="workflow-heading" className="font-display text-3xl font-semibold tracking-tight text-text-primary mb-8">
            {page.workflowHeading}
          </h2>
          <ol className="space-y-3">
            {page.workflow.map((step, i) => (
              <li key={step} className="flex items-start gap-4 rounded-lg border border-border-subtle bg-surface-subtle p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-brand-primary-foreground">
                  {i + 1}
                </span>
                <span className="pt-1 text-text-primary">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-surface-subtle" aria-labelledby="faq-heading">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 id="faq-heading" className="font-display text-3xl font-semibold tracking-tight text-text-primary mb-8">
            Frequently asked questions
          </h2>
          <div className="space-y-3">
            {page.faqs.map((faq) => (
              <details key={faq.q} className="group rounded-xl border border-border bg-surface-raised">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-text-primary [&::-webkit-details-marker]:hidden">
                  <h3 className="text-base font-semibold">{faq.q}</h3>
                  <ChevronDown className="h-5 w-5 shrink-0 text-text-muted transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="border-t border-border-subtle px-5 py-4 text-text-secondary leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-surface-raised" aria-labelledby="related-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 id="related-heading" className="font-display text-3xl font-semibold tracking-tight text-text-primary mb-8">
            Related pages
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {page.related.map((r) => (
              <Link
                key={r.to}
                to={r.to}
                className="group rounded-xl border border-border bg-surface-subtle p-5 hover:border-brand-primary/40 hover:shadow-sm transition-all"
              >
                <span className="font-semibold text-text-primary group-hover:text-brand-primary">{r.label}</span>
                <span className="mt-1 block text-sm text-text-secondary">{r.text}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-gray-900" aria-labelledby="cta-heading">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 id="cta-heading" className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            See it with one of your own orders
          </h2>
          <p className="mt-4 text-lg text-white/90">
            Book a live demo and we will walk through your workflow in Prime7 ERP, or start a free trial and explore it yourself.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/book-demo"
              className={btnPrimary}
              onClick={() => trackEvent("cta_click", { cta: "book_demo", from: `solution_footer:${page.path}` })}
            >
              Book a demo <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to="/contact"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/40 px-6 py-3 text-base font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Contact sales
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

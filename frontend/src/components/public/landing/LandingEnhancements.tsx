import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUp,
  Building2,
  CheckCircle2,
  ChevronUp,
  Clock3,
  Factory,
  MessageCircle,
  PlayCircle,
  Quote,
  ShieldCheck,
  Users,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { customerLogos, industrySegments, testimonials } from "@/data/marketing/socialProof";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Verifiable product facts only — no invented usage numbers. */
const productFacts = [
  { label: "Inquiry → shipment", value: "One workflow" },
  { label: "Merch · Production · Finance · HR", value: "One platform" },
  { label: "Every voucher & document", value: "Audit trail" },
  { label: "Office hours (BST)", value: "Local support" },
] as const;

/** Controls the product actually enforces (not certifications we have not earned). */
const securityControls = ["Tenant data isolation", "Login lockout & rate limits", "Role-based permissions"] as const;

export const DEMO_VIDEO_SRC = "/demo-intro.mp4";

const processSteps = [
  {
    title: "Inquiry & Costing",
    detail: "Create inquiries, auto-build BOM-based costing, and compare buyer targets with margin safeguards.",
  },
  {
    title: "Sample & Approval",
    detail: "Track sample versions, approvals, and comments from buyers with deadline alerts.",
  },
  {
    title: "Order Planning",
    detail: "Convert confirmed orders into production plans with capacity, line, and material readiness checks.",
  },
  {
    title: "Production & Quality",
    detail: "Monitor cutting, sewing, finishing, inline QA, and final inspection in one live workflow.",
  },
  {
    title: "Commercial & Shipment",
    detail: "Manage LC docs, packing, dispatch, and shipping milestones with complete traceability.",
  },
];

/** Accessible video dialog for the product demo (Escape / backdrop closes). */
export function DemoVideoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Prime7 ERP product demo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 rounded-lg px-2 py-1 text-sm text-white hover:bg-white/10"
          aria-label="Close demo video"
        >
          <X className="h-5 w-5" />
        </button>
        <video src={DEMO_VIDEO_SRC} controls autoPlay playsInline className="w-full rounded-xl bg-black shadow-2xl">
          Your browser does not support embedded video.
        </video>
      </div>
    </div>
  );
}

export function HeroEnhancedSection() {
  const [demoOpen, setDemoOpen] = useState(false);
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-900 to-gray-900 text-white">
      {/* Background layers */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(249,115,22,0.2),transparent),radial-gradient(ellipse_60%_80%_at_80%_50%,rgba(249,115,22,0.08),transparent),radial-gradient(ellipse_40%_60%_at_20%_80%,rgba(255,255,255,0.05),transparent)]" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-80" aria-hidden="true" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-24 sm:pt-20 sm:pb-28 md:pt-24 md:pb-32 lg:pt-24 lg:pb-40">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="text-center lg:text-left order-2 lg:order-1">
            <Badge variant="accent" className="mb-5 sm:mb-6">
              AI-Powered ERP for Garment & Apparel
            </Badge>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold tracking-tight leading-[1.08] text-white">
              The AI-Powered Cloud ERP Built Exclusively for Garment Manufacturers.
            </h1>
            <p className="mt-5 sm:mt-6 text-sm sm:text-base md:text-lg text-white/90 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Manage merchandising, production, inventory, LC processing, and accounting in one unified platform. Stop relying on disconnected Excel sheets.
            </p>
            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link
                to="/signup"
                onClick={() => trackEvent("signup_started", { from: "hero" })}
                className="w-full sm:w-auto inline-flex justify-center"
              >
                <Button variant="cta" size="lg" className="w-full sm:w-auto whitespace-nowrap min-w-0 bg-brand-primary text-brand-primary-foreground hover:bg-brand-primary/90 shadow-xl shadow-brand-primary/30 border-0">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4 shrink-0" />
                </Button>
              </Link>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setDemoOpen(true)}
                className="w-full sm:w-auto whitespace-nowrap bg-white/10 border-white/35 text-white hover:bg-white/20"
              >
                <PlayCircle className="mr-2 h-5 w-5 text-brand-primary shrink-0" />
                Watch Demo
              </Button>
            </div>
            <p className="mt-4 text-sm text-white/80">
              Prefer a guided tour?{" "}
              <Link
                to="/book-demo"
                onClick={() => trackEvent("cta_click", { cta: "book_demo", from: "hero" })}
                className="font-semibold text-white underline decoration-brand-primary underline-offset-4 hover:text-brand-primary"
              >
                Book a 45-minute live demo
              </Link>{" "}
              or{" "}
              <Link to="/roi-calculator" className="font-semibold text-white underline decoration-white/40 underline-offset-4 hover:text-brand-primary">
                estimate your time savings
              </Link>
              .
            </p>
            <DemoVideoDialog open={demoOpen} onClose={() => setDemoOpen(false)} />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="relative order-1 lg:order-2"
          >
            <div className="rounded-xl border border-border bg-surface-raised/5 shadow-2xl overflow-hidden">
              <div className="rounded-xl overflow-hidden bg-gray-900/90 border border-border/50">
                <div className="h-8 sm:h-10 border-b border-border/50 bg-gray-900/80 px-3 sm:px-4 flex items-center gap-2">
                  <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-status-danger" />
                  <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-status-warning" />
                  <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-status-success" />
                  <span className="ml-2 sm:ml-3 text-xs font-medium text-white/70">Prime7 ERP Dashboard</span>
                </div>
                <div className="relative aspect-video sm:aspect-[16/10] bg-gradient-to-br from-gray-900 to-gray-900">
                  <picture className="contents">
                    <source srcSet="/images/prime7-dashboard.webp" type="image/webp" />
                    <img
                      src="/images/prime7-dashboard.png"
                      alt="Prime7 ERP home dashboard with approvals, TNA, alerts and order KPIs"
                      className="absolute inset-0 w-full h-full object-cover object-top"
                      loading="eager"
                      fetchPriority="high"
                      width={800}
                      height={500}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const placeholder = e.currentTarget.parentElement?.nextElementSibling as HTMLElement | null;
                        if (placeholder) placeholder.classList.remove("hidden");
                      }}
                    />
                  </picture>
                  <div className="absolute inset-0 hidden flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-900" aria-hidden="true">
                    <span className="text-sm font-medium text-white/80">Dashboard preview</span>
                  </div>
                </div>
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.25, duration: 0.45 }}
              className="hidden sm:flex absolute -bottom-6 lg:-bottom-10 left-2 right-2 lg:left-auto lg:right-0 lg:max-w-[220px] rounded-xl border border-white/20 bg-gray-900/95 backdrop-blur-md px-3 py-2.5 sm:px-4 sm:py-3 items-center gap-3 shadow-xl"
            >
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-brand-primary/20 text-brand-primary flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <p className="min-w-0 text-sm font-semibold text-white">Real product screen, demo data</p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function MarqueeItems({ copy }: { copy: boolean }) {
  const items =
    customerLogos.length > 0
      ? customerLogos.map((logo) => (
          <img
            key={logo.name}
            src={logo.src}
            alt={copy ? "" : logo.name}
            className="h-8 w-auto opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0"
            loading="lazy"
          />
        ))
      : industrySegments.map((segment) => (
          <span
            key={segment}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface-subtle px-4 py-1.5 text-sm font-medium text-text-secondary"
          >
            <Factory className="h-3.5 w-3.5 text-text-muted" aria-hidden />
            {segment}
          </span>
        ));
  return (
    <div className="flex shrink-0 items-center gap-4 pr-4" data-marquee-copy={copy} aria-hidden={copy || undefined}>
      {items}
    </div>
  );
}

/** Scrolling strip: approved customer logos when `customerLogos` has entries, otherwise the segments we serve. */
export function LandingTrustLogoStrip() {
  const heading =
    customerLogos.length > 0
      ? "Trusted by garment and apparel businesses"
      : "Built in Bangladesh for garment manufacturers, buying houses and export-oriented apparel businesses";
  return (
    <section className="py-8 bg-surface-raised border-b border-border-subtle" aria-label="Who Prime7 ERP is for">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-text-secondary text-sm mb-5">{heading}</p>
        <div className="marquee-viewport overflow-hidden">
          <div className="marquee-track">
            <MarqueeItems copy={false} />
            <MarqueeItems copy />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Customer quotes from `testimonials`; renders nothing until approved quotes are added. */
export function TestimonialsSection() {
  if (testimonials.length === 0) return null;
  return (
    <section className="py-20 lg:py-24 bg-surface-subtle" aria-labelledby="testimonials-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-sm font-medium text-brand-pressed uppercase tracking-wide mb-2">Customer stories</p>
          <h2 id="testimonials-heading" className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-text-primary">
            What garment teams say about Prime7
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t) => (
            <figure
              key={`${t.company}-${t.role}`}
              className="flex h-full flex-col rounded-2xl border border-border bg-surface-raised p-6 shadow-card"
            >
              <Quote className="h-6 w-6 text-brand-primary" aria-hidden />
              <blockquote className="mt-4 flex-1 text-text-secondary leading-relaxed">&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption className="mt-6 border-t border-border-subtle pt-4 text-sm">
                {t.name ? <p className="font-semibold text-text-primary">{t.name}</p> : null}
                <p className="text-text-secondary">
                  {t.role}, {t.company}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TrustBadgesBar() {
  return (
    <section className="bg-gray-900 text-white py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {productFacts.map((fact) => (
            <div key={fact.label} className="rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-center">
              <p className="text-xl font-bold text-brand-primary">{fact.value}</p>
              <p className="text-xs sm:text-sm text-white/80">{fact.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-center items-center gap-2 text-xs">
          {securityControls.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 rounded-full bg-white/12 border border-white/20 px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-brand-primary" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

const beforePoints = [
  "Scattered Excel files and manual updates",
  "Delayed reports and duplicate data entry",
  "No single view of orders, production, or finance",
];
const afterPoints = [
  "One platform for merchandising, production & finance",
  "Real-time dashboards and automated reports",
  "Unified visibility from inquiry to shipment",
];

export function BeforeAfterSection() {
  return (
    <section className="py-20 lg:py-28 bg-white overflow-x-clip">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-text-primary">Before vs After Prime7 ERP</h2>
          <p className="mt-5 text-lg text-text-secondary max-w-3xl mx-auto leading-relaxed">See the difference between fragmented tools and one unified ERP workflow.</p>
        </div>
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="h-full"
          >
            <Card className="h-full border-2 border-status-danger/20 bg-gradient-to-b from-status-danger-subtle/80 to-surface-raised rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-status-danger-subtle flex items-center justify-center">
                    <XCircle className="h-6 w-6 text-status-danger-foreground" />
                  </div>
                  <CardTitle className="text-status-danger-foreground text-xl">Without Prime7 ERP</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  {beforePoints.map((point, i) => (
                    <motion.li
                      key={point}
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.1 * i, duration: 0.3 }}
                      className="flex items-start gap-3 text-sm text-text-secondary"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-status-danger shrink-0" />
                      <span>{point}</span>
                    </motion.li>
                  ))}
                </ul>
                <p className="text-sm text-status-danger-foreground/90 leading-relaxed pt-1">Disconnected spreadsheets, duplicate entries, and delayed reporting.</p>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="h-full"
          >
            <Card className="h-full border-2 border-brand-primary/25 bg-gradient-to-b from-brand-primary/5 to-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-brand-primary/15 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-brand-primary" />
                  </div>
                  <CardTitle className="text-brand-primary text-xl">With Prime7 ERP</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  {afterPoints.map((point, i) => (
                    <motion.li
                      key={point}
                      initial={{ opacity: 0, x: 8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.1 * i, duration: 0.3 }}
                      className="flex items-start gap-3 text-sm text-text-secondary"
                    >
                      <CheckCircle2 className="h-4 w-4 text-brand-primary shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </motion.li>
                  ))}
                </ul>
                <p className="text-sm text-text-secondary leading-relaxed pt-1">Unified dashboard with live insights across operations, finance, and planning.</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export function InteractiveProcessFlowSection() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <section className="py-20 lg:py-24 bg-surface-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-text-primary">Interactive Process Flow</h2>
          <p className="mt-4 text-lg text-text-secondary max-w-3xl mx-auto leading-relaxed">Hover or tap each stage to view how Prime7 ERP keeps teams aligned from first inquiry to shipment.</p>
        </div>
        <div className="relative">
          <div className="absolute top-4 left-0 right-0 h-0.5 bg-brand-primary/30 hidden lg:block" aria-hidden />
          <div className="grid lg:grid-cols-5 gap-3 sm:gap-4 relative">
          {processSteps.map((step, idx) => {
            const active = idx === activeIndex;
            return (
              <motion.button
                type="button"
                key={step.title}
                onMouseEnter={() => setActiveIndex(idx)}
                onFocus={() => setActiveIndex(idx)}
                onClick={() => setActiveIndex(idx)}
                aria-expanded={active}
                className={`text-left rounded-xl border p-5 lg:p-4 min-h-[56px] transition-all relative ${
                  active ? "bg-surface-raised border-brand-primary/50 shadow-lg shadow-brand-primary/10" : "bg-surface-raised/80 border-border hover:border-brand-primary/30"
                }`}
                whileTap={{ scale: 0.99 }}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-7 w-7 rounded-full text-xs font-bold flex items-center justify-center ${active ? "bg-brand-primary text-brand-primary-foreground" : "bg-surface-subtle text-text-secondary"}`}>
                    {idx + 1}
                  </span>
                  <p className="font-semibold text-text-primary">{step.title}</p>
                </div>
                <motion.p
                  initial={false}
                  animate={{ height: active ? "auto" : 0, opacity: active ? 1 : 0, marginTop: active ? 16 : 0 }}
                  className="overflow-hidden pl-9 text-sm text-text-secondary leading-relaxed lg:pl-0"
                >
                  {step.detail}
                </motion.p>
              </motion.button>
            );
          })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function StickyCtaBar() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      if (dismissed) return;
      setVisible(window.scrollY > 620);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [dismissed]);

  if (!visible || dismissed) return null;

  return (
    <div className="xl:hidden fixed z-40 inset-x-0 bottom-0 bg-white/95 backdrop-blur border-t border-border shadow-lg pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <p className="hidden sm:block text-sm text-text-secondary">Ready to modernize your factory operations?</p>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/signup">
            <Button size="sm" variant="cta">
              Start Free Trial
            </Button>
          </Link>
          <Link
            to="/book-demo"
            onClick={() => trackEvent("cta_click", { cta: "book_demo", from: "sticky_bar" })}
            className="text-sm font-semibold text-brand-primary hover:underline"
          >
            Book a Demo
          </Link>
          <button type="button" onClick={() => setDismissed(true)} className="h-8 w-8 rounded-lg hover:bg-surface-subtle text-text-muted" aria-label="Dismiss sticky call to action">
            <X className="h-4 w-4 mx-auto" />
          </button>
        </div>
      </div>
    </div>
  );
}

const SCROLL_THRESHOLD_PX = 400;
const WHATSAPP_LINK = "https://wa.me/8801892787220?text=Hello%20Prime7%20ERP%20team%2C%20I%20want%20a%20demo.";

/** Single FAB that opens a menu: Back to top + WhatsApp. Shown only after scrolling down. */
export function FloatingActions() {
  const [showFab, setShowFab] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setShowFab(window.scrollY > SCROLL_THRESHOLD_PX);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [menuOpen]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setMenuOpen(false);
  };

  if (!showFab) return null;

  return (
    <div ref={containerRef} className="fixed bottom-20 right-4 xl:bottom-5 xl:right-5 z-40 flex flex-col items-end gap-2">
      {menuOpen && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-white p-1 shadow-lg min-w-[160px]"
        >
          <button
            type="button"
            onClick={scrollToTop}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-text-secondary hover:bg-surface-subtle min-h-[44px]"
            aria-label="Back to top"
          >
            <ArrowUp className="h-5 w-5 shrink-0 text-brand-primary" />
            Back to top
          </button>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noreferrer"
            onClick={() => setMenuOpen(false)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-text-secondary hover:bg-surface-subtle min-h-[44px]"
            aria-label="Chat with us on WhatsApp"
          >
            <MessageCircle className="h-5 w-5 shrink-0 text-[#25D366]" />
            Chat on WhatsApp
          </a>
        </motion.div>
      )}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? "Close menu" : "Open actions"}
              aria-expanded={menuOpen}
              className="h-12 w-12 rounded-full bg-brand-primary shadow-lg text-brand-primary-foreground flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            >
              <ChevronUp className={`h-6 w-6 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{menuOpen ? "Close" : "Actions"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export function LandingTrustHighlights() {
  return (
    <section className="py-20 lg:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { icon: Users, title: "Built for non-tech teams", text: "Simple navigation for merchandising, planning, and line managers." },
            { icon: WalletCards, title: "Finance-grade controls", text: "Approvals, audit trails, and clear reporting for confident decisions." },
            { icon: Clock3, title: "Fast onboarding support", text: "Local-language guidance and practical setup for factory users." },
          ].map((item) => (
            <Card key={item.title} className="border border-brand-primary/20 rounded-xl">
              <CardContent className="p-6 pt-6">
                <div className="h-10 w-10 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center mb-3">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-text-primary">{item.title}</h3>
                <p className="mt-2 text-sm text-text-secondary leading-relaxed">{item.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

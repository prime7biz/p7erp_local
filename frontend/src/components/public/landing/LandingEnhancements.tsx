import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  MessageCircle,
  PlayCircle,
  ShieldCheck,
  Users,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const trustStats = [
  { label: "Active Users", value: 500, suffix: "+" },
  { label: "Uptime", value: 99.9, suffix: "%" },
  { label: "Processed", value: 50, prefix: "$", suffix: "M+" },
  { label: "Support", value: 24, suffix: "/7" },
] as const;

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

function useCountUp(target: number, shouldRun: boolean, durationMs = 1300) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!shouldRun) return;
    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      const next = target * progress;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, shouldRun, durationMs]);

  return value;
}

function formatCounter(value: number, hasDecimal = false) {
  if (hasDecimal) return value.toFixed(1);
  return Math.round(value).toString();
}

export function HeroEnhancedSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-900 to-orange-950 text-white">
      {/* Background layers */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(249,115,22,0.2),transparent),radial-gradient(ellipse_60%_80%_at_80%_50%,rgba(249,115,22,0.08),transparent),radial-gradient(ellipse_40%_60%_at_20%_80%,rgba(255,255,255,0.05),transparent)]" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-80" aria-hidden="true" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20 sm:pt-16 sm:pb-24 md:pt-20 md:pb-28 lg:pt-20 lg:pb-36">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div className="text-center lg:text-left">
            <Badge variant="accent" className="mb-4 sm:mb-5">
              AI ERP for Garment & Apparel Operations
            </Badge>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
              Trusted ERP Platform for
              <span className="block text-primary mt-1">Bangladesh Apparel Leaders</span>
            </h1>
            <p className="mt-4 sm:mt-5 text-sm sm:text-base md:text-lg text-gray-300 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Prime7 ERP unifies merchandising, production, inventory, finance, and HR in one secure platform designed for garment factories and buying houses.
            </p>
            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Link to="/signup" className="w-full sm:w-auto inline-flex justify-center">
                <Button variant="cta" size="lg" className="w-full sm:w-auto whitespace-nowrap min-w-0">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4 shrink-0" />
                </Button>
              </Link>
              <Link to="/contact" className="w-full sm:w-auto inline-flex justify-center">
                <motion.div animate={{ y: [0, -2, 0] }} transition={{ repeat: Number.POSITIVE_INFINITY, duration: 2.2 }} className="w-full sm:w-auto">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto whitespace-nowrap bg-white/10 border-white/35 text-white hover:bg-white/20">
                    <PlayCircle className="mr-2 h-5 w-5 text-primary shrink-0" />
                    Watch Demo
                  </Button>
                </motion.div>
              </Link>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="relative order-first lg:order-none"
          >
            <div className="rounded-2xl sm:rounded-3xl border border-white/20 bg-white/5 backdrop-blur-xl shadow-2xl shadow-black/30 p-2 sm:p-4 overflow-hidden">
              <div className="rounded-xl sm:rounded-2xl overflow-hidden bg-gray-900/90 border border-white/10">
                <div className="h-8 sm:h-10 border-b border-white/10 bg-gray-800/80 px-3 sm:px-4 flex items-center gap-2">
                  <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-red-500" />
                  <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-green-500" />
                  <span className="ml-2 sm:ml-3 text-xs font-medium text-gray-400">Prime7 ERP Dashboard</span>
                </div>
                <div className="relative aspect-video sm:aspect-[16/10] bg-gray-900">
                  <img
                    src="/images/prime7-dashboard.png"
                    alt="Prime7 ERP Dashboard"
                    className="absolute inset-0 w-full h-full object-cover object-top"
                    loading="eager"
                    width={800}
                    height={500}
                  />
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
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-white/80 truncate">Live Production Snapshot</p>
                <p className="text-sm font-semibold text-white">Line Efficiency 92%</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export function TrustBadgesBar() {
  const ref = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(ref, { once: true, amount: 0.4 });
  const counterValues = [
    useCountUp(trustStats[0].value, isInView),
    useCountUp(trustStats[1].value, isInView),
    useCountUp(trustStats[2].value, isInView),
    useCountUp(trustStats[3].value, isInView),
  ];

  return (
    <section ref={ref} className="bg-gray-900 text-white py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {trustStats.map((stat, index) => (
            <div key={stat.label} className="rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-primary">
                {"prefix" in stat ? stat.prefix : ""}
                {formatCounter(counterValues[index] ?? 0, stat.value % 1 !== 0)}
                {stat.suffix ?? ""}
              </p>
              <p className="text-xs sm:text-sm text-white/80">{stat.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-center items-center gap-2 text-xs">
          {["ISO 27001 Ready", "SOC 2 Practices", "GDPR Aligned"].map((item) => (
            <span key={item} className="inline-flex items-center gap-1 rounded-full bg-white/12 border border-white/20 px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
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
    <section className="py-16 lg:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-semibold text-gray-900">Before vs After Prime7 ERP</h2>
          <p className="mt-4 text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">See the operational difference between fragmented tools and a unified ERP workflow.</p>
        </div>
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-10">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="h-full"
          >
            <Card className="h-full border-2 border-rose-200 bg-gradient-to-b from-rose-50/80 to-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-rose-100 flex items-center justify-center">
                    <XCircle className="h-6 w-6 text-rose-600" />
                  </div>
                  <CardTitle className="text-rose-800 text-xl">Without Prime7 ERP</CardTitle>
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
                      className="flex items-start gap-3 text-sm text-gray-700"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-rose-400 shrink-0" />
                      <span>{point}</span>
                    </motion.li>
                  ))}
                </ul>
                <p className="text-sm text-rose-700/90 leading-relaxed pt-1">Disconnected spreadsheets, duplicate entries, and delayed reporting.</p>
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
            <Card className="h-full border-2 border-primary/25 bg-gradient-to-b from-primary/5 to-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-primary text-xl">With Prime7 ERP</CardTitle>
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
                      className="flex items-start gap-3 text-sm text-gray-700"
                    >
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </motion.li>
                  ))}
                </ul>
                <p className="text-sm text-gray-700 leading-relaxed pt-1">Unified dashboard with live insights across operations, finance, and planning.</p>
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
    <section className="py-16 lg:py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-semibold text-gray-900">Interactive Process Flow</h2>
          <p className="mt-4 text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">Hover or tap each stage to view how Prime7 ERP keeps teams aligned from first inquiry to shipment.</p>
        </div>
        <div className="grid lg:grid-cols-5 gap-4">
          {processSteps.map((step, idx) => {
            const active = idx === activeIndex;
            return (
              <motion.button
                type="button"
                key={step.title}
                onMouseEnter={() => setActiveIndex(idx)}
                onFocus={() => setActiveIndex(idx)}
                onClick={() => setActiveIndex(idx)}
                className={`text-left rounded-xl border p-4 transition-all relative ${
                  active ? "bg-white border-primary/50 shadow-lg shadow-primary/10" : "bg-white/80 border-gray-200 hover:border-primary/30"
                }`}
                whileTap={{ scale: 0.99 }}
              >
                {idx < processSteps.length - 1 && (
                  <span className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 h-0.5 w-4 bg-gradient-to-r from-primary/50 to-primary/40" />
                )}
                <div className="flex items-center gap-2">
                  <span className={`h-7 w-7 rounded-full text-xs font-bold flex items-center justify-center ${active ? "bg-primary text-white" : "bg-gray-200 text-gray-700"}`}>
                    {idx + 1}
                  </span>
                  <p className="font-semibold text-gray-900">{step.title}</p>
                </div>
                <motion.p
                  initial={false}
                  animate={{ height: active ? "auto" : 0, opacity: active ? 1 : 0, marginTop: active ? 12 : 0 }}
                  className="overflow-hidden text-sm text-gray-600 leading-relaxed"
                >
                  {step.detail}
                </motion.p>
              </motion.button>
            );
          })}
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
    <div className="fixed z-40 inset-x-0 bottom-0 md:top-0 md:bottom-auto bg-white/95 backdrop-blur border-t md:border-b md:border-t-0 border-gray-200 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <p className="hidden sm:block text-sm text-gray-700">Ready to modernize your factory operations?</p>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/signup">
            <Button size="sm" variant="cta">
              Start Free Trial
            </Button>
          </Link>
          <Link to="/contact" className="text-sm font-semibold text-primary hover:underline">
            Talk to Sales
          </Link>
          <button type="button" onClick={() => setDismissed(true)} className="h-8 w-8 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Dismiss sticky call to action">
            <X className="h-4 w-4 mx-auto" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function WhatsAppFloatingButton() {
  const whatsappLink = useMemo(
    () => "https://wa.me/8801892787220?text=Hello%20Prime7%20ERP%20team%2C%20I%20want%20a%20demo.",
    [],
  );

  return (
    <TooltipProvider>
      <div className="fixed bottom-5 right-5 z-40">
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              aria-label="Chat with us on WhatsApp"
              className="h-12 w-12 rounded-full bg-[#25D366] shadow-lg shadow-emerald-200 hover:scale-105 transition-transform text-white flex items-center justify-center"
            >
              <MessageCircle className="h-6 w-6" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="left">Chat with us</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

export function LandingTrustHighlights() {
  return (
    <section className="py-16 lg:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { icon: Users, title: "Built for non-tech teams", text: "Simple navigation for merchandising, planning, and line managers." },
            { icon: WalletCards, title: "Finance-grade controls", text: "Approvals, audit trails, and clear reporting for confident decisions." },
            { icon: Clock3, title: "Fast onboarding support", text: "Local-language guidance and practical setup for factory users." },
          ].map((item) => (
            <Card key={item.title} className="border border-primary/20 rounded-xl">
              <CardContent className="p-6 pt-6">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

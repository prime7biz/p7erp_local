import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  Building2,
  Clock3,
  MessageCircle,
  PlayCircle,
  ShieldCheck,
  Users,
  WalletCards,
  X,
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
    <section className="relative overflow-visible bg-gradient-to-br from-[#1e3a5f] via-[#23466f] to-[#0f2743] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,188,212,0.18),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.12),transparent_35%)]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-28 md:pt-20 md:pb-36">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <Badge variant="accent" className="mb-5">
              AI ERP for Garment & Apparel Operations
            </Badge>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
              Trusted ERP Platform for
              <span className="block text-[#7fe9f5]">Bangladesh Apparel Leaders</span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-100/90 max-w-xl">
              Prime7 ERP unifies merchandising, production, inventory, finance, and HR in one secure platform designed for garment factories and buying houses.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/signup">
                <Button variant="cta" size="lg">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/contact">
                <motion.div animate={{ y: [0, -2, 0] }} transition={{ repeat: Number.POSITIVE_INFINITY, duration: 2.2 }}>
                  <Button variant="outline" size="lg" className="bg-white/10 border-white/35 text-white hover:bg-white/20">
                    <PlayCircle className="mr-2 h-5 w-5 text-[#7fe9f5]" />
                    Watch Demo
                  </Button>
                </motion.div>
              </Link>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="rounded-3xl border border-white/35 bg-white/10 backdrop-blur-xl shadow-2xl shadow-[#0f2743]/45 p-4">
              <div className="rounded-2xl bg-white text-slate-800 overflow-hidden">
                <div className="h-10 border-b bg-slate-50 px-4 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  <span className="ml-3 text-xs font-medium text-slate-500">Prime7 ERP Dashboard</span>
                </div>
                <div className="p-5 grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-slate-100 h-24 p-2">
                    <div className="h-2 w-12 bg-slate-300 rounded mb-2" />
                    <div className="h-2 w-8 bg-slate-200 rounded mb-1" />
                    <div className="h-2 w-10 bg-slate-200 rounded" />
                  </div>
                  <div className="rounded-xl bg-cyan-50 h-24 p-2">
                    <div className="h-2 w-14 bg-cyan-300 rounded mb-2" />
                    <div className="h-8 rounded bg-cyan-200/70" />
                  </div>
                  <div className="rounded-xl bg-slate-100 h-24 p-2">
                    <div className="h-2 w-10 bg-slate-300 rounded mb-2" />
                    <div className="h-2 w-14 bg-slate-200 rounded mb-1" />
                    <div className="h-2 w-7 bg-slate-200 rounded" />
                  </div>
                  <div className="col-span-2 rounded-xl bg-slate-100 h-28 p-3">
                    <div className="h-2 w-20 bg-slate-300 rounded mb-3" />
                    <div className="h-14 rounded-lg bg-gradient-to-r from-[#1e3a5f]/20 to-[#00bcd4]/25" />
                  </div>
                  <div className="rounded-xl bg-slate-100 h-28 p-3">
                    <div className="h-2 w-12 bg-slate-300 rounded mb-3" />
                    <div className="space-y-1">
                      <div className="h-1.5 bg-slate-200 rounded" />
                      <div className="h-1.5 bg-slate-200 rounded" />
                      <div className="h-1.5 bg-slate-200 rounded" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="hidden md:flex absolute -bottom-14 -left-10 rounded-2xl border border-white/40 bg-white/15 backdrop-blur-md px-4 py-3 items-center gap-3 shadow-xl"
            >
              <div className="h-10 w-10 rounded-xl bg-[#00bcd4]/20 text-[#7fe9f5] flex items-center justify-center">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-white/75">Live Production Snapshot</p>
                <p className="text-sm font-semibold">Line Efficiency 92%</p>
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
    <section ref={ref} className="bg-[#1e3a5f] text-white py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {trustStats.map((stat, index) => (
            <div key={stat.label} className="rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-[#7fe9f5]">
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
              <ShieldCheck className="h-3.5 w-3.5 text-[#7fe9f5]" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BeforeAfterSection() {
  return (
    <section className="py-16 sm:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#1e3a5f]">Before vs After Prime7</h2>
          <p className="mt-3 text-slate-600">See the operational difference between fragmented tools and a unified ERP workflow.</p>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, x: -18 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.3 }}>
            <Card className="h-full border-rose-200 bg-rose-50/40">
              <CardHeader>
                <CardTitle className="text-rose-700">Without Prime7</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-rose-200 bg-white p-4 space-y-3">
                  <div className="h-6 rounded bg-rose-100 w-2/3" />
                  <div className="h-6 rounded bg-rose-100 w-3/4" />
                  <div className="h-6 rounded bg-rose-100 w-1/2" />
                  <p className="text-sm text-rose-700 mt-2">Disconnected spreadsheets, duplicate entries, and delayed reporting.</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 18 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.3 }}>
            <Card className="h-full border-emerald-200 bg-emerald-50/40">
              <CardHeader>
                <CardTitle className="text-emerald-700">With Prime7</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-emerald-200 bg-white p-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-16 rounded bg-[#1e3a5f]/15" />
                    <div className="h-16 rounded bg-[#00bcd4]/20" />
                    <div className="h-16 rounded bg-[#1e3a5f]/10" />
                    <div className="col-span-2 h-20 rounded bg-[#00bcd4]/15" />
                    <div className="h-20 rounded bg-[#1e3a5f]/12" />
                  </div>
                  <p className="text-sm text-emerald-700 mt-3">Unified dashboard with live insights across operations, finance, and planning.</p>
                </div>
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
    <section className="py-16 sm:py-20 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#1e3a5f]">Interactive Process Flow</h2>
          <p className="mt-3 text-slate-600">Hover or tap each stage to view how Prime7 keeps teams aligned from first inquiry to shipment.</p>
        </div>
        <div className="grid lg:grid-cols-5 gap-3">
          {processSteps.map((step, idx) => {
            const active = idx === activeIndex;
            return (
              <motion.button
                type="button"
                key={step.title}
                onMouseEnter={() => setActiveIndex(idx)}
                onFocus={() => setActiveIndex(idx)}
                onClick={() => setActiveIndex(idx)}
                className={`text-left rounded-2xl border p-4 transition-all relative ${
                  active ? "bg-white border-[#00bcd4]/50 shadow-lg shadow-cyan-100" : "bg-white/80 border-slate-200 hover:border-slate-300"
                }`}
                whileTap={{ scale: 0.99 }}
              >
                {idx < processSteps.length - 1 && (
                  <span className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 h-0.5 w-4 bg-gradient-to-r from-[#1e3a5f]/50 to-[#00bcd4]/60" />
                )}
                <div className="flex items-center gap-2">
                  <span className={`h-7 w-7 rounded-full text-xs font-bold flex items-center justify-center ${active ? "bg-[#00bcd4] text-white" : "bg-slate-200 text-slate-700"}`}>
                    {idx + 1}
                  </span>
                  <p className="font-semibold text-[#1e3a5f]">{step.title}</p>
                </div>
                <motion.p
                  initial={false}
                  animate={{ height: active ? "auto" : 0, opacity: active ? 1 : 0, marginTop: active ? 12 : 0 }}
                  className="overflow-hidden text-sm text-slate-600"
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
    <div className="fixed z-40 inset-x-0 bottom-0 md:top-0 md:bottom-auto bg-white/95 backdrop-blur border-t md:border-b md:border-t-0 border-slate-200 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <p className="hidden sm:block text-sm text-slate-700">Ready to modernize your factory operations?</p>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/signup">
            <Button size="sm" variant="cta">
              Start Free Trial
            </Button>
          </Link>
          <Link to="/contact" className="text-sm font-semibold text-[#1e3a5f] hover:underline">
            Talk to Sales
          </Link>
          <button type="button" onClick={() => setDismissed(true)} className="h-8 w-8 rounded-md hover:bg-slate-100 text-slate-500" aria-label="Dismiss sticky call to action">
            <X className="h-4 w-4 mx-auto" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function WhatsAppFloatingButton() {
  const whatsappLink = useMemo(
    () => "https://wa.me/8801700000000?text=Hello%20Prime7%20ERP%20team%2C%20I%20want%20a%20demo.",
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
    <section className="py-10 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: Users, title: "Built for non-tech teams", text: "Simple navigation for merchandising, planning, and line managers." },
            { icon: WalletCards, title: "Finance-grade controls", text: "Approvals, audit trails, and clear reporting for confident decisions." },
            { icon: Clock3, title: "Fast onboarding support", text: "Local-language guidance and practical setup for factory users." },
          ].map((item) => (
            <Card key={item.title} className="border-slate-200">
              <CardContent className="pt-6">
                <div className="h-10 w-10 rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f] flex items-center justify-center mb-3">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-[#1e3a5f]">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useMarketingCurrency } from "@/hooks/useMarketingCurrency";
import { trackEvent } from "@/lib/analytics";
import { Menu, X, Globe, Mail, Phone, MessageCircle, MapPin, ExternalLink, ChevronDown } from "lucide-react";

const navLinks = [
  { label: "Features", to: "/features" },
  { label: "How it works", to: "/how-it-works" },
  { label: "Garments ERP", to: "/garments-erp" },
  { label: "Buying House", to: "/buying-house-erp" },
  { label: "Pricing", to: "/pricing" },
  { label: "Security", to: "/security" },
  { label: "Resources", to: "/resources" },
  { label: "Contact", to: "/contact" },
];

const currencies = [
  { code: "BDT", label: "BDT" },
  { code: "USD", label: "$ USD" },
  { code: "GBP", label: "£ GBP" },
  { code: "EUR", label: "€ EUR" },
  { code: "AED", label: "د.إ AED" },
  { code: "INR", label: "₹ INR" },
];

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currency, setCurrency] = useMarketingCurrency();
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const currencyRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const pathname = location.pathname;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (currencyRef.current && !currencyRef.current.contains(e.target as Node)) setCurrencyOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      menuButton?.focus();
    };
  }, [mobileOpen]);

  const isActive = (to: string) => pathname === to || (to !== "/" && pathname.startsWith(to + "/"));
  const currentCurrencyLabel = currencies.find((c) => c.code === currency)?.label ?? currency;

  return (
    <div className="public-site min-h-screen flex flex-col bg-surface-raised">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-text-primary focus:shadow-modal"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-50 bg-surface-raised/80 backdrop-blur-md border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2 min-w-0">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <img src="/images/logo-header.png" alt="Prime7 ERP" width={324} height={80} className="h-8 sm:h-10 w-auto" />
            </Link>

            <nav className="hidden xl:flex items-center gap-0.5 flex-shrink-0" aria-label="Main">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`whitespace-nowrap px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(link.to)
                      ? "text-brand-primary bg-brand-primary/5"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-subtle"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="hidden xl:flex items-center gap-2 flex-shrink-0">
              {/* Hidden between 1280px and 1535px so the header fits; the Pricing page has its own currency picker. */}
              <div className="relative hidden 2xl:block" ref={currencyRef}>
                <button
                  type="button"
                  onClick={() => setCurrencyOpen(!currencyOpen)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised/80 px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle transition-colors min-w-0"
                  aria-label="Currency"
                  aria-expanded={currencyOpen}
                  aria-haspopup="listbox"
                >
                  <Globe className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  <span className="truncate max-w-[4rem]">{currentCurrencyLabel}</span>
                  <ChevronDown className={`h-3.5 w-3.5 text-text-muted shrink-0 transition-transform ${currencyOpen ? "rotate-180" : ""}`} />
                </button>
                {currencyOpen && (
                  <div
                    className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-border bg-surface-raised py-1 shadow-lg z-50"
                    role="listbox"
                  >
                    {currencies.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        role="option"
                        aria-selected={currency === c.code}
                        onClick={() => {
                          setCurrency(c.code);
                          setCurrencyOpen(false);
                        }}
                        className={`block w-full text-left px-3 py-2 text-xs font-medium transition-colors ${currency === c.code ? "bg-brand-primary/10 text-brand-primary" : "text-text-secondary hover:bg-surface-subtle"}`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Link
                to="/book-demo"
                onClick={() => trackEvent("cta_click", { cta: "book_demo", from: "header" })}
                className="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium border border-brand-primary/30 text-brand-primary hover:bg-brand-primary/5 transition-colors"
              >
                Book a Demo
              </Link>
              <Link
                to="/login"
                className="whitespace-nowrap px-2.5 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-brand-primary transition-colors"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="whitespace-nowrap inline-flex items-center justify-center rounded-lg bg-brand-primary px-3 py-2 text-sm font-medium text-brand-primary-foreground shadow-md shadow-brand-primary/20 hover:bg-brand-primary/90 transition-colors"
              >
                Start Free Trial
              </Link>
            </div>

            <div className="xl:hidden flex items-center gap-1 shrink-0">
              <Link
                to="/signup"
                className="hidden sm:inline-flex h-10 items-center rounded-lg bg-brand-primary px-3 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-hover"
              >
                Start Free Trial
              </Link>
              <button
                ref={menuButtonRef}
                type="button"
                onClick={() => setMobileOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-subtle"
                aria-label="Open menu"
                aria-expanded={mobileOpen}
                aria-haspopup="dialog"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

      </header>

      {/* Rendered outside <header>: its backdrop-blur would otherwise make this fixed drawer header-sized. */}
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {mobileOpen && (
            <div className="xl:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Site menu">
              <motion.div
                className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileOpen(false)}
                aria-hidden
              />
              <motion.nav
                className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-surface-raised shadow-modal"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
                aria-label="Mobile"
              >
                <div className="flex h-14 sm:h-16 items-center justify-between border-b border-border-subtle px-4">
                  <Link to="/" onClick={() => setMobileOpen(false)} className="shrink-0">
                    <img src="/images/logo-header.png" alt="Prime7 ERP" width={324} height={80} className="h-8 w-auto" />
                  </Link>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-subtle"
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <ul className="space-y-1">
                    {navLinks.map((link) => (
                      <li key={link.to}>
                        <Link
                          to={link.to}
                          onClick={() => setMobileOpen(false)}
                          aria-current={isActive(link.to) ? "page" : undefined}
                          className={`flex min-h-[48px] items-center rounded-lg px-4 text-base font-medium transition-colors ${
                            isActive(link.to)
                              ? "text-brand-pressed bg-brand-primary/10"
                              : "text-text-primary hover:bg-surface-subtle"
                          }`}
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 border-t border-border-subtle pt-4">
                    <label htmlFor="mobile-currency" className="mb-1.5 block px-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      Currency
                    </label>
                    <div className="relative">
                      <select
                        id="mobile-currency"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="h-12 w-full cursor-pointer appearance-none rounded-lg border border-border bg-surface-subtle px-3 pr-10 text-sm font-medium text-text-secondary"
                      >
                        {currencies.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <Globe className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border-subtle p-4">
                  <Link
                    to="/signup"
                    onClick={() => setMobileOpen(false)}
                    className="flex h-12 w-full items-center justify-center rounded-lg bg-brand-primary text-sm font-semibold text-brand-primary-foreground hover:bg-brand-hover"
                  >
                    Start Free Trial
                  </Link>
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      to="/book-demo"
                      onClick={() => {
                        setMobileOpen(false);
                        trackEvent("cta_click", { cta: "book_demo", from: "mobile_menu" });
                      }}
                      className="flex h-12 items-center justify-center rounded-lg border border-brand-primary/40 text-sm font-semibold text-brand-pressed"
                    >
                      Book a Demo
                    </Link>
                    <Link
                      to="/login"
                      onClick={() => setMobileOpen(false)}
                      className="flex h-12 items-center justify-center rounded-lg border border-border text-sm font-semibold text-text-secondary"
                    >
                      Login
                    </Link>
                  </div>
                </div>
              </motion.nav>
            </div>
          )}
        </AnimatePresence>
      </MotionConfig>

      {/* Honour the OS "reduce motion" setting for every framer-motion animation on public pages. */}
      <MotionConfig reducedMotion="user">
        <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
      </MotionConfig>

      <footer className="bg-gradient-to-b from-gray-900 to-gray-900/95 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-3 xl:grid-cols-7">
            <div className="col-span-2 md:col-span-3 xl:col-span-2">
              <div className="mb-4">
                <img src="/images/logo-white.svg" alt="Prime7 ERP" width={220} height={52} loading="lazy" className="h-12 w-auto" />
              </div>
              <p className="text-sm text-white mb-6 leading-relaxed">
                AI-driven cloud ERP built for garment manufacturers and buying houses worldwide.
              </p>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center gap-2 text-white">
                  <Mail className="h-4 w-4 shrink-0 text-brand-primary" />
                  <a href="mailto:info@prime7erp.com" className="hover:text-brand-primary transition-colors">
                    info@prime7erp.com
                  </a>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <Mail className="h-4 w-4 shrink-0 text-brand-primary" />
                  <a href="mailto:support@prime7erp.com" className="hover:text-brand-primary transition-colors">
                    support@prime7erp.com
                  </a>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <Phone className="h-4 w-4 shrink-0 text-brand-primary" />
                  <span>+880 1892-787220</span>
                </div>
                <a
                  href="https://wa.me/8801892787220"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-white hover:text-status-success transition-colors"
                >
                  <MessageCircle className="h-4 w-4 shrink-0" />
                  <span>WhatsApp</span>
                </a>
                <a
                  href="https://www.facebook.com/share/1Cc3vRoqye/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-white hover:text-brand-primary transition-colors"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  <span>Facebook</span>
                </a>
                <div className="flex items-center gap-2 text-white">
                  <MapPin className="h-4 w-4 shrink-0 text-brand-primary" />
                  <span>Gulshan-2, Dhaka 1212, Bangladesh</span>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <Link to="/signup" className="text-white hover:text-brand-primary transition-colors font-medium">
                  Start Free Trial
                </Link>
                <Link to="/login" className="text-white hover:text-brand-primary transition-colors font-medium">
                  Login
                </Link>
                <Link to="/book-demo" className="text-white hover:text-brand-primary transition-colors font-medium">
                  Book a Demo
                </Link>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-brand-primary-foreground uppercase tracking-wider mb-4">Product</h3>
              <ul className="space-y-2.5">
                {[
                  { label: "Features", to: "/features" },
                  { label: "Garments ERP", to: "/garments-erp" },
                  { label: "Buying House ERP", to: "/buying-house-erp" },
                  { label: "Garments ERP Bangladesh", to: "/erp-bangladesh" },
                  { label: "ERP Comparison", to: "/erp-comparison" },
                  { label: "Pricing", to: "/pricing" },
                  { label: "How It Works", to: "/how-it-works" },
                ].map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-sm text-white hover:text-brand-primary transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-brand-primary-foreground uppercase tracking-wider mb-4">Modules</h3>
              <ul className="space-y-2.5">
                {[
                  { label: "Merchandising & Orders", to: "/garment-merchandising-software" },
                  { label: "Costing & Consumption", to: "/garment-costing-software" },
                  { label: "Production", to: "/garment-production-management-software" },
                  { label: "Inventory & Warehouse", to: "/garment-inventory-management-software" },
                  { label: "Commercial & BTB LC", to: "/back-to-back-lc-management-software" },
                  { label: "Accounts & Finance", to: "/garment-accounting-software" },
                  { label: "AI-Powered ERP", to: "/ai-garment-erp" },
                  { label: "Quality Management", to: "/features#quality-management" },
                  { label: "HR & Payroll", to: "/features#hr---payroll" },
                ].map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-sm text-white hover:text-brand-primary transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-brand-primary-foreground uppercase tracking-wider mb-4">Resources</h3>
              <ul className="space-y-2.5">
                <li><Link to="/resources" className="text-sm text-white hover:text-brand-primary transition-colors">Guides & Articles</Link></li>
                <li><Link to="/about" className="text-sm text-white hover:text-brand-primary transition-colors">About Us</Link></li>
                <li><Link to="/contact" className="text-sm text-white hover:text-brand-primary transition-colors">Contact Us</Link></li>
                <li><Link to="/book-demo" className="text-sm text-white hover:text-brand-primary transition-colors">Book a Demo</Link></li>
                <li><Link to="/roi-calculator" className="text-sm text-white hover:text-brand-primary transition-colors">ROI Calculator</Link></li>
                <li><Link to="/security" className="text-sm text-white hover:text-brand-primary transition-colors">Security</Link></li>
                <li><Link to="/support" className="text-sm text-white hover:text-brand-primary transition-colors">Support</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-brand-primary-foreground uppercase tracking-wider mb-4">Legal</h3>
              <ul className="space-y-2.5">
                <li>
                  <Link to="/legal/privacy" className="text-sm text-white hover:text-brand-primary transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/legal/terms" className="text-sm text-white hover:text-brand-primary transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/legal/dpa" className="text-sm text-white hover:text-brand-primary transition-colors">
                    Data Processing Agreement
                  </Link>
                </li>
                <li>
                  <Link to="/legal/ai-disclaimer" className="text-sm text-white hover:text-brand-primary transition-colors">
                    AI Usage Disclaimer
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-brand-primary-foreground uppercase tracking-wider mb-4">Trust</h3>
              <ul className="space-y-2.5">
                <li>
                  <Link to="/trust-center" className="text-sm text-white hover:text-brand-primary transition-colors">
                    Trust Center
                  </Link>
                </li>
                <li>
                  <Link to="/legal/security-compliance" className="text-sm text-white hover:text-brand-primary transition-colors">
                    Security &amp; Compliance
                  </Link>
                </li>
                <li>
                  <Link to="/legal/sla" className="text-sm text-white hover:text-brand-primary transition-colors">
                    Service Level Agreement
                  </Link>
                </li>
                <li>
                  <Link to="/security" className="text-sm text-white hover:text-brand-primary transition-colors">
                    Security overview
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="border-t border-brand-primary/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-white/75">
              &copy; {new Date().getFullYear()} Prime7 ERP. All rights reserved.
            </p>
            <nav
              className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-white/75 max-w-3xl"
              aria-label="Legal and trust"
            >
              <Link to="/legal/privacy" className="hover:text-brand-primary transition-colors">
                Privacy
              </Link>
              <span className="text-text-muted/50 hidden sm:inline" aria-hidden>
                ·
              </span>
              <Link to="/legal/terms" className="hover:text-brand-primary transition-colors">
                Terms
              </Link>
              <span className="text-text-muted/50 hidden sm:inline" aria-hidden>
                ·
              </span>
              <Link to="/legal/dpa" className="hover:text-brand-primary transition-colors">
                DPA
              </Link>
              <span className="text-text-muted/50 hidden sm:inline" aria-hidden>
                ·
              </span>
              <Link to="/legal/ai-disclaimer" className="hover:text-brand-primary transition-colors">
                AI
              </Link>
              <span className="text-text-muted/50 hidden sm:inline" aria-hidden>
                ·
              </span>
              <Link to="/legal/sla" className="hover:text-brand-primary transition-colors">
                SLA
              </Link>
              <span className="text-text-muted/50 hidden sm:inline" aria-hidden>
                ·
              </span>
              <Link to="/legal/security-compliance" className="hover:text-brand-primary transition-colors">
                Security
              </Link>
              <span className="text-text-muted/50 hidden sm:inline" aria-hidden>
                ·
              </span>
              <Link to="/trust-center" className="hover:text-brand-primary transition-colors">
                Trust Center
              </Link>
              <span className="text-text-muted/50 hidden sm:inline" aria-hidden>
                ·
              </span>
              <Link to="/sitemap" className="hover:text-brand-primary transition-colors">
                Site map
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}

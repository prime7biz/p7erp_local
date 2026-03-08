import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X, Globe, CalendarCheck } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import logoImg from "@assets/LOGO_ERP_1772333423262.png";

const navLinks = [
  { label: "Features", href: "/features" },
  { label: "Garments ERP", href: "/garments-erp" },
  { label: "Buying House", href: "/buying-house-erp" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/resources" },
  { label: "Contact", href: "/contact" },
];

const currencies = [
  { code: "BDT", locale: "en-BD", label: "BDT" },
  { code: "USD", locale: "en-US", label: "$ USD" },
  { code: "GBP", locale: "en-GB", label: "£ GBP" },
  { code: "EUR", locale: "en-IE", label: "€ EUR" },
  { code: "AED", locale: "ar-AE", label: "د.إ AED" },
  { code: "INR", locale: "en-IN", label: "₹ INR" },
];

export function PublicNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const { currency, setCurrency } = useCurrency();

  const isActive = (href: string) => location === href;

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/">
            <div className="flex items-center cursor-pointer">
              <img src={logoImg} alt="Prime7 ERP" className="h-10 w-auto" />
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <span
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    isActive(link.href)
                      ? "text-primary bg-primary/5"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {link.label}
                </span>
              </Link>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            <div className="relative">
              <select
                value={currency}
                onChange={(e) => {
                  const sel = currencies.find(c => c.code === e.target.value);
                  if (sel) setCurrency(sel.code, sel.locale);
                }}
                className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-100 pr-6"
              >
                {currencies.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <Globe className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
            <Link href="/contact">
              <Button variant="outline" className="text-sm font-medium gap-1.5 border-primary/30 text-primary hover:bg-primary/5">
                <CalendarCheck className="w-3.5 h-3.5" />
                Book a Demo
              </Button>
            </Link>
            <Link href="/app/login">
              <Button variant="ghost" className="text-sm font-medium text-gray-700 hover:text-primary">
                Login
              </Button>
            </Link>
            <Link href="/app/register">
              <Button className="text-sm font-medium bg-primary hover:bg-primary/90 shadow-md shadow-primary/20">
                Start Free Trial
              </Button>
            </Link>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden bg-white border-t border-gray-100 shadow-lg">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <button
                  onClick={() => setMobileOpen(false)}
                  className={`block w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(link.href)
                      ? "text-primary bg-primary/5"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {link.label}
                </button>
              </Link>
            ))}
            <div className="pt-3 border-t border-gray-100 space-y-2">
              <div className="relative px-4 py-1">
                <select
                  value={currency}
                  onChange={(e) => {
                    const sel = currencies.find(c => c.code === e.target.value);
                    if (sel) setCurrency(sel.code, sel.locale);
                  }}
                  className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100 pr-8"
                >
                  {currencies.map(c => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
                <Globe className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              <Link href="/contact">
                <Button variant="outline" className="w-full gap-1.5 border-primary/30 text-primary" onClick={() => setMobileOpen(false)}>
                  <CalendarCheck className="w-4 h-4" />
                  Book a Demo
                </Button>
              </Link>
              <Link href="/app/login">
                <Button variant="outline" className="w-full" onClick={() => setMobileOpen(false)}>
                  Login
                </Button>
              </Link>
              <Link href="/app/register">
                <Button className="w-full bg-primary" onClick={() => setMobileOpen(false)}>
                  Start Free Trial
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

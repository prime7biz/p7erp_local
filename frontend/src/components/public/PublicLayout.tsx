import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Globe, Mail, Phone, MessageCircle, MapPin, ExternalLink } from "lucide-react";

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
  const [currency, setCurrency] = useState("BDT");
  const location = useLocation();
  const pathname = location.pathname;

  const isActive = (to: string) => pathname === to || (to !== "/" && pathname.startsWith(to + "/"));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2 min-w-0">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <img src="/images/logo.png" alt="Prime7 ERP" className="h-8 sm:h-10 w-auto" />
            </Link>

            <nav className="hidden xl:flex items-center gap-0.5 flex-shrink-0" aria-label="Main">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`whitespace-nowrap px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(link.to)
                      ? "text-primary bg-primary/5"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="hidden xl:flex items-center gap-2 flex-shrink-0">
              <div className="relative">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-100 pr-6"
                  aria-label="Currency"
                >
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <Globe className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 pointer-events-none" />
              </div>
              <Link
                to="/contact"
                className="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium border border-primary/30 text-primary hover:bg-primary/5 transition-colors"
              >
                Book a Demo
              </Link>
              <Link
                to="/login"
                className="whitespace-nowrap px-2.5 py-2 rounded-lg text-sm font-medium text-gray-700 hover:text-primary transition-colors"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="whitespace-nowrap inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors"
              >
                Start Free Trial
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="xl:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 shrink-0"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="xl:hidden bg-white border-t border-gray-100 shadow-lg">
            <div className="px-4 py-3 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className={`block w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(link.to)
                      ? "text-primary bg-primary/5"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <div className="relative px-4 py-1">
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100 pr-8"
                  >
                    {currencies.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <Globe className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
                </div>
                <Link
                  to="/contact"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center w-full py-2.5 rounded-lg text-sm font-medium border border-primary/30 text-primary"
                >
                  Book a Demo
                </Link>
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center w-full py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-700"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center w-full py-2.5 rounded-lg text-sm font-medium bg-primary text-white"
                >
                  Start Free Trial
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-gradient-to-b from-gray-900 to-gray-950 text-gray-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8">
            <div className="col-span-2 md:col-span-1">
              <div className="mb-4">
                <img src="/images/logo-white.svg" alt="Prime7 ERP" className="h-12 w-auto" />
              </div>
              <p className="text-sm text-gray-300 mb-6 leading-relaxed">
                AI-driven cloud ERP built for garment manufacturers and buying houses worldwide.
              </p>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center gap-2 text-gray-300">
                  <Mail className="h-4 w-4 shrink-0 text-primary" />
                  <a href="mailto:info@prime7erp.com" className="hover:text-primary transition-colors">
                    info@prime7erp.com
                  </a>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Mail className="h-4 w-4 shrink-0 text-primary" />
                  <a href="mailto:support@prime7erp.com" className="hover:text-primary transition-colors">
                    support@prime7erp.com
                  </a>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Phone className="h-4 w-4 shrink-0 text-primary" />
                  <span>+880 1892-787220</span>
                </div>
                <a
                  href="https://wa.me/8801892787220"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-300 hover:text-green-400 transition-colors"
                >
                  <MessageCircle className="h-4 w-4 shrink-0" />
                  <span>WhatsApp</span>
                </a>
                <a
                  href="https://www.facebook.com/share/1Cc3vRoqye/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-300 hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  <span>Facebook</span>
                </a>
                <div className="flex items-center gap-2 text-gray-300">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <span>Gulshan-2, Dhaka 1212, Bangladesh</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Product</h3>
              <ul className="space-y-2.5">
                {[
                  { label: "Features", to: "/features" },
                  { label: "Garments ERP", to: "/garments-erp" },
                  { label: "Buying House ERP", to: "/buying-house-erp" },
                  { label: "ERP Bangladesh", to: "/erp-bangladesh" },
                  { label: "ERP Comparison", to: "/erp-comparison" },
                  { label: "Pricing", to: "/pricing" },
                  { label: "How It Works", to: "/how-it-works" },
                ].map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-sm text-gray-300 hover:text-primary transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Modules</h3>
              <ul className="space-y-2.5">
                {[
                  { label: "Merchandising", to: "/features" },
                  { label: "Inventory", to: "/features" },
                  { label: "Accounting", to: "/features" },
                  { label: "Production", to: "/features" },
                  { label: "LC Processing", to: "/features" },
                  { label: "Quality Management", to: "/features" },
                  { label: "HR & Payroll", to: "/features" },
                  { label: "Reports & Analytics", to: "/features" },
                  { label: "CRM & Support", to: "/features" },
                ].map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-sm text-gray-300 hover:text-primary transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Resources</h3>
              <ul className="space-y-2.5">
                <li><Link to="/blog" className="text-sm text-gray-300 hover:text-primary transition-colors">Blog & Articles</Link></li>
                <li><Link to="/about" className="text-sm text-gray-300 hover:text-primary transition-colors">About Us</Link></li>
                <li><Link to="/contact" className="text-sm text-gray-300 hover:text-primary transition-colors">Contact Us</Link></li>
                <li><Link to="/security" className="text-sm text-gray-300 hover:text-primary transition-colors">Security</Link></li>
                <li><Link to="/support" className="text-sm text-gray-300 hover:text-primary transition-colors">Support</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Get Started</h3>
              <ul className="space-y-2.5">
                <li><Link to="/signup" className="text-sm text-gray-300 hover:text-primary transition-colors">Start Free Trial</Link></li>
                <li><Link to="/login" className="text-sm text-gray-300 hover:text-primary transition-colors">Login</Link></li>
                <li><Link to="/contact" className="text-sm text-gray-300 hover:text-primary transition-colors">Book a Demo</Link></li>
                <li><Link to="/privacy" className="text-sm text-gray-300 hover:text-primary transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="text-sm text-gray-300 hover:text-primary transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="border-t border-primary/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-400">
              &copy; {new Date().getFullYear()} Prime7 ERP. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm text-gray-400">
              <Link to="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-primary transition-colors">Terms</Link>
              <Link to="/security" className="hover:text-primary transition-colors">Security</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

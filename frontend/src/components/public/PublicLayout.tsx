import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

const navLinks = [
  { label: "Features", to: "/features" },
  { label: "Garments ERP", to: "/garments-erp" },
  { label: "Buying House", to: "/buying-house-erp" },
  { label: "Pricing", to: "/pricing" },
  { label: "Contact", to: "/contact" },
];

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <img src="/images/logo.png" alt="P7 ERP" className="h-10 w-auto" />
            </Link>

            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="hidden lg:flex items-center gap-3">
              <Link
                to="/contact"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-primary/30 text-primary hover:bg-primary/5 transition-colors"
              >
                Book a Demo
              </Link>
              <Link
                to="/login"
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:text-primary transition-colors"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors"
              >
                Start Free Trial
              </Link>
            </div>

            <button
              type="button"
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
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className="block px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-3 border-t border-gray-100 space-y-2">
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
                <img src="/images/logo-white.png" alt="P7 ERP" className="h-12 w-auto" />
              </div>
              <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                AI-driven cloud ERP built for garment manufacturers and buying houses worldwide.
              </p>
              <div className="space-y-2.5 text-sm text-gray-400">
                <p>support@p7erp.example</p>
                <p>Contact us for demos and support</p>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Product</h3>
              <ul className="space-y-2.5">
                {[
                  { label: "Features", to: "/features" },
                  { label: "Garments ERP", to: "/garments-erp" },
                  { label: "Buying House ERP", to: "/buying-house-erp" },
                  { label: "Pricing", to: "/pricing" },
                  { label: "Contact", to: "/contact" },
                ].map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-sm text-gray-400 hover:text-orange-400 transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Resources</h3>
              <ul className="space-y-2.5">
                <li><Link to="/about" className="text-sm text-gray-400 hover:text-orange-400 transition-colors">About Us</Link></li>
                <li><Link to="/contact" className="text-sm text-gray-400 hover:text-orange-400 transition-colors">Contact Us</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Get Started</h3>
              <ul className="space-y-2.5">
                <li><Link to="/signup" className="text-sm text-gray-400 hover:text-orange-400 transition-colors">Start Free Trial</Link></li>
                <li><Link to="/login" className="text-sm text-gray-400 hover:text-orange-400 transition-colors">Login</Link></li>
                <li><Link to="/contact" className="text-sm text-gray-400 hover:text-orange-400 transition-colors">Book a Demo</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="border-t border-orange-500/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              &copy; {new Date().getFullYear()} P7 ERP. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm text-gray-500">
              <Link to="/privacy" className="hover:text-orange-400 transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-orange-400 transition-colors">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

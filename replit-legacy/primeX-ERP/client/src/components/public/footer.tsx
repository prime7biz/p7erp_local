import { Link } from "wouter";
import { Mail, Phone, MapPin, MessageCircle } from "lucide-react";
import { SiFacebook } from "react-icons/si";
import logoImg from "@assets/prime7-logo-white.png";

const footerSections = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Garments ERP", href: "/garments-erp" },
      { label: "Buying House ERP", href: "/buying-house-erp" },
      { label: "ERP Bangladesh", href: "/erp-software-bangladesh" },
      { label: "ERP Comparison", href: "/erp-comparison" },
      { label: "Pricing", href: "/pricing" },
      { label: "How It Works", href: "/how-it-works" },
    ],
  },
  {
    title: "Modules",
    links: [
      { label: "Merchandising", href: "/modules/merchandising" },
      { label: "Inventory", href: "/modules/inventory" },
      { label: "Accounting", href: "/modules/accounting" },
      { label: "Production", href: "/modules/production" },
      { label: "LC Processing", href: "/modules/lc-processing" },
      { label: "Quality Management", href: "/modules/quality-management" },
      { label: "HR & Payroll", href: "/modules/hr-payroll" },
      { label: "Reports & Analytics", href: "/modules/reports-analytics" },
      { label: "CRM & Support", href: "/modules/crm-support" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog & Articles", href: "/resources" },
      { label: "About Us", href: "/about" },
      { label: "Contact Us", href: "/contact" },
      { label: "Security", href: "/security" },
      { label: "Support", href: "/contact#support" },
    ],
  },
  {
    title: "Get Started",
    links: [
      { label: "Start Free Trial", href: "/app/register" },
      { label: "Login", href: "/app/login" },
      { label: "Book a Demo", href: "/contact" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer className="bg-gradient-to-b from-gray-900 to-gray-950 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-1">
            <div className="mb-4">
              <img src={logoImg} alt="Prime7 ERP" className="h-20 w-auto" />
            </div>
            <p className="text-sm text-gray-400 mb-6 leading-relaxed">
              AI-driven cloud ERP built for garment manufacturers and buying houses worldwide.
            </p>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-gray-400">
                <Mail className="h-4 w-4 shrink-0 text-orange-500" />
                <span>info@prime7erp.com</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Phone className="h-4 w-4 shrink-0 text-orange-500" />
                <span>+880 1892-787220</span>
              </div>
              <a href="https://wa.me/8801892787220" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-400 hover:text-green-400 transition-colors">
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span>WhatsApp</span>
              </a>
              <a href="https://www.facebook.com/share/1Cc3vRoqye/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-400 hover:text-blue-400 transition-colors">
                <SiFacebook className="h-4 w-4 shrink-0" />
                <span>Facebook</span>
              </a>
              <div className="flex items-center gap-2 text-gray-400">
                <MapPin className="h-4 w-4 shrink-0 text-orange-500" />
                <span>Gulshan-2, Dhaka 1212, Bangladesh</span>
              </div>
            </div>
          </div>

          {footerSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                {section.title}
              </h3>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>
                      <span className="text-sm text-gray-400 hover:text-orange-400 transition-colors cursor-pointer">
                        {link.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-orange-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Prime7 ERP. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <Link href="/privacy">
              <span className="hover:text-orange-400 cursor-pointer">Privacy</span>
            </Link>
            <Link href="/terms">
              <span className="hover:text-orange-400 cursor-pointer">Terms</span>
            </Link>
            <Link href="/security">
              <span className="hover:text-orange-400 cursor-pointer">Security</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

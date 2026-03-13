import { useState } from "react";
import { MapPin, Mail, Phone, MessageCircle, Clock, Send, Loader2, Building2 } from "lucide-react";

const companySizes = [
  { value: "1-10", label: "1–10 employees" },
  { value: "11-50", label: "11–50 employees" },
  { value: "51-200", label: "51–200 employees" },
  { value: "200+", label: "200+ employees" },
];

const contactInfo = [
  { icon: MapPin, label: "Office Address", value: "Dhaka, Bangladesh", detail: "Gulshan-2, Dhaka 1212, Bangladesh" },
  { icon: Mail, label: "Email", value: "info@p7erp.com", href: "mailto:info@p7erp.com" },
  { icon: Phone, label: "Phone", value: "+880 1892-787220", href: "tel:+8801892787220" },
  { icon: MessageCircle, label: "WhatsApp", value: "+880 1892-787220", href: "https://wa.me/8801892787220" },
];

export function ContactPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    message: "",
    companySize: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return;
    setLoading(true);
    try {
      // Replace with your API when ready: await fetch("/api/leads", { method: "POST", body: JSON.stringify(form) });
      await new Promise((r) => setTimeout(r, 800));
      setSubmitted(true);
      setForm({ name: "", email: "", company: "", phone: "", message: "", companySize: "" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className="relative bg-gradient-to-br from-primary/5 via-blue-50 to-white py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
            Let&apos;s Talk About <span className="text-primary">Your Business</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
            Whether you&apos;re exploring ERP options or ready to get started, our team is here to help you
            find the right solution for your garment manufacturing operations.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-12 lg:gap-16">
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Contact Information</h2>
                <div className="space-y-6">
                  {contactInfo.map((item) => (
                    <div key={item.label} className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <item.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">{item.label}</p>
                        {"href" in item && item.href ? (
                          <a href={item.href} className="text-gray-900 font-medium hover:text-primary transition-colors">
                            {item.value}
                          </a>
                        ) : (
                          <p className="text-gray-900 font-medium">{item.value}</p>
                        )}
                        {"detail" in item && item.detail && (
                          <p className="text-sm text-gray-500 mt-0.5">{item.detail}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <Clock className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-gray-900">Office Hours</h3>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Saturday – Thursday</span>
                    <span className="font-medium text-gray-900">9:00 AM – 6:00 PM</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Friday</span>
                    <span className="font-medium text-gray-500">Closed</span>
                  </div>
                  <p className="text-xs text-gray-400 pt-2">All times in Bangladesh Standard Time (BST, UTC+6)</p>
                </div>
              </div>

              <div id="support" className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <Mail className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-gray-900">Support & Help</h3>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between gap-2">
                    <span>Email Support</span>
                    <a href="mailto:support@p7erp.com" className="font-medium text-primary hover:underline shrink-0">support@p7erp.com</a>
                  </div>
                  <div className="flex justify-between">
                    <span>Response Time</span>
                    <span className="font-medium text-gray-900">Within 24 hours</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-3">
              <div className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h2 className="text-2xl font-bold text-gray-900">Send Us a Message</h2>
                </div>
                <p className="text-xs text-gray-500 mb-5">Fields marked with ** are mandatory.</p>

                {submitted ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                      <Send className="h-7 w-7 text-emerald-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Message Sent!</h3>
                    <p className="text-gray-600 max-w-md mx-auto">
                      Thank you for reaching out. Our team will get back to you within 24 hours.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSubmitted(false)}
                      className="mt-6 px-5 py-2.5 rounded-lg border border-gray-200 font-medium hover:bg-gray-50"
                    >
                      Send Another Message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full Name **</label>
                        <input type="text" id="name" name="name" required value={form.name} onChange={handleChange} placeholder="Your full name" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                      </div>
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address **</label>
                        <input type="email" id="email" name="email" required value={form.email} onChange={handleChange} placeholder="john@company.com" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="company" className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                        <input type="text" id="company" name="company" value={form.company} onChange={handleChange} placeholder="Your Company Ltd." className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                      </div>
                      <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                        <input type="tel" id="phone" name="phone" value={form.phone} onChange={handleChange} placeholder="+880 1XXX-XXXXXX" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="companySize" className="block text-sm font-medium text-gray-700 mb-1">Company Size</label>
                      <select id="companySize" name="companySize" value={form.companySize} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white">
                        <option value="">Select company size</option>
                        {companySizes.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">Message **</label>
                      <textarea id="message" name="message" required rows={5} value={form.message} onChange={handleChange} placeholder="Tell us about your requirements..." className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" />
                    </div>
                    <button type="submit" disabled={loading} className="w-full py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
                      {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : <><Send className="h-4 w-4" /> Send Message</>}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

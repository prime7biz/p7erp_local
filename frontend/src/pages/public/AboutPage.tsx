import { Link } from "react-router-dom";
import { Lightbulb, Shield, Factory, HeartHandshake, Target, Eye, BookOpen, ArrowRight, Users } from "lucide-react";

const values = [
  { icon: Lightbulb, title: "Innovation", description: "We leverage AI, automation, and modern cloud architecture to solve problems that legacy ERP systems cannot.", color: "bg-primary/10 text-primary" },
  { icon: Shield, title: "Reliability", description: "99.9% uptime SLA, daily backups, and enterprise-grade security ensure your business never stops.", color: "bg-primary/10 text-primary" },
  { icon: Factory, title: "Industry Focus", description: "Built exclusively for garment manufacturers and buying houses — every feature is purpose-designed for RMG workflows.", color: "bg-primary/10 text-primary" },
  { icon: HeartHandshake, title: "Customer Success", description: "Dedicated onboarding, training, and support teams who understand the garment industry inside out.", color: "bg-primary/10 text-primary" },
];

const team = [
  { role: "CEO & Co-Founder", description: "20+ years in Bangladesh's RMG industry. Former operations director at a leading export-oriented garment group. Drives the company's strategic vision and industry partnerships." },
  { role: "CTO & Co-Founder", description: "Former principal engineer at a leading SaaS company. Expert in cloud architecture, AI/ML, and building scalable multi-tenant platforms for manufacturing industries." },
  { role: "Head of Product", description: "Domain expert in garment ERP systems with 12+ years of experience. Translates complex RMG workflows into intuitive software features that factories actually use." },
  { role: "Head of Customer Success", description: "Previously led ERP implementation teams across 50+ garment factories. Ensures every customer achieves measurable ROI within the first 90 days." },
];

export function AboutPage() {
  return (
    <>
      {/* Hero — who we are */}
      <section className="relative bg-gradient-to-br from-primary/5 via-white to-white py-20 lg:py-28 overflow-hidden" aria-labelledby="about-hero-heading">
        <div className="absolute top-10 -left-32 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -right-20 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <p className="text-sm font-medium text-primary uppercase tracking-wide mb-3">About Prime7 ERP</p>
          <h1 id="about-hero-heading" className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
            Transforming Bangladesh&apos;s Garment Industry <span className="text-primary">Through Technology</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Prime7 ERP is built by industry veterans who understand the unique challenges of garment
            manufacturing in Bangladesh. We combine deep domain expertise with cutting-edge AI to
            deliver software that truly works for the RMG sector.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-white hover:bg-primary/90 transition-colors">
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/contact" className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-6 py-3 text-base font-semibold text-gray-700 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors">
              Get In Touch
            </Link>
          </div>
        </div>
      </section>

      {/* Mission & Vision — what drives us */}
      <section className="relative py-16 lg:py-24 bg-white overflow-hidden" aria-labelledby="mission-vision-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p id="mission-vision-heading" className="sr-only">What drives us</p>
          <div className="grid md:grid-cols-2 gap-12 lg:gap-20">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                <Target className="h-4 w-4" />
                Our Mission
              </div>
              <h2 className="text-3xl font-semibold text-gray-900">Empowering Manufacturers to Compete Globally</h2>
              <p className="text-gray-600 leading-relaxed">
                Our mission is to empower garment manufacturers and buying houses in Bangladesh with
                AI-driven tools that streamline operations, reduce waste, and unlock data-driven
                decision making — enabling them to compete on the global stage with confidence.
              </p>
              <p className="text-gray-600 leading-relaxed">
                We believe that every factory, regardless of size, deserves access to enterprise-grade
                technology. Prime7 ERP levels the playing field by making sophisticated ERP capabilities
                affordable and accessible to manufacturers across Bangladesh.
              </p>
            </div>
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                <Eye className="h-4 w-4" />
                Our Vision
              </div>
              <h2 className="text-3xl font-semibold text-gray-900">The Most Digitally Advanced Garment Hub</h2>
              <p className="text-gray-600 leading-relaxed">
                We envision Bangladesh as the most digitally advanced garment manufacturing hub in the
                world. A place where every factory runs on real-time data, AI-powered insights guide
                production decisions, and paperless workflows are the norm — not the exception.
              </p>
              <p className="text-gray-600 leading-relaxed">
                By 2030, we aim to power over 1,000 garment factories across Bangladesh, helping the
                country&apos;s $45+ billion RMG sector achieve new levels of efficiency, transparency, and
                sustainability through technology.
              </p>
            </div>
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent mt-16" />
        </div>
      </section>

      {/* Our Story */}
      <section className="relative py-16 lg:py-24 bg-gray-50 overflow-hidden" aria-labelledby="story-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <BookOpen className="h-4 w-4" />
              Our Story
            </div>
            <h2 id="story-heading" className="text-3xl sm:text-4xl font-semibold text-gray-900">Born From Industry Experience</h2>
          </div>
          <div className="max-w-4xl mx-auto space-y-6 text-gray-600 leading-relaxed">
            <p>
              Prime7 ERP was founded by a team of industry veterans who spent decades working inside
              Bangladesh&apos;s garment manufacturing ecosystem. They experienced firsthand the pain points
              that plagued the industry: spreadsheets tracking millions of taka in inventory, manual
              consumption calculations prone to costly errors, LC documents scattered across email
              chains, and production data that arrived days after decisions needed to be made.
            </p>
            <p>
              Existing ERP solutions were either too generic — designed for Western manufacturing
              models that didn&apos;t fit Bangladesh&apos;s unique buying house and CMT (Cut, Make, Trim)
              workflows — or too expensive and complex for mid-sized factories. The founders saw an
              opportunity to build something different: an ERP system designed from the ground up for
              the Bangladeshi garment industry, powered by AI, and delivered as an affordable cloud
              service.
            </p>
            <p>
              Today, Prime7 ERP covers the entire garment manufacturing lifecycle — from inquiry and
              merchandising to production, inventory, accounting, and shipment — all in a single
              platform. Our AI engine provides demand forecasting, consumption optimization, and
              production insights that help manufacturers make smarter decisions every day.
            </p>
          </div>
        </div>
      </section>

      {/* Core Values — guiding principles */}
      <section className="relative py-16 lg:py-24 bg-white overflow-hidden" aria-labelledby="values-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <h2 id="values-heading" className="text-3xl sm:text-4xl font-bold text-gray-900">Our Core Values</h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              These principles guide every decision we make, from product development to customer support.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value) => (
              <div key={value.title} className="bg-white border border-primary/20 rounded-xl p-6 hover:shadow-lg hover:border-primary/30 transition-all">
                <div className={`inline-flex p-3 rounded-lg ${value.color} mb-4`}>
                  <value.icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{value.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="relative py-16 lg:py-24 bg-gray-50 overflow-hidden" aria-labelledby="team-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Users className="h-4 w-4" />
              Leadership
            </div>
            <h2 id="team-heading" className="text-3xl sm:text-4xl font-bold text-gray-900">Meet Our Team</h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Industry veterans and technology leaders united by a shared passion for transforming garment manufacturing.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {team.map((member) => (
              <div key={member.role} className="bg-white border border-primary/20 rounded-xl p-6 hover:shadow-lg hover:border-primary/30 transition-all">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{member.role}</h3>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">{member.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA — get in touch */}
      <section className="relative py-16 lg:py-24 bg-primary text-white overflow-hidden" aria-labelledby="about-cta-heading">
        <img src="/images/tech-pattern.svg" alt="" width={1920} height={1080} className="absolute inset-0 w-full h-full object-cover opacity-[0.05] pointer-events-none" loading="lazy" />
        <div className="absolute top-10 -left-20 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 -right-20 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <p className="text-sm font-medium text-white/80 uppercase tracking-wide mb-2">Get in touch</p>
          <h2 id="about-cta-heading" className="text-3xl sm:text-4xl font-bold">Join Our Mission</h2>
          <p className="mt-4 text-lg text-white/90 max-w-2xl mx-auto leading-relaxed">
            Whether you&apos;re a garment manufacturer looking to digitize operations or a technology
            professional passionate about transforming industries — we&apos;d love to hear from you.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/contact" className="inline-flex items-center justify-center gap-2 rounded-lg bg-white text-primary px-8 py-3 font-semibold hover:bg-gray-50 transition-colors">
              Get In Touch <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/50 text-white px-8 py-3 font-semibold hover:bg-white/10 transition-colors">
              Start Free Trial
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

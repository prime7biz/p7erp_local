import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Lock, Phone, CheckCircle, Copy, ArrowLeft, Building2, Globe, Factory, Wallet, Calendar, Clock, Shield, BarChart3, Cpu } from "lucide-react";
import logoTransparent from "@assets/LOGO_ERP_1772333423262.png";
import logoWhite from "@assets/prime7-logo-white.png";
import heroFuturisticBg from "@assets/hero-futuristic-bg.png";

export default function Register() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    companyName: "",
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
    phone: "",
    companyAddress: "",
    country: "",
    businessType: "both" as "manufacturer" | "buying_house" | "both",
    baseCurrency: "BDT" as "BDT" | "USD" | "EUR" | "GBP",
    fiscalYearStart: "January",
    timeZone: "Asia/Dhaka",
  });
  const [successData, setSuccessData] = useState<{ companyCode: string; message: string } | null>(null);

  const registerMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Registration failed");
      }
      return result;
    },
    onSuccess: (data) => {
      setSuccessData({ companyCode: data.companyCode, message: data.message });
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.phone || formData.phone.length < 5) {
      toast({ title: "Phone Required", description: "Please enter a valid phone number", variant: "destructive" });
      return;
    }
    registerMutation.mutate(formData);
  };

  const copyCompanyCode = () => {
    if (successData?.companyCode) {
      navigator.clipboard.writeText(successData.companyCode);
      toast({ title: "Copied!", description: "Company code copied to clipboard" });
    }
  };

  if (successData) {
    return (
      <div className="min-h-screen flex">
        <div className="hidden lg:flex lg:w-[55%] relative flex-col items-center justify-center p-12 overflow-hidden">
          <img src={heroFuturisticBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-orange-950/50" />
          <div className="absolute top-1/4 -left-20 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-orange-400/10 rounded-full blur-3xl" />
          <div className="relative z-10 text-center max-w-md">
            <img src={logoWhite} alt="Prime7 ERP" className="mx-auto h-28 xl:h-32 w-auto mb-8 drop-shadow-2xl" />
            <h1 className="text-3xl font-bold text-white mb-4">Welcome to Prime7 ERP</h1>
            <p className="text-white/80 text-lg mb-10">Complete garment manufacturing solution for modern businesses</p>
            <div className="grid grid-cols-2 gap-4 text-left">
              <div className="flex items-center gap-3 text-white/80">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><Factory className="h-4 w-4" /></div>
                <span className="text-sm">Production</span>
              </div>
              <div className="flex items-center gap-3 text-white/80">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><BarChart3 className="h-4 w-4" /></div>
                <span className="text-sm">Finance</span>
              </div>
              <div className="flex items-center gap-3 text-white/80">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><Shield className="h-4 w-4" /></div>
                <span className="text-sm">Merchandising</span>
              </div>
              <div className="flex items-center gap-3 text-white/80">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><Cpu className="h-4 w-4" /></div>
                <span className="text-sm">AI Insights</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center bg-[#F8F9FB] p-6">
          <div className="w-full max-w-md space-y-6">
            <div className="lg:hidden text-center mb-6">
              <img src={logoTransparent} alt="Prime7 ERP" className="mx-auto h-16 w-auto mb-2" />
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
              <div className="text-center mb-6">
                <div className="mx-auto w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-3">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">Registration Successful!</h2>
                <p className="text-sm text-gray-500 mt-1">Your company has been registered and is pending approval</p>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-center mb-4">
                <p className="text-sm text-gray-600 mb-2">Your Company Code</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl font-bold font-mono text-primary tracking-wider">
                    {successData.companyCode}
                  </span>
                  <Button variant="ghost" size="sm" onClick={copyCompanyCode} className="h-8 w-8 p-0">
                    <Copy className="h-4 w-4 text-gray-400" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-2">Save this code — you'll need it to log in</p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center mb-4">
                <p className="text-sm text-yellow-800">
                  Your account is <span className="font-semibold">pending approval</span>. You will be notified once your account is activated.
                </p>
              </div>

              <Link href="/auth/login">
                <Button className="w-full bg-primary hover:bg-primary/90">Go to Login</Button>
              </Link>
            </div>

            <div className="text-center">
              <a href="/" className="text-sm text-gray-500 hover:text-primary transition-colors inline-flex items-center gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Website
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-[55%] relative flex-col items-center justify-center p-12 overflow-hidden">
        <img src={heroFuturisticBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-orange-950/50" />
        <div className="absolute top-1/4 -left-20 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-orange-400/10 rounded-full blur-3xl" />
        <div className="relative z-10 text-center max-w-md">
          <img src={logoWhite} alt="Prime7 ERP" className="mx-auto h-28 xl:h-32 w-auto mb-8 drop-shadow-2xl" />
          <h1 className="text-3xl font-bold text-white mb-4">Start Your Journey</h1>
          <p className="text-white/80 text-lg mb-10">Register your company and unlock the full power of garment manufacturing ERP</p>
          <div className="grid grid-cols-2 gap-4 text-left">
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><Factory className="h-4 w-4" /></div>
              <span className="text-sm">Production</span>
            </div>
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><BarChart3 className="h-4 w-4" /></div>
              <span className="text-sm">Finance</span>
            </div>
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><Shield className="h-4 w-4" /></div>
              <span className="text-sm">Merchandising</span>
            </div>
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center"><Cpu className="h-4 w-4" /></div>
              <span className="text-sm">AI Insights</span>
            </div>
          </div>
          <div className="flex justify-center gap-8 mt-10">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">500+</div>
              <div className="text-xs text-white/60">Styles Managed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">99.9%</div>
              <div className="text-xs text-white/60">Uptime</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">24/7</div>
              <div className="text-xs text-white/60">Support</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-[#F8F9FB] p-4 lg:p-6 overflow-y-auto">
        <div className="w-full max-w-lg space-y-4 py-6">
          <div className="lg:hidden text-center mb-4">
            <div className="bg-gradient-to-r from-primary/90 to-primary rounded-xl p-4 mb-4">
              <img src={logoTransparent} alt="Prime7 ERP" className="mx-auto h-12 w-auto" />
              <p className="text-white/80 text-xs mt-1">Garment Manufacturing ERP</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Register Your Company</h2>
              <p className="text-sm text-gray-500 mt-1">Create an account to get started</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Account Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="companyName">Company Name</Label>
                    <div className="relative mt-1">
                      <Building2 className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="companyName"
                        placeholder="Your Company Ltd."
                        className="pl-10"
                        value={formData.companyName}
                        onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        placeholder="John"
                        className="mt-1"
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        placeholder="Doe"
                        className="mt-1"
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <div className="relative mt-1">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="john@company.com"
                        className="pl-10"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="username">Username</Label>
                      <div className="relative mt-1">
                        <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="username"
                          placeholder="johndoe"
                          className="pl-10"
                          value={formData.username}
                          onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="password">Password</Label>
                      <div className="relative mt-1">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="password"
                          type="password"
                          placeholder="Min 8 characters"
                          className="pl-10"
                          value={formData.password}
                          onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                          required
                          minLength={8}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Company Details
                </h3>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="phone">
                      Phone <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative mt-1">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+880 1XXX-XXXXXX"
                        className="pl-10"
                        value={formData.phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="companyAddress">Address</Label>
                    <Input
                      id="companyAddress"
                      placeholder="Company address"
                      className="mt-1"
                      value={formData.companyAddress}
                      onChange={(e) => setFormData(prev => ({ ...prev, companyAddress: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="country">Country</Label>
                      <div className="relative mt-1">
                        <Globe className="absolute left-3 top-3 h-4 w-4 text-gray-400 z-10" />
                        <Select
                          value={formData.country}
                          onValueChange={(val) => setFormData(prev => ({ ...prev, country: val }))}
                        >
                          <SelectTrigger className="pl-10">
                            <SelectValue placeholder="Select country" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BD">Bangladesh</SelectItem>
                            <SelectItem value="IN">India</SelectItem>
                            <SelectItem value="CN">China</SelectItem>
                            <SelectItem value="VN">Vietnam</SelectItem>
                            <SelectItem value="PK">Pakistan</SelectItem>
                            <SelectItem value="LK">Sri Lanka</SelectItem>
                            <SelectItem value="MM">Myanmar</SelectItem>
                            <SelectItem value="KH">Cambodia</SelectItem>
                            <SelectItem value="TR">Turkey</SelectItem>
                            <SelectItem value="US">United States</SelectItem>
                            <SelectItem value="GB">United Kingdom</SelectItem>
                            <SelectItem value="DE">Germany</SelectItem>
                            <SelectItem value="OTHER">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="businessType">Business Type</Label>
                      <Select
                        value={formData.businessType}
                        onValueChange={(val) => setFormData(prev => ({ ...prev, businessType: val as any }))}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manufacturer">Manufacturer</SelectItem>
                          <SelectItem value="buying_house">Buying House</SelectItem>
                          <SelectItem value="both">Both</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  Preferences
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="baseCurrency">Base Currency</Label>
                    <Select
                      value={formData.baseCurrency}
                      onValueChange={(val) => setFormData(prev => ({ ...prev, baseCurrency: val as any }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BDT">BDT (৳)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="fiscalYearStart">Fiscal Year Start</Label>
                    <Select
                      value={formData.fiscalYearStart}
                      onValueChange={(val) => setFormData(prev => ({ ...prev, fiscalYearStart: val }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="January">January</SelectItem>
                        <SelectItem value="April">April</SelectItem>
                        <SelectItem value="July">July</SelectItem>
                        <SelectItem value="October">October</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="timeZone">Time Zone</Label>
                    <Select
                      value={formData.timeZone}
                      onValueChange={(val) => setFormData(prev => ({ ...prev, timeZone: val }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Asia/Dhaka">Asia/Dhaka (GMT+6)</SelectItem>
                        <SelectItem value="Asia/Kolkata">Asia/Kolkata (GMT+5:30)</SelectItem>
                        <SelectItem value="Asia/Shanghai">Asia/Shanghai (GMT+8)</SelectItem>
                        <SelectItem value="UTC">UTC (GMT+0)</SelectItem>
                        <SelectItem value="America/New_York">US Eastern (GMT-5)</SelectItem>
                        <SelectItem value="Europe/London">London (GMT+0)</SelectItem>
                        <SelectItem value="Europe/Berlin">Berlin (GMT+1)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 mt-2" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Creating Account..." : "Register Company"}
              </Button>
            </form>

            <div className="text-center text-sm text-gray-500 mt-4">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-primary hover:text-primary/80 font-medium">
                Sign in
              </Link>
            </div>
          </div>

          <div className="text-center">
            <a href="/" className="text-sm text-gray-500 hover:text-primary transition-colors inline-flex items-center gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Website
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

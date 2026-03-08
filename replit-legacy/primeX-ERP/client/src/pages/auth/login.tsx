import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User, Lock, AlertCircle, ArrowLeft, Building2, ShoppingBag, Factory, DollarSign, Brain, CheckCircle2 } from "lucide-react";
import logoWhite from "@assets/prime7-logo-white.png";
import heroFuturisticBg from "@assets/hero-futuristic-bg.png";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [credentials, setCredentials] = useState({
    companyCode: localStorage.getItem("lastCompanyCode") || "",
    username: "",
    password: ""
  });
  const [statusError, setStatusError] = useState<{ message: string; statusCode: string } | null>(null);

  const loginMutation = useMutation({
    mutationFn: async (data: typeof credentials) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
        const err = new Error(result.message) as any;
        err.statusCode = result.statusCode;
        throw err;
      }
      return result;
    },
    onSuccess: (data) => {
      localStorage.setItem("lastCompanyCode", credentials.companyCode);
      toast({ title: "Login Successful", description: `Welcome back, ${data.user.firstName || data.user.username}!` });
      window.location.href = "/app";
    },
    onError: (error: any) => {
      if (error.statusCode === "PENDING" || error.statusCode === "REJECTED" || error.statusCode === "SUSPENDED") {
        setStatusError({ message: error.message, statusCode: error.statusCode });
      } else {
        toast({ title: "Login Failed", description: error.message || "Invalid credentials", variant: "destructive" });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusError(null);
    loginMutation.mutate(credentials);
  };

  const features = [
    { icon: ShoppingBag, label: "Merchandising" },
    { icon: Factory, label: "Production" },
    { icon: DollarSign, label: "Finance" },
    { icon: Brain, label: "AI-Powered" },
  ];

  const stats = [
    { value: "500+", label: "Styles Managed" },
    { value: "99.9%", label: "Uptime" },
    { value: "50+", label: "Companies Trust Us" },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        <img src={heroFuturisticBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-orange-950/50" />

        <div className="absolute top-[15%] left-[10%] w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-[20%] right-[15%] w-48 h-48 bg-orange-400/10 rounded-full blur-3xl" />

        <div className="relative z-10 flex flex-col justify-center items-start px-12 xl:px-20 w-full">
          <img src={logoWhite} alt="Prime7 ERP" className="h-28 xl:h-32 w-auto mb-8 drop-shadow-2xl" />

          <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-3">
            Complete ERP for<br />
            <span className="text-orange-400">
              Garment Manufacturers
            </span>
          </h1>

          <p className="text-white/80 text-base xl:text-lg mb-10 max-w-md leading-relaxed">
            Streamline your entire garment manufacturing workflow — from inquiry to shipment — with AI-powered insights.
          </p>

          <div className="grid grid-cols-2 gap-4 mb-12 w-full max-w-sm">
            {features.map((f) => (
              <div key={f.label} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-3 border border-white/10">
                <f.icon className="h-5 w-5 text-orange-400 flex-shrink-0" />
                <span className="text-white/90 text-sm font-medium">{f.label}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-8">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-bold text-white">{s.value}</div>
                <div className="text-xs text-white/70 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="lg:hidden bg-gradient-to-r from-orange-600 to-orange-700 px-6 py-5 flex items-center gap-3">
          <img src={logoWhite} alt="Prime7 ERP" className="h-11 w-auto" />
          <span className="text-white font-semibold text-lg">Prime7 ERP</span>
        </div>

        <div className="flex-1 flex items-center justify-center bg-[hsl(220,14%,96%)] px-6 py-10">
          <div className="w-full max-w-md space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Welcome Back</h2>
              <p className="text-sm text-gray-500 mt-1">Sign in to your company account</p>
            </div>

            {statusError && (
              <Alert variant={statusError.statusCode === "PENDING" ? "default" : "destructive"}>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{statusError.message}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="companyCode" className="text-gray-700 text-sm font-medium">Company Code</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="companyCode"
                    placeholder="e.g. PRIME1357"
                    className="pl-10 font-mono uppercase h-11 bg-white border-gray-200 focus:border-primary focus:ring-primary"
                    value={credentials.companyCode}
                    onChange={(e) => setCredentials(prev => ({ ...prev, companyCode: e.target.value.toUpperCase() }))}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-gray-700 text-sm font-medium">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="username"
                    placeholder="Enter your username"
                    className="pl-10 h-11 bg-white border-gray-200 focus:border-primary focus:ring-primary"
                    value={credentials.username}
                    onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-gray-700 text-sm font-medium">Password</Label>
                  <Link href="/auth/forgot-password" className="text-xs text-primary hover:text-primary/80 font-medium">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    className="pl-10 h-11 bg-white border-gray-200 focus:border-primary focus:ring-primary"
                    value={credentials.password}
                    onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-medium text-base" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            <div className="text-center text-sm text-gray-500">
              Don't have an account?{" "}
              <Link href="/auth/register" className="text-primary hover:text-primary/80 font-medium">
                Register your company
              </Link>
            </div>

            <div className="text-center pt-2">
              <a href="/" className="text-sm text-gray-400 hover:text-primary transition-colors inline-flex items-center gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Website
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Search, CreditCard, TrendingUp, Users, UserCheck, DollarSign } from "lucide-react";
import { formatMoney } from "@/lib/formatters";

interface SubscriptionStats {
  totalTenants: number;
  activePaid: number;
  trialUsers: number;
  totalMonthlyRevenue: number;
  planDistribution: Record<string, number>;
}

interface SubscriptionRow {
  id: number;
  tenantId: number;
  plan: string;
  status: string;
  startDate: string;
  endDate: string;
  tenantName: string;
  companyCode: string;
  isActive: boolean;
  planDisplayName: string | null;
  monthlyPrice: number | null;
  maxUsers: number | null;
  usersCount: number;
}

const PLAN_COLORS: Record<string, string> = {
  trial: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  starter: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  growth: "bg-green-100 text-green-700 hover:bg-green-100",
  professional: "bg-purple-100 text-purple-700 hover:bg-purple-100",
  business: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  enterprise: "bg-red-100 text-red-700 hover:bg-red-100",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 hover:bg-green-100",
  trial: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  expired: "bg-red-100 text-red-700 hover:bg-red-100",
  cancelled: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  suspended: "bg-red-100 text-red-700 hover:bg-red-100",
};

const PLAN_OPTIONS = [
  { value: "trial", label: "Trial" },
  { value: "starter", label: "Starter" },
  { value: "growth", label: "Growth" },
  { value: "professional", label: "Professional" },
  { value: "business", label: "Business" },
  { value: "enterprise", label: "Enterprise" },
];

export default function AdminSubscriptions() {
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [changePlanDialog, setChangePlanDialog] = useState<{ tenantId: number; tenantName: string; currentPlan: string } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("");
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading } = useQuery<SubscriptionStats>({
    queryKey: ["/api/admin/subscriptions/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/subscriptions/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: subscriptions, isLoading: subsLoading } = useQuery<SubscriptionRow[]>({
    queryKey: ["/api/admin/subscriptions"],
    queryFn: async () => {
      const res = await fetch("/api/admin/subscriptions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch subscriptions");
      return res.json();
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: async ({ tenantId, plan }: { tenantId: number; plan: string }) => {
      const res = await fetch(`/api/admin/subscriptions/${tenantId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to change plan" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions/stats"] });
      toast({ title: "Plan Changed", description: "Subscription plan has been updated successfully." });
      setChangePlanDialog(null);
      setSelectedPlan("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filtered = subscriptions?.filter((sub) => {
    const matchesSearch =
      sub.tenantName?.toLowerCase().includes(search.toLowerCase()) ||
      sub.companyCode?.toLowerCase().includes(search.toLowerCase());
    const matchesPlan = planFilter === "ALL" || sub.plan === planFilter;
    return matchesSearch && matchesPlan;
  }) ?? [];

  const formatCurrency = (amount: number) => formatMoney(amount);

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Subscription Management</h1>
          <p className="text-gray-600">Manage tenant subscriptions and plans</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statsLoading ? (
            [...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Total Active Tenants</p>
                      <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.totalTenants ?? 0}</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Users className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Monthly Revenue</p>
                      <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(stats?.totalMonthlyRevenue ?? 0)}</p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Trial Users</p>
                      <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.trialUsers ?? 0}</p>
                    </div>
                    <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                      <CreditCard className="w-6 h-6 text-amber-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Paid Users</p>
                      <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.activePaid ?? 0}</p>
                    </div>
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                      <UserCheck className="w-6 h-6 text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">All Subscriptions</h2>
          <div className="flex items-center gap-3">
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Filter by plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Plans</SelectItem>
                {PLAN_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {subsLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Company Code</TableHead>
                    <TableHead>Current Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Monthly Price</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                        <CreditCard className="mx-auto h-8 w-8 mb-2 text-gray-300" />
                        No subscriptions found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium">{sub.tenantName}</TableCell>
                        <TableCell className="text-gray-600 text-sm font-mono">{sub.companyCode || "—"}</TableCell>
                        <TableCell>
                          <Badge className={PLAN_COLORS[sub.plan] || "bg-gray-100 text-gray-700"}>
                            {sub.planDisplayName || sub.plan}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[sub.status] || "bg-gray-100 text-gray-700"}>
                            {sub.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-600 text-sm">
                          {sub.startDate ? new Date(sub.startDate).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {sub.usersCount}{sub.maxUsers ? `/${sub.maxUsers}` : ""}
                        </TableCell>
                        <TableCell className="text-gray-900 font-medium">
                          {sub.monthlyPrice != null ? formatCurrency(sub.monthlyPrice) : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 px-3"
                            onClick={() => {
                              setChangePlanDialog({
                                tenantId: sub.tenantId,
                                tenantName: sub.tenantName,
                                currentPlan: sub.plan,
                              });
                              setSelectedPlan(sub.plan);
                            }}
                          >
                            Change Plan
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!changePlanDialog} onOpenChange={(open) => { if (!open) { setChangePlanDialog(null); setSelectedPlan(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Subscription Plan</DialogTitle>
            <DialogDescription>
              Update the subscription plan for <strong>{changePlanDialog?.tenantName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">Select New Plan</label>
            <Select value={selectedPlan} onValueChange={setSelectedPlan}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a plan" />
              </SelectTrigger>
              <SelectContent>
                {PLAN_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {changePlanDialog && selectedPlan === changePlanDialog.currentPlan && (
              <p className="text-xs text-amber-600 mt-2">This is the current plan. Select a different plan to change.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setChangePlanDialog(null); setSelectedPlan(""); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (changePlanDialog && selectedPlan && selectedPlan !== changePlanDialog.currentPlan) {
                  changePlanMutation.mutate({ tenantId: changePlanDialog.tenantId, plan: selectedPlan });
                }
              }}
              disabled={!selectedPlan || selectedPlan === changePlanDialog?.currentPlan || changePlanMutation.isPending}
            >
              {changePlanMutation.isPending ? "Updating..." : "Update Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

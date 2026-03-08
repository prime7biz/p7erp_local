import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ShoppingCart, Package, Truck, FileText, Receipt, CreditCard,
  ArrowRight, Plus, Eye, Clock, CheckCircle2, AlertCircle,
  TrendingUp, Building2
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ModuleAIPanel } from "@/components/ai/ModuleAIPanel";

function formatCurrency(amount: string | number | null | undefined) {
  if (!amount) return 'BDT 0';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `BDT ${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function PipelineCard({ icon: Icon, title, total, breakdown, color, actions }: {
  icon: any;
  title: string;
  total: number;
  breakdown?: { label: string; count: number; variant?: 'default' | 'secondary' | 'outline' | 'destructive' }[];
  color: string;
  actions?: { label: string; url: string; icon?: any }[];
}) {
  const [, navigate] = useLocation();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${color}`}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
          </div>
          <span className="text-2xl font-bold">{total}</span>
        </div>
      </CardHeader>
      <CardContent>
        {breakdown && breakdown.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {breakdown.map((b) => (
              <Badge key={b.label} variant={b.variant || 'secondary'} className="text-xs">
                {b.label}: {b.count}
              </Badge>
            ))}
          </div>
        )}
        {actions && actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {actions.map((a) => (
              <Button key={a.label} size="sm" variant="ghost" className="text-xs h-7 gap-1" onClick={() => navigate(a.url)}>
                {a.icon && <a.icon className="h-3 w-3" />}
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FlowDiagram({ type, steps }: { type: 'purchase' | 'sales'; steps: { label: string; count: number; icon: any }[] }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-3 px-1">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center">
          <div className="flex flex-col items-center gap-1 min-w-[80px]">
            <div className={`p-2 rounded-full ${type === 'purchase' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
              <step.icon className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-center">{step.label}</span>
            <Badge variant="secondary" className="text-xs">{step.count}</Badge>
          </div>
          {i < steps.length - 1 && (
            <ArrowRight className="h-4 w-4 text-gray-400 mx-1 shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function DocumentFlowDashboard() {
  const [, navigate] = useLocation();

  const { data: summary, isLoading } = useQuery<any>({
    queryKey: ['/api/document-flow/summary'],
  });

  if (isLoading) {
    return (
      <DashboardContainer title="Document Flow" subtitle="End-to-end ERP flow tracking">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      </DashboardContainer>
    );
  }

  const p = summary?.purchase || {};
  const s = summary?.sales || {};
  const activity = summary?.recentActivity || [];

  const purchaseSteps = [
    { label: 'PO', count: p.purchaseOrders?.total || 0, icon: ShoppingCart },
    { label: 'GRN', count: p.grn?.total || 0, icon: Package },
    { label: 'Gate Pass In', count: p.gatePassesIn?.total || 0, icon: Truck },
    { label: 'Bills', count: p.purchaseBills?.total || 0, icon: FileText },
    { label: 'Payables', count: p.pendingPayables?.total || 0, icon: CreditCard },
  ];

  const salesSteps = [
    { label: 'Orders', count: s.orders?.total || 0, icon: ShoppingCart },
    { label: 'Challans', count: s.deliveryChallans?.total || 0, icon: Truck },
    { label: 'Gate Pass Out', count: s.gatePassesOut?.total || 0, icon: Package },
    { label: 'Invoices', count: s.salesInvoices?.total || 0, icon: Receipt },
    { label: 'Receivables', count: s.pendingReceivables?.total || 0, icon: CreditCard },
  ];

  return (
    <DashboardContainer
      title="Document Flow"
      subtitle="End-to-end purchase & sales flow tracking"
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate('/parties')}>
            <Building2 className="h-4 w-4 mr-1" /> Parties
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-blue-700">
                <TrendingUp className="h-5 w-5" /> Purchase Pipeline
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => navigate('/inventory/purchase-orders/new')}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Create PO
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <FlowDiagram type="purchase" steps={purchaseSteps} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <PipelineCard
            icon={ShoppingCart}
            title="Purchase Orders"
            total={p.purchaseOrders?.total || 0}
            color="bg-blue-500"
            breakdown={[
              { label: 'Draft', count: p.purchaseOrders?.draft || 0 },
              { label: 'Approved', count: p.purchaseOrders?.approved || 0, variant: 'default' },
            ]}
            actions={[
              { label: 'Create PO', url: '/inventory/purchase-orders/new', icon: Plus },
              { label: 'View All', url: '/inventory/purchase-orders', icon: Eye },
            ]}
          />
          <PipelineCard
            icon={Package}
            title="GRN"
            total={p.grn?.total || 0}
            color="bg-indigo-500"
            breakdown={[
              { label: 'Pending', count: p.grn?.pending || 0 },
            ]}
            actions={[
              { label: 'View GRNs', url: '/inventory/goods-receiving', icon: Eye },
            ]}
          />
          <PipelineCard
            icon={Truck}
            title="Gate Passes (In)"
            total={p.gatePassesIn?.total || 0}
            color="bg-purple-500"
            actions={[
              { label: 'View All', url: '/inventory/enhanced-gate-passes', icon: Eye },
            ]}
          />
          <PipelineCard
            icon={FileText}
            title="Purchase Bills"
            total={p.purchaseBills?.total || 0}
            color="bg-orange-500"
            actions={[
              { label: 'View Vouchers', url: '/accounts/vouchers', icon: Eye },
            ]}
          />
          <PipelineCard
            icon={CreditCard}
            title="Pending Payables"
            total={p.pendingPayables?.total || 0}
            color="bg-red-500"
            actions={[
              { label: 'Outstanding', url: '/accounts/outstanding-bills', icon: Eye },
            ]}
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-green-700">
                <TrendingUp className="h-5 w-5" /> Sales Pipeline
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => navigate('/orders/new')}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Create Order
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <FlowDiagram type="sales" steps={salesSteps} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <PipelineCard
            icon={ShoppingCart}
            title="Sales Orders"
            total={s.orders?.total || 0}
            color="bg-green-500"
            breakdown={[
              { label: 'Active', count: s.orders?.active || 0, variant: 'default' },
            ]}
            actions={[
              { label: 'Create Order', url: '/orders/new', icon: Plus },
              { label: 'View All', url: '/orders', icon: Eye },
            ]}
          />
          <PipelineCard
            icon={Truck}
            title="Delivery Challans"
            total={s.deliveryChallans?.total || 0}
            color="bg-emerald-500"
            breakdown={[
              { label: 'Pending', count: s.deliveryChallans?.pending || 0 },
            ]}
            actions={[
              { label: 'View All', url: '/inventory/delivery-challans', icon: Eye },
            ]}
          />
          <PipelineCard
            icon={Package}
            title="Gate Passes (Out)"
            total={s.gatePassesOut?.total || 0}
            color="bg-teal-500"
            actions={[
              { label: 'View All', url: '/inventory/enhanced-gate-passes', icon: Eye },
            ]}
          />
          <PipelineCard
            icon={Receipt}
            title="Sales Invoices"
            total={s.salesInvoices?.total || 0}
            color="bg-cyan-500"
            actions={[
              { label: 'View Vouchers', url: '/accounts/vouchers', icon: Eye },
            ]}
          />
          <PipelineCard
            icon={CreditCard}
            title="Pending Receivables"
            total={s.pendingReceivables?.total || 0}
            color="bg-amber-500"
            actions={[
              { label: 'Outstanding', url: '/accounts/outstanding-bills', icon: Eye },
            ]}
          />
        </div>

        <ModuleAIPanel
          title="AI Delivery & Security Analysis"
          endpoint="/api/module-ai/delivery-security"
          requestData={{}}
          triggerKey="delivery-security"
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
            ) : (
              <div className="space-y-2">
                {activity.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-full bg-gray-100">
                        {item.originType === 'purchase_bill' ? <FileText className="h-3.5 w-3.5 text-orange-500" /> :
                         item.originType === 'sales_invoice' ? <Receipt className="h-3.5 w-3.5 text-green-500" /> :
                         item.originType === 'payment' ? <CreditCard className="h-3.5 w-3.5 text-blue-500" /> :
                         <FileText className="h-3.5 w-3.5 text-gray-500" />}
                      </div>
                      <div>
                        <span className="text-sm font-medium">{item.voucherNumber}</span>
                        <span className="text-xs text-muted-foreground ml-2">{item.originType?.replace('_', ' ')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">{formatCurrency(item.amount)}</span>
                      <Badge variant={item.status === 'POSTED' ? 'default' : 'secondary'} className="text-xs">
                        {item.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardContainer>
  );
}

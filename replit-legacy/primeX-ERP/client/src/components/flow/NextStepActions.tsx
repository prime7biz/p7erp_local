import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Truck, Receipt, Package } from "lucide-react";
import { useState } from "react";

interface NextStepActionsProps {
  docType: 'purchase_order' | 'delivery_challan' | 'order' | 'grn';
  docId: number;
  status: string;
}

export function NextStepActions({ docType, docId, status }: NextStepActionsProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const s = status?.toUpperCase() || '';

  const handleAction = async (action: string, endpoint: string) => {
    setLoading(action);
    try {
      const res = await apiRequest(endpoint, 'POST');
      const data = await res.json();
      if (data.redirectUrl) {
        navigate(data.redirectUrl);
      }
      if (data.success) {
        toast({ title: "Success", description: `${action} created successfully` });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const actions: { label: string; icon: any; action: string; endpoint: string }[] = [];

  if (docType === 'purchase_order' && (s === 'APPROVED' || s === 'POSTED')) {
    actions.push({
      label: 'Create GRN',
      icon: Package,
      action: 'GRN',
      endpoint: `/api/document-flow/po-to-grn/${docId}`,
    });
  }

  if (docType === 'order' && (s === 'IN_PROGRESS' || s === 'NEW' || s === 'APPROVED' || s === 'in_progress' || s === 'new')) {
    actions.push({
      label: 'Create Delivery Challan',
      icon: Truck,
      action: 'Delivery Challan',
      endpoint: `/api/document-flow/order-to-challan/${docId}`,
    });
  }

  if (docType === 'delivery_challan' && s === 'POSTED') {
    actions.push({
      label: 'Create Gate Pass',
      icon: FileText,
      action: 'Gate Pass',
      endpoint: `/api/document-flow/challan-to-gate-pass/${docId}`,
    });
    actions.push({
      label: 'Create Invoice',
      icon: Receipt,
      action: 'Invoice',
      endpoint: `/api/document-flow/challan-to-invoice/${docId}`,
    });
  }

  if (docType === 'delivery_challan' && (s === 'APPROVED' || s === 'DRAFT' || s === 'SUBMITTED' || s === 'CHECKED' || s === 'RECOMMENDED')) {
    actions.push({
      label: 'Create Gate Pass',
      icon: FileText,
      action: 'Gate Pass',
      endpoint: `/api/document-flow/challan-to-gate-pass/${docId}`,
    });
  }

  if (actions.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {actions.map((act) => (
        <Button
          key={act.action}
          size="sm"
          variant="outline"
          onClick={() => handleAction(act.action, act.endpoint)}
          disabled={loading === act.action}
          className="gap-1.5"
        >
          <act.icon className="h-3.5 w-3.5" />
          {loading === act.action ? 'Creating...' : act.label}
        </Button>
      ))}
    </div>
  );
}

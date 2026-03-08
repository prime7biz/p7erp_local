import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { PrintLayout } from "@/components/print/PrintLayout";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { useTenantInfo } from "@/hooks/useTenantInfo";
import QRCode from "react-qr-code";

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try { return format(new Date(dateStr), "dd MMM yyyy"); } catch { return dateStr; }
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try { return format(new Date(dateStr), "dd MMM yyyy, hh:mm a"); } catch { return dateStr; }
}

export default function EnhancedGatePassPrint() {
  const [, params] = useRoute("/inventory/enhanced-gate-passes/:id/print");
  const id = params?.id ? parseInt(params.id) : null;
  const { tenantInfo } = useTenantInfo();

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/enhanced-gate-passes', id],
    queryFn: async () => {
      if (!id) return null;
      const res = await fetch(`/api/enhanced-gate-passes/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch gate pass");
      return res.json();
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <div className="p-8 text-center">Gate pass not found</div>;
  }

  const isInward = data.gatePassType === 'GP_IN';
  const items = data.items || [];

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <Link href={`/inventory/enhanced-gate-passes/${id}`}>
          <Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </Button>
      </div>

      <PrintLayout
        title={isInward ? "GATE PASS — INWARD" : "GATE PASS — OUTWARD"}
        subtitle={`Gate Pass No: ${data.gatePassNumber}`}
        companyInfo={tenantInfo.companyName ? { name: tenantInfo.companyName, address: tenantInfo.companyAddress, phone: tenantInfo.companyPhone, email: tenantInfo.companyEmail, logoUrl: tenantInfo.companyLogo } : undefined}
        showSignatures={true}
        signatures={[
          { label: "Prepared By" },
          { label: "Approved By" },
          { label: "Security Guard" },
          { label: isInward ? "Driver / Supplier" : "Driver / Receiver" },
        ]}
        qrCode={data.verificationCode ? (
          <div className="flex flex-col items-center gap-1">
            <QRCode value={`${window.location.origin}/verify/${data.verificationCode}`} size={80} />
            <span className="text-[8px] text-muted-foreground">Scan to verify</span>
          </div>
        ) : undefined}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm border p-3 rounded">
            <div><span className="font-semibold">Gate Pass No:</span> {data.gatePassNumber}</div>
            <div><span className="font-semibold">Date:</span> {formatDate(data.gatePassDate)}</div>
            <div><span className="font-semibold">Type:</span> {isInward ? "INWARD (GP_IN)" : "OUTWARD (GP_OUT)"}</div>
            <div><span className="font-semibold">Status:</span> {data.workflowStatus}</div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm border p-3 rounded">
            <div className="col-span-2 font-semibold text-base border-b pb-1 mb-1">Party Details</div>
            <div><span className="font-semibold">Party:</span> {data.partyDisplayName || data.partyName || "—"}</div>
            <div><span className="font-semibold">Party Code:</span> {data.partyCode || "—"}</div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm border p-3 rounded">
            <div className="col-span-2 font-semibold text-base border-b pb-1 mb-1">Vehicle & Driver</div>
            <div><span className="font-semibold">Vehicle No:</span> {data.vehicleNumber || "—"}</div>
            <div><span className="font-semibold">Vehicle Type:</span> {data.vehicleType || "—"}</div>
            <div><span className="font-semibold">Driver:</span> {data.driverName || "—"}</div>
            <div><span className="font-semibold">Contact:</span> {data.driverContact || "—"}</div>
            <div><span className="font-semibold">License:</span> {data.driverLicense || "—"}</div>
            <div><span className="font-semibold">Transporter:</span> {data.transporterName || "—"}</div>
          </div>

          {(data.deliveryChallanId || data.grnId || data.purchaseOrderId) && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm border p-3 rounded">
              <div className="col-span-2 font-semibold text-base border-b pb-1 mb-1">Reference Documents</div>
              {data.deliveryChallanId && <div><span className="font-semibold">Delivery Challan ID:</span> {data.deliveryChallanId}</div>}
              {data.grnId && <div><span className="font-semibold">GRN ID:</span> {data.grnId}</div>}
              {data.purchaseOrderId && <div><span className="font-semibold">Purchase Order ID:</span> {data.purchaseOrderId}</div>}
            </div>
          )}

          {items.length > 0 && (
            <div className="border rounded">
              <div className="font-semibold text-base p-3 border-b">Items ({items.length})</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Sl</th>
                    <th className="p-2 text-left">Item</th>
                    <th className="p-2 text-left">Code</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-left">Unit</th>
                    <th className="p-2 text-right">Weight</th>
                    <th className="p-2 text-left">Batch</th>
                    <th className="p-2 text-left">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any, idx: number) => (
                    <tr key={idx} className="border-b">
                      <td className="p-2">{idx + 1}</td>
                      <td className="p-2">{item.itemName}</td>
                      <td className="p-2">{item.itemCode || "—"}</td>
                      <td className="p-2 text-right">{item.quantity}</td>
                      <td className="p-2">{item.unit || "—"}</td>
                      <td className="p-2 text-right">{item.weight || "—"}</td>
                      <td className="p-2">{item.batchNumber || "—"}</td>
                      <td className="p-2 capitalize">{item.condition || "good"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm border p-3 rounded">
            <div className="col-span-2 font-semibold text-base border-b pb-1 mb-1">Security Checkpoint</div>
            <div><span className="font-semibold">Guard:</span> {data.securityGuardName || "—"}</div>
            <div><span className="font-semibold">Checkpoint:</span> {data.securityCheckpoint || "—"}</div>
            <div><span className="font-semibold">Acknowledged:</span> {data.guardAcknowledged ? "Yes" : "No"}</div>
            <div><span className="font-semibold">Acknowledged At:</span> {data.guardAcknowledgedAt ? formatDateTime(data.guardAcknowledgedAt) : "—"}</div>
            {data.entryTime && <div><span className="font-semibold">Entry Time:</span> {formatDateTime(data.entryTime)}</div>}
            {data.exitTime && <div><span className="font-semibold">Exit Time:</span> {formatDateTime(data.exitTime)}</div>}
          </div>

          {data.purpose && (
            <div className="text-sm border p-3 rounded">
              <span className="font-semibold">Purpose:</span> {data.purpose}
            </div>
          )}
          {data.notes && (
            <div className="text-sm border p-3 rounded">
              <span className="font-semibold">Notes:</span> {data.notes}
            </div>
          )}

          <div className="border-2 border-dashed p-4 rounded text-center text-sm text-muted-foreground mt-6">
            <p className="font-semibold">Guard Acknowledgment Stamp</p>
            <div className="h-16"></div>
            <p>Date: _____________ Time: _____________ Signature: _____________</p>
          </div>
        </div>
      </PrintLayout>
    </div>
  );
}

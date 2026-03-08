import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { PrintLayout } from "@/components/print/PrintLayout";
import { ArrowLeft, Printer, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useTenantInfo } from "@/hooks/useTenantInfo";
import QRCode from "react-qr-code";

function formatAmount(val: string | number) {
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "BDT 0.00";
  return "BDT " + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function numberToWords(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + numberToWords(n % 100) : "");
  if (n < 100000) return numberToWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + numberToWords(n % 1000) : "");
  if (n < 10000000) return numberToWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + numberToWords(n % 100000) : "");
  return numberToWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + numberToWords(n % 10000000) : "");
}

function amountToWords(amount: number): string {
  if (amount === 0) return "Zero Taka Only";
  const wholePart = Math.floor(Math.abs(amount));
  const paisaPart = Math.round((Math.abs(amount) - wholePart) * 100);
  let result = numberToWords(wholePart) + " Taka";
  if (paisaPart > 0) {
    result += " and " + numberToWords(paisaPart) + " Paisa";
  }
  result += " Only";
  return result;
}

export default function DeliveryChallanPrint() {
  const params = useParams<{ id: string }>();
  const challanId = params.id ? parseInt(params.id) : undefined;
  const [, setLocation] = useLocation();
  const { tenantInfo } = useTenantInfo();

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ['/api/delivery-challans', challanId],
    queryFn: async () => {
      const res = await fetch(`/api/delivery-challans/${challanId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!challanId,
  });

  useEffect(() => {
    if (data) {
      const timer = setTimeout(() => { window.print(); }, 500);
      return () => clearTimeout(timer);
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-medium text-destructive">Could not load challan details.</p>
        <Button variant="outline" onClick={() => setLocation("/inventory/delivery-challans")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Challans
        </Button>
      </div>
    );
  }

  const items = data.items || [];
  const totalQty = items.reduce((sum: number, item: any) => sum + (parseFloat(item.quantity) || 0), 0);
  const totalAmt = items.reduce((sum: number, item: any) => sum + (parseFloat(item.amount) || 0), 0);

  return (
    <div className="p-4">
      <div className="no-print flex gap-2 mb-4">
        <Button variant="outline" onClick={() => setLocation(`/inventory/delivery-challans/${challanId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </Button>
      </div>

      <PrintLayout
        title="DELIVERY CHALLAN"
        subtitle={`Challan No: ${data.challanNumber}`}
        companyInfo={tenantInfo.companyName ? { name: tenantInfo.companyName, address: tenantInfo.companyAddress, phone: tenantInfo.companyPhone, email: tenantInfo.companyEmail, logoUrl: tenantInfo.companyLogo } : undefined}
        showSignatures={true}
        signatures={[
          { label: "Prepared By" },
          { label: "Checked By" },
          { label: "Recommended By" },
          { label: "Approved By" },
          { label: "Received By" },
        ]}
        qrCode={data.verificationCode ? (
          <div className="flex flex-col items-center gap-1">
            <QRCode value={`${window.location.origin}/verify/${data.verificationCode}`} size={80} />
            <span className="text-[8px] text-muted-foreground">Scan to verify</span>
          </div>
        ) : undefined}
      >
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-4 text-sm">
          <div>
            <span className="text-muted-foreground">Date: </span>
            <span className="font-medium">{formatDate(data.challanDate)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Status: </span>
            <span className="font-medium">{data.workflowStatus}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Party: </span>
            <span className="font-medium">{data.partyName || "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Order Ref: </span>
            <span className="font-medium">{data.orderId ? `Order #${data.orderId}` : "-"}</span>
          </div>
          {data.partyAddress && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Address: </span>
              <span className="font-medium">{data.partyAddress}</span>
            </div>
          )}
          {data.deliveryAddress && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Delivery Address: </span>
              <span className="font-medium">{data.deliveryAddress}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-x-8 gap-y-2 mb-4 text-sm border-t border-b border-gray-300 py-2">
          <div>
            <span className="text-muted-foreground">Vehicle No: </span>
            <span className="font-medium">{data.vehicleNumber || "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Driver: </span>
            <span className="font-medium">{data.driverName || "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Transporter: </span>
            <span className="font-medium">{data.transporterName || "-"}</span>
          </div>
          {data.receiverName && (
            <div>
              <span className="text-muted-foreground">Receiver: </span>
              <span className="font-medium">{data.receiverName}</span>
            </div>
          )}
          {data.receiverContact && (
            <div>
              <span className="text-muted-foreground">Receiver Contact: </span>
              <span className="font-medium">{data.receiverContact}</span>
            </div>
          )}
        </div>

        <table className="w-full border-collapse border border-gray-400 text-sm mb-4">
          <thead>
            <tr>
              <th className="border border-gray-400 px-2 py-1.5 text-left w-[40px]">Sl</th>
              <th className="border border-gray-400 px-2 py-1.5 text-left">Item Name</th>
              <th className="border border-gray-400 px-2 py-1.5 text-left">Description</th>
              <th className="border border-gray-400 px-2 py-1.5 text-left w-[70px]">Color</th>
              <th className="border border-gray-400 px-2 py-1.5 text-left w-[60px]">Size</th>
              <th className="border border-gray-400 px-2 py-1.5 text-right w-[80px]">Qty</th>
              <th className="border border-gray-400 px-2 py-1.5 text-left w-[50px]">Unit</th>
              <th className="border border-gray-400 px-2 py-1.5 text-right w-[90px]">Rate</th>
              <th className="border border-gray-400 px-2 py-1.5 text-right w-[110px]">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr key={item.id || idx}>
                <td className="border border-gray-400 px-2 py-1">{idx + 1}</td>
                <td className="border border-gray-400 px-2 py-1">{item.itemName}</td>
                <td className="border border-gray-400 px-2 py-1">{item.description || ""}</td>
                <td className="border border-gray-400 px-2 py-1">{item.color || ""}</td>
                <td className="border border-gray-400 px-2 py-1">{item.size || ""}</td>
                <td className="border border-gray-400 px-2 py-1 text-right">{parseFloat(item.quantity || "0").toLocaleString()}</td>
                <td className="border border-gray-400 px-2 py-1">{item.unit || ""}</td>
                <td className="border border-gray-400 px-2 py-1 text-right">{item.rate ? formatAmount(item.rate) : ""}</td>
                <td className="border border-gray-400 px-2 py-1 text-right">{item.amount ? formatAmount(item.amount) : ""}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border border-gray-400 px-2 py-1.5" colSpan={5} style={{ textAlign: "right" }}>TOTAL</td>
              <td className="border border-gray-400 px-2 py-1.5 text-right">{totalQty.toLocaleString()}</td>
              <td className="border border-gray-400 px-2 py-1.5"></td>
              <td className="border border-gray-400 px-2 py-1.5"></td>
              <td className="border border-gray-400 px-2 py-1.5 text-right">{formatAmount(totalAmt)}</td>
            </tr>
          </tbody>
        </table>

        <div className="text-sm mb-3">
          <span className="font-semibold">Amount in Words: </span>
          <span className="italic">{amountToWords(totalAmt)}</span>
        </div>

        {data.specialInstructions && (
          <div className="text-sm mb-3 p-2 border border-gray-300">
            <span className="font-semibold">Special Instructions: </span>
            <span>{data.specialInstructions}</span>
          </div>
        )}

        {data.notes && (
          <div className="text-sm mb-3 p-2 border border-gray-300">
            <span className="font-semibold">Notes: </span>
            <span>{data.notes}</span>
          </div>
        )}
      </PrintLayout>
    </div>
  );
}
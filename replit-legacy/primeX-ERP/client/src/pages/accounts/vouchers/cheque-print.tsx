import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, AlertCircle, ArrowLeft, Settings } from "lucide-react";
import { numberToWords } from "@/lib/numberToWords";
import { format } from "date-fns";
import { Link } from "wouter";

interface VoucherDetail {
  id: number;
  voucherNumber: string;
  voucherDate: string;
  voucherTypeName: string;
  description: string | null;
  amount: string;
  currencyCode: string;
}

interface VoucherItem {
  id: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  debitAmount: string;
  creditAmount: string;
}

interface VoucherResponse {
  voucher: VoucherDetail;
  items: VoucherItem[];
}

interface FieldPosition {
  top: number;
  left: number;
  fontSize: number;
  maxWidth?: number;
}

interface ChequeTemplate {
  id: number;
  bankAccountId: number;
  templateName: string;
  templateImageUrl: string | null;
  fieldPositions: {
    date: FieldPosition;
    payeeName: FieldPosition;
    amountWords: FieldPosition & { maxWidth: number };
    amountFigures: FieldPosition;
  };
  isActive: boolean;
}

export default function ChequePrintPage() {
  const params = useParams<{ id: string }>();
  const voucherId = params.id ? parseInt(params.id) : undefined;
  const [, setLocation] = useLocation();

  const { data: voucherData, isLoading: voucherLoading } = useQuery<VoucherResponse>({
    queryKey: ["/api/accounting/vouchers", voucherId],
    queryFn: async () => {
      const res = await fetch(`/api/accounting/vouchers/${voucherId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load voucher");
      return res.json();
    },
    enabled: !!voucherId,
  });

  const voucher = voucherData?.voucher;
  const items = voucherData?.items || [];

  const bankAccountId = items.length > 0 ? findBankAccountFromItems(items) : null;

  const { data: templateData, isLoading: templateLoading, isError: templateError } = useQuery<ChequeTemplate>({
    queryKey: ["/api/cheque-templates/by-bank", bankAccountId],
    queryFn: async () => {
      const res = await fetch(`/api/cheque-templates/by-bank/${bankAccountId}`, { credentials: "include" });
      if (!res.ok) throw new Error("No template found");
      return res.json();
    },
    enabled: !!bankAccountId,
  });

  const handlePrint = () => {
    window.print();
  };

  if (voucherLoading || templateLoading) {
    return (
      <DashboardContainer title="Cheque Print" subtitle="Loading...">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardContainer>
    );
  }

  if (!voucher) {
    return (
      <DashboardContainer title="Cheque Print" subtitle="Voucher not found">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <p className="text-lg font-medium">Voucher not found</p>
            <Button variant="outline" onClick={() => setLocation("/accounts/vouchers")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Vouchers
            </Button>
          </CardContent>
        </Card>
      </DashboardContainer>
    );
  }

  if (!bankAccountId || templateError || !templateData) {
    return (
      <DashboardContainer
        title="Cheque Print"
        subtitle={`Voucher ${voucher.voucherNumber}`}
        actions={
          <Button variant="outline" onClick={() => setLocation(`/accounts/vouchers/view/${voucherId}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Voucher
          </Button>
        }
      >
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <AlertCircle className="h-12 w-12 text-orange-500" />
            <p className="text-lg font-medium">No cheque template configured</p>
            <p className="text-sm text-muted-foreground">
              {!bankAccountId
                ? "This voucher does not have a bank account linked."
                : "No active cheque template is set up for this bank account."}
            </p>
            <Link href="/settings/cheque-templates">
              <Button variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                Configure Cheque Templates
              </Button>
            </Link>
          </CardContent>
        </Card>
      </DashboardContainer>
    );
  }

  const amount = parseFloat(voucher.amount) || 0;
  const amountWords = numberToWords(amount);
  const formattedAmount = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  let formattedDate = "";
  try {
    formattedDate = format(new Date(voucher.voucherDate), "dd/MM/yyyy");
  } catch {
    formattedDate = voucher.voucherDate;
  }

  const payeeName = voucher.description || "—";
  const fp = templateData.fieldPositions;

  return (
    <DashboardContainer
      title="Print Cheque"
      subtitle={`Voucher ${voucher.voucherNumber}`}
      actions={
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => setLocation(`/accounts/vouchers/view/${voucherId}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print Cheque
          </Button>
        </div>
      }
    >
      <div className="flex justify-center">
        <div
          className="relative border rounded-lg overflow-hidden bg-white shadow-lg print:border-0 print:shadow-none"
          style={{ width: "100%", maxWidth: "800px" }}
        >
          {templateData.templateImageUrl ? (
            <img
              src={templateData.templateImageUrl}
              alt="Cheque"
              className="w-full block"
            />
          ) : (
            <div className="w-full h-64 bg-gray-100 flex items-center justify-center text-muted-foreground">
              No cheque image
            </div>
          )}

          <div
            className="absolute font-medium text-black"
            style={{
              top: `${fp.date.top}%`,
              left: `${fp.date.left}%`,
              fontSize: `${fp.date.fontSize}px`,
              whiteSpace: "nowrap",
            }}
          >
            {formattedDate}
          </div>

          <div
            className="absolute font-medium text-black"
            style={{
              top: `${fp.payeeName.top}%`,
              left: `${fp.payeeName.left}%`,
              fontSize: `${fp.payeeName.fontSize}px`,
              whiteSpace: "nowrap",
            }}
          >
            {payeeName}
          </div>

          <div
            className="absolute font-medium text-black"
            style={{
              top: `${fp.amountWords.top}%`,
              left: `${fp.amountWords.left}%`,
              fontSize: `${fp.amountWords.fontSize}px`,
              maxWidth: `${fp.amountWords.maxWidth || 70}%`,
              lineHeight: 1.3,
            }}
          >
            {amountWords}
          </div>

          <div
            className="absolute font-bold text-black"
            style={{
              top: `${fp.amountFigures.top}%`,
              left: `${fp.amountFigures.left}%`,
              fontSize: `${fp.amountFigures.fontSize}px`,
              whiteSpace: "nowrap",
            }}
          >
            {formattedAmount}
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .relative, .relative * { visibility: visible; }
          .relative { position: fixed; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </DashboardContainer>
  );
}

function findBankAccountFromItems(items: { accountId: number; accountCode: string; accountName: string; creditAmount: string }[]): number | null {
  const bankItem = items.find(
    (item) =>
      (parseFloat(item.creditAmount) > 0 || true) &&
      (item.accountName?.toLowerCase().includes("bank") ||
        item.accountCode?.startsWith("1002") ||
        item.accountCode?.startsWith("1102"))
  );
  return bankItem ? bankItem.accountId : (items.length > 0 ? items[0].accountId : null);
}

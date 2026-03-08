import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { PrintLayout } from "@/components/print/PrintLayout";
import { ArrowLeft, Printer, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useTenantInfo } from "@/hooks/useTenantInfo";
import QRCode from "react-qr-code";

interface VoucherDetail {
  id: number;
  voucherNumber: string;
  voucherDate: string;
  postingDate: string | null;
  voucherTypeId: number;
  voucherTypeName: string;
  statusId: number;
  statusName: string;
  statusColor: string;
  fiscalYearId: number;
  accountingPeriodId: number;
  reference: string | null;
  referenceDate: string | null;
  description: string | null;
  preparedById: number;
  preparedByName: string;
  amount: string;
  currencyCode: string;
  exchangeRate: string;
  isPosted: boolean;
  isCancelled: boolean;
  verificationCode?: string;
  createdAt: string;
  updatedAt: string;
}

interface VoucherItem {
  id: number;
  voucherId: number;
  lineNumber: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  description: string | null;
  debitAmount: string;
  creditAmount: string;
}

interface BillAllocationDetail {
  id: number;
  billReferenceId: number | null;
  voucherId: number;
  voucherItemId: number | null;
  allocationType: string;
  amount: string;
  partyId: number;
  accountId: number;
  allocationDate: string;
  notes: string | null;
  billNumber: string | null;
  billDate: string | null;
  billType: string | null;
  originalAmount: string | null;
  pendingAmount: string | null;
  billStatus: string | null;
  partyName: string | null;
  accountName: string | null;
  accountCode: string | null;
}

interface VoucherResponse {
  voucher: VoucherDetail;
  items: VoucherItem[];
  approvalHistory: unknown[];
  billAllocations?: BillAllocationDetail[];
}

function formatAmount(val: string | number, currency: string = "BDT") {
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return `${currency === "BDT" ? "BDT " : ""}0.00`;
  const prefix = currency === "BDT" ? "BDT " : "";
  return prefix + num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

export default function VoucherPrint() {
  const params = useParams<{ id: string }>();
  const voucherId = params.id ? parseInt(params.id) : undefined;
  const [, setLocation] = useLocation();
  const { tenantInfo } = useTenantInfo();

  const { data, isLoading, isError } = useQuery<VoucherResponse>({
    queryKey: [`/api/accounting/vouchers/${voucherId}`],
    enabled: !!voucherId,
  });

  useEffect(() => {
    if (data) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
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
        <p className="text-lg font-medium text-destructive">Could not load voucher details.</p>
        <Button variant="outline" onClick={() => setLocation("/accounts/vouchers")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Vouchers
        </Button>
      </div>
    );
  }

  const { voucher, items, billAllocations: billAllocationsData } = data;

  const isForeignCurrency = voucher.currencyCode && voucher.currencyCode !== "BDT";
  const exchangeRate = parseFloat(voucher.exchangeRate || "1") || 1;

  const totalDebit = (items || []).reduce(
    (sum, item) => sum + (parseFloat(item.debitAmount) || 0),
    0
  );
  const totalCredit = (items || []).reduce(
    (sum, item) => sum + (parseFloat(item.creditAmount) || 0),
    0
  );

  const baseCurrencyTotal = isForeignCurrency ? totalDebit * exchangeRate : totalDebit;

  return (
    <div className="p-4">
      <div className="no-print flex gap-2 mb-4">
        <Button variant="outline" onClick={() => setLocation(`/accounts/vouchers/view/${voucherId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      <PrintLayout
        title={voucher.voucherTypeName}
        subtitle={`Voucher No: ${voucher.voucherNumber}`}
        companyInfo={tenantInfo.companyName ? { name: tenantInfo.companyName, address: tenantInfo.companyAddress, phone: tenantInfo.companyPhone, email: tenantInfo.companyEmail, logoUrl: tenantInfo.companyLogo } : undefined}
        showSignatures={true}
        signatures={[
          { label: "Prepared By" },
          { label: "Checked By" },
          { label: "Recommended By" },
          { label: "Audited By" },
          { label: "Approved By" },
        ]}
        qrCode={voucher.verificationCode ? (
          <div className="flex flex-col items-center gap-1">
            <QRCode value={`${window.location.origin}/verify/${voucher.verificationCode}`} size={80} />
            <span className="text-[8px] text-muted-foreground">Scan to verify</span>
          </div>
        ) : undefined}
      >
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-4 text-sm">
          <div>
            <span className="text-muted-foreground">Date: </span>
            <span className="font-medium">{formatDate(voucher.voucherDate)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Reference: </span>
            <span className="font-medium">{voucher.reference || "-"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Posting Date: </span>
            <span className="font-medium">{formatDate(voucher.postingDate)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Ref Date: </span>
            <span className="font-medium">{formatDate(voucher.referenceDate)}</span>
          </div>
          {isForeignCurrency && (
            <>
              <div>
                <span className="text-muted-foreground">Currency: </span>
                <span className="font-medium">{voucher.currencyCode}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Exchange Rate: </span>
                <span className="font-medium">1 {voucher.currencyCode} = {exchangeRate.toFixed(6)} BDT</span>
              </div>
            </>
          )}
        </div>

        <table className="w-full border-collapse border border-gray-400 text-sm mb-4">
          <thead>
            <tr>
              <th className="border border-gray-400 px-2 py-1.5 text-left w-[40px]">#</th>
              <th className="border border-gray-400 px-2 py-1.5 text-left w-[90px]">Acc Code</th>
              <th className="border border-gray-400 px-2 py-1.5 text-left">Account Name</th>
              <th className="border border-gray-400 px-2 py-1.5 text-right w-[130px]">Debit{isForeignCurrency ? ` (${voucher.currencyCode})` : ""}</th>
              <th className="border border-gray-400 px-2 py-1.5 text-right w-[130px]">Credit{isForeignCurrency ? ` (${voucher.currencyCode})` : ""}</th>
              {isForeignCurrency && (
                <>
                  <th className="border border-gray-400 px-2 py-1.5 text-right w-[130px]">Debit (BDT)</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-right w-[130px]">Credit (BDT)</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {(items || []).map((item) => {
              const debit = parseFloat(item.debitAmount) || 0;
              const credit = parseFloat(item.creditAmount) || 0;
              return (
                <tr key={item.id}>
                  <td className="border border-gray-400 px-2 py-1">{item.lineNumber}</td>
                  <td className="border border-gray-400 px-2 py-1 font-mono text-xs">{item.accountCode}</td>
                  <td className="border border-gray-400 px-2 py-1">{item.accountName}</td>
                  <td className="border border-gray-400 px-2 py-1 text-right">
                    {debit > 0 ? formatAmount(debit, voucher.currencyCode) : ""}
                  </td>
                  <td className="border border-gray-400 px-2 py-1 text-right">
                    {credit > 0 ? formatAmount(credit, voucher.currencyCode) : ""}
                  </td>
                  {isForeignCurrency && (
                    <>
                      <td className="border border-gray-400 px-2 py-1 text-right text-gray-600">
                        {debit > 0 ? formatAmount(debit * exchangeRate) : ""}
                      </td>
                      <td className="border border-gray-400 px-2 py-1 text-right text-gray-600">
                        {credit > 0 ? formatAmount(credit * exchangeRate) : ""}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className="border border-gray-400 px-2 py-1.5" colSpan={3} style={{ textAlign: "right" }}>
                TOTAL
              </td>
              <td className="border border-gray-400 px-2 py-1.5 text-right">
                {isForeignCurrency ? formatAmount(totalDebit, voucher.currencyCode) : formatAmount(totalDebit)}
              </td>
              <td className="border border-gray-400 px-2 py-1.5 text-right">
                {isForeignCurrency ? formatAmount(totalCredit, voucher.currencyCode) : formatAmount(totalCredit)}
              </td>
              {isForeignCurrency && (
                <>
                  <td className="border border-gray-400 px-2 py-1.5 text-right text-gray-600">{formatAmount(totalDebit * exchangeRate)}</td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right text-gray-600">{formatAmount(totalCredit * exchangeRate)}</td>
                </>
              )}
            </tr>
          </tbody>
        </table>

        {voucher.description && (
          <div className="text-sm mb-3 p-2 border border-gray-300">
            <span className="font-semibold">Narration: </span>
            <span>{voucher.description}</span>
          </div>
        )}

        {billAllocationsData && billAllocationsData.length > 0 && (() => {
          const grouped = billAllocationsData.reduce((acc, alloc) => {
            const key = `${alloc.accountCode || 'N/A'} - ${alloc.accountName || 'Unknown Account'}`;
            if (!acc[key]) acc[key] = { party: alloc.partyName, items: [] };
            acc[key].items.push(alloc);
            return acc;
          }, {} as Record<string, { party: string | null; items: BillAllocationDetail[] }>);

          return (
            <div className="mb-4">
              <div className="text-sm font-semibold mb-2 border-b border-gray-400 pb-1">
                Bill-wise Details
              </div>
              {Object.entries(grouped).map(([accountLabel, { party, items: allocations }]) => (
                <div key={accountLabel} className="mb-3 last:mb-0">
                  <div className="text-xs mb-1">
                    <span className="font-medium">{accountLabel}</span>
                    {party && <span className="text-gray-600"> ({party})</span>}
                  </div>
                  <table className="w-full border-collapse border border-gray-300 text-xs mb-1">
                    <thead>
                      <tr>
                        <th className="border border-gray-300 px-2 py-1 text-left w-[80px]">Type</th>
                        <th className="border border-gray-300 px-2 py-1 text-left">Bill No</th>
                        <th className="border border-gray-300 px-2 py-1 text-left w-[90px]">Bill Date</th>
                        <th className="border border-gray-300 px-2 py-1 text-right w-[110px]">Bill Amount</th>
                        <th className="border border-gray-300 px-2 py-1 text-right w-[110px]">Allocated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocations.map((alloc) => (
                        <tr key={alloc.id}>
                          <td className="border border-gray-300 px-2 py-0.5">
                            {alloc.allocationType === "AGAINST_REF" ? "Agst Ref" :
                             alloc.allocationType === "NEW_REF" ? "New Ref" :
                             alloc.allocationType === "ADVANCE" ? "Advance" :
                             alloc.allocationType === "ON_ACCOUNT" ? "On Acct" :
                             alloc.allocationType}
                          </td>
                          <td className="border border-gray-300 px-2 py-0.5">{alloc.billNumber || "-"}</td>
                          <td className="border border-gray-300 px-2 py-0.5">{formatDate(alloc.billDate)}</td>
                          <td className="border border-gray-300 px-2 py-0.5 text-right">
                            {alloc.originalAmount ? formatAmount(alloc.originalAmount, voucher.currencyCode) : "-"}
                          </td>
                          <td className="border border-gray-300 px-2 py-0.5 text-right">
                            {formatAmount(alloc.amount, voucher.currencyCode)}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="border border-gray-300 px-2 py-0.5" colSpan={4} style={{ textAlign: "right" }}>
                          Total
                        </td>
                        <td className="border border-gray-300 px-2 py-0.5 text-right">
                          {formatAmount(
                            allocations.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0),
                            voucher.currencyCode
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="text-sm mb-3">
          <span className="font-semibold">Amount in Words: </span>
          <span className="italic">{amountToWords(isForeignCurrency ? baseCurrencyTotal : totalDebit)}</span>
          {isForeignCurrency && (
            <div className="mt-1 text-xs text-gray-600">
              (Base currency equivalent of {voucher.currencyCode} {totalDebit.toLocaleString("en-US", { minimumFractionDigits: 2 })} at rate {exchangeRate.toFixed(6)})
            </div>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          <span>Status: {voucher.statusName}</span>
          <span className="mx-2">|</span>
          <span>Prepared By: {voucher.preparedByName || "-"}</span>
        </div>
      </PrintLayout>
    </div>
  );
}

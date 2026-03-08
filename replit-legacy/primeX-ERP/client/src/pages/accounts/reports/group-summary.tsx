import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { PrintLayout } from "@/components/print/PrintLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, Scale } from "lucide-react";
import { useTenantCurrencySettings, getCurrencySymbol } from "@/lib/currency";
import { useTenantInfo } from "@/hooks/useTenantInfo";

interface TrialBalanceEntry {
  accountId: number;
  accountNumber: string;
  accountName: string;
  accountTypeName: string;
  debitTotal: number;
  creditTotal: number;
  closingBalance: number;
}

interface TrialBalanceGroup {
  groupId: number;
  groupName: string;
  nature: string;
  level: number;
  parentGroupId: number | null;
  accounts: TrialBalanceEntry[];
  subGroups: TrialBalanceGroup[];
  totalDebit: number;
  totalCredit: number;
}

function formatAmount(val: number): string {
  return Math.abs(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const natureColors: Record<string, string> = {
  Asset: "bg-blue-100 text-blue-800",
  Liability: "bg-orange-100 text-orange-800",
  Equity: "bg-purple-100 text-purple-800",
  Income: "bg-green-100 text-green-800",
  Expense: "bg-red-100 text-red-800",
};

interface GroupSummaryRow {
  groupName: string;
  nature: string;
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
  balanceType: "Dr" | "Cr";
}

function flattenGroups(groups: TrialBalanceGroup[]): GroupSummaryRow[] {
  const rows: GroupSummaryRow[] = [];
  for (const g of groups) {
    if (g.totalDebit > 0 || g.totalCredit > 0) {
      const net = g.totalDebit - g.totalCredit;
      rows.push({
        groupName: g.groupName,
        nature: g.nature,
        totalDebit: g.totalDebit,
        totalCredit: g.totalCredit,
        netBalance: Math.abs(net),
        balanceType: net >= 0 ? "Dr" : "Cr",
      });
    }
  }
  return rows;
}

interface NatureSummary {
  nature: string;
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
  balanceType: "Dr" | "Cr";
  groups: GroupSummaryRow[];
}

function groupByNature(rows: GroupSummaryRow[]): NatureSummary[] {
  const map = new Map<string, GroupSummaryRow[]>();
  const order = ["Asset", "Liability", "Equity", "Income", "Expense"];
  for (const r of rows) {
    if (!map.has(r.nature)) map.set(r.nature, []);
    map.get(r.nature)!.push(r);
  }
  const result: NatureSummary[] = [];
  for (const nature of order) {
    const groups = map.get(nature) || [];
    if (groups.length === 0) continue;
    const totalDebit = groups.reduce((s, g) => s + g.totalDebit, 0);
    const totalCredit = groups.reduce((s, g) => s + g.totalCredit, 0);
    const net = totalDebit - totalCredit;
    result.push({
      nature,
      totalDebit,
      totalCredit,
      netBalance: Math.abs(net),
      balanceType: net >= 0 ? "Dr" : "Cr",
      groups,
    });
  }
  return result;
}

export default function GroupSummaryPage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);
  const { data: tenantCurrency } = useTenantCurrencySettings();
  const currencySymbol = getCurrencySymbol(tenantCurrency?.baseCurrency || "BDT");
  const { tenantInfo } = useTenantInfo();

  const queryUrl = `/api/accounting/reports/trial-balance${asOfDate ? `?asOfDate=${asOfDate}` : ""}`;

  const { data: groups, isLoading } = useQuery<TrialBalanceGroup[]>({
    queryKey: [queryUrl],
  });

  const rows = groups ? flattenGroups(groups) : [];
  const natureSummaries = groupByNature(rows);
  const hasData = rows.length > 0;

  const grandTotalDebit = rows.reduce((s, r) => s + r.totalDebit, 0);
  const grandTotalCredit = rows.reduce((s, r) => s + r.totalCredit, 0);
  const grandNet = grandTotalDebit - grandTotalCredit;

  return (
    <DashboardContainer
      title="Group Summary"
      subtitle="Account group totals summarized by nature — similar to Tally's Group Summary"
      actions={
        <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      }
    >
      <PrintLayout
        title="Group Summary"
        subtitle={`As of ${asOfDate}`}
        companyInfo={tenantInfo.companyName ? { name: tenantInfo.companyName, address: tenantInfo.companyAddress, phone: tenantInfo.companyPhone, email: tenantInfo.companyEmail, logoUrl: tenantInfo.companyLogo } : undefined}
        showSignatures={false}
      >
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="w-full md:w-64 no-print">
                <label className="text-sm font-medium text-gray-700 mb-1 block">As of Date</label>
                <Input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !hasData ? (
              <div className="text-center py-16">
                <Scale className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-500">No group summary data</h3>
                <p className="text-sm text-gray-400 mt-1">
                  No accounts with balances found as of the selected date.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto print:overflow-visible">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="min-w-[200px]">Group Name</TableHead>
                      <TableHead className="w-[120px]">Nature</TableHead>
                      <TableHead className="text-right w-[160px]">{`Total Debit (${currencySymbol})`}</TableHead>
                      <TableHead className="text-right w-[160px]">{`Total Credit (${currencySymbol})`}</TableHead>
                      <TableHead className="text-right w-[180px]">Net Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {natureSummaries.map((ns) => (
                      <>
                        {ns.groups.map((row) => (
                          <TableRow key={`${ns.nature}-${row.groupName}`} className="hover:bg-gray-50">
                            <TableCell className="font-medium text-sm">{row.groupName}</TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${natureColors[row.nature] || "bg-gray-100 text-gray-800"}`}>
                                {row.nature}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {row.totalDebit > 0 ? formatAmount(row.totalDebit) : "-"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {row.totalCredit > 0 ? formatAmount(row.totalCredit) : "-"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">
                              <span className={row.balanceType === "Dr" ? "text-blue-700" : "text-orange-700"}>
                                {currencySymbol}{formatAmount(row.netBalance)} {row.balanceType}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-gray-100 border-t-2">
                          <TableCell className="font-bold text-sm text-gray-800">
                            Total {ns.nature}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs font-bold ${natureColors[ns.nature] || "bg-gray-100 text-gray-800"}`}>
                              {ns.nature}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-bold">
                            {ns.totalDebit > 0 ? formatAmount(ns.totalDebit) : "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-bold">
                            {ns.totalCredit > 0 ? formatAmount(ns.totalCredit) : "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-bold">
                            <span className={ns.balanceType === "Dr" ? "text-blue-700" : "text-orange-700"}>
                              {currencySymbol}{formatAmount(ns.netBalance)} {ns.balanceType}
                            </span>
                          </TableCell>
                        </TableRow>
                      </>
                    ))}
                    <TableRow className="border-t-4 bg-gray-200">
                      <TableCell colSpan={2} className="text-right font-bold text-gray-900 text-base">
                        Grand Total
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-gray-900">
                        {formatAmount(grandTotalDebit)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-gray-900">
                        {formatAmount(grandTotalCredit)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-gray-900">
                        <span className={grandNet >= 0 ? "text-blue-700" : "text-orange-700"}>
                          {currencySymbol}{formatAmount(Math.abs(grandNet))} {grandNet >= 0 ? "Dr" : "Cr"}
                        </span>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </PrintLayout>
    </DashboardContainer>
  );
}

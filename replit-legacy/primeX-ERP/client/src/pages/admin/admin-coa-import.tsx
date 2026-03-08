import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import AdminLayout from "@/components/layout/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileSpreadsheet, AlertTriangle, CheckCircle,
  ArrowLeft, RefreshCw, Trash2, Download
} from "lucide-react";

interface ImportResult {
  success: boolean;
  dryRun: boolean;
  backup?: { path: string; groupCount: number; ledgerCount: number };
  deleted?: { groups: number; ledgers: number; openingBalances: number };
  created?: { groups: number; ledgers: number; openingBalancesSet: number };
  totals?: { totalDr: number; totalCr: number; difference: number };
  nameCorrections: Array<{ original: string; normalized: string; type: string }>;
  validationErrors: string[];
  groupMismatches: Array<{
    topGroup: string;
    subGroup: string;
    expected: { dr: number; cr: number };
    actual: { dr: number; cr: number };
    diff: { dr: number; cr: number };
  }>;
  summary: string;
}

export default function AdminCOAImport() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tenantId, setTenantId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [cutoverDate, setCutoverDate] = useState("2026-02-15");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: tenants, isLoading: tenantsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/tenants"],
  });

  const handleImport = async (dryRun: boolean) => {
    if (!tenantId) {
      toast({ title: "Error", description: "Please select a tenant.", variant: "destructive" });
      return;
    }
    if (!file) {
      toast({ title: "Error", description: "Please select an Excel file.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("cutover", cutoverDate);
      formData.append("dry_run", dryRun ? "true" : "false");

      const response = await fetch(`/api/admin/tenants/${tenantId}/coa/reset-from-excel`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Import failed" }));
        throw new Error(errorData.message || `Import failed with status ${response.status}`);
      }

      const data: ImportResult = await response.json();
      setResult(data);

      toast({
        title: data.success ? "Import Successful" : "Import Completed with Issues",
        description: data.summary,
        variant: data.success ? "default" : "destructive",
      });
    } catch (error: any) {
      toast({ title: "Import Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setResult(null);
  };

  const formatNumber = (n: number) =>
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <Button variant="ghost" onClick={() => setLocation("/admin")} className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Admin
        </Button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <FileSpreadsheet className="h-6 w-6 text-blue-600" />
            COA Import from Excel
          </h1>
          <p className="text-gray-500 mt-1">
            Reset and import Chart of Accounts from an Excel file for a tenant
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Import Configuration</CardTitle>
            <CardDescription>Select a tenant, upload an Excel file, and choose the cutover date</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tenant">Tenant</Label>
                <Select value={tenantId} onValueChange={setTenantId}>
                  <SelectTrigger>
                    <SelectValue placeholder={tenantsLoading ? "Loading tenants..." : "Select a tenant"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(tenants ?? []).map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name} ({t.domain})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cutover">Cutover Date</Label>
                <Input
                  id="cutover"
                  type="date"
                  value={cutoverDate}
                  onChange={(e) => setCutoverDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="file">Excel File (.xlsx, .xls)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    ref={fileInputRef}
                    id="file"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="cursor-pointer"
                  />
                </div>
                {file && (
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <FileSpreadsheet className="h-3 w-3" />
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={() => handleImport(true)}
                disabled={loading || !tenantId || !file}
                variant="outline"
                className="gap-2"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Dry Run
              </Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={loading || !tenantId || !file}
                variant="destructive"
                className="gap-2"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Commit Import
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
              <p className="text-gray-600">Processing import...</p>
            </div>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-6">
            <Alert className={result.success ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}>
              <div className="flex items-center gap-2">
                {result.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                )}
                <AlertDescription className="text-sm font-medium">
                  {result.summary}
                  {result.dryRun && (
                    <Badge variant="outline" className="ml-2">Dry Run</Badge>
                  )}
                </AlertDescription>
              </div>
            </Alert>

            {result.backup && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Download className="h-4 w-4" /> Backup Info
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                    <p><span className="font-medium">Path:</span> {result.backup.path}</p>
                    <p><span className="font-medium">Groups backed up:</span> {result.backup.groupCount}</p>
                    <p><span className="font-medium">Ledgers backed up:</span> {result.backup.ledgerCount}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {(result.deleted || result.created) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" /> Delete / Create Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {result.deleted && (
                      <div className="bg-red-50 rounded-lg p-4">
                        <h4 className="font-medium text-red-700 flex items-center gap-2 mb-2">
                          <Trash2 className="h-4 w-4" /> Deleted
                        </h4>
                        <div className="space-y-1 text-sm">
                          <p>Groups: <span className="font-semibold">{result.deleted.groups}</span></p>
                          <p>Ledgers: <span className="font-semibold">{result.deleted.ledgers}</span></p>
                          <p>Opening Balances: <span className="font-semibold">{result.deleted.openingBalances}</span></p>
                        </div>
                      </div>
                    )}
                    {result.created && (
                      <div className="bg-green-50 rounded-lg p-4">
                        <h4 className="font-medium text-green-700 flex items-center gap-2 mb-2">
                          <CheckCircle className="h-4 w-4" /> Created
                        </h4>
                        <div className="space-y-1 text-sm">
                          <p>Groups: <span className="font-semibold">{result.created.groups}</span></p>
                          <p>Ledgers: <span className="font-semibold">{result.created.ledgers}</span></p>
                          <p>Opening Balances Set: <span className="font-semibold">{result.created.openingBalancesSet}</span></p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {result.totals && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Totals</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-gray-500">Total Dr</p>
                      <p className="text-lg font-bold text-blue-700">{formatNumber(result.totals.totalDr)}</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-gray-500">Total Cr</p>
                      <p className="text-lg font-bold text-blue-700">{formatNumber(result.totals.totalCr)}</p>
                    </div>
                    <div className={`text-center p-3 rounded-lg ${result.totals.difference === 0 ? "bg-green-50" : "bg-yellow-50"}`}>
                      <p className="text-xs text-gray-500">Difference</p>
                      <p className={`text-lg font-bold ${result.totals.difference === 0 ? "text-green-700" : "text-yellow-700"}`}>
                        {formatNumber(result.totals.difference)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {result.validationErrors.length > 0 && (
              <Card className="border-red-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-red-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Validation Errors ({result.validationErrors.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {result.validationErrors.map((err, i) => (
                      <div key={i} className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
                        {err}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {result.nameCorrections.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Name Corrections ({result.nameCorrections.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Original</TableHead>
                        <TableHead>Normalized</TableHead>
                        <TableHead>Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.nameCorrections.map((nc, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{nc.original}</TableCell>
                          <TableCell className="text-sm font-medium">{nc.normalized}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{nc.type}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {result.groupMismatches.length > 0 && (
              <Card className="border-yellow-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-yellow-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Group Mismatches ({result.groupMismatches.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Top Group</TableHead>
                          <TableHead>Sub Group</TableHead>
                          <TableHead className="text-right">Expected Dr</TableHead>
                          <TableHead className="text-right">Expected Cr</TableHead>
                          <TableHead className="text-right">Actual Dr</TableHead>
                          <TableHead className="text-right">Actual Cr</TableHead>
                          <TableHead className="text-right">Diff Dr</TableHead>
                          <TableHead className="text-right">Diff Cr</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.groupMismatches.map((gm, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm font-medium">{gm.topGroup}</TableCell>
                            <TableCell className="text-sm">{gm.subGroup}</TableCell>
                            <TableCell className="text-right text-sm">{formatNumber(gm.expected.dr)}</TableCell>
                            <TableCell className="text-right text-sm">{formatNumber(gm.expected.cr)}</TableCell>
                            <TableCell className="text-right text-sm">{formatNumber(gm.actual.dr)}</TableCell>
                            <TableCell className="text-right text-sm">{formatNumber(gm.actual.cr)}</TableCell>
                            <TableCell className={`text-right text-sm font-medium ${gm.diff.dr !== 0 ? "text-red-600" : ""}`}>
                              {formatNumber(gm.diff.dr)}
                            </TableCell>
                            <TableCell className={`text-right text-sm font-medium ${gm.diff.cr !== 0 ? "text-red-600" : ""}`}>
                              {formatNumber(gm.diff.cr)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Confirm COA Import
              </DialogTitle>
              <DialogDescription>
                This will permanently delete all existing Chart of Accounts data for the selected tenant
                and replace it with data from the uploaded Excel file. This action cannot be undone.
                A backup will be created before the import.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              <p className="font-medium">You are about to:</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Delete all existing account groups and ledgers</li>
                <li>Delete all opening balances</li>
                <li>Import new COA from: <span className="font-semibold">{file?.name}</span></li>
                <li>Cutover date: <span className="font-semibold">{cutoverDate}</span></li>
              </ul>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleImport(false)}
                disabled={loading}
                className="gap-2"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Confirm Import
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

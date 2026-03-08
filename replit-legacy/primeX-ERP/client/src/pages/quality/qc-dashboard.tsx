import { useQuery } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "wouter";
import {
  ClipboardCheck, TrendingUp, AlertTriangle, RotateCcw, FlaskConical,
  ArrowRight, CheckCircle2, XCircle, Clock
} from "lucide-react";

const resultColors: Record<string, string> = {
  PASS: "bg-green-100 text-green-800",
  FAIL: "bg-red-100 text-red-800",
  CONDITIONAL: "bg-amber-100 text-amber-800",
  PENDING: "bg-gray-100 text-gray-800",
};

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export default function QCDashboardPage() {
  const { data, isLoading } = useQuery<{ success: boolean; data: any }>({
    queryKey: ["/api/quality/dashboard"],
  });

  const dashboard = data?.data;

  return (
    <DashboardContainer title="Quality Management" subtitle="QC Dashboard & Overview">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Inspections</p>
                <p className="text-2xl font-bold">{dashboard?.inspections?.total || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <ClipboardCheck className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3 w-3" />{dashboard?.inspections?.passed || 0} passed</span>
              <span className="flex items-center gap-1 text-red-600"><XCircle className="h-3 w-3" />{dashboard?.inspections?.failed || 0} failed</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pass Rate</p>
                <p className="text-2xl font-bold">{dashboard?.passRate || 0}%</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(dashboard?.passRate || 0, 100)}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending CAPA</p>
                <p className="text-2xl font-bold">{dashboard?.capa?.open || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {dashboard?.capa?.inProgress || 0} in progress
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open Returns</p>
                <p className="text-2xl font-bold">{dashboard?.returns?.pending || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                <RotateCcw className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {dashboard?.returns?.total || 0} total
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Lab Tests</p>
                <p className="text-2xl font-bold">{dashboard?.labTests?.pending || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <FlaskConical className="h-5 w-5 text-purple-600" />
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {dashboard?.labTests?.total || 0} total
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Inspections</CardTitle>
            <Link href="/quality/inspections">
              <Button variant="ghost" size="sm" className="gap-1">View All <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Inspection #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(dashboard?.recentInspections || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No inspections yet</TableCell>
                    </TableRow>
                  ) : (
                    (dashboard?.recentInspections || []).map((insp: any) => (
                      <TableRow key={insp.id}>
                        <TableCell className="font-medium">{insp.inspectionNumber}</TableCell>
                        <TableCell>{insp.inspectionType}</TableCell>
                        <TableCell><Badge className={statusColors[insp.status] || "bg-gray-100"}>{insp.status}</Badge></TableCell>
                        <TableCell><Badge className={resultColors[insp.overallResult] || "bg-gray-100"}>{insp.overallResult || "—"}</Badge></TableCell>
                        <TableCell>{insp.createdAt ? new Date(insp.createdAt).toLocaleDateString() : "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/quality/inspections">
              <Button variant="outline" className="w-full justify-start gap-2">
                <ClipboardCheck className="h-4 w-4" /> New Inspection
              </Button>
            </Link>
            <Link href="/quality/lab-tests">
              <Button variant="outline" className="w-full justify-start gap-2">
                <FlaskConical className="h-4 w-4" /> Lab Tests
              </Button>
            </Link>
            <Link href="/quality/capa">
              <Button variant="outline" className="w-full justify-start gap-2">
                <AlertTriangle className="h-4 w-4" /> CAPA Actions
              </Button>
            </Link>
            <Link href="/quality/returns">
              <Button variant="outline" className="w-full justify-start gap-2">
                <RotateCcw className="h-4 w-4" /> Returns
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-lg">Inspection Pass/Fail Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { label: "INCOMING", pass: 0, fail: 0 },
              { label: "IN_PROCESS", pass: 0, fail: 0 },
              { label: "PRE_SHIPMENT", pass: 0, fail: 0 },
              { label: "FINAL", pass: 0, fail: 0 },
            ].map((stage) => {
              const total = stage.pass + stage.fail;
              const pct = total > 0 ? (stage.pass / total) * 100 : 0;
              return (
                <div key={stage.label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{stage.label.replace("_", " ")}</span>
                    <span className="text-muted-foreground">{total > 0 ? `${Math.round(pct)}% pass` : "No data"}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 flex overflow-hidden">
                    {total > 0 ? (
                      <>
                        <div className="bg-green-500 h-3" style={{ width: `${pct}%` }} />
                        <div className="bg-red-400 h-3" style={{ width: `${100 - pct}%` }} />
                      </>
                    ) : (
                      <div className="bg-gray-300 h-3 w-full" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </DashboardContainer>
  );
}

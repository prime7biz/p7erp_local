import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Wallet,
  Plus,
  Play,
  CheckCircle2,
  FileText,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Users,
  Calendar,
  CreditCard,
  Clock,
  AlertCircle,
  Download,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportToExcel } from '@/lib/exportToExcel';

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const runStatusColors: Record<string, string> = {
  DRAFT: "bg-blue-100 text-blue-800 border-blue-200",
  PROCESSING: "bg-amber-100 text-amber-800 border-amber-200",
  COMPLETED: "bg-green-100 text-green-800 border-green-200",
  CANCELLED: "bg-red-100 text-red-800 border-red-200",
};

const advanceStatusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-green-100 text-green-800 border-green-200",
  DEDUCTED: "bg-blue-100 text-blue-800 border-blue-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
};

function formatBDT(amount: string | number | null | undefined) {
  if (amount == null) return "BDT 0";
  return `BDT ${Number(amount).toLocaleString()}`;
}

function formatDate(dateStr: string | Date | null | undefined) {
  if (!dateStr) return "-";
  return format(new Date(dateStr), "MMM dd, yyyy");
}

export default function PayrollPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("salary-structures");

  return (
    <DashboardContainer
      title="Payroll Management"
      subtitle="Manage salary structures, payroll runs, and employee advances"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="salary-structures" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Salary Structures
          </TabsTrigger>
          <TabsTrigger value="payroll-runs" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Payroll Runs
          </TabsTrigger>
          <TabsTrigger value="advances" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Employee Advances
          </TabsTrigger>
        </TabsList>

        <TabsContent value="salary-structures" className="mt-6">
          <SalaryStructuresTab />
        </TabsContent>
        <TabsContent value="payroll-runs" className="mt-6">
          <PayrollRunsTab />
        </TabsContent>
        <TabsContent value="advances" className="mt-6">
          <AdvancesTab />
        </TabsContent>
      </Tabs>
    </DashboardContainer>
  );
}

function SalaryStructuresTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", description: "", isActive: true });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: structures, isLoading } = useQuery<any[]>({
    queryKey: ["/api/payroll/salary-structures"],
    select: (res: any) => Array.isArray(res) ? res : (res?.data ?? []),
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; isActive: boolean }) => {
      const res = await apiRequest("/api/payroll/salary-structures", "POST", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/salary-structures"] });
      toast({ title: "Success", description: "Salary structure created successfully" });
      setDialogOpen(false);
      setFormData({ name: "", description: "", isActive: true });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Salary Structures</h3>
          <p className="text-sm text-muted-foreground">Define salary components and structures for employees</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Structure
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Salary Structure</DialogTitle>
              <DialogDescription>Define a new salary structure with components</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Structure Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Standard Monthly Salary"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe this salary structure..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label htmlFor="isActive">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.name || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Structure"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : !structures?.length ? (
            <div className="text-center py-12">
              <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No salary structures defined yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create your first salary structure to get started</p>
            </div>
          ) : (
            <div className="divide-y">
              {structures.map((structure: any) => (
                <Collapsible
                  key={structure.id}
                  open={expandedId === structure.id}
                  onOpenChange={(open) => setExpandedId(open ? structure.id : null)}
                >
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        {expandedId === structure.id ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="text-left">
                          <p className="font-medium">{structure.name}</p>
                          {structure.description && (
                            <p className="text-sm text-muted-foreground">{structure.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs">
                          {structure.components?.length || 0} components
                        </Badge>
                        <Badge
                          variant="outline"
                          className={structure.isActive
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-gray-50 text-gray-500 border-gray-200"
                          }
                        >
                          {structure.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4 pl-11">
                      {structure.components?.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Component</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead className="text-right">Amount/Percentage</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {structure.components.map((comp: any, idx: number) => (
                              <TableRow key={idx}>
                                <TableCell className="font-medium">{comp.name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {comp.type || "EARNING"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  {comp.isPercentage
                                    ? `${comp.percentage}%`
                                    : formatBDT(comp.amount)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-sm text-muted-foreground py-2">No components added yet</p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PayrollRunsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const currentDate = new Date();
  const [month, setMonth] = useState(String(currentDate.getMonth() + 1));
  const [year, setYear] = useState(String(currentDate.getFullYear()));

  const { data: runs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/payroll/runs"],
    select: (res: any) => Array.isArray(res) ? res : (res?.data ?? []),
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { month: number; year: number }) => {
      const res = await apiRequest("/api/payroll/runs", "POST", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/runs"] });
      toast({ title: "Success", description: "Payroll run generated successfully" });
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/payroll/runs/${id}/approve`, "POST");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/runs"] });
      toast({ title: "Success", description: "Payroll run approved successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const totalPayroll = runs?.reduce((sum: number, r: any) => {
    if (r.status === "COMPLETED") return sum + Number(r.totalAmount || 0);
    return sum;
  }, 0) || 0;

  const totalEmployees = runs?.reduce((sum: number, r: any) => {
    if (r.status === "COMPLETED") return sum + Number(r.totalEmployees || 0);
    return sum;
  }, 0) || 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payroll (Completed)</CardTitle>
            <Wallet className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatBDT(totalPayroll)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Employees Processed</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEmployees}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
            <Calendar className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{runs?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Payroll Runs</h3>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-1.5" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportToExcel(
                (runs || []).map((r: any) => ({
                  period: `${monthNames[(r.month || 1) - 1]} ${r.year}`,
                  status: r.status,
                  totalEmployees: r.totalEmployees || 0,
                  totalAmount: r.totalAmount || 0,
                  createdAt: r.createdAt ? format(new Date(r.createdAt), 'yyyy-MM-dd') : '',
                })),
                [
                  { key: "period", header: "Period" },
                  { key: "status", header: "Status" },
                  { key: "totalEmployees", header: "Employees" },
                  { key: "totalAmount", header: "Total Amount" },
                  { key: "createdAt", header: "Created" },
                ],
                "payroll-runs",
                "xlsx"
              )}>
                Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportToExcel(
                (runs || []).map((r: any) => ({
                  period: `${monthNames[(r.month || 1) - 1]} ${r.year}`,
                  status: r.status,
                  totalEmployees: r.totalEmployees || 0,
                  totalAmount: r.totalAmount || 0,
                  createdAt: r.createdAt ? format(new Date(r.createdAt), 'yyyy-MM-dd') : '',
                })),
                [
                  { key: "period", header: "Period" },
                  { key: "status", header: "Status" },
                  { key: "totalEmployees", header: "Employees" },
                  { key: "totalAmount", header: "Total Amount" },
                  { key: "createdAt", header: "Created" },
                ],
                "payroll-runs",
                "csv"
              )}>
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Play className="h-4 w-4 mr-2" />
                Generate Payroll
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Payroll Run</DialogTitle>
              <DialogDescription>Select the month and year to generate payroll</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthNames.map((name, idx) => (
                      <SelectItem key={idx} value={String(idx + 1)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => generateMutation.mutate({ month: Number(month), year: Number(year) })}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? "Generating..." : "Generate Payroll"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : !runs?.length ? (
            <div className="text-center py-12">
              <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No payroll runs yet</p>
              <p className="text-sm text-muted-foreground mt-1">Generate your first payroll run to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run: any) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">
                      {monthNames[(run.month || 1) - 1]} {run.year}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={runStatusColors[run.status] || ""}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{run.totalEmployees || 0}</TableCell>
                    <TableCell className="text-right font-medium">{formatBDT(run.totalAmount)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(run.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {run.status === "PROCESSING" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => approveMutation.mutate(run.id)}
                            disabled={approveMutation.isPending}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                        )}
                        {run.status === "COMPLETED" && (
                          <Button size="sm" variant="outline">
                            <FileText className="h-4 w-4 mr-1" />
                            View Payslips
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AdvancesTab() {
  const { data: advances, isLoading } = useQuery<any[]>({
    queryKey: ["/api/payroll/advances"],
    select: (res: any) => Array.isArray(res) ? res : (res?.data ?? []),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Employee Advances</h3>
          <p className="text-sm text-muted-foreground">Track salary advances and deductions</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : !advances?.length ? (
            <div className="text-center py-12">
              <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No employee advances recorded</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Request Date</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.map((advance: any) => (
                  <TableRow key={advance.id}>
                    <TableCell className="font-medium">{advance.employeeName || `Employee #${advance.employeeId}`}</TableCell>
                    <TableCell className="text-right font-medium">{formatBDT(advance.amount)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={advanceStatusColors[advance.status] || ""}>
                        {advance.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(advance.requestDate)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {advance.remarks || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

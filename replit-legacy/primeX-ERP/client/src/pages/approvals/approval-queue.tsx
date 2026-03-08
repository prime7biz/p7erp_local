import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  CheckCircle, XCircle, Clock, ArrowRight, FileText,
  ShoppingCart, Receipt, Send, Eye, Search, ArrowLeft,
  ClipboardCheck, AlertTriangle, ThumbsUp, ThumbsDown,
  Shield, BookCheck, Star, Stamp,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-blue-100 text-blue-800",
  CHECKED: "bg-indigo-100 text-indigo-800",
  RECOMMENDED: "bg-purple-100 text-purple-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  SENT_BACK: "bg-yellow-100 text-yellow-800",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  voucher: "Voucher",
  purchase_order: "Purchase Order",
  quotation: "Quotation",
};

const DOC_TYPE_ICONS: Record<string, typeof Receipt> = {
  voucher: Receipt,
  purchase_order: ShoppingCart,
  quotation: FileText,
};

const ACTION_STYLES: Record<string, { variant: "default" | "destructive" | "outline" | "secondary"; icon: typeof CheckCircle }> = {
  approve: { variant: "default", icon: CheckCircle },
  check: { variant: "default", icon: CheckCircle },
  recommend: { variant: "default", icon: ThumbsUp },
  post: { variant: "default", icon: ArrowRight },
  submit: { variant: "default", icon: Send },
  send_back: { variant: "outline", icon: ArrowLeft },
  reject: { variant: "destructive", icon: XCircle },
  cancel: { variant: "destructive", icon: XCircle },
};

const AUTHORITY_TAB_CONFIG: Record<string, { label: string; shortLabel: string; icon: typeof CheckCircle; color: string }> = {
  all: { label: "All Pending", shortLabel: "All", icon: Clock, color: "text-gray-600" },
  check: { label: "Pending My Check", shortLabel: "Check", icon: BookCheck, color: "text-blue-600" },
  recommend: { label: "Pending My Recommendation", shortLabel: "Recommend", icon: Star, color: "text-purple-600" },
  approve: { label: "Pending My Approval", shortLabel: "Approve", icon: Stamp, color: "text-green-600" },
  post: { label: "Ready to Post", shortLabel: "Post", icon: ArrowRight, color: "text-orange-600" },
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatAmount(amount: number, currency: string = "BDT") {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: currency === "BDT" ? "BDT" : currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function ApprovalQueue() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activeAuthorityTab, setActiveAuthorityTab] = useState("all");
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    action: string;
    docType: string;
    docId: number;
    docNumber: string;
    currentStatus: string;
    amount: number;
  } | null>(null);
  const [actionComments, setActionComments] = useState("");
  const [actionReason, setActionReason] = useState("");

  const isSuperUser = user?.isSuperUser ?? false;

  const statsQuery = useQuery<{
    totalPending: number;
    awaitingMyAction: number;
    approvedToday: number;
    rejectedToday: number;
    byDocType: Record<string, number>;
    byStatus: Record<string, number>;
  }>({
    queryKey: ["/api/approvals/stats"],
  });

  const byActionQuery = useQuery<{
    byAction: Record<string, number>;
    total: number;
    availableAuthorities: string[];
    isSuperUser: boolean;
  }>({
    queryKey: ["/api/approvals/queue/by-action"],
  });

  const actionFilter = activeAuthorityTab !== "all" ? activeAuthorityTab : undefined;

  const queueQuery = useQuery<{
    items: any[];
    pagination: { page: number; pageSize: number; totalCount: number; totalPages: number };
    summary: { total: number; byDocType: Record<string, number>; byStatus: Record<string, number>; byAction: Record<string, number> };
  }>({
    queryKey: ["/api/approvals/queue", docTypeFilter, statusFilter, searchText, currentPage, pageSize, actionFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (docTypeFilter !== "all") params.set("docType", docTypeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (actionFilter) params.set("actionFilter", actionFilter);
      if (searchText) params.set("search", searchText);
      params.set("page", String(currentPage));
      params.set("pageSize", String(pageSize));
      const url = `/api/approvals/queue${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" } });
      if (!res.ok) throw new Error("Failed to fetch queue");
      return res.json();
    },
  });

  const myActionsQuery = useQuery<{ items: any[] }>({
    queryKey: ["/api/approvals/my-actions"],
  });

  const performActionMutation = useMutation({
    mutationFn: async (params: {
      docType: string;
      docId: number;
      action: string;
      currentStatus: string;
      amount: number;
      comments: string;
      reason: string;
    }) => {
      const res = await apiRequest(
        `/api/workflow/documents/${params.docType}/${params.docId}/action`,
        "POST",
        {
          action: params.action,
          currentStatus: params.currentStatus,
          amount: params.amount,
          comments: params.comments,
          reason: params.reason,
        }
      );
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Action Completed", description: data.message || "Action performed successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/my-actions"] });
      setActionDialog(null);
      setActionComments("");
      setActionReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Action Failed", description: error.message, variant: "destructive" });
    },
  });

  const filteredItems = queueQuery.data?.items || [];
  const pagination = queueQuery.data?.pagination;

  const handleActionClick = (action: string, item: any) => {
    setActionDialog({
      open: true,
      action,
      docType: item.docType,
      docId: item.docId,
      docNumber: item.docNumber,
      currentStatus: item.currentStatus,
      amount: item.amount,
    });
    setActionComments("");
    setActionReason("");
  };

  const handleConfirmAction = () => {
    if (!actionDialog) return;
    const requiresComments = ["reject", "send_back"].includes(actionDialog.action);
    if (requiresComments && !actionComments.trim()) {
      toast({ title: "Comments Required", description: `Please provide comments for ${actionDialog.action.replace("_", " ")} action`, variant: "destructive" });
      return;
    }
    performActionMutation.mutate({
      docType: actionDialog.docType,
      docId: actionDialog.docId,
      action: actionDialog.action,
      currentStatus: actionDialog.currentStatus,
      amount: actionDialog.amount,
      comments: actionComments,
      reason: actionReason,
    });
  };

  const stats = statsQuery.data;

  const byActionData = byActionQuery.data?.byAction || {};
  const availableAuthorities = byActionQuery.data?.availableAuthorities || [];

  const authorityTabs = isSuperUser
    ? ["all", "check", "recommend", "approve", "post"]
    : ["all", ...availableAuthorities.filter(a => ["check", "recommend", "approve", "post"].includes(a))];

  const uniqueTabs = Array.from(new Set(authorityTabs));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-orange-100 rounded-lg">
          <ClipboardCheck className="h-6 w-6 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Queue</h1>
          <p className="text-sm text-gray-500">Review and act on pending documents</p>
        </div>
        {isSuperUser && (
          <Badge className="ml-auto bg-purple-100 text-purple-700 hover:bg-purple-100">
            <Shield className="h-3 w-3 mr-1" />
            Super User
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Pending</p>
                {statsQuery.isLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-bold text-gray-900">{stats?.totalPending || 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Awaiting My Action</p>
                {statsQuery.isLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-bold text-gray-900">{stats?.awaitingMyAction || 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <ThumbsUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Approved Today</p>
                {statsQuery.isLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-bold text-gray-900">{stats?.approvedToday || 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <ThumbsDown className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Rejected / Sent Back</p>
                {statsQuery.isLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-bold text-gray-900">{stats?.rejectedToday || 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            Pending Approvals
            {byActionQuery.data?.total ? (
              <Badge variant="secondary" className="ml-2">{byActionQuery.data.total}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="my-actions">My Recent Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {uniqueTabs.map((tab) => {
              const config = AUTHORITY_TAB_CONFIG[tab];
              if (!config) return null;
              const TabIcon = config.icon;
              const count = tab === "all" ? (byActionQuery.data?.total || 0) : (byActionData[tab] || 0);
              const isActive = activeAuthorityTab === tab;
              return (
                <Button
                  key={tab}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className={`gap-1.5 ${isActive ? "" : "hover:bg-gray-50"}`}
                  onClick={() => {
                    setActiveAuthorityTab(tab);
                    setCurrentPage(1);
                  }}
                >
                  <TabIcon className={`h-4 w-4 ${isActive ? "" : config.color}`} />
                  <span className="hidden sm:inline">{config.label}</span>
                  <span className="sm:hidden">{config.shortLabel}</span>
                  <Badge
                    variant={isActive ? "outline" : "secondary"}
                    className={`ml-1 text-xs min-w-[20px] justify-center ${isActive ? "bg-white/20 text-white border-white/30" : ""}`}
                  >
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by document number..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSearchText(searchInput);
                        setCurrentPage(1);
                      }
                    }}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSearchText(searchInput); setCurrentPage(1); }}
                >
                  Search
                </Button>
                <Select value={docTypeFilter} onValueChange={(val) => { setDocTypeFilter(val); setCurrentPage(1); }}>
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Document Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="voucher">Vouchers</SelectItem>
                    <SelectItem value="purchase_order">Purchase Orders</SelectItem>
                    <SelectItem value="quotation">Quotations</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}>
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="SUBMITTED">Submitted</SelectItem>
                    <SelectItem value="CHECKED">Checked</SelectItem>
                    <SelectItem value="RECOMMENDED">Recommended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {queueQuery.isLoading ? (
            <Card>
              <CardContent className="p-6 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : filteredItems.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-1">All caught up!</h3>
                <p className="text-sm text-gray-500">
                  {activeAuthorityTab !== "all"
                    ? `No documents pending your ${activeAuthorityTab} action.`
                    : "No documents are waiting for your action."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead className="hidden md:table-cell">Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Your Role</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="hidden lg:table-cell">Submitted By</TableHead>
                      <TableHead className="hidden lg:table-cell">Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item: any) => {
                      const DocIcon = DOC_TYPE_ICONS[item.docType] || FileText;
                      const authorityConfig = AUTHORITY_TAB_CONFIG[item.userAuthority];
                      return (
                        <TableRow key={`${item.docType}-${item.docId}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <DocIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                              <div>
                                <p className="font-medium text-sm">{item.docNumber}</p>
                                <p className="text-xs text-gray-500">{DOC_TYPE_LABELS[item.docType] || item.docType}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <p className="text-sm text-gray-700 max-w-[200px] truncate">{item.description}</p>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${STATUS_COLORS[item.currentStatus] || "bg-gray-100 text-gray-800"}`}>
                              {item.currentStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {authorityConfig ? (
                              <Badge variant="outline" className={`text-xs capitalize ${authorityConfig.color}`}>
                                {item.userAuthority}
                              </Badge>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-medium text-sm">{formatAmount(item.amount, item.currency)}</span>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <p className="text-sm text-gray-600">{item.submittedBy}</p>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <p className="text-xs text-gray-500">{formatDate(item.submittedAt || item.createdAt)}</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(item.availableActions || []).slice(0, 3).map((actionObj: any) => {
                                const actionName = typeof actionObj === 'string' ? actionObj : actionObj?.action;
                                if (!actionName) return null;
                                const style = ACTION_STYLES[actionName] || { variant: "outline" as const, icon: ArrowRight };
                                const ActionIcon = style.icon;
                                return (
                                  <Button
                                    key={actionName}
                                    variant={style.variant}
                                    size="sm"
                                    className="text-xs h-7 px-2"
                                    onClick={() => handleActionClick(actionName, item)}
                                  >
                                    <ActionIcon className="h-3 w-3 mr-1" />
                                    {String(actionName).replace("_", " ")}
                                  </Button>
                                );
                              })}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {((pagination.page - 1) * pagination.pageSize) + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.totalCount)} of {pagination.totalCount}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-700">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= pagination.totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="my-actions" className="space-y-4">
          {myActionsQuery.isLoading ? (
            <Card>
              <CardContent className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (myActionsQuery.data?.items || []).length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Eye className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-1">No recent actions</h3>
                <p className="text-sm text-gray-500">You haven't acted on any documents yet.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>From → To</TableHead>
                      <TableHead className="hidden md:table-cell">Role</TableHead>
                      <TableHead className="hidden md:table-cell">Comments</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(myActionsQuery.data?.items || []).map((item: any) => {
                      const DocIcon = DOC_TYPE_ICONS[item.docType] || FileText;
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <DocIcon className="h-4 w-4 text-gray-400" />
                              <div>
                                <p className="font-medium text-sm">{item.docNumber}</p>
                                <p className="text-xs text-gray-500">{DOC_TYPE_LABELS[item.docType] || item.docType}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">
                              {item.action?.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-xs">
                              <Badge className={`${STATUS_COLORS[item.fromStatus] || "bg-gray-100 text-gray-800"} text-[10px]`}>
                                {item.fromStatus}
                              </Badge>
                              <ArrowRight className="h-3 w-3 text-gray-400" />
                              <Badge className={`${STATUS_COLORS[item.toStatus] || "bg-gray-100 text-gray-800"} text-[10px]`}>
                                {item.toStatus}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <p className="text-xs text-gray-500">{item.actorRoleName || "-"}</p>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <p className="text-xs text-gray-500 max-w-[150px] truncate">{item.comments || "-"}</p>
                          </TableCell>
                          <TableCell>
                            <p className="text-xs text-gray-500">{formatDateTime(item.performedAt)}</p>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!actionDialog?.open} onOpenChange={(open) => { if (!open) setActionDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {actionDialog?.action?.replace("_", " ")} Document
            </DialogTitle>
            <DialogDescription>
              {actionDialog?.docNumber} — Current status: {actionDialog?.currentStatus}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Comments {["reject", "send_back"].includes(actionDialog?.action || "") ? "(required)" : "(optional)"}
              </label>
              <Textarea
                placeholder="Add your comments..."
                value={actionComments}
                onChange={(e) => setActionComments(e.target.value)}
                rows={3}
              />
            </div>
            {actionDialog?.action === "reject" && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Rejection Reason</label>
                <Textarea
                  placeholder="Provide a reason for rejection..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  rows={2}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              variant={["reject", "cancel"].includes(actionDialog?.action || "") ? "destructive" : "default"}
              onClick={handleConfirmAction}
              disabled={performActionMutation.isPending}
            >
              {performActionMutation.isPending ? "Processing..." : `Confirm ${actionDialog?.action?.replace("_", " ")}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

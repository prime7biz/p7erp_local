import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TicketCheck, Send } from "lucide-react";

interface Ticket {
  id: number;
  subject: string;
  description: string;
  tenantName: string;
  tenantId: number;
  status: string;
  priority: string;
  assignedTo: string | null;
  createdAt: string;
  comments: TicketComment[];
}

interface TicketComment {
  id: number;
  message: string;
  authorName: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

export default function AdminTickets() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [comment, setComment] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const { toast } = useToast();

  const { data: tickets, isLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/admin/tickets"],
  });

  const filtered = tickets?.filter((t) =>
    statusFilter === "all" ? true : t.status === statusFilter
  ) ?? [];

  const handleAddComment = async () => {
    if (!selectedTicket || !comment.trim()) return;
    try {
      await apiRequest(`/api/admin/tickets/${selectedTicket.id}/comments`, "POST", { message: comment });
      setComment("");
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/tickets"] });
      toast({ title: "Comment Added" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedTicket || !newStatus) return;
    try {
      await apiRequest(`/api/admin/tickets/${selectedTicket.id}`, "PATCH", { status: newStatus });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/tickets"] });
      setSelectedTicket(null);
      toast({ title: "Ticket Updated" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
          <p className="text-gray-600">Manage tenant support requests</p>
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-6">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
            <TabsTrigger value="closed">Closed</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        <TicketCheck className="mx-auto h-8 w-8 mb-2 text-gray-300" />
                        No tickets found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((ticket) => (
                      <TableRow
                        key={ticket.id}
                        className="cursor-pointer"
                        onClick={() => { setSelectedTicket(ticket); setNewStatus(ticket.status); }}
                      >
                        <TableCell className="font-medium">{ticket.subject}</TableCell>
                        <TableCell className="text-gray-600">{ticket.tenantName}</TableCell>
                        <TableCell>
                          <Badge className={`${statusColors[ticket.status] || ""} hover:opacity-80`}>
                            {ticket.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${priorityColors[ticket.priority] || ""} hover:opacity-80`}>
                            {ticket.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-600">{ticket.assignedTo || "Unassigned"}</TableCell>
                        <TableCell className="text-gray-600">
                          {new Date(ticket.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedTicket?.subject}</DialogTitle>
            </DialogHeader>
            {selectedTicket && (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <Badge className={`${statusColors[selectedTicket.status] || ""} hover:opacity-80`}>
                    {selectedTicket.status.replace("_", " ")}
                  </Badge>
                  <Badge className={`${priorityColors[selectedTicket.priority] || ""} hover:opacity-80`}>
                    {selectedTicket.priority}
                  </Badge>
                  <span className="text-sm text-gray-500">{selectedTicket.tenantName}</span>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-700">{selectedTicket.description}</p>
                </div>

                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <Label className="text-sm">Update Status</Label>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleUpdateStatus} size="sm">Update</Button>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Comments</h4>
                  <div className="space-y-3 mb-4">
                    {(selectedTicket.comments ?? []).length === 0 ? (
                      <p className="text-sm text-gray-500">No comments yet</p>
                    ) : (
                      (selectedTicket.comments ?? []).map((c) => (
                        <div key={c.id} className="bg-gray-50 p-3 rounded-lg">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium">{c.authorName}</span>
                            <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="text-sm text-gray-700">{c.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add a comment..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="flex-1"
                      rows={2}
                    />
                    <Button onClick={handleAddComment} size="sm" className="self-end gap-1">
                      <Send className="h-3 w-3" /> Send
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

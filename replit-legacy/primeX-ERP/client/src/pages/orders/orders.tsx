import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { cn } from "@/lib/utils";
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  ClipboardList,
  FileEdit,
  Trash2,
  Calendar,
  Eye,
  Download,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportToExcel } from '@/lib/exportToExcel';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { ErpTable, StatusBadge } from "@/components/erp/erp-table";
import type { ErpTableColumn, ErpFilter } from "@/components/erp/erp-table";

const statusMap: Record<string, { color: string, label: string }> = {
  new: { color: "bg-blue-500", label: "New" },
  in_progress: { color: "bg-indigo-500", label: "In Progress" },
  ready_for_production: { color: "bg-purple-500", label: "Ready for Production" },
  in_production: { color: "bg-amber-500", label: "In Production" },
  completed: { color: "bg-emerald-500", label: "Completed" },
  shipped: { color: "bg-green-500", label: "Shipped" },
  delivered: { color: "bg-teal-500", label: "Delivered" },
  canceled: { color: "bg-red-500", label: "Canceled" },
};

const OrderStatusBadge = ({ status }: { status: string }) => {
  const displayInfo = statusMap[status] || { color: "bg-gray-500", label: status };
  return (
    <Badge className={cn("text-white", displayInfo.color)}>
      {displayInfo.label}
    </Badge>
  );
};

interface OrdersPageProps {
  showTimeActionButton?: boolean;
}

const OrdersPage: React.FC<OrdersPageProps> = ({ showTimeActionButton = false }) => {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const statusFilter = activeFilters.status || '';

  const { data: orders, isLoading } = useQuery({
    queryKey: [
      '/api/orders',
      {
        search: searchTerm,
        status: statusFilter,
        page: currentPage,
        sortBy: sortField,
        sortDirection
      }
    ],
    queryFn: async () => {
      const response = await fetch(
        `/api/orders?search=${searchTerm}&status=${statusFilter}&page=${currentPage}&sortBy=${sortField || ''}&sortDirection=${sortDirection}`
      );
      if (!response.ok) throw new Error('Failed to fetch orders');
      return response.json();
    },
  });

  const columns: ErpTableColumn<any>[] = [
    {
      key: "orderId", label: "Order ID", sticky: true, width: "130px",
      render: (row) => (
        <Link href={`/orders/${row.id}`} className="text-blue-600 hover:underline font-medium">
          {row.orderId}
        </Link>
      ),
    },
    { key: "customerName", label: "Customer" },
    { key: "styleName", label: "Style Name" },
    {
      key: "totalQuantity", label: "Quantity", align: "right", isQty: true,
      render: (row) => row.totalQuantity?.toLocaleString() || '0',
    },
    { key: "department", label: "Department" },
    {
      key: "deliveryDate", label: "Delivery Date",
      render: (row) => formatDate(row.deliveryDate),
    },
    {
      key: "priceConfirmed", label: "Price Confirmed", align: "right", isMoney: true,
      render: (row) => formatCurrency(row.priceConfirmed),
    },
    {
      key: "orderStatus", label: "Status",
      render: (row) => <OrderStatusBadge status={row.orderStatus} />,
    },
  ];

  const orderStatusOptions = [
    { value: "new", label: "New" },
    { value: "in_progress", label: "In Progress" },
    { value: "ready_for_production", label: "Ready for Production" },
    { value: "in_production", label: "In Production" },
    { value: "completed", label: "Completed" },
    { value: "shipped", label: "Shipped" },
    { value: "delivered", label: "Delivered" },
    { value: "canceled", label: "Canceled" },
  ];

  const filters: ErpFilter[] = [
    {
      key: "status", label: "Status", type: "select",
      options: orderStatusOptions,
    },
  ];

  const handleFilterChange = (key: string, value: string) => {
    setActiveFilters((prev) => {
      if (!value) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  };

  const handleClearFilters = () => setActiveFilters({});

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">
            Manage and track all garment production orders
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/orders/multi-currency">
            <Button variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50">
              <Plus className="h-4 w-4 mr-2" />
              Multi-Currency Order
            </Button>
          </Link>
          <Link href="/orders/new">
            <Button className="bg-orange-600 hover:bg-orange-700">
              <Plus className="h-4 w-4 mr-2" />
              New Order
            </Button>
          </Link>
        </div>
      </div>

      <ErpTable
        tableId="orders"
        columns={columns}
        data={Array.isArray(orders) ? orders : []}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search orders..."
        headerActions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Download className="h-4 w-4 mr-1.5" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportToExcel(
                Array.isArray(orders) ? orders : [],
                [
                  { key: "orderId", header: "Order No" },
                  { key: "customerName", header: "Customer" },
                  { key: "styleName", header: "Style Name" },
                  { key: "totalQuantity", header: "Quantity" },
                  { key: "department", header: "Department" },
                  { key: "deliveryDate", header: "Delivery Date" },
                  { key: "priceConfirmed", header: "Price Confirmed" },
                  { key: "orderStatus", header: "Status" },
                ],
                "orders",
                "xlsx"
              )}>
                Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportToExcel(
                Array.isArray(orders) ? orders : [],
                [
                  { key: "orderId", header: "Order No" },
                  { key: "customerName", header: "Customer" },
                  { key: "styleName", header: "Style Name" },
                  { key: "totalQuantity", header: "Quantity" },
                  { key: "department", header: "Department" },
                  { key: "deliveryDate", header: "Delivery Date" },
                  { key: "priceConfirmed", header: "Price Confirmed" },
                  { key: "orderStatus", header: "Status" },
                ],
                "orders",
                "csv"
              )}>
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
        filters={filters}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        emptyIcon={<ClipboardList className="h-12 w-12 opacity-40" />}
        emptyTitle="No orders found"
        emptyDescription="Create your first order to get started."
        emptyAction={{ label: "New Order", onClick: () => setLocation("/orders/new") }}
        rowActions={(row) => {
          const actions: any[] = [
            { label: "View Details", icon: <Eye className="h-4 w-4 mr-2" />, onClick: () => setLocation(`/orders/${row.id}`) },
            { label: "Edit Order", icon: <FileEdit className="h-4 w-4 mr-2" />, onClick: () => setLocation(`/orders/${row.id}/edit`) },
          ];
          if (showTimeActionButton) {
            actions.push({
              label: "Time & Action Plan",
              icon: <Calendar className="h-4 w-4 mr-2" />,
              onClick: () => setLocation(`/orders/${row.id}/time-action-plan`),
            });
          }
          actions.push({
            label: "Delete Order",
            icon: <Trash2 className="h-4 w-4 mr-2" />,
            variant: "destructive" as const,
            onClick: () => {
              toast({
                title: "This feature is not implemented yet",
                description: "Delete functionality will be available in a future update."
              });
            },
          });
          return actions;
        }}
      />
    </div>
  );
}

export default OrdersPage;

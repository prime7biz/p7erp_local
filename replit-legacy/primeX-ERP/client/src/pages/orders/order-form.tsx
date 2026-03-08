import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Save, Loader2, History } from 'lucide-react';
import { StylePicker } from '@/components/erp/style-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon } from 'lucide-react';

// Schema for creating a new order
const orderSchema = z.object({
  customerId: z.number(),
  styleName: z.string().min(1, "Style name is required"),
  department: z.string().min(1, "Department is required"),
  totalQuantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  deliveryDate: z.date({
    required_error: "Delivery date is required",
  }),
  deliveryMode: z.string().min(1, "Delivery mode is required"),
  deliveryPort: z.string().optional(),
  paymentTerms: z.string().optional(),
  priceConfirmed: z.coerce.number().min(0.01, "Price must be greater than 0"),
  currency: z.string().default("BDT"),
  notes: z.string().optional(),
});

const CONFIRMED_STATUSES = ['in_progress', 'ready_for_production', 'in_production', 'completed', 'shipped', 'delivered'];

const TRACKED_FIELDS = ['styleName', 'department', 'totalQuantity', 'deliveryDate', 'deliveryMode', 'deliveryPort', 'paymentTerms', 'priceConfirmed', 'currency', 'notes'];

const FIELD_LABELS: Record<string, string> = {
  styleName: 'Style Name',
  department: 'Department',
  totalQuantity: 'Total Quantity',
  deliveryDate: 'Delivery Date',
  deliveryMode: 'Delivery Mode',
  deliveryPort: 'Delivery Port',
  paymentTerms: 'Payment Terms',
  priceConfirmed: 'Price',
  currency: 'Currency',
  notes: 'Notes',
};

const OrderForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditMode = !!id;
  const [showAmendmentDialog, setShowAmendmentDialog] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [detectedChanges, setDetectedChanges] = useState<Array<{ fieldChanged: string; oldValue: string; newValue: string }>>([]);
  const pendingSubmitData = useRef<z.infer<typeof orderSchema> | null>(null);
  const originalOrderData = useRef<any>(null);

  // Fetch order data if in edit mode
  const { data: order, isLoading: isLoadingOrder } = useQuery({
    queryKey: [`/api/orders/${id}`],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch order');
      }
      return response.json();
    },
    enabled: isEditMode,
  });

  // Fetch customers for dropdown
  const { data: customers, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['/api/customers'],
    queryFn: async () => {
      const response = await fetch('/api/customers');
      if (!response.ok) {
        throw new Error('Failed to fetch customers');
      }
      return response.json();
    },
  });

  // Form definition
  const form = useForm<z.infer<typeof orderSchema>>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      customerId: 0,
      styleName: '',
      department: '',
      totalQuantity: 0,
      deliveryMode: 'Sea',
      deliveryPort: '',
      paymentTerms: 'Net 30',
      priceConfirmed: 0,
      currency: 'BDT',
      notes: '',
    },
  });

  // Update form with order data when in edit mode
  useEffect(() => {
    if (order && isEditMode) {
      const formData = {
        customerId: order.customerId,
        styleName: order.styleName,
        department: order.department,
        totalQuantity: order.totalQuantity,
        deliveryDate: new Date(order.deliveryDate),
        deliveryMode: order.deliveryMode,
        deliveryPort: order.deliveryPort || '',
        paymentTerms: order.paymentTerms || '',
        priceConfirmed: Number(order.priceConfirmed),
        currency: order.currency || 'BDT',
        notes: order.notes || '',
      };
      form.reset(formData);
      originalOrderData.current = { ...formData };
    }
  }, [order, isEditMode, form]);

  const isConfirmedOrder = isEditMode && order && CONFIRMED_STATUSES.includes(order.orderStatus);

  // Define the mutation for creating or updating orders
  const orderMutation = useMutation({
    mutationFn: async (data: z.infer<typeof orderSchema>) => {
      const url = isEditMode ? `/api/orders/${id}` : '/api/orders';
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to save order');
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      
      toast({
        title: isEditMode ? 'Order Updated' : 'Order Created',
        description: `Order ${data.orderId} has been ${isEditMode ? 'updated' : 'created'} successfully.`,
      });
      
      navigate('/orders');
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const amendmentMutation = useMutation({
    mutationFn: async ({ amendments, reason }: { amendments: any[]; reason: string }) => {
      const response = await fetch(`/api/orders/${order?.id}/amendments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amendments, reason }),
      });
      if (!response.ok) throw new Error('Failed to create amendments');
      return response.json();
    },
  });

  const detectChanges = (data: z.infer<typeof orderSchema>) => {
    if (!originalOrderData.current) return [];
    const changes: Array<{ fieldChanged: string; oldValue: string; newValue: string }> = [];
    for (const field of TRACKED_FIELDS) {
      const oldVal = (originalOrderData.current as any)[field];
      const newVal = (data as any)[field];
      let oldStr = oldVal instanceof Date ? format(oldVal, 'yyyy-MM-dd') : String(oldVal ?? '');
      let newStr = newVal instanceof Date ? format(newVal, 'yyyy-MM-dd') : String(newVal ?? '');
      if (oldStr !== newStr) {
        changes.push({ fieldChanged: field, oldValue: oldStr, newValue: newStr });
      }
    }
    return changes;
  };

  // Handle form submission
  const onSubmit = (data: z.infer<typeof orderSchema>) => {
    if (isConfirmedOrder) {
      const changes = detectChanges(data);
      if (changes.length > 0) {
        setDetectedChanges(changes);
        pendingSubmitData.current = data;
        setAmendmentReason('');
        setShowAmendmentDialog(true);
        return;
      }
    }
    orderMutation.mutate(data);
  };

  const handleAmendmentConfirm = async () => {
    if (!pendingSubmitData.current || !amendmentReason.trim()) return;
    try {
      await amendmentMutation.mutateAsync({ amendments: detectedChanges, reason: amendmentReason });
      orderMutation.mutate(pendingSubmitData.current);
      setShowAmendmentDialog(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to record amendments', variant: 'destructive' });
    }
  };

  // Delivery mode options
  const deliveryModeOptions = [
    'Sea',
    'Air',
    'Road',
    'Rail',
    'Express'
  ];

  // Payment terms options
  const paymentTermsOptions = [
    'Net 30',
    'Net 60',
    'Net 90',
    'Cash in Advance',
    'Letter of Credit (LC)',
    'Documents Against Payment (DP)',
    'Cash Against Documents (CAD)'
  ];

  // Currency options
  const currencyOptions = [
    'BDT',
    'USD',
    'EUR',
    'GBP',
    'INR',
    'CNY',
    'JPY',
    'AUD'
  ];

  // Department options
  const departmentOptions = [
    "Men's",
    "Women's",
    "Children's",
    "Accessories",
    "Home Textiles"
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center space-x-2">
        <Button variant="outline" size="icon" onClick={() => navigate("/orders")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold">
          {isEditMode ? `Edit Order ${order?.orderId}` : 'Create New Order'}
        </h1>
      </div>

      {(isLoadingOrder || isLoadingCustomers) ? (
        <div className="flex justify-center items-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Order Information</CardTitle>
                <CardDescription>
                  Enter the basic details for this order
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Customer Selection */}
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer</FormLabel>
                        <Select
                          value={field.value.toString()}
                          onValueChange={(value) => field.onChange(parseInt(value))}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a customer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {customers?.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id.toString()}>
                                {customer.customerName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Select the customer for this order
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Style Name */}
                  <FormField
                    control={form.control}
                    name="styleName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Style</FormLabel>
                        <FormControl>
                          <StylePicker
                            value={form.getValues('styleId' as any) || null}
                            styleName={field.value}
                            onChange={(styleId, styleNameVal) => {
                              field.onChange(styleNameVal);
                              form.setValue('styleId' as any, styleId);
                            }}
                          />
                        </FormControl>
                        <FormDescription>
                          Select from master styles or enter manually
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Department */}
                  <FormField
                    control={form.control}
                    name="department"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select department" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {departmentOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Department or category of the products
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Total Quantity */}
                  <FormField
                    control={form.control}
                    name="totalQuantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total Quantity</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            {...field}
                            placeholder="Enter total quantity"
                          />
                        </FormControl>
                        <FormDescription>
                          Total number of pieces to be produced
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Confirmed Price */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name="priceConfirmed"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Price Per Unit</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                {...field}
                                placeholder="Enter confirmed price"
                              />
                            </FormControl>
                            <FormDescription>
                              Confirmed price per unit
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="USD" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {currencyOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Delivery Date */}
                  <FormField
                    control={form.control}
                    name="deliveryDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Delivery Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date < new Date(new Date().setDate(new Date().getDate() - 1))
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          The expected delivery date for this order
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Delivery Mode */}
                  <FormField
                    control={form.control}
                    name="deliveryMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Delivery Mode</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select delivery mode" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {deliveryModeOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Mode of transportation for delivery
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Delivery Port */}
                  <FormField
                    control={form.control}
                    name="deliveryPort"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Delivery Port/Location</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Enter delivery port or location" />
                        </FormControl>
                        <FormDescription>
                          Port or specific location for delivery
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Payment Terms */}
                  <FormField
                    control={form.control}
                    name="paymentTerms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Terms</FormLabel>
                        <Select
                          value={field.value || ""}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select payment terms" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {paymentTermsOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Terms of payment for this order
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Notes */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter any additional notes or special instructions"
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Any additional notes or special instructions for this order
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/orders")}
                >
                  Cancel
                </Button>
                <div className="flex items-center gap-2">
                  {isConfirmedOrder && (
                    <span className="text-xs text-amber-600 flex items-center gap-1">
                      <History className="h-3 w-3" />
                      Changes will be tracked as amendments
                    </span>
                  )}
                  <Button
                    type="submit"
                    className="bg-primary hover:bg-primary/90"
                    disabled={orderMutation.isPending}
                  >
                    {orderMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isEditMode ? 'Update Order' : 'Create Order'}
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </form>
        </Form>
      )}

      <Dialog open={showAmendmentDialog} onOpenChange={setShowAmendmentDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Order Amendment Required
            </DialogTitle>
            <DialogDescription>
              This order has been confirmed. The following changes will be recorded as a formal amendment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left font-medium">Field</th>
                    <th className="p-2 text-left font-medium">Old</th>
                    <th className="p-2 text-left font-medium">New</th>
                  </tr>
                </thead>
                <tbody>
                  {detectedChanges.map((change, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-2 font-medium">{FIELD_LABELS[change.fieldChanged] || change.fieldChanged}</td>
                      <td className="p-2 text-red-600">{change.oldValue || '—'}</td>
                      <td className="p-2 text-green-600">{change.newValue || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amendment-reason">Reason for Amendment *</Label>
              <Textarea
                id="amendment-reason"
                placeholder="Enter the reason for this amendment..."
                value={amendmentReason}
                onChange={(e) => setAmendmentReason(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAmendmentDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAmendmentConfirm}
              disabled={!amendmentReason.trim() || amendmentMutation.isPending}
            >
              {amendmentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Amendment & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrderForm;
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CurrencySelector } from "@/components/ui/currency-selector";
import { CurrencyAmountDisplay } from "@/components/ui/currency-amount-display";
import { useTenantCurrencySettings } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, DollarSign, Globe } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const orderSchema = z.object({
  customerId: z.number().min(1, "Customer is required"),
  quotationId: z.number().optional(),
  styleName: z.string().min(1, "Style name is required"),
  department: z.string().min(1, "Department is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  orderDate: z.string(),
  deliveryDate: z.string(),
  unitPrice: z.number().min(0),
  totalAmount: z.number().min(0),
  currency: z.string().min(1, "Currency is required"),
  exchangeRate: z.number().min(0),
  notes: z.string().optional(),
});

type OrderFormData = z.infer<typeof orderSchema>;

export function MultiCurrencyOrderForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { quotationId } = useParams();
  const { data: currencySettings } = useTenantCurrencySettings();
  
  const baseCurrency = currencySettings?.baseCurrency || "BDT";
  const localCurrency = currencySettings?.localCurrency || "BDT";
  
  const form = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      customerId: 0,
      quotationId: quotationId ? parseInt(quotationId) : undefined,
      styleName: "",
      department: "",
      quantity: 1,
      orderDate: format(new Date(), 'yyyy-MM-dd'),
      deliveryDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
      unitPrice: 0,
      totalAmount: 0,
      currency: baseCurrency,
      exchangeRate: 1,
      notes: "",
    }
  });

  // Fetch quotation data if converting from quotation
  const { data: quotation } = useQuery({
    queryKey: ['/api/quotations', quotationId],
    enabled: !!quotationId,
  });

  // Fetch customers
  const { data: customers = [] } = useQuery({
    queryKey: ['/api/customers'],
  });

  // Pre-fill form when quotation data is loaded
  useEffect(() => {
    if (quotation) {
      form.setValue('customerId', quotation.customerId);
      form.setValue('styleName', quotation.styleName);
      form.setValue('department', quotation.department);
      form.setValue('quantity', quotation.projectedQuantity);
      form.setValue('unitPrice', parseFloat(quotation.quotedPrice || quotation.targetPrice || '0'));
      form.setValue('currency', quotation.currency || baseCurrency);
      form.setValue('exchangeRate', quotation.exchangeRate || 1);
      
      // Calculate total amount
      const total = quotation.projectedQuantity * parseFloat(quotation.quotedPrice || quotation.targetPrice || '0');
      form.setValue('totalAmount', total);
    }
  }, [quotation, form, baseCurrency]);

  // Calculate total amount when quantity or unit price changes
  const watchedQuantity = form.watch('quantity');
  const watchedUnitPrice = form.watch('unitPrice');
  const watchedCurrency = form.watch('currency');
  const watchedExchangeRate = form.watch('exchangeRate');

  useEffect(() => {
    const total = watchedQuantity * watchedUnitPrice;
    form.setValue('totalAmount', total);
  }, [watchedQuantity, watchedUnitPrice, form]);

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async (data: OrderFormData) => {
      const response = await apiRequest('POST', '/api/orders', {
        ...data,
        baseAmount: data.currency === baseCurrency ? data.totalAmount : data.totalAmount * data.exchangeRate,
        localAmount: data.currency === localCurrency ? data.totalAmount : data.totalAmount * data.exchangeRate,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Multi-currency order created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      setLocation('/orders');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create order",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: OrderFormData) => {
    createOrderMutation.mutate(data);
  };

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            <span>Create Multi-Currency Order</span>
            {quotationId && (
              <span className="text-sm text-muted-foreground">
                (Converting from Quotation {quotation?.quotationId})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customer Selection */}
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        value={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select customer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(customers as any[]).map((customer: any) => (
                            <SelectItem key={customer.id} value={customer.id.toString()}>
                              {customer.companyName} - {customer.contactPersonName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Woven">Woven</SelectItem>
                          <SelectItem value="Knit">Knit</SelectItem>
                          <SelectItem value="Sweater">Sweater</SelectItem>
                          <SelectItem value="Denim">Denim</SelectItem>
                        </SelectContent>
                      </Select>
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
                      <FormLabel>Style Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter style name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Quantity */}
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                          placeholder="Enter quantity" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Order Date */}
                <FormField
                  control={form.control}
                  name="orderDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Delivery Date */}
                <FormField
                  control={form.control}
                  name="deliveryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Multi-Currency Pricing Section */}
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Multi-Currency Pricing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Currency Selection */}
                    <FormField
                      control={form.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <FormControl>
                            <CurrencySelector 
                              value={field.value}
                              onValueChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Unit Price */}
                    <FormField
                      control={form.control}
                      name="unitPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit Price</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              placeholder="0.00" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Exchange Rate */}
                    <FormField
                      control={form.control}
                      name="exchangeRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Exchange Rate</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.000001"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              placeholder="1.000000" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Total Amount (Read-only) */}
                    <FormField
                      control={form.control}
                      name="totalAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total Amount</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01"
                              {...field}
                              value={field.value.toFixed(2)}
                              readOnly
                              className="bg-gray-100" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Currency Conversion Display */}
                  {form.watch('totalAmount') > 0 && (
                    <div className="p-4 bg-white rounded-lg border">
                      <Label className="text-sm font-medium mb-2 block">Order Value Conversions</Label>
                      <CurrencyAmountDisplay
                        amount={form.watch('totalAmount')}
                        currency={watchedCurrency}
                        baseCurrency={baseCurrency}
                        localCurrency={localCurrency}
                        exchangeRate={watchedExchangeRate}
                        showConversions={true}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        placeholder="Additional notes about the order"
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Action Buttons */}
              <div className="flex justify-between">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setLocation('/orders')}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createOrderMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {createOrderMutation.isPending ? 'Creating...' : 'Create Multi-Currency Order'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
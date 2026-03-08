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
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const quotationSchema = z.object({
  customerId: z.number().min(1, "Customer is required"),
  styleName: z.string().min(1, "Style name is required"),
  department: z.string().min(1, "Department is required"),
  projectedQuantity: z.number().min(1, "Quantity must be at least 1"),
  quotationDate: z.string(),
  validUntil: z.string(),
  targetPrice: z.number().min(0),
  currency: z.string().min(1, "Currency is required"),
  exchangeRate: z.number().min(0),
  description: z.string().optional(),
});

type QuotationFormData = z.infer<typeof quotationSchema>;

export function MultiCurrencyQuotationForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: currencySettings } = useTenantCurrencySettings();
  
  const baseCurrency = currencySettings?.baseCurrency || "BDT";
  const localCurrency = currencySettings?.localCurrency || "BDT";
  const displayCurrency = currencySettings?.displayCurrency || "BDT";

  const form = useForm<QuotationFormData>({
    resolver: zodResolver(quotationSchema),
    defaultValues: {
      customerId: 0,
      styleName: "",
      department: "",
      projectedQuantity: 1,
      quotationDate: format(new Date(), 'yyyy-MM-dd'),
      validUntil: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
      targetPrice: 0,
      currency: baseCurrency,
      exchangeRate: 1,
      description: "",
    }
  });

  // Fetch customers for dropdown
  const { data: customers = [] } = useQuery({
    queryKey: ['/api/customers'],
  });

  // Fetch departments
  const { data: departments = [] } = useQuery({
    queryKey: ['/api/departments'],
  });

  // Create quotation mutation
  const createQuotationMutation = useMutation({
    mutationFn: async (data: QuotationFormData) => {
      const response = await apiRequest('POST', '/api/quotations', {
        ...data,
        baseAmount: data.currency === baseCurrency ? data.targetPrice : data.targetPrice * data.exchangeRate,
        localAmount: data.currency === localCurrency ? data.targetPrice : data.targetPrice * data.exchangeRate,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Multi-currency quotation created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quotations'] });
      setLocation('/quotations');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create quotation",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: QuotationFormData) => {
    createQuotationMutation.mutate(data);
  };

  const watchedCurrency = form.watch('currency');
  const watchedTargetPrice = form.watch('targetPrice');
  const watchedExchangeRate = form.watch('exchangeRate');

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Create Multi-Currency Quotation</span>
            <span className="text-sm text-muted-foreground">
              ({baseCurrency} exports, {localCurrency} accounting)
            </span>
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
                          {customers.map((customer: any) => (
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

                {/* Department Selection */}
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

                {/* Projected Quantity */}
                <FormField
                  control={form.control}
                  name="projectedQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Projected Quantity</FormLabel>
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

                {/* Quotation Date */}
                <FormField
                  control={form.control}
                  name="quotationDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quotation Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Valid Until */}
                <FormField
                  control={form.control}
                  name="validUntil"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valid Until</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Multi-Currency Pricing Section */}
              <Card className="bg-slate-50">
                <CardHeader>
                  <CardTitle className="text-lg">Multi-Currency Pricing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Currency Selection */}
                    <FormField
                      control={form.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quote Currency</FormLabel>
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

                    {/* Target Price */}
                    <FormField
                      control={form.control}
                      name="targetPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Price</FormLabel>
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
                          <FormLabel>Exchange Rate (to {baseCurrency})</FormLabel>
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
                  </div>

                  {/* Currency Conversion Display */}
                  {watchedTargetPrice > 0 && (
                    <div className="p-4 bg-white rounded-lg border">
                      <Label className="text-sm font-medium mb-2 block">Price Conversions</Label>
                      <CurrencyAmountDisplay
                        amount={watchedTargetPrice}
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

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        placeholder="Additional details about the quotation"
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
                  onClick={() => setLocation('/quotations')}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createQuotationMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {createQuotationMutation.isPending ? 'Creating...' : 'Create Multi-Currency Quotation'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, DollarSign, TrendingUp, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CurrencySelector } from "@/components/ui/currency-selector";
import { formatCurrency, getCurrencySymbol } from "@/lib/currency";

const exchangeRateSchema = z.object({
  fromCurrency: z.string().min(1, "From currency is required"),
  toCurrency: z.string().min(1, "To currency is required"),
  exchangeRate: z.coerce.number().min(0.0001, "Exchange rate must be greater than 0"),
  effectiveDate: z.string().min(1, "Effective date is required"),
  source: z.string().default("manual"),
});

type ExchangeRateFormData = z.infer<typeof exchangeRateSchema>;

interface ExchangeRate {
  id: number;
  fromCurrency: string;
  toCurrency: string;
  exchangeRate: number;
  effectiveDate: string;
  source: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function CurrencyManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<ExchangeRate | null>(null);

  const form = useForm<ExchangeRateFormData>({
    resolver: zodResolver(exchangeRateSchema),
    defaultValues: {
      fromCurrency: "",
      toCurrency: "",
      exchangeRate: 1,
      effectiveDate: new Date().toISOString().split('T')[0],
      source: "manual",
    },
  });

  // Fetch exchange rates
  const { data: exchangeRates = [], isLoading } = useQuery<ExchangeRate[]>({
    queryKey: ["/api/currency/exchange-rates"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch tenant currency settings
  const { data: tenantSettings } = useQuery<any>({
    queryKey: ["/api/settings/tenant-settings"],
  });

  // Create exchange rate mutation
  const createRateMutation = useMutation({
    mutationFn: (rateData: ExchangeRateFormData) =>
      apiRequest("/api/currency/exchange-rates", "POST", rateData),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Exchange rate created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/currency/exchange-rates"] });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create exchange rate",
        variant: "destructive",
      });
    },
  });

  // Update exchange rate mutation
  const updateRateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ExchangeRateFormData> }) =>
      apiRequest(`/api/currency/exchange-rates/${id}`, "PUT", data),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Exchange rate updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/currency/exchange-rates"] });
      setIsDialogOpen(false);
      setEditingRate(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update exchange rate",
        variant: "destructive",
      });
    },
  });

  // Delete exchange rate mutation
  const deleteRateMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/currency/exchange-rates/${id}`, "DELETE"),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Exchange rate deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/currency/exchange-rates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete exchange rate",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ExchangeRateFormData) => {
    if (data.fromCurrency === data.toCurrency) {
      toast({
        title: "Error",
        description: "From and To currencies cannot be the same",
        variant: "destructive",
      });
      return;
    }

    if (editingRate) {
      updateRateMutation.mutate({ id: editingRate.id, data });
    } else {
      createRateMutation.mutate(data);
    }
  };

  const handleEdit = (rate: ExchangeRate) => {
    setEditingRate(rate);
    form.reset({
      fromCurrency: rate.fromCurrency,
      toCurrency: rate.toCurrency,
      exchangeRate: rate.exchangeRate,
      effectiveDate: rate.effectiveDate,
      source: rate.source,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this exchange rate?")) {
      deleteRateMutation.mutate(id);
    }
  };

  const handleNewRate = () => {
    setEditingRate(null);
    form.reset({
      fromCurrency: "",
      toCurrency: "",
      exchangeRate: 1,
      effectiveDate: new Date().toISOString().split('T')[0],
      source: "manual",
    });
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Currency Management</h2>
            <p className="text-gray-600 mt-2">
              Manage exchange rates for multi-currency transactions
            </p>
          </div>
          <Button onClick={handleNewRate} className="bg-gradient-to-r from-orange-500 to-orange-600">
            <Plus className="w-4 h-4 mr-2" />
            Add Exchange Rate
          </Button>
        </div>
      </motion.div>

      {/* Currency Settings Overview */}
      {tenantSettings && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Current Currency Configuration
              </CardTitle>
              <CardDescription>
                Your company's multi-currency setup
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-600 font-medium">Base Currency</div>
                  <div className="text-2xl font-bold text-blue-800">
                    {getCurrencySymbol(tenantSettings.baseCurrency)} {tenantSettings.baseCurrency}
                  </div>
                  <div className="text-xs text-blue-600">For exports</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-green-600 font-medium">Local Currency</div>
                  <div className="text-2xl font-bold text-green-800">
                    {getCurrencySymbol(tenantSettings.localCurrency)} {tenantSettings.localCurrency}
                  </div>
                  <div className="text-xs text-green-600">For accounting</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-sm text-purple-600 font-medium">Display Currency</div>
                  <div className="text-2xl font-bold text-purple-800">
                    {getCurrencySymbol(tenantSettings.displayCurrency)} {tenantSettings.displayCurrency}
                  </div>
                  <div className="text-xs text-purple-600">Default view</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Exchange Rates Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Exchange Rates
            </CardTitle>
            <CardDescription>
              Current exchange rates for currency conversions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {exchangeRates.length === 0 ? (
              <div className="text-center py-8">
                <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Exchange Rates</h3>
                <p className="text-gray-600 mb-4">Add exchange rates to enable multi-currency support</p>
                <Button onClick={handleNewRate} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Rate
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3">Currency Pair</th>
                      <th className="text-left py-3">Exchange Rate</th>
                      <th className="text-left py-3">Effective Date</th>
                      <th className="text-left py-3">Source</th>
                      <th className="text-left py-3">Status</th>
                      <th className="text-left py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exchangeRates.map((rate: ExchangeRate) => (
                      <tr key={rate.id} className="border-b hover:bg-gray-50">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{rate.fromCurrency}</span>
                            <span className="text-gray-400">→</span>
                            <span className="font-medium">{rate.toCurrency}</span>
                          </div>
                        </td>
                        <td className="py-3">
                          <span className="font-mono">
                            1 {rate.fromCurrency} = {Number(rate.exchangeRate).toFixed(6)} {rate.toCurrency}
                          </span>
                        </td>
                        <td className="py-3">
                          {new Date(rate.effectiveDate).toLocaleDateString()}
                        </td>
                        <td className="py-3">
                          <Badge variant={rate.source === "manual" ? "secondary" : "default"}>
                            {rate.source}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <Badge variant={rate.isActive ? "default" : "secondary"}>
                            {rate.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(rate)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(rate.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Exchange Rate Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {editingRate ? "Edit Exchange Rate" : "Add Exchange Rate"}
            </DialogTitle>
            <DialogDescription>
              {editingRate 
                ? "Update the exchange rate details"
                : "Add a new exchange rate for currency conversion"
              }
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="fromCurrency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>From Currency</FormLabel>
                      <FormControl>
                        <CurrencySelector
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder="Select currency"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="toCurrency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>To Currency</FormLabel>
                      <FormControl>
                        <CurrencySelector
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder="Select currency"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
                        placeholder="1.000000"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="effectiveDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createRateMutation.isPending || updateRateMutation.isPending}
                  className="bg-gradient-to-r from-orange-500 to-orange-600"
                >
                  {createRateMutation.isPending || updateRateMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  {editingRate ? "Update Rate" : "Add Rate"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
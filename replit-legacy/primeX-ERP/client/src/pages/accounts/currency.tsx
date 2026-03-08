import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardContainer } from "@/components/layout/dashboard-container";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertCircle, CheckCircle, Loader2, RefreshCw, PlusCircle, Pencil, Trash, Star, Settings, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";



// Define types
interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  isActive: boolean;
  isDefault: boolean;
  tenantId: number;
  createdAt: string;
  updatedAt: string;
}

interface ExchangeRate {
  id: number;
  currencyId: number;
  rate: number;
  validFrom: string;
  validTo: string | null;
  source: string;
  tenantId: number;
  createdAt: string;
  updatedAt: string;
}

interface CurrencyInsight {
  id: number;
  currencyId: number;
  insightType: string;
  title: string;
  content: string;
  confidence: number;
  tenantId: number;
  createdAt: string;
}

// Currency form schema
const currencyFormSchema = z.object({
  code: z.string().length(3, "Currency code must be exactly 3 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  symbol: z.string().min(1, "Symbol is required"),
  decimalPlaces: z.coerce.number().int().min(0).max(6),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

// Exchange rate form schema
const exchangeRateFormSchema = z.object({
  rate: z.coerce.number().positive("Rate must be positive"),
  validFrom: z.string().min(1, "Valid from date is required"),
  validTo: z.string().optional(),
  source: z.string().default("manual"),
});

// Currency management page
export default function CurrencyPage() {
  // Wrap the entire component with DashboardContainer
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | null>(null);
  const [addCurrencyOpen, setAddCurrencyOpen] = useState(false);
  const [editCurrencyOpen, setEditCurrencyOpen] = useState(false);
  const [addRateOpen, setAddRateOpen] = useState(false);
  const [liveRateData, setLiveRateData] = useState<{
    liveRate: number | null; liveSource: string; liveUpdated: string | null;
    lastInputRate: number | null; lastInputDate: string | null; lastInputSource: string | null;
  } | null>(null);
  const [liveRateLoading, setLiveRateLoading] = useState(false);
  
  // Query currencies
  const { 
    data: currencies, 
    isLoading: currenciesLoading 
  } = useQuery<Currency[]>({
    queryKey: ["/api/currencies"],
    select: (data: Currency[]) => {
      if (activeTab === "active") {
        return data.filter((c: Currency) => c.isActive);
      } else if (activeTab === "inactive") {
        return data.filter((c: Currency) => !c.isActive);
      }
      return data;
    }
  });

  // Query exchange rates when a currency is selected
  const { 
    data: exchangeRates,
    isLoading: ratesLoading
  } = useQuery<ExchangeRate[]>({
    queryKey: [`/api/currencies/${selectedCurrency?.id}/exchange-rates`],
    enabled: !!selectedCurrency && !selectedCurrency.isDefault,
  });

  // Query insights when a currency is selected
  const {
    data: insights,
    isLoading: insightsLoading
  } = useQuery<CurrencyInsight[]>({
    queryKey: [`/api/currencies/${selectedCurrency?.id}/insights`],
    enabled: !!selectedCurrency,
  });

  // Add Currency mutation
  const addCurrencyMutation = useMutation({
    mutationFn: (data: z.infer<typeof currencyFormSchema>) => {
      return apiRequest("/api/currencies", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/currencies"] });
      toast({
        title: "Currency added",
        description: "The currency has been added successfully",
      });
      setAddCurrencyOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error adding currency",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Update Currency mutation
  const updateCurrencyMutation = useMutation({
    mutationFn: (data: { id: number; currency: Partial<z.infer<typeof currencyFormSchema>> }) => {
      return apiRequest(`/api/currencies/${data.id}`, "PATCH", data.currency);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/currencies"] });
      toast({
        title: "Currency updated",
        description: "The currency has been updated successfully",
      });
      setEditCurrencyOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error updating currency",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Set Default Currency mutation
  const setDefaultCurrencyMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest(`/api/currencies/${id}/set-default`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/currencies"] });
      toast({
        title: "Default currency set",
        description: "The default currency has been updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error setting default currency",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Add Exchange Rate mutation
  const addExchangeRateMutation = useMutation({
    mutationFn: (data: { currencyId: number; rate: z.infer<typeof exchangeRateFormSchema> }) => {
      return apiRequest(`/api/currencies/${data.currencyId}/exchange-rates`, "POST", data.rate);
    },
    onSuccess: () => {
      if (selectedCurrency) {
        queryClient.invalidateQueries({ queryKey: ["/api/currencies", selectedCurrency.id, "exchange-rates"] });
      }
      toast({
        title: "Exchange rate added",
        description: "The exchange rate has been added successfully",
      });
      setAddRateOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error adding exchange rate",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Generate Insights mutation
  const generateInsightsMutation = useMutation({
    mutationFn: (currencyId: number) => {
      return apiRequest(`/api/currencies/${currencyId}/generate-insights`, "POST");
    },
    onSuccess: () => {
      if (selectedCurrency) {
        queryClient.invalidateQueries({ queryKey: ["/api/currencies", selectedCurrency.id, "insights"] });
      }
      toast({
        title: "Insights generated",
        description: "Currency insights have been refreshed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error generating insights",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Add Currency form
  const addCurrencyForm = useForm<z.infer<typeof currencyFormSchema>>({
    resolver: zodResolver(currencyFormSchema),
    defaultValues: {
      code: "",
      name: "",
      symbol: "",
      decimalPlaces: 2,
      isActive: true,
      isDefault: false,
    },
  });

  // Edit Currency form
  const editCurrencyForm = useForm<z.infer<typeof currencyFormSchema>>({
    resolver: zodResolver(currencyFormSchema),
    defaultValues: {
      code: selectedCurrency?.code || "",
      name: selectedCurrency?.name || "",
      symbol: selectedCurrency?.symbol || "",
      decimalPlaces: selectedCurrency?.decimalPlaces || 2,
      isActive: selectedCurrency?.isActive || true,
      isDefault: selectedCurrency?.isDefault || false,
    },
  });

  // Exchange Rate form
  const exchangeRateForm = useForm<z.infer<typeof exchangeRateFormSchema>>({
    resolver: zodResolver(exchangeRateFormSchema),
    defaultValues: {
      rate: 1,
      validFrom: new Date().toISOString().split("T")[0],
      validTo: "",
      source: "manual",
    },
  });

  // Update edit form when selected currency changes
  useEffect(() => {
    if (selectedCurrency && editCurrencyOpen) {
      editCurrencyForm.reset({
        code: selectedCurrency.code,
        name: selectedCurrency.name,
        symbol: selectedCurrency.symbol,
        decimalPlaces: selectedCurrency.decimalPlaces,
        isActive: selectedCurrency.isActive,
        isDefault: selectedCurrency.isDefault,
      });
    }
  }, [selectedCurrency, editCurrencyOpen]);

  // Handle form submissions
  const onAddCurrencySubmit = (data: z.infer<typeof currencyFormSchema>) => {
    addCurrencyMutation.mutate(data);
  };

  const onEditCurrencySubmit = (data: z.infer<typeof currencyFormSchema>) => {
    if (selectedCurrency) {
      updateCurrencyMutation.mutate({
        id: selectedCurrency.id,
        currency: data,
      });
    }
  };

  const onAddRateSubmit = (data: z.infer<typeof exchangeRateFormSchema>) => {
    if (selectedCurrency) {
      addExchangeRateMutation.mutate({
        currencyId: selectedCurrency.id,
        rate: data,
      });
    }
  };

  const fetchLiveRateForCurrency = async (currCode: string) => {
    const baseCurr = currencies?.find((c: Currency) => c.isDefault);
    const toCurr = baseCurr?.code || "BDT";
    setLiveRateLoading(true);
    setLiveRateData(null);
    try {
      const res = await fetch(`/api/currencies/live-rate?from=${currCode}&to=${toCurr}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setLiveRateData(data);
      } else {
        toast({ title: "Failed to fetch live rate", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Failed to fetch live rate", variant: "destructive" });
    } finally {
      setLiveRateLoading(false);
    }
  };

  const saveLiveRateMutation = useMutation({
    mutationFn: async (data: { fromCurrency: string; toCurrency: string; rate: number; source: string }) => {
      return apiRequest("/api/currencies/save-live-rate", "POST", data);
    },
    onSuccess: () => {
      if (selectedCurrency) {
        queryClient.invalidateQueries({ queryKey: [`/api/currencies/${selectedCurrency.id}/exchange-rates`] });
      }
      toast({ title: "Rate saved", description: "The live exchange rate has been saved" });
    },
    onError: (error: any) => {
      toast({ title: "Error saving rate", description: error.message, variant: "destructive" });
    },
  });

  // Get the default currency
  const defaultCurrency = currencies?.find((c: Currency) => c.isDefault);

  return (
    <DashboardContainer 
      title="Currency Management" 
      subtitle="Manage currencies and exchange rates for your organization"
    >

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Currency List */}
        <Card className="md:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Currencies</CardTitle>
              <CardDescription>
                Manage your organization's currencies
              </CardDescription>
            </div>
            <Dialog open={addCurrencyOpen} onOpenChange={setAddCurrencyOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="ml-auto">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Currency
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Currency</DialogTitle>
                  <DialogDescription>
                    Enter the details for the new currency
                  </DialogDescription>
                </DialogHeader>
                <Form {...addCurrencyForm}>
                  <form onSubmit={addCurrencyForm.handleSubmit(onAddCurrencySubmit)} className="space-y-4">
                    <FormField
                      control={addCurrencyForm.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency Code</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="USD" maxLength={3} />
                          </FormControl>
                          <FormDescription>
                            ISO 4217 currency code (e.g., USD, EUR, GBP)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addCurrencyForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="US Dollar" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addCurrencyForm.control}
                      name="symbol"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Symbol</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="$" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addCurrencyForm.control}
                      name="decimalPlaces"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Decimal Places</FormLabel>
                          <FormControl>
                            <Input {...field} type="number" min={0} max={6} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addCurrencyForm.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Active</FormLabel>
                            <FormDescription>
                              Make this currency available for use
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button type="submit" disabled={addCurrencyMutation.isPending}>
                        {addCurrencyMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Add Currency
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="inactive">Inactive</TabsTrigger>
              </TabsList>
              <div className="mt-4">
                {currenciesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : currencies?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-muted-foreground">No currencies found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {currencies?.map((currency: Currency) => (
                      <div
                        key={currency.id}
                        className={`flex items-center justify-between p-3 rounded-md cursor-pointer hover:bg-accent ${
                          selectedCurrency?.id === currency.id ? "bg-accent" : ""
                        }`}
                        onClick={() => { setSelectedCurrency(currency); setLiveRateData(null); }}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="font-bold w-10">{currency.code}</div>
                          <div className="flex flex-col">
                            <span>{currency.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {currency.symbol} • {currency.decimalPlaces} decimals
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {currency.isDefault && (
                            <Badge variant="default" className="bg-yellow-500">
                              <Star className="h-3 w-3 mr-1" />
                              Default
                            </Badge>
                          )}
                          {!currency.isActive && (
                            <Badge variant="outline">Inactive</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Tabs>
          </CardContent>
        </Card>

        {/* Currency Details and Actions */}
        <Card className="md:col-span-2">
          {!selectedCurrency ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Settings className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-xl font-medium">Currency Settings</h3>
              <p className="text-muted-foreground mt-2 max-w-md">
                Select a currency from the list to view its details, exchange rates and
                insights
              </p>
            </div>
          ) : (
            <>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <CardTitle>
                      {selectedCurrency.symbol} {selectedCurrency.code}
                    </CardTitle>
                    {selectedCurrency.isDefault && (
                      <Badge variant="default" className="bg-yellow-500">
                        <Star className="h-3 w-3 mr-1" />
                        Default
                      </Badge>
                    )}
                    {!selectedCurrency.isActive && (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </div>
                  <CardDescription>{selectedCurrency.name}</CardDescription>
                </div>
                <div className="flex space-x-2">
                  {!selectedCurrency.isDefault && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setDefaultCurrencyMutation.mutate(selectedCurrency.id)}
                      disabled={setDefaultCurrencyMutation.isPending}
                    >
                      {setDefaultCurrencyMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Set as Default
                    </Button>
                  )}
                  <Dialog open={editCurrencyOpen} onOpenChange={setEditCurrencyOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Currency</DialogTitle>
                        <DialogDescription>
                          Update the details for {selectedCurrency.code}
                        </DialogDescription>
                      </DialogHeader>
                      <Form {...editCurrencyForm}>
                        <form onSubmit={editCurrencyForm.handleSubmit(onEditCurrencySubmit)} className="space-y-4">
                          <FormField
                            control={editCurrencyForm.control}
                            name="code"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Currency Code</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="USD" maxLength={3} />
                                </FormControl>
                                <FormDescription>
                                  ISO 4217 currency code (e.g., USD, EUR, GBP)
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={editCurrencyForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Currency Name</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="US Dollar" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={editCurrencyForm.control}
                            name="symbol"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Symbol</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="$" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={editCurrencyForm.control}
                            name="decimalPlaces"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Decimal Places</FormLabel>
                                <FormControl>
                                  <Input {...field} type="number" min={0} max={6} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={editCurrencyForm.control}
                            name="isActive"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                  <FormLabel>Active</FormLabel>
                                  <FormDescription>
                                    Make this currency available for use
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <DialogFooter>
                            <Button type="submit" disabled={updateCurrencyMutation.isPending}>
                              {updateCurrencyMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              )}
                              Save Changes
                            </Button>
                          </DialogFooter>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="rates">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="rates">Exchange Rates</TabsTrigger>
                    <TabsTrigger value="insights">Insights</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="rates" className="mt-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium">
                        {selectedCurrency.isDefault 
                          ? "Base Currency" 
                          : `Exchange Rates (${selectedCurrency.code} to ${defaultCurrency?.code || "Base"})`}
                      </h3>
                      <div className="flex items-center gap-2">
                      {!selectedCurrency.isDefault && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fetchLiveRateForCurrency(selectedCurrency.code)}
                          disabled={liveRateLoading}
                        >
                          {liveRateLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                          Fetch Live Rate
                        </Button>
                      )}
                      {!selectedCurrency.isDefault && (
                        <Dialog open={addRateOpen} onOpenChange={setAddRateOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm">
                              <PlusCircle className="mr-2 h-4 w-4" />
                              Add Rate
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add Exchange Rate</DialogTitle>
                              <DialogDescription>
                                Enter the new exchange rate for {selectedCurrency.code} to {defaultCurrency?.code || "base currency"}
                              </DialogDescription>
                            </DialogHeader>
                            <Form {...exchangeRateForm}>
                              <form onSubmit={exchangeRateForm.handleSubmit(onAddRateSubmit)} className="space-y-4">
                                <FormField
                                  control={exchangeRateForm.control}
                                  name="rate"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Exchange Rate</FormLabel>
                                      <FormControl>
                                        <Input {...field} type="number" step="0.000001" min="0.000001" />
                                      </FormControl>
                                      <FormDescription>
                                        Amount of {defaultCurrency?.code || "base currency"} per 1 {selectedCurrency.code}
                                      </FormDescription>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={exchangeRateForm.control}
                                  name="validFrom"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Valid From</FormLabel>
                                      <FormControl>
                                        <Input {...field} type="date" />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={exchangeRateForm.control}
                                  name="validTo"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Valid To (Optional)</FormLabel>
                                      <FormControl>
                                        <Input {...field} type="date" />
                                      </FormControl>
                                      <FormDescription>
                                        Leave empty for indefinite validity
                                      </FormDescription>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <DialogFooter>
                                  <Button type="submit" disabled={addExchangeRateMutation.isPending}>
                                    {addExchangeRateMutation.isPending && (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    Add Exchange Rate
                                  </Button>
                                </DialogFooter>
                              </form>
                            </Form>
                          </DialogContent>
                        </Dialog>
                      )}
                      </div>
                    </div>

                    {!selectedCurrency.isDefault && liveRateData && (
                      <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {liveRateData.liveRate && (
                          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <Globe className="h-4 w-4 text-green-600" />
                                  <span className="font-semibold text-green-800">Live Rate</span>
                                  <Badge variant="outline" className="text-[10px] border-green-400 text-green-700">live</Badge>
                                </div>
                                <p className="text-lg font-mono font-bold text-green-900 mt-1">
                                  1 {selectedCurrency.code} = {liveRateData.liveRate.toFixed(6)} {defaultCurrency?.code || "BDT"}
                                </p>
                                <p className="text-xs text-green-600 mt-0.5">Source: {liveRateData.liveSource}</p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-green-400 text-green-700 hover:bg-green-100"
                                disabled={saveLiveRateMutation.isPending}
                                onClick={() => {
                                  if (liveRateData.liveRate) {
                                    saveLiveRateMutation.mutate({
                                      fromCurrency: selectedCurrency.code,
                                      toCurrency: defaultCurrency?.code || "BDT",
                                      rate: liveRateData.liveRate,
                                      source: "api",
                                    });
                                  }
                                }}
                              >
                                {saveLiveRateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                                Save Rate
                              </Button>
                            </div>
                          </div>
                        )}
                        {liveRateData.lastInputRate && (
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-blue-600" />
                              <span className="font-semibold text-blue-800">Last Entered Rate</span>
                              <Badge variant="outline" className="text-[10px] border-blue-400 text-blue-700">
                                {liveRateData.lastInputSource || "manual"}
                              </Badge>
                            </div>
                            <p className="text-lg font-mono font-bold text-blue-900 mt-1">
                              1 {selectedCurrency.code} = {liveRateData.lastInputRate.toFixed(6)} {defaultCurrency?.code || "BDT"}
                            </p>
                            <p className="text-xs text-blue-600 mt-0.5">
                              Effective: {liveRateData.lastInputDate ? new Date(liveRateData.lastInputDate).toLocaleDateString() : "N/A"}
                            </p>
                          </div>
                        )}
                        {liveRateData.liveRate && liveRateData.lastInputRate && (
                          <div className="md:col-span-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                            Difference: {Math.abs(liveRateData.liveRate - liveRateData.lastInputRate).toFixed(6)} ({((Math.abs(liveRateData.liveRate - liveRateData.lastInputRate) / liveRateData.lastInputRate) * 100).toFixed(2)}% {liveRateData.liveRate > liveRateData.lastInputRate ? "higher" : "lower"} than last entry)
                          </div>
                        )}
                      </div>
                    )}
                    
                    {selectedCurrency.isDefault ? (
                      <div className="bg-muted p-4 rounded-md">
                        <p className="text-center">
                          This is the base currency. All exchange rates are calculated relative to this currency.
                        </p>
                      </div>
                    ) : ratesLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : !exchangeRates || exchangeRates.length === 0 ? (
                      <div className="bg-muted p-4 rounded-md text-center">
                        <p>No exchange rates found for this currency.</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Click "Add Rate" to add the first exchange rate.
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rate</TableHead>
                            <TableHead>Valid From</TableHead>
                            <TableHead>Valid To</TableHead>
                            <TableHead>Source</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {exchangeRates.map((rate: ExchangeRate) => (
                            <TableRow key={rate.id}>
                              <TableCell className="font-medium">
                                {parseFloat(String(rate.rate || 0)).toFixed(6)}
                              </TableCell>
                              <TableCell>
                                {new Date(rate.validFrom).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                {rate.validTo
                                  ? new Date(rate.validTo).toLocaleDateString()
                                  : "Indefinite"}
                              </TableCell>
                              <TableCell className="capitalize">{rate.source}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="insights" className="mt-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium">
                        AI-Powered Currency Insights
                      </h3>
                      <Button
                        size="sm"
                        onClick={() => generateInsightsMutation.mutate(selectedCurrency.id)}
                        disabled={generateInsightsMutation.isPending}
                      >
                        {generateInsightsMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Generate Insights
                      </Button>
                    </div>

                    {insightsLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : !insights || insights.length === 0 ? (
                      <div className="bg-muted p-4 rounded-md text-center">
                        <p>No insights available for this currency.</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Click "Generate Insights" to get AI-powered analysis.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {insights.map((insight: CurrencyInsight) => {
                          const getIcon = () => {
                            switch (insight.insightType) {
                              case "trend":
                                return <Badge variant="outline" className="mb-2">Trend Analysis</Badge>;
                              case "forecast":
                                return <Badge variant="outline" className="mb-2">Forecast</Badge>;
                              case "risk":
                                return <Badge variant="outline" className="mb-2">Risk Assessment</Badge>;
                              default:
                                return <Badge variant="outline" className="mb-2">Insight</Badge>;
                            }
                          };

                          return (
                            <Card key={insight.id}>
                              <CardContent className="pt-4">
                                {getIcon()}
                                <h4 className="text-sm font-medium">{insight.title}</h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {insight.content}
                                </p>
                                <div className="flex justify-between items-center mt-3">
                                  <div className="flex items-center">
                                    <span className="text-xs text-muted-foreground">
                                      Confidence: {(insight.confidence * 100).toFixed(0)}%
                                    </span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(insight.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </DashboardContainer>
  );
}
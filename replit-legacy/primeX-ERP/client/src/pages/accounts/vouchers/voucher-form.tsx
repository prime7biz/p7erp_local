import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useForm, useFieldArray } from "react-hook-form";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Save,
  SendHorizontal,
  Trash2,
  X,
  AlertCircle,
  Info,
  ChevronsUpDown,
  Check,
  PlusCircle,
  Globe,
  Brain,
  Sparkles,
  Keyboard,
  RefreshCw,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ModuleAIPanel } from "@/components/ai/ModuleAIPanel";
import { ToastAction } from "@/components/ui/toast";

interface VoucherType {
  id: number;
  code: string;
  name: string;
  prefix: string;
  nextNumber: number;
  isPurchase: boolean;
  isSales: boolean;
  isPayment: boolean;
  isReceipt: boolean;
  isJournal: boolean;
  isContra: boolean;
  requiresApproval: boolean;
  requiresAttachment: boolean;
  tenantId: number;
}

interface VoucherStatus {
  id: number;
  code: string;
  name: string;
  description?: string;
  color: string;
  isDefault: boolean;
  sequence: number;
  tenantId: number;
}

interface Account {
  id: number;
  accountNumber: string;
  name: string;
  accountTypeId: number;
  groupId: number | null;
  isActive: boolean;
  level: number;
  path: string;
  balance: string;
  accountCurrencyCode?: string | null;
}

interface AccountType {
  id: number;
  name: string;
  code: string;
}

interface FiscalYear {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  isCurrent: boolean;
  tenantId: number;
}

interface AccountingPeriod {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  fiscalYearId: number;
  isClosed: boolean;
  tenantId: number;
}

interface VoucherItem {
  id?: number;
  lineNumber: number;
  accountId: number;
  description: string;
  debitAmount: string;
  creditAmount: string;
  reference: string;
  currencyId?: number;
  exchangeRate?: string;
  foreignDebitAmount?: string;
  foreignCreditAmount?: string;
  fcCurrencyCode?: string;
  fcDebitAmount?: string;
  fcCreditAmount?: string;
  itemExchangeRate?: string;
}

interface VoucherFormData {
  voucherTypeId: string;
  voucherDate: string;
  fiscalYearId: string;
  accountingPeriodId: string;
  statusId: string;
  reference: string;
  referenceDate: string;
  description: string;
  items: VoucherItem[];
  currencyId?: string;
  exchangeRate?: string;
}


interface AccountGroup {
  id: number;
  name: string;
  code: string;
  nature: string;
  parentGroupId: number | null;
}

function AccountCombobox({
  accounts,
  accountGroups,
  value,
  onChange,
  loading,
  onAccountSelected,
}: {
  accounts: Account[];
  accountGroups: AccountGroup[];
  value: number;
  onChange: (val: number) => void;
  loading?: boolean;
  onAccountSelected?: (account: Account) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [newNormalBalance, setNewNormalBalance] = useState("debit");
  const [creating, setCreating] = useState(false);
  const [localAccounts, setLocalAccounts] = useState<Account[]>([]);
  const { toast } = useToast();

  const allAccounts = useMemo(() => {
    const merged = [...accounts];
    for (const la of localAccounts) {
      if (!merged.some((a) => a.id === la.id)) {
        merged.push(la);
      }
    }
    return merged.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
  }, [accounts, localAccounts]);

  const selected = allAccounts.find((a) => a.id === value);

  const groupedAccounts = useMemo(() => {
    const accts = search
      ? allAccounts.filter((a) => {
          const q = search.toLowerCase();
          return a.name.toLowerCase().includes(q) || a.accountNumber.toLowerCase().includes(q);
        })
      : allAccounts;
    const grouped: Record<number, { group: AccountGroup; accounts: Account[] }> = {};
    for (const acc of accts) {
      const gid = (acc as any).groupId || 0;
      if (!grouped[gid]) {
        const g = accountGroups.find((g) => g.id === gid);
        grouped[gid] = { group: g || { id: 0, name: "Ungrouped", code: "", nature: "", parentGroupId: null }, accounts: [] };
      }
      grouped[gid].accounts.push(acc);
    }
    return Object.values(grouped).sort((a, b) => a.group.name.localeCompare(b.group.name));
  }, [allAccounts, accountGroups, search]);

  const handleGroupChange = (groupIdStr: string) => {
    setNewGroupId(groupIdStr);
    const g = accountGroups.find((g) => g.id === parseInt(groupIdStr));
    if (g) {
      const nature = g.nature;
      setNewNormalBalance(nature === "Asset" || nature === "Expense" ? "debit" : "credit");
    }
  };

  const handleCreateAccount = async () => {
    if (!newAccountName.trim() || !newGroupId) {
      toast({ title: "Please fill in account name and group", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const nextNumRes = await fetch("/api/accounting/chart-of-accounts/next-account-number", { credentials: "include" });
      const nextNumData = await nextNumRes.json();

      const res = await apiRequest("/api/accounting/chart-of-accounts", "POST", {
        name: newAccountName.trim(),
        accountNumber: nextNumData.nextAccountNumber || "9999",
        groupId: parseInt(newGroupId),
        normalBalance: newNormalBalance,
        isActive: true,
        openingBalance: "0",
      });
      const created = await res.json();
      setLocalAccounts((prev) => [...prev, created]);
      onChange(created.id);
      setCreateDialogOpen(false);
      setNewAccountName("");
      setNewGroupId("");
      setNewNormalBalance("debit");
      toast({ title: `Account "${created.name}" created successfully` });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/chart-of-accounts"] });
    } catch (err: any) {
      toast({ title: "Failed to create account", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-9 px-3"
          >
            <span className="truncate">
              {loading
                ? "Loading..."
                : selected
                  ? `${selected.accountNumber} - ${selected.name}`
                  : "Select account"}
            </span>
            <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Type account name or number..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>No account found.</CommandEmpty>
              {groupedAccounts.map(({ group, accounts: groupAccts }) => (
                <CommandGroup key={group.id} heading={group.name}>
                  {groupAccts.map((acc) => (
                    <CommandItem
                      key={acc.id}
                      value={acc.id.toString()}
                      onSelect={() => {
                        onChange(acc.id);
                        onAccountSelected?.(acc);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === acc.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="font-mono text-xs mr-2">{acc.accountNumber}</span>
                      <span className="truncate">{acc.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    setSearch("");
                    setTimeout(() => setCreateDialogOpen(true), 150);
                  }}
                  className="text-primary cursor-pointer"
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create New Account
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Quick Create Account</DialogTitle>
            <DialogDescription>
              Add a new account to your chart of accounts
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="quick-acct-name">Account Name</Label>
              <Input
                id="quick-acct-name"
                placeholder="e.g. Office Supplies"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-acct-group">Account Group</Label>
              <select
                id="quick-acct-group"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={newGroupId}
                onChange={(e) => handleGroupChange(e.target.value)}
              >
                <option value="">Select group</option>
                {accountGroups?.map((g) => (
                  <option key={g.id} value={g.id.toString()}>
                    {g.name} ({g.nature})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-acct-balance">Normal Balance</Label>
              <select
                id="quick-acct-balance"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={newNormalBalance}
                onChange={(e) => setNewNormalBalance(e.target.value)}
              >
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateAccount} disabled={creating || !newGroupId}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImpactPreviewPanel({
  totalDebit,
  totalCredit,
  itemCount,
  formatAmount,
}: {
  totalDebit: number;
  totalCredit: number;
  itemCount: number;
  formatAmount: (val: number) => string;
}) {
  const balance = totalDebit - totalCredit;
  const isBalanced = Math.abs(balance) < 0.01;
  const hasAmounts = totalDebit > 0 || totalCredit > 0;

  return (
    <Card className={cn(
      "border-2 transition-colors",
      !hasAmounts ? "border-muted" : isBalanced ? "border-green-300 bg-green-50/30" : "border-red-300 bg-red-50/30"
    )}>
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">Impact Preview</CardTitle>
          <div className="ml-auto flex gap-1">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Ctrl+S Save
            </Badge>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Ctrl+Enter Submit
            </Badge>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Alt+N Add Row
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">Total Debits</span>
            <p className="font-semibold text-green-700 font-mono">{formatAmount(totalDebit)}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Total Credits</span>
            <p className="font-semibold text-blue-700 font-mono">{formatAmount(totalCredit)}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Balance</span>
            <p className={cn("font-semibold font-mono", isBalanced ? "text-green-600" : "text-red-600")}>
              {formatAmount(Math.abs(balance))}
              {!isBalanced && hasAmounts && (
                <span className="text-[10px] ml-1">
                  ({balance > 0 ? "Dr" : "Cr"} heavy)
                </span>
              )}
            </p>
          </div>
        </div>
        {!isBalanced && hasAmounts && (
          <div className="flex items-center gap-2 text-xs text-red-600 mt-2 pt-2 border-t border-red-200">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Debits and credits must balance before saving. Difference: {formatAmount(Math.abs(balance))}</span>
          </div>
        )}
        {isBalanced && hasAmounts && (
          <div className="flex items-center gap-2 text-xs text-green-600 mt-2 pt-2 border-t border-green-200">
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span>Voucher is balanced with {itemCount} line item{itemCount !== 1 ? "s" : ""}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const VOUCHER_TYPE_GUIDANCE: Record<string, string> = {
  PV: "Debit: Expense/Vendor account, Credit: Bank/Cash account",
  RV: "Debit: Bank/Cash account, Credit: Income/Customer account",
  JV: "General purpose entry - debit and credit any accounts",
  PI: "Debit: Purchase/Inventory account, Credit: Vendor/Payable account",
  SI: "Debit: Customer/Receivable account, Credit: Sales/Revenue account",
  CV: "Transfer between bank/cash accounts",
};

export default function VoucherForm() {
  const params = useParams<{ id: string }>();
  const voucherId = params.id ? parseInt(params.id) : undefined;
  const isEditMode = !!voucherId;

  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedFiscalYearId, setSelectedFiscalYearId] = useState<number | null>(null);
  const [submitAfterSave, setSubmitAfterSave] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [aiSuggestionsLoading, setAiSuggestionsLoading] = useState(false);

  const { data: voucherTypes, isLoading: loadingTypes } = useQuery<VoucherType[]>({
    queryKey: ["/api/accounting/vouchers/types"],
  });

  const { data: voucherStatuses, isLoading: loadingStatuses } = useQuery<VoucherStatus[]>({
    queryKey: ["/api/accounting/vouchers/statuses"],
  });

  const draftStatus = voucherStatuses?.find(s => s.code === 'DRAFT');
  const submittedStatus = voucherStatuses?.find(s => s.code === 'SUBMITTED');

  const { data: accounts, isLoading: loadingAccounts } = useQuery<Account[]>({
    queryKey: ["/api/accounting/chart-of-accounts"],
  });

  const { data: accountGroups } = useQuery<AccountGroup[]>({
    queryKey: ["/api/accounting/account-groups"],
  });

  const { data: fiscalYears, isLoading: loadingFiscalYears } = useQuery<FiscalYear[]>({
    queryKey: ["/api/accounting/fiscal-years"],
  });

  const { data: currentFiscalYear } = useQuery<FiscalYear>({
    queryKey: ["/api/accounting/fiscal-years/current"],
  });

  const { data: accountingPeriods, isLoading: loadingPeriods } = useQuery<AccountingPeriod[]>({
    queryKey: [`/api/accounting/fiscal-years/${selectedFiscalYearId}/periods`],
    enabled: !!selectedFiscalYearId,
  });

  const { data: currencies } = useQuery<any[]>({
    queryKey: ["/api/currencies"],
  });

  const baseCurrency = currencies?.find((c: any) => c.isDefault);
  const foreignCurrencies = currencies?.filter((c: any) => !c.isDefault && c.isActive) || [];

  const [voucherCurrency, setVoucherCurrency] = useState<number | null>(null);
  const [voucherExchangeRate, setVoucherExchangeRate] = useState<string>("1");
  const [aiRateSuggestion, setAiRateSuggestion] = useState<{
    rate: number; source: string; confidence: string; note: string;
  } | null>(null);
  const [aiRateLoading, setAiRateLoading] = useState(false);
  const [liveRateData, setLiveRateData] = useState<{
    liveRate: number | null; liveSource: string; liveUpdated: string | null;
    lastInputRate: number | null; lastInputDate: string | null; lastInputSource: string | null;
  } | null>(null);

  const { data: existingVoucher, isLoading: loadingVoucher } = useQuery<{
    voucher: any;
    items: any[];
    approvalHistory: any[];
  }>({
    queryKey: [`/api/accounting/vouchers/${voucherId}`],
    enabled: isEditMode && !!voucherId,
  });

  const form = useForm<VoucherFormData>({
    defaultValues: {
      voucherTypeId: "",
      voucherDate: new Date().toISOString().split("T")[0],
      fiscalYearId: "",
      accountingPeriodId: "",
      statusId: "",
      reference: "",
      referenceDate: "",
      description: "",
      items: [
        {
          lineNumber: 1,
          accountId: 0,
          description: "",
          debitAmount: "",
          creditAmount: "",
          reference: "",
        },
        {
          lineNumber: 2,
          accountId: 0,
          description: "",
          debitAmount: "",
          creditAmount: "",
          reference: "",
        },
      ],
    },
  });

  const fetchAIExchangeRate = useCallback(async (currencyCode: string) => {
    setAiRateLoading(true);
    setAiRateSuggestion(null);
    setLiveRateData(null);
    const toCurr = baseCurrency?.code || "BDT";
    try {
      const liveRes = await fetch(`/api/currencies/live-rate?from=${currencyCode}&to=${toCurr}`, { credentials: "include" });
      if (liveRes.ok) {
        const liveData = await liveRes.json();
        setLiveRateData(liveData);
        if (liveData.liveRate && liveData.liveRate > 0) {
          setVoucherExchangeRate(String(liveData.liveRate));
          setAiRateSuggestion({
            rate: liveData.liveRate,
            source: liveData.liveSource,
            confidence: "high",
            note: `Live market rate. 1 ${currencyCode} = ${liveData.liveRate} ${toCurr}`,
          });
          setAiRateLoading(false);
          return;
        }
      }
    } catch (err) {
      console.error("Live rate fetch failed, trying AI:", err);
    }
    try {
      const voucherDate = form.getValues("voucherDate") || new Date().toISOString().split("T")[0];
      const res = await apiRequest("/api/ai-insights/erp/exchange-rate", "POST", {
        fromCurrency: currencyCode,
        toCurrency: toCurr,
        date: voucherDate,
      });
      const data = await res.json();
      if (data?.rate && data.rate > 0) {
        setAiRateSuggestion(data);
        setVoucherExchangeRate(String(data.rate));
      }
    } catch (err) {
      console.error("AI exchange rate fetch failed:", err);
    } finally {
      setAiRateLoading(false);
    }
  }, [baseCurrency, form]);

  const { fields, append, remove } = useFieldArray({
    name: "items",
    control: form.control,
  });

  useEffect(() => {
    if (!isEditMode && currentFiscalYear) {
      form.setValue("fiscalYearId", currentFiscalYear.id.toString());
      setSelectedFiscalYearId(currentFiscalYear.id);
    }
  }, [currentFiscalYear, isEditMode, form]);

  useEffect(() => {
    if (!isEditMode && accountingPeriods && accountingPeriods.length > 0) {
      const openPeriod = accountingPeriods.find((p) => !p.isClosed);
      if (openPeriod && !form.getValues("accountingPeriodId")) {
        form.setValue("accountingPeriodId", openPeriod.id.toString());
      }
    }
  }, [accountingPeriods, isEditMode, form]);

  useEffect(() => {
    if (isEditMode && existingVoucher?.voucher) {
      const v = existingVoucher.voucher;
      const items = existingVoucher.items || [];

      form.reset({
        voucherTypeId: v.voucherTypeId?.toString() || "",
        voucherDate: v.voucherDate ? v.voucherDate.split("T")[0] : "",
        fiscalYearId: v.fiscalYearId?.toString() || "",
        accountingPeriodId: v.accountingPeriodId?.toString() || "",
        statusId: v.statusId?.toString() || "",
        reference: v.reference || "",
        referenceDate: v.referenceDate ? v.referenceDate.split("T")[0] : "",
        description: v.description || "",
        items: items.length > 0
          ? items.map((item: any) => ({
              id: item.id,
              lineNumber: item.lineNumber,
              accountId: item.accountId,
              description: item.description || "",
              debitAmount: item.debitAmount?.toString() || "",
              creditAmount: item.creditAmount?.toString() || "",
              reference: item.reference || "",
              fcCurrencyCode: item.fcCurrencyCode || "",
              fcDebitAmount: item.fcDebitAmount?.toString() || "",
              fcCreditAmount: item.fcCreditAmount?.toString() || "",
              itemExchangeRate: item.itemExchangeRate?.toString() || "",
            }))
          : [
              {
                lineNumber: 1,
                accountId: 0,
                description: "",
                debitAmount: "",
                creditAmount: "",
                reference: "",
              },
              {
                lineNumber: 2,
                accountId: 0,
                description: "",
                debitAmount: "",
                creditAmount: "",
                reference: "",
              },
            ],
      });

      if (v.fiscalYearId) {
        setSelectedFiscalYearId(v.fiscalYearId);
      }

      if (v.currencyCode && v.currencyCode !== (baseCurrency?.code || "BDT")) {
        const matchedCurrency = foreignCurrencies.find((c: any) => c.code === v.currencyCode);
        if (matchedCurrency) {
          setVoucherCurrency(matchedCurrency.id);
        }
        if (v.exchangeRate) {
          setVoucherExchangeRate(String(v.exchangeRate));
        }
      }
    }
  }, [existingVoucher, isEditMode, form, foreignCurrencies, baseCurrency]);

  const watchItems = form.watch("items");

  const totalDebit = (watchItems || []).reduce(
    (sum: number, item: any) => sum + (parseFloat(item?.debitAmount) || 0),
    0
  );
  const totalCredit = (watchItems || []).reduce(
    (sum: number, item: any) => sum + (parseFloat(item?.creditAmount) || 0),
    0
  );
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 0.01;

  const activeAccounts = useMemo(() => {
    return (accounts || []).filter((a) => a.isActive);
  }, [accounts]);

  const formRef = useRef<HTMLFormElement>(null);

  const handleLineItemKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colName: string) => {
      const columns = ["description", "debitAmount", "creditAmount", "reference"];
      const colIndex = columns.indexOf(colName);
      if (colIndex === -1) return;

      const isEnter = e.key === "Enter";
      const isTab = e.key === "Tab";

      if (!isEnter && !isTab) return;

      if (isEnter) {
        e.preventDefault();
        e.stopPropagation();
      }

      const forward = !e.shiftKey;
      let nextRow = rowIndex;
      let nextCol = colIndex;

      if (forward) {
        nextCol++;
        if (nextCol >= columns.length) {
          nextCol = 0;
          nextRow++;
        }
      } else {
        nextCol--;
        if (nextCol < 0) {
          nextCol = columns.length - 1;
          nextRow--;
        }
      }

      if (nextRow < 0) return;

      if (nextRow >= fields.length) {
        if (forward && isEnter) {
          handleAddItem();
          setTimeout(() => {
            const selector = `[data-row="${nextRow}"][data-col="${columns[nextCol]}"]`;
            const el = formRef.current?.querySelector(selector) as HTMLInputElement;
            el?.focus();
          }, 50);
        }
        return;
      }

      if (isEnter) {
        const selector = `[data-row="${nextRow}"][data-col="${columns[nextCol]}"]`;
        const el = formRef.current?.querySelector(selector) as HTMLInputElement;
        el?.focus();
      }
    },
    [fields.length]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      if (isMod && e.key === "s") {
        e.preventDefault();
        const saveBtn = document.querySelector('button[type="submit"][form="voucher-form"]') as HTMLButtonElement;
        saveBtn?.click();
        return;
      }

      if (isMod && e.key === "Enter") {
        e.preventDefault();
        form.handleSubmit(onSubmit)();
        return;
      }

      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleAddItem();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [form]);

  const shouldPromptChequePrint = useCallback(() => {
    const selectedTypeId = form.getValues("voucherTypeId");
    const selectedType = voucherTypes?.find(t => t.id.toString() === selectedTypeId);
    if (!selectedType) return false;

    const isPaymentOrContra = selectedType.isPayment || selectedType.isContra;
    if (!isPaymentOrContra) return false;

    const items = form.getValues("items") || [];
    const hasBankAccount = items.some(item => {
      if (!item.accountId) return false;
      const account = (accounts || []).find(a => a.id === item.accountId);
      if (!account) return false;
      const group = (accountGroups || []).find(g => g.id === account.groupId);
      if (group) {
        const groupName = group.name.toLowerCase();
        const groupCode = group.code.toLowerCase();
        if (groupName.includes("bank") || groupCode.includes("bank")) return true;
      }
      const accountName = account.name.toLowerCase();
      if (accountName.includes("bank")) return true;
      return false;
    });

    return hasBankAccount;
  }, [form, voucherTypes, accounts, accountGroups]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("/api/accounting/vouchers", "POST", data);
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/vouchers"] });
      if (submitAfterSave && result?.id) {
        submitForApprovalMutation.mutate(result.id);
        setSubmitAfterSave(false);
      } else {
        const savedId = result?.id;
        if (savedId && shouldPromptChequePrint()) {
          toast({
            title: "Voucher created",
            description: "Would you like to print a cheque?",
            action: (
              <ToastAction altText="Print Cheque" onClick={() => setLocation(`/accounts/vouchers/cheque-print/${savedId}`)}>
                Print Cheque
              </ToastAction>
            ),
          });
        } else {
          toast({ title: "Voucher created", description: "The voucher has been created successfully." });
        }
        setLocation("/accounts/vouchers");
      }
    },
    onError: (error: any) => {
      setSubmitAfterSave(false);
      toast({
        title: "Error creating voucher",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(`/api/accounting/vouchers/${voucherId}`, "PUT", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/vouchers"] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounting/vouchers/${voucherId}`] });
      if (submitAfterSave && voucherId) {
        submitForApprovalMutation.mutate(voucherId);
        setSubmitAfterSave(false);
      } else {
        if (voucherId && shouldPromptChequePrint()) {
          toast({
            title: "Voucher updated",
            description: "Would you like to print a cheque?",
            action: (
              <ToastAction altText="Print Cheque" onClick={() => setLocation(`/accounts/vouchers/cheque-print/${voucherId}`)}>
                Print Cheque
              </ToastAction>
            ),
          });
        } else {
          toast({ title: "Voucher updated", description: "The voucher has been updated successfully." });
        }
        setLocation("/accounts/vouchers");
      }
    },
    onError: (error: any) => {
      setSubmitAfterSave(false);
      toast({
        title: "Error updating voucher",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const submitForApprovalMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/accounting/vouchers/${id}/change-status`, "POST", {
        statusId: submittedStatus?.id,
        actionName: "Submit",
        comments: "Submitted for approval",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/vouchers"] });
      toast({ title: "Voucher submitted", description: "The voucher has been saved and submitted for approval." });
      setLocation("/accounts/vouchers");
    },
    onError: (error: any) => {
      toast({
        title: "Error submitting voucher",
        description: error.message || "Voucher was saved but could not be submitted for approval.",
        variant: "destructive",
      });
      setLocation("/accounts/vouchers");
    },
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending || submitForApprovalMutation.isPending;

  const getAISuggestions = async () => {
    const items = form.getValues("items") || [];
    const description = form.getValues("description") || "";
    const selectedType = voucherTypes?.find(t => t.id.toString() === form.getValues("voucherTypeId"));

    if (!description && items.every(i => !i.accountId)) return;

    setAiSuggestionsLoading(true);
    try {
      const itemDetails = items.filter(i => i.accountId).map(i => {
        const acc = (accounts || []).find(a => a.id === i.accountId);
        return {
          accountName: acc?.name || "Unknown",
          debitAmount: parseFloat(i.debitAmount) || 0,
          creditAmount: parseFloat(i.creditAmount) || 0,
        };
      });

      const res = await apiRequest("/api/ai-insights/erp/voucher-entry", "POST", {
        voucherType: selectedType?.name || "Journal",
        totalAmount: totalDebit,
        description,
        items: itemDetails,
      });
      const data = await res.json();
      setAiSuggestions(data.insights || []);
    } catch (err) {
      console.error("AI suggestions failed:", err);
    } finally {
      setAiSuggestionsLoading(false);
    }
  };

  const onSubmit = (data: VoucherFormData) => {
    if (!data.voucherTypeId) {
      toast({
        title: "Voucher type required",
        description: "Please select a voucher type before saving.",
        variant: "destructive",
      });
      return;
    }
    if (!isBalanced) {
      toast({
        title: "Unbalanced voucher",
        description: "Total debits must equal total credits before saving.",
        variant: "destructive",
      });
      return;
    }

    const nonEmptyItems = data.items.filter((item) => {
      const hasDebit = parseFloat(item.debitAmount) > 0;
      const hasCredit = parseFloat(item.creditAmount) > 0;
      const hasAccount = item.accountId > 0;
      return hasDebit || hasCredit || hasAccount;
    });

    if (nonEmptyItems.length < 2) {
      toast({
        title: "Insufficient line items",
        description: "At least 2 line items with amounts are required for double-entry.",
        variant: "destructive",
      });
      return;
    }

    for (let i = 0; i < nonEmptyItems.length; i++) {
      const item = nonEmptyItems[i];
      const hasDebit = parseFloat(item.debitAmount) > 0;
      const hasCredit = parseFloat(item.creditAmount) > 0;
      if (hasDebit && hasCredit) {
        toast({
          title: "Invalid line item",
          description: `A line item cannot have both debit and credit amounts.`,
          variant: "destructive",
        });
        return;
      }
      if (!hasDebit && !hasCredit) {
        toast({
          title: "Invalid line item",
          description: `Each line with an account must have either a debit or credit amount.`,
          variant: "destructive",
        });
        return;
      }
    }

    data.items = nonEmptyItems;

    const computedTotalDebit = data.items.reduce((sum, item) => sum + (parseFloat(item.debitAmount) || 0), 0);

    const exchangeRateNum = parseFloat(voucherExchangeRate || "1") || 1;
    const selectedForeignCurrency = voucherCurrency ? foreignCurrencies.find((c: any) => c.id === voucherCurrency) : null;
    const currencyCode = selectedForeignCurrency?.code || baseCurrency?.code || "BDT";
    const baseCurrencyAmount = currencyCode !== (baseCurrency?.code || "BDT")
      ? computedTotalDebit * exchangeRateNum
      : computedTotalDebit;

    const voucherData: Record<string, any> = {
      voucherTypeId: parseInt(data.voucherTypeId),
      voucherDate: data.voucherDate,
      fiscalYearId: parseInt(data.fiscalYearId),
      accountingPeriodId: data.accountingPeriodId ? parseInt(data.accountingPeriodId) : null,
      amount: computedTotalDebit,
      currencyCode,
      exchangeRate: exchangeRateNum.toString(),
      baseCurrencyAmount: baseCurrencyAmount.toString(),
      reference: data.reference || null,
      referenceDate: data.referenceDate || null,
      description: data.description || null,
    };

    if (!isEditMode && draftStatus) {
      voucherData.statusId = draftStatus.id;
    }

    const isForeignCurrency = currencyCode !== (baseCurrency?.code || "BDT");

    const payload = {
      voucher: voucherData,
      items: data.items.map((item, index) => {
        const debit = parseFloat(item.debitAmount) || 0;
        const credit = parseFloat(item.creditAmount) || 0;
        const lineItem: Record<string, any> = {
          ...(isEditMode && item.id ? { id: item.id } : {}),
          lineNumber: index + 1,
          accountId: item.accountId,
          description: item.description || undefined,
          debitAmount: debit,
          creditAmount: credit,
          baseCurrencyDebit: isForeignCurrency ? (debit * exchangeRateNum).toString() : undefined,
          baseCurrencyCreditAmount: isForeignCurrency ? (credit * exchangeRateNum).toString() : undefined,
          reference: item.reference || undefined,
        };
        if (isForeignCurrency) {
          lineItem.fcCurrencyCode = currencyCode;
          lineItem.fcDebitAmount = debit.toString();
          lineItem.fcCreditAmount = credit.toString();
          lineItem.itemExchangeRate = exchangeRateNum.toString();
        }
        return lineItem;
      }),
    };

    if (isEditMode) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleSaveAndSubmit = () => {
    setSubmitAfterSave(true);
    form.handleSubmit(onSubmit)();
  };

  const handleAddItem = () => {
    append({
      lineNumber: fields.length + 1,
      accountId: 0,
      description: "",
      debitAmount: "",
      creditAmount: "",
      reference: "",
    });
  };

  const handleRemoveItem = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  const handleFiscalYearChange = (value: string) => {
    form.setValue("fiscalYearId", value);
    form.setValue("accountingPeriodId", "");
    setSelectedFiscalYearId(parseInt(value));
  };

  const handleAccountCurrencyAutoSelect = useCallback((account: Account) => {
    const accCurrency = (account as any).accountCurrencyCode;
    if (!accCurrency || accCurrency === (baseCurrency?.code || "BDT")) return;
    const matchedFC = foreignCurrencies.find((c: any) => c.code === accCurrency);
    if (matchedFC && (!voucherCurrency || voucherCurrency !== matchedFC.id)) {
      setVoucherCurrency(matchedFC.id);
      fetchAIExchangeRate(matchedFC.code);
      toast({
        title: `Currency auto-selected: ${matchedFC.code}`,
        description: `Account "${account.name}" uses ${matchedFC.code}. Voucher currency set to ${matchedFC.code}.`,
      });
    }
  }, [baseCurrency, foreignCurrencies, voucherCurrency, fetchAIExchangeRate, toast]);

  const selectedForeignCurrencyObj = voucherCurrency ? foreignCurrencies.find((c: any) => c.id === voucherCurrency) : null;
  const activeCurrencyCode = selectedForeignCurrencyObj?.code || baseCurrency?.code || "BDT";
  const isForeignCurrencyActive = !!selectedForeignCurrencyObj && activeCurrencyCode !== (baseCurrency?.code || "BDT");
  const exchangeRateNum = parseFloat(voucherExchangeRate || "1") || 1;

  const formatAmount = (val: number) => {
    return activeCurrencyCode + " " + val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatBaseAmount = (val: number) => {
    const baseCode = baseCurrency?.code || "BDT";
    const converted = val * exchangeRateNum;
    return "≈ " + baseCode + " " + converted.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (isEditMode && loadingVoucher) {
    return (
      <DashboardContainer title="Loading Voucher..." subtitle="Please wait">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardContainer>
    );
  }

  const pageTitle = isEditMode ? "Edit Voucher" : "New Voucher";
  const pageSubtitle = isEditMode
    ? `Editing voucher ${existingVoucher?.voucher?.voucherNumber || ""}`
    : "Create a new financial voucher entry";

  const pageActions = (
    <div className="flex gap-2">
      <Button
        variant="outline"
        onClick={() => setLocation("/accounts/vouchers")}
        disabled={isSubmitting}
      >
        <X className="mr-2 h-4 w-4" />
        Cancel
      </Button>
      <Button
        type="submit"
        form="voucher-form"
        disabled={isSubmitting || !isBalanced}
        variant="outline"
      >
        {isSubmitting && !submitAfterSave ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        {isEditMode ? "Update Voucher" : "Save Voucher"}
      </Button>
      <Button
        type="button"
        onClick={handleSaveAndSubmit}
        disabled={isSubmitting || !isBalanced || !submittedStatus}
      >
        {isSubmitting && submitAfterSave ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <SendHorizontal className="mr-2 h-4 w-4" />
        )}
        Save & Submit
      </Button>
    </div>
  );

  return (
    <DashboardContainer title={pageTitle} subtitle={pageSubtitle} actions={pageActions}>
      <form id="voucher-form" ref={formRef} onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Voucher Information</CardTitle>
            <CardDescription>Enter the basic details for this voucher</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Voucher Type *</label>
                <Select
                  value={form.watch("voucherTypeId")}
                  onValueChange={(val) => form.setValue("voucherTypeId", val)}
                  disabled={isEditMode}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select voucher type" />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingTypes ? (
                      <div className="flex items-center justify-center p-2">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading...
                      </div>
                    ) : (
                      (voucherTypes || []).map((type) => (
                        <SelectItem key={type.id} value={type.id.toString()}>
                          {type.name} ({type.code})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {(() => {
                  const selectedType = (voucherTypes || []).find(t => t.id.toString() === form.watch("voucherTypeId"));
                  const guidance = selectedType ? VOUCHER_TYPE_GUIDANCE[selectedType.code] : null;
                  return guidance ? (
                    <div className="flex items-start gap-1.5 mt-1">
                      <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                      <span className="text-xs text-blue-600">{guidance}</span>
                    </div>
                  ) : null;
                })()}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Voucher Date *</label>
                <Input
                  type="date"
                  {...form.register("voucherDate")}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status *</label>
                <Select
                  value={form.watch("statusId")}
                  onValueChange={(val) => form.setValue("statusId", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingStatuses ? (
                      <div className="flex items-center justify-center p-2">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading...
                      </div>
                    ) : (
                      (voucherStatuses || []).map((status) => (
                        <SelectItem key={status.id} value={status.id.toString()}>
                          {status.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Fiscal Year *</label>
                <Select
                  value={form.watch("fiscalYearId")}
                  onValueChange={handleFiscalYearChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select fiscal year" />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingFiscalYears ? (
                      <div className="flex items-center justify-center p-2">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading...
                      </div>
                    ) : (
                      (fiscalYears || []).map((year) => (
                        <SelectItem
                          key={year.id}
                          value={year.id.toString()}
                        >
                          {year.name} {year.isCurrent ? "(Current)" : ""} {year.status === "closed" ? "(Closed)" : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Accounting Period *</label>
                <Select
                  value={form.watch("accountingPeriodId")}
                  onValueChange={(val) => form.setValue("accountingPeriodId", val)}
                  disabled={!selectedFiscalYearId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedFiscalYearId ? "Select period" : "Select fiscal year first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingPeriods ? (
                      <div className="flex items-center justify-center p-2">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading...
                      </div>
                    ) : (
                      (accountingPeriods || []).map((period) => (
                        <SelectItem
                          key={period.id}
                          value={period.id.toString()}
                        >
                          {period.name} {period.isClosed ? "(Closed)" : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Reference</label>
                <Input
                  placeholder="Invoice or bill number"
                  {...form.register("reference")}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Reference Date</label>
                <Input
                  type="date"
                  {...form.register("referenceDate")}
                />
              </div>

              {foreignCurrencies.length > 0 && (
                <div className="col-span-2 border rounded-lg p-4 bg-blue-50/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="h-4 w-4 text-blue-600" />
                    <Label className="font-semibold text-blue-800">Multi-Currency Entry</Label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Currency</Label>
                      <Select
                        value={voucherCurrency?.toString() || "base"}
                        onValueChange={(val) => {
                          if (val === "base") {
                            setVoucherCurrency(null);
                            setVoucherExchangeRate("1");
                            setAiRateSuggestion(null);
                            return;
                          }
                          const id = parseInt(val);
                          setVoucherCurrency(id || null);
                          if (id) {
                            const selectedCurrency = foreignCurrencies.find((c: any) => c.id === id);
                            if (selectedCurrency) {
                              fetchAIExchangeRate(selectedCurrency.code);
                            }
                          } else {
                            setVoucherExchangeRate("1");
                            setAiRateSuggestion(null);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Base Currency (BDT)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base">Base Currency ({baseCurrency?.code || 'BDT'})</SelectItem>
                          {foreignCurrencies.map((c: any) => (
                            <SelectItem key={c.id} value={c.id.toString()}>
                              {c.code} - {c.name} ({c.symbol})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {voucherCurrency && (
                      <>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <Label>Exchange Rate (1 {foreignCurrencies.find((c: any) => c.id === voucherCurrency)?.code} = ? {baseCurrency?.code || "BDT"})</Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-primary hover:bg-primary/10"
                              disabled={aiRateLoading}
                              onClick={() => {
                                const sel = foreignCurrencies.find((c: any) => c.id === voucherCurrency);
                                if (sel) fetchAIExchangeRate(sel.code);
                              }}
                            >
                              {aiRateLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                              {aiRateLoading ? "Fetching..." : "Live Rate"}
                            </Button>
                          </div>
                          <Input
                            type="number"
                            step="0.000001"
                            value={voucherExchangeRate}
                            onChange={(e) => setVoucherExchangeRate(e.target.value)}
                            placeholder={aiRateLoading ? "Fetching live rate..." : "Enter exchange rate"}
                          />
                          {liveRateData && (
                            <div className="mt-1.5 space-y-1.5">
                              {liveRateData.liveRate && (
                                <div
                                  className="p-2 bg-green-50 border border-green-200 rounded text-xs cursor-pointer hover:bg-green-100 transition-colors"
                                  onClick={() => {
                                    if (liveRateData.liveRate) {
                                      setVoucherExchangeRate(String(liveRateData.liveRate));
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-1 text-green-800">
                                    <Globe className="h-3 w-3 flex-shrink-0" />
                                    <span className="font-medium">Live Rate: {liveRateData.liveRate.toFixed(6)}</span>
                                    <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 border-green-400 text-green-700">
                                      live
                                    </Badge>
                                  </div>
                                  <p className="text-green-600 mt-0.5">Source: {liveRateData.liveSource} &middot; Click to apply</p>
                                </div>
                              )}
                              {liveRateData.lastInputRate && (
                                <div
                                  className="p-2 bg-blue-50 border border-blue-200 rounded text-xs cursor-pointer hover:bg-blue-100 transition-colors"
                                  onClick={() => {
                                    if (liveRateData.lastInputRate) {
                                      setVoucherExchangeRate(String(liveRateData.lastInputRate));
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-1 text-blue-800">
                                    <History className="h-3 w-3 flex-shrink-0" />
                                    <span className="font-medium">Last Entered: {liveRateData.lastInputRate.toFixed(6)}</span>
                                    <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 border-blue-400 text-blue-700">
                                      {liveRateData.lastInputSource || "manual"}
                                    </Badge>
                                  </div>
                                  <p className="text-blue-600 mt-0.5">
                                    Date: {liveRateData.lastInputDate ? new Date(liveRateData.lastInputDate).toLocaleDateString() : "N/A"} &middot; Click to apply
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                          {!liveRateData && aiRateSuggestion && (
                            <div className="mt-1.5 p-2 bg-purple-50 border border-purple-200 rounded text-xs">
                              <div className="flex items-center gap-1 text-purple-800">
                                <Sparkles className="h-3 w-3 flex-shrink-0" />
                                <span className="font-medium">AI Suggested: {aiRateSuggestion.rate.toFixed(6)}</span>
                                <Badge variant="outline" className={`ml-1 text-[10px] px-1 py-0 ${
                                  aiRateSuggestion.confidence === 'high' ? 'border-green-400 text-green-700' :
                                  aiRateSuggestion.confidence === 'medium' ? 'border-yellow-400 text-yellow-700' :
                                  'border-orange-400 text-orange-700'
                                }`}>
                                  {aiRateSuggestion.confidence}
                                </Badge>
                              </div>
                              <p className="text-purple-600 mt-0.5">{aiRateSuggestion.note}</p>
                              <p className="text-purple-500 mt-0.5 italic">Source: {aiRateSuggestion.source}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex items-end">
                          <div className="space-y-1">
                            <Badge variant="outline" className="h-9 px-3 flex items-center gap-1 bg-white">
                              <span className="text-xs text-muted-foreground">{baseCurrency?.code || "BDT"} Equivalent:</span>
                              <span className="font-mono font-bold">
                                {baseCurrency?.code || "BDT"} {(totalDebit * parseFloat(voucherExchangeRate || "1")).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              </span>
                            </Badge>
                            {totalDebit > 0 && (
                              <div className="text-[10px] text-muted-foreground text-center">
                                {selectedForeignCurrencyObj?.code} {totalDebit.toLocaleString("en-US", { minimumFractionDigits: 2 })} × {parseFloat(voucherExchangeRate || "1").toFixed(4)}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2 md:col-span-2 lg:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  placeholder="Enter voucher description"
                  rows={2}
                  {...form.register("description")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-gradient-to-r from-purple-50/50 to-indigo-50/50">
          <CardHeader className="pb-2 pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-600" />
                <CardTitle className="text-sm text-purple-900">AI Assistant</CardTitle>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-purple-700 hover:bg-purple-100"
                onClick={getAISuggestions} disabled={aiSuggestionsLoading} type="button">
                {aiSuggestionsLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Brain className="mr-1 h-3 w-3" />}
                Get Suggestions
              </Button>
            </div>
          </CardHeader>
          {(aiSuggestions.length > 0 || aiSuggestionsLoading) && (
            <CardContent className="pt-0 pb-3">
              {aiSuggestionsLoading ? (
                <div className="flex items-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-500 mr-2" />
                  <span className="text-xs text-purple-700">Analyzing your voucher entry...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {aiSuggestions.slice(0, 3).map((s: any, idx: number) => (
                    <div key={idx} className={`p-2 rounded border text-xs ${
                      s.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                      s.type === 'recommendation' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                      'bg-green-50 border-green-200 text-green-800'
                    }`}>
                      <span className="font-semibold">{s.title}:</span> {s.description}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        <ModuleAIPanel
          title="AI Voucher Assistant"
          endpoint="/api/ai-insights/erp/voucher-entry"
          requestData={{}}
        />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Voucher Items</CardTitle>
                <CardDescription>Add debit and credit entries. Total debits must equal total credits.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="mr-2 h-4 w-4" />
                Add Line
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead className="min-w-[200px]">Account</TableHead>
                    <TableHead className="min-w-[150px]">Description</TableHead>
                    <TableHead className="w-[140px] text-right">Debit {isForeignCurrencyActive ? `(${activeCurrencyCode})` : ""}</TableHead>
                    <TableHead className="w-[140px] text-right">Credit {isForeignCurrencyActive ? `(${activeCurrencyCode})` : ""}</TableHead>
                    <TableHead className="min-w-[120px]">Reference</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => (
                    <TableRow key={field.id}>
                      <TableCell className="font-medium text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <AccountCombobox
                          accounts={activeAccounts}
                          accountGroups={accountGroups || []}
                          value={form.watch(`items.${index}.accountId`) || 0}
                          onChange={(val) => form.setValue(`items.${index}.accountId`, val)}
                          loading={loadingAccounts}
                          onAccountSelected={handleAccountCurrencyAutoSelect}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Description"
                          data-row={index}
                          data-col="description"
                          onKeyDown={(e) => handleLineItemKeyDown(e, index, "description")}
                          {...form.register(`items.${index}.description`)}
                        />
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const debitValue = form.watch(`items.${index}.debitAmount`) || "";
                          const creditValue = form.watch(`items.${index}.creditAmount`) || "";
                          const hasCredit = parseFloat(creditValue) > 0;
                          return (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              data-row={index}
                              data-col="debitAmount"
                              className={`text-right ${hasCredit ? "bg-muted/50 text-muted-foreground cursor-not-allowed" : "border-green-200 focus:border-green-400"}`}
                              readOnly={hasCredit}
                              tabIndex={hasCredit ? -1 : undefined}
                              value={debitValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                form.setValue(`items.${index}.debitAmount`, val, { shouldDirty: true });
                                if (parseFloat(val) > 0) {
                                  form.setValue(`items.${index}.creditAmount`, "", { shouldDirty: true });
                                }
                              }}
                              onKeyDown={(e) => handleLineItemKeyDown(e, index, "debitAmount")}
                            />
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const debitValue = form.watch(`items.${index}.debitAmount`) || "";
                          const creditValue = form.watch(`items.${index}.creditAmount`) || "";
                          const hasDebit = parseFloat(debitValue) > 0;
                          return (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              data-row={index}
                              data-col="creditAmount"
                              className={`text-right ${hasDebit ? "bg-muted/50 text-muted-foreground cursor-not-allowed" : "border-blue-200 focus:border-blue-400"}`}
                              readOnly={hasDebit}
                              tabIndex={hasDebit ? -1 : undefined}
                              value={creditValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                form.setValue(`items.${index}.creditAmount`, val, { shouldDirty: true });
                                if (parseFloat(val) > 0) {
                                  form.setValue(`items.${index}.debitAmount`, "", { shouldDirty: true });
                                }
                              }}
                              onKeyDown={(e) => handleLineItemKeyDown(e, index, "creditAmount")}
                            />
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Reference"
                          data-row={index}
                          data-col="reference"
                          onKeyDown={(e) => handleLineItemKeyDown(e, index, "reference")}
                          {...form.register(`items.${index}.reference`)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(index)}
                          disabled={fields.length <= 1}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-col items-end gap-2">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm w-full max-w-md">
                <span className="text-muted-foreground">Total Debit:</span>
                <div className="text-right">
                  <span className="font-semibold">{formatAmount(totalDebit)}</span>
                  {isForeignCurrencyActive && (
                    <div className="text-xs text-muted-foreground">{formatBaseAmount(totalDebit)}</div>
                  )}
                </div>

                <span className="text-muted-foreground">Total Credit:</span>
                <div className="text-right">
                  <span className="font-semibold">{formatAmount(totalCredit)}</span>
                  {isForeignCurrencyActive && (
                    <div className="text-xs text-muted-foreground">{formatBaseAmount(totalCredit)}</div>
                  )}
                </div>

                <span className="text-muted-foreground">Difference:</span>
                <div className="text-right">
                  <span className={`font-semibold ${isBalanced ? "text-green-600" : "text-red-600"}`}>
                    {formatAmount(difference)}
                  </span>
                </div>
              </div>

              {!isBalanced && (totalDebit > 0 || totalCredit > 0) && (
                <div className="flex items-center gap-2 text-sm text-red-600 mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>Debits and credits must be equal before saving.</span>
                </div>
              )}

              {isBalanced && totalDebit > 0 && (
                <Badge variant="outline" className="text-green-600 border-green-600 mt-1">
                  Balanced
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </form>

        <ImpactPreviewPanel
          totalDebit={totalDebit}
          totalCredit={totalCredit}
          itemCount={(watchItems || []).filter((i: any) => i?.accountId > 0 && (parseFloat(i?.debitAmount) > 0 || parseFloat(i?.creditAmount) > 0)).length}
          formatAmount={formatAmount}
        />
    </DashboardContainer>
  );
}

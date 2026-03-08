import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ChevronRight, ChevronDown, Plus, Eye, Pencil, Trash2, FolderOpen, BookOpen, Search, AlertTriangle, CheckCircle2, Package, Globe, Landmark, Percent } from "lucide-react";
import { AIInsightsPanel } from "@/components/ai-insights-panel";

interface AccountGroup {
  id: number;
  name: string;
  code: string;
  nature: string;
  parentGroupId: number | null;
  affectsGrossProfit: boolean;
  isBankGroup: boolean;
  isDefault: boolean;
  sortOrder: number;
  isActive: boolean;
  children?: AccountGroup[];
  ledgers?: Account[];
}

interface BankAccountDetails {
  bankName?: string;
  accountNumber?: string;
  branch?: string;
  swiftCode?: string;
  routingNumber?: string;
}

interface Account {
  id: number;
  accountNumber: string;
  name: string;
  description: string | null;
  accountTypeId: number;
  groupId: number;
  parentAccountId: number | null;
  level: number;
  isActive: boolean;
  balance: string;
  openingBalance?: string;
  normalBalance: string;
  isCashAccount: boolean;
  isBankAccount: boolean;
  bankAccountDetails: BankAccountDetails | null;
  hasInterest: boolean;
  yearlyInterestRate: string | null;
  interestPostingFrequency: string | null;
  lastInterestPostedDate: string | null;
  isMaterialSupplier: boolean;
  supplierContactPerson: string | null;
  supplierPhone: string | null;
  supplierEmail: string | null;
  supplierAddress: string | null;
  supplierCity: string | null;
  supplierCountry: string | null;
  supplierTaxId: string | null;
  supplierPaymentTerms: string | null;
  supplierCreditLimit: string | null;
  accountCurrencyCode: string | null;
  maintainFcBalance: boolean;
  path: string;
  createdAt: string;
  updatedAt: string;
}

interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string;
  isDefault: boolean;
}

const accountFormSchema = z.object({
  accountNumber: z.string().min(1, "Account number is required"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional().nullable(),
  groupId: z.number({ required_error: "Please select an account group" }),
  normalBalance: z.enum(["debit", "credit"], { required_error: "Please select a normal balance" }),
  openingBalance: z.string().optional().default("0"),
  isActive: z.boolean().default(true),
  isBankAccount: z.boolean().default(false),
  bankAccountDetails: z.object({
    bankName: z.string().optional(),
    accountNumber: z.string().optional(),
    branch: z.string().optional(),
    swiftCode: z.string().optional(),
    routingNumber: z.string().optional(),
  }).optional().nullable(),
  hasInterest: z.boolean().default(false),
  yearlyInterestRate: z.string().optional().nullable(),
  interestPostingFrequency: z.string().optional().nullable().default("quarterly"),
  isMaterialSupplier: z.boolean().default(false),
  supplierContactPerson: z.string().optional().nullable(),
  supplierPhone: z.string().optional().nullable(),
  supplierEmail: z.string().optional().nullable(),
  supplierAddress: z.string().optional().nullable(),
  supplierCity: z.string().optional().nullable(),
  supplierCountry: z.string().optional().nullable(),
  supplierTaxId: z.string().optional().nullable(),
  supplierPaymentTerms: z.string().optional().nullable(),
  supplierCreditLimit: z.string().optional().nullable(),
  accountCurrencyCode: z.string().optional().nullable(),
  maintainFcBalance: z.boolean().default(false),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

const NATURE_COLORS: Record<string, string> = {
  Asset: "bg-blue-100 text-blue-800",
  Liability: "bg-red-100 text-red-800",
  Equity: "bg-purple-100 text-purple-800",
  Income: "bg-green-100 text-green-800",
  Expense: "bg-orange-100 text-orange-800",
};

function getNormalBalanceFromNature(nature: string): "debit" | "credit" {
  return ["Asset", "Expense"].includes(nature) ? "debit" : "credit";
}

function GroupTreeRow({
  group,
  level,
  expandedIds,
  toggleExpanded,
  showInactive,
  searchQuery,
  matchingGroupIds,
  onCreateUnderGroup,
  onViewAccount,
  onEditAccount,
  onDeleteAccount,
  onToggleAccount,
  flatGroups,
}: {
  group: AccountGroup;
  level: number;
  expandedIds: Set<number>;
  toggleExpanded: (id: number) => void;
  showInactive: boolean;
  searchQuery: string;
  matchingGroupIds: Set<number>;
  onCreateUnderGroup: (groupId: number) => void;
  onViewAccount: (account: Account) => void;
  onEditAccount: (account: Account) => void;
  onDeleteAccount: (account: Account) => void;
  onToggleAccount: (account: Account) => void;
  flatGroups?: AccountGroup[];
}) {
  const hasChildren = (group.children && group.children.length > 0) || (group.ledgers && group.ledgers.length > 0);
  const isExpanded = expandedIds.has(group.id);
  const ledgers = group.ledgers?.filter(l => showInactive || l.isActive) || [];
  const ledgerCount = ledgers.length;

  const filteredLedgers = searchQuery
    ? ledgers.filter(l =>
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.accountNumber.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : ledgers;

  if (searchQuery && !matchingGroupIds.has(group.id)) return null;

  return (
    <>
      <div
        className="flex items-center gap-2 py-2.5 px-3 bg-muted/50 hover:bg-muted/80 rounded-md mb-0.5 group/row"
        style={{ paddingLeft: `${12 + level * 24}px` }}
      >
        <button
          className="w-5 h-5 flex items-center justify-center shrink-0"
          onClick={() => hasChildren && toggleExpanded(group.id)}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <span className="w-4" />
          )}
        </button>
        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-medium text-sm flex-1 min-w-0 truncate">{group.name}</span>
        <Badge variant="secondary" className={`text-xs shrink-0 ${NATURE_COLORS[group.nature] || ""}`}>
          {group.nature}
        </Badge>
        {ledgerCount > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">{ledgerCount} ledger{ledgerCount !== 1 ? "s" : ""}</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0"
          onClick={() => onCreateUnderGroup(group.id)}
          title="Create ledger under this group"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isExpanded && (
        <>
          {filteredLedgers.map((ledger) => (
            <div
              key={ledger.id}
              className="flex items-center gap-2 py-2 px-3 hover:bg-accent/50 rounded-md mb-0.5 group/ledger"
              style={{ paddingLeft: `${36 + level * 24}px` }}
            >
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className={`text-xs font-mono text-muted-foreground w-20 shrink-0 ${!ledger.isActive ? "line-through" : ""}`}>
                {ledger.accountNumber}
              </span>
              <span className={`text-sm flex-1 min-w-0 truncate ${!ledger.isActive ? "text-muted-foreground line-through" : ""}`}>
                {ledger.name}
                {ledger.accountCurrencyCode && (
                  <Badge variant="outline" className="ml-1.5 text-[10px] px-1.5 py-0 h-4 font-semibold text-blue-600 border-blue-300">
                    {ledger.accountCurrencyCode}
                  </Badge>
                )}
                {ledger.isBankAccount && (
                  <Badge variant="outline" className="ml-1.5 text-[10px] px-1.5 py-0 h-4 font-semibold text-emerald-600 border-emerald-300">
                    Bank
                  </Badge>
                )}
                {ledger.hasInterest && (
                  <Badge variant="outline" className="ml-1.5 text-[10px] px-1.5 py-0 h-4 font-semibold text-orange-600 border-orange-300">
                    {ledger.yearlyInterestRate}%
                  </Badge>
                )}
              </span>
              <span className={`text-xs font-medium shrink-0 ${ledger.normalBalance === "debit" ? "text-blue-600" : "text-amber-600"}`}>
                {ledger.normalBalance === "debit" ? "Dr" : "Cr"}
              </span>
              {(parseFloat(ledger.openingBalance || "0") !== 0) && (
                <span className="text-xs font-medium text-right shrink-0 text-purple-600">
                  OB: {Math.abs(parseFloat(ledger.openingBalance || "0")).toLocaleString("en-IN", { minimumFractionDigits: 2 })} {parseFloat(ledger.openingBalance || "0") >= 0 ? "Dr" : "Cr"}
                </span>
              )}
              {(parseFloat(ledger.balance) || 0) !== 0 && (
                <span className={`text-sm font-medium text-right min-w-[100px] shrink-0 ${(parseFloat(ledger.balance) || 0) >= 0 ? "text-blue-600" : "text-amber-600"}`}>
                  {Math.abs(parseFloat(ledger.balance) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} {(parseFloat(ledger.balance) || 0) >= 0 ? "Dr" : "Cr"}
                </span>
              )}
              <div className="flex items-center gap-0.5 opacity-0 group-hover/ledger:opacity-100 transition-opacity shrink-0">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onViewAccount(ledger)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEditAccount(ledger)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700" onClick={() => onDeleteAccount(ledger)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <Switch
                  checked={ledger.isActive}
                  onCheckedChange={() => onToggleAccount(ledger)}
                />
              </div>
            </div>
          ))}

          {group.children?.map((child) => (
            <GroupTreeRow
              key={child.id}
              group={child}
              level={level + 1}
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
              showInactive={showInactive}
              searchQuery={searchQuery}
              matchingGroupIds={matchingGroupIds}
              onCreateUnderGroup={onCreateUnderGroup}
              onViewAccount={onViewAccount}
              onEditAccount={onEditAccount}
              onDeleteAccount={onDeleteAccount}
              onToggleAccount={onToggleAccount}
              flatGroups={flatGroups}
            />
          ))}
        </>
      )}
    </>
  );
}

function DeleteLedgerDialog({
  isOpen,
  onOpenChange,
  currentAccount,
  deleteMutation,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentAccount: Account | null;
  deleteMutation: ReturnType<typeof useMutation<unknown, Error, number>>;
}) {
  const { data: entryCountData, isLoading: entryCountLoading } = useQuery<{
    entryCount: number;
    details: {
      voucherItems: number;
      ledgerPostings: number;
      openingBalances: number;
      journalLines: number;
      postingProfileLines: number;
      childAccounts: number;
    };
  }>({
    queryKey: [`/api/accounting/chart-of-accounts/${currentAccount?.id}/entry-count`],
    enabled: isOpen && !!currentAccount,
  });

  const hasEntries = (entryCountData?.entryCount ?? 0) > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Ledger</DialogTitle>
          <DialogDescription>Are you sure you want to delete this ledger account?</DialogDescription>
        </DialogHeader>
        {currentAccount && (
          <div className="space-y-4">
            <div className="border p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium">{currentAccount.accountNumber} - {currentAccount.name}</h4>
              <p className="text-sm text-muted-foreground mt-1">{currentAccount.description || "No description"}</p>
            </div>

            {entryCountLoading ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : hasEntries ? (
              <div className="border border-destructive/50 bg-destructive/10 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-semibold">This ledger has {entryCountData!.entryCount} entries that must be deleted first</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {entryCountData!.details.voucherItems > 0 && (
                    <div className="flex justify-between"><span>Voucher Items:</span><span className="font-medium">{entryCountData!.details.voucherItems}</span></div>
                  )}
                  {entryCountData!.details.ledgerPostings > 0 && (
                    <div className="flex justify-between"><span>Ledger Postings:</span><span className="font-medium">{entryCountData!.details.ledgerPostings}</span></div>
                  )}
                  {entryCountData!.details.openingBalances > 0 && (
                    <div className="flex justify-between"><span>Opening Balances:</span><span className="font-medium">{entryCountData!.details.openingBalances}</span></div>
                  )}
                  {entryCountData!.details.journalLines > 0 && (
                    <div className="flex justify-between"><span>Journal Lines:</span><span className="font-medium">{entryCountData!.details.journalLines}</span></div>
                  )}
                  {entryCountData!.details.postingProfileLines > 0 && (
                    <div className="flex justify-between"><span>Posting Profiles:</span><span className="font-medium">{entryCountData!.details.postingProfileLines}</span></div>
                  )}
                  {entryCountData!.details.childAccounts > 0 && (
                    <div className="flex justify-between"><span>Child Accounts:</span><span className="font-medium">{entryCountData!.details.childAccounts}</span></div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-green-500/50 bg-green-50 dark:bg-green-950/20 rounded-lg p-4 flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <span>This ledger is empty and can be safely deleted.</span>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => currentAccount && deleteMutation.mutate(currentAccount.id)}
            disabled={deleteMutation.isPending || entryCountLoading || hasEntries}
          >
            {deleteMutation.isPending ? "Deleting..." : hasEntries ? "Delete All Entries First" : "Delete Ledger"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ChartOfAccounts() {
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  const [preselectedGroupId, setPreselectedGroupId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: hierarchy, isLoading: hierarchyLoading } = useQuery<AccountGroup[]>({
    queryKey: ["/api/accounting/account-groups/hierarchy"],
  });

  const { data: flatGroups } = useQuery<AccountGroup[]>({
    queryKey: ["/api/accounting/account-groups"],
  });

  const { data: nextAccountNumberData } = useQuery<{ nextAccountNumber: string }>({
    queryKey: ["/api/accounting/chart-of-accounts/next-account-number"],
    enabled: isCreateDialogOpen,
  });

  const { data: currencies } = useQuery<Currency[]>({
    queryKey: ["/api/currencies"],
  });

  const collectAllGroupIds = (groups: AccountGroup[]): number[] => {
    const ids: number[] = [];
    const walk = (g: AccountGroup) => {
      ids.push(g.id);
      g.children?.forEach(walk);
    };
    groups.forEach(walk);
    return ids;
  };

  const matchingGroupIds = useMemo(() => {
    if (!searchQuery || !hierarchy) return new Set<number>();
    const ids = new Set<number>();

    const checkGroup = (group: AccountGroup): boolean => {
      let hasMatch = false;
      const ledgers = group.ledgers || [];
      for (const l of ledgers) {
        if (
          l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.accountNumber.toLowerCase().includes(searchQuery.toLowerCase())
        ) {
          hasMatch = true;
        }
      }
      for (const child of group.children || []) {
        if (checkGroup(child)) hasMatch = true;
      }
      if (hasMatch) ids.add(group.id);
      return hasMatch;
    };

    hierarchy.forEach(checkGroup);
    return ids;
  }, [searchQuery, hierarchy]);

  useEffect(() => {
    if (searchQuery && hierarchy) {
      const allMatching = new Set<number>();
      const walk = (g: AccountGroup) => {
        if (matchingGroupIds.has(g.id)) allMatching.add(g.id);
        g.children?.forEach(walk);
      };
      hierarchy.forEach(walk);
      setExpandedIds(allMatching);
    }
  }, [searchQuery, matchingGroupIds, hierarchy]);

  useEffect(() => {
    if (!expandedIds.size && hierarchy) {
      setExpandedIds(new Set(collectAllGroupIds(hierarchy)));
    }
  }, [hierarchy]);

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createForm = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      accountNumber: "",
      name: "",
      description: "",
      groupId: undefined,
      normalBalance: "debit",
      openingBalance: "0",
      isActive: true,
      isBankAccount: false,
      bankAccountDetails: null,
      hasInterest: false,
      yearlyInterestRate: null,
      interestPostingFrequency: "quarterly",
      isMaterialSupplier: false,
      supplierContactPerson: "",
      supplierPhone: "",
      supplierEmail: "",
      supplierAddress: "",
      supplierCity: "",
      supplierCountry: "",
      supplierTaxId: "",
      supplierPaymentTerms: "",
      supplierCreditLimit: "",
      accountCurrencyCode: null,
      maintainFcBalance: false,
    },
  });

  const editForm = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      accountNumber: "",
      name: "",
      description: "",
      groupId: undefined,
      normalBalance: "debit",
      openingBalance: "0",
      isActive: true,
      isBankAccount: false,
      bankAccountDetails: null,
      hasInterest: false,
      yearlyInterestRate: null,
      interestPostingFrequency: "quarterly",
      isMaterialSupplier: false,
      supplierContactPerson: "",
      supplierPhone: "",
      supplierEmail: "",
      supplierAddress: "",
      supplierCity: "",
      supplierCountry: "",
      supplierTaxId: "",
      supplierPaymentTerms: "",
      supplierCreditLimit: "",
      accountCurrencyCode: null,
      maintainFcBalance: false,
    },
  });

  useEffect(() => {
    if (isCreateDialogOpen) {
      const preselectedGroup = preselectedGroupId && flatGroups
        ? flatGroups.find(g => g.id === preselectedGroupId)
        : null;
      const isBankGroup = preselectedGroup?.isBankGroup || false;
      createForm.reset({
        accountNumber: nextAccountNumberData?.nextAccountNumber || "",
        name: "",
        description: "",
        groupId: preselectedGroupId ?? undefined,
        normalBalance: preselectedGroup
          ? getNormalBalanceFromNature(preselectedGroup.nature || "Asset")
          : "debit",
        openingBalance: "0",
        isActive: true,
        isBankAccount: isBankGroup,
        bankAccountDetails: null,
        hasInterest: false,
        yearlyInterestRate: null,
        interestPostingFrequency: "quarterly",
        isMaterialSupplier: false,
        supplierContactPerson: "",
        supplierPhone: "",
        supplierEmail: "",
        supplierAddress: "",
        supplierCity: "",
        supplierCountry: "",
        supplierTaxId: "",
        supplierPaymentTerms: "",
        supplierCreditLimit: "",
        accountCurrencyCode: null,
        maintainFcBalance: false,
      });
    }
  }, [isCreateDialogOpen, nextAccountNumberData, preselectedGroupId, flatGroups]);

  useEffect(() => {
    if (currentAccount && isEditDialogOpen) {
      editForm.reset({
        accountNumber: currentAccount.accountNumber,
        name: currentAccount.name,
        description: currentAccount.description,
        groupId: currentAccount.groupId,
        normalBalance: currentAccount.normalBalance as "debit" | "credit",
        openingBalance: currentAccount.openingBalance || currentAccount.balance || "0",
        isActive: currentAccount.isActive,
        isBankAccount: currentAccount.isBankAccount || false,
        bankAccountDetails: currentAccount.bankAccountDetails || null,
        hasInterest: currentAccount.hasInterest || false,
        yearlyInterestRate: currentAccount.yearlyInterestRate || null,
        interestPostingFrequency: currentAccount.interestPostingFrequency || "quarterly",
        isMaterialSupplier: currentAccount.isMaterialSupplier || false,
        supplierContactPerson: currentAccount.supplierContactPerson || "",
        supplierPhone: currentAccount.supplierPhone || "",
        supplierEmail: currentAccount.supplierEmail || "",
        supplierAddress: currentAccount.supplierAddress || "",
        supplierCity: currentAccount.supplierCity || "",
        supplierCountry: currentAccount.supplierCountry || "",
        supplierTaxId: currentAccount.supplierTaxId || "",
        supplierPaymentTerms: currentAccount.supplierPaymentTerms || "",
        supplierCreditLimit: currentAccount.supplierCreditLimit || "",
        accountCurrencyCode: currentAccount.accountCurrencyCode || null,
        maintainFcBalance: currentAccount.maintainFcBalance || false,
      });
    }
  }, [currentAccount, isEditDialogOpen]);

  const createGroupIdWatch = createForm.watch("groupId");
  useEffect(() => {
    if (createGroupIdWatch && flatGroups) {
      const group = flatGroups.find(g => g.id === createGroupIdWatch);
      if (group) {
        createForm.setValue("normalBalance", getNormalBalanceFromNature(group.nature));
        if (group.isBankGroup) {
          createForm.setValue("isBankAccount", true);
        }
      }
    }
  }, [createGroupIdWatch, flatGroups]);

  const editGroupIdWatch = editForm.watch("groupId");
  useEffect(() => {
    if (editGroupIdWatch && flatGroups) {
      const group = flatGroups.find(g => g.id === editGroupIdWatch);
      if (group) editForm.setValue("normalBalance", getNormalBalanceFromNature(group.nature));
    }
  }, [editGroupIdWatch, flatGroups]);

  const createMutation = useMutation({
    mutationFn: (data: AccountFormValues) => apiRequest("/api/accounting/chart-of-accounts", "POST", data),
    onSuccess: () => {
      setIsCreateDialogOpen(false);
      setPreselectedGroupId(null);
      toast({ title: "Ledger created", description: "The ledger account has been created successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/account-groups/hierarchy"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/chart-of-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/chart-of-accounts/next-account-number"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: AccountFormValues }) =>
      apiRequest(`/api/accounting/chart-of-accounts/${id}`, "PUT", data),
    onSuccess: () => {
      setIsEditDialogOpen(false);
      toast({ title: "Ledger updated", description: "The ledger account has been updated successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/account-groups/hierarchy"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/chart-of-accounts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/accounting/chart-of-accounts/${id}`, "DELETE"),
    onSuccess: () => {
      setIsDeleteDialogOpen(false);
      toast({ title: "Ledger deleted", description: "The ledger account has been deleted successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/account-groups/hierarchy"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/chart-of-accounts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleAccount = async (account: Account) => {
    try {
      await updateMutation.mutateAsync({
        id: account.id,
        data: {
          accountNumber: account.accountNumber,
          name: account.name,
          description: account.description,
          groupId: account.groupId,
          normalBalance: account.normalBalance as "debit" | "credit",
          openingBalance: account.openingBalance || "0",
          isActive: !account.isActive,
          isBankAccount: account.isBankAccount || false,
          bankAccountDetails: account.bankAccountDetails || null,
          hasInterest: account.hasInterest || false,
          yearlyInterestRate: account.yearlyInterestRate || null,
          interestPostingFrequency: account.interestPostingFrequency || "quarterly",
          isMaterialSupplier: account.isMaterialSupplier || false,
          maintainFcBalance: account.maintainFcBalance || false,
          accountCurrencyCode: account.accountCurrencyCode || null,
        },
      });
    } catch (error) {
      console.error("Error toggling account status:", error);
    }
  };

  const openCreateUnderGroup = (groupId: number) => {
    setPreselectedGroupId(groupId);
    setIsCreateDialogOpen(true);
  };

  const getGroupName = (groupId: number) => {
    return flatGroups?.find(g => g.id === groupId)?.name || "—";
  };

  const renderLedgerFormFields = (form: ReturnType<typeof useForm<AccountFormValues>>, isEdit: boolean) => {
    const watchedGroupId = form.watch("groupId");
    const watchedIsMaterialSupplier = form.watch("isMaterialSupplier");
    const watchedCurrencyCode = form.watch("accountCurrencyCode");
    const watchedIsBankAccount = form.watch("isBankAccount");
    const watchedHasInterest = form.watch("hasInterest");
    const selectedGroup = flatGroups?.find(g => g.id === watchedGroupId);
    const isLiabilityNature = selectedGroup?.nature === "Liability";
    const showCurrencyFields = selectedGroup?.nature === "Asset" || selectedGroup?.nature === "Liability";
    const showInterestFields = selectedGroup?.nature === "Asset" || selectedGroup?.nature === "Liability";

    return (
      <>
        <FormField
          control={form.control}
          name="accountNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Number</FormLabel>
              <FormControl>
                <Input placeholder="Auto-generated" {...field} disabled />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter account name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Optional description" {...field} value={field.value || ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="groupId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Group</FormLabel>
              <Select
                value={field.value?.toString()}
                onValueChange={(val) => field.onChange(Number(val))}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account group" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {flatGroups?.map((g) => (
                    <SelectItem key={g.id} value={g.id.toString()}>
                      {g.name} ({g.nature})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="normalBalance"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Normal Balance</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select normal balance" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="debit">Debit</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>Auto-set from group nature but editable</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="openingBalance"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Opening Balance</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value || "0"} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Active</FormLabel>
                <FormDescription>Available for transactions</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isBankAccount"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel className="flex items-center gap-2">
                  <Landmark className="h-4 w-4" />
                  Bank Account
                </FormLabel>
                <FormDescription>Mark as a bank account (syncs to Banking module)</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked);
                    if (!checked) {
                      form.setValue("bankAccountDetails", null);
                    } else {
                      form.setValue("bankAccountDetails", {
                        bankName: "",
                        accountNumber: "",
                        branch: "",
                        swiftCode: "",
                        routingNumber: "",
                      });
                    }
                  }}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {watchedIsBankAccount && (
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Landmark className="h-4 w-4" />
              Bank Account Details
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="bankAccountDetails.bankName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Standard Chartered" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bankAccountDetails.accountNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Bank account number" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="bankAccountDetails.branch"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Branch</FormLabel>
                  <FormControl>
                    <Input placeholder="Branch name" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="bankAccountDetails.swiftCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SWIFT Code</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. SCBLBDDX" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bankAccountDetails.routingNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Routing Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Routing number" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}

        {showInterestFields && (
          <FormField
            control={form.control}
            name="hasInterest"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel className="flex items-center gap-2">
                    <Percent className="h-4 w-4" />
                    Interest Calculation
                  </FormLabel>
                  <FormDescription>Enable automatic interest accrual posting</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked);
                      if (!checked) {
                        form.setValue("yearlyInterestRate", null);
                        form.setValue("interestPostingFrequency", "quarterly");
                      }
                    }}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        )}

        {showInterestFields && watchedHasInterest && (
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Percent className="h-4 w-4" />
              Interest Rate Settings
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="yearlyInterestRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Yearly Interest Rate (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="e.g. 8.50"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormDescription>Annual interest rate percentage</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="interestPostingFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Posting Frequency</FormLabel>
                    <Select value={field.value || "quarterly"} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>How often interest is calculated and posted</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}

        {showCurrencyFields && (
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Foreign Currency Settings
            </h4>
            <FormField
              control={form.control}
              name="accountCurrencyCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Currency</FormLabel>
                  <Select
                    value={field.value || "__base__"}
                    onValueChange={(val) => {
                      field.onChange(val === "__base__" ? null : val);
                      if (val === "__base__") {
                        form.setValue("maintainFcBalance", false);
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Base currency (default)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__base__">Base Currency (default)</SelectItem>
                      {currencies?.map((c) => (
                        <SelectItem key={c.id} value={c.code}>
                          {c.code} - {c.name} ({c.symbol})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Set a foreign currency for bank, customer, or vendor accounts</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {watchedCurrencyCode && (
              <FormField
                control={form.control}
                name="maintainFcBalance"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Maintain balance in foreign currency</FormLabel>
                      <FormDescription>Track balances in {watchedCurrencyCode} alongside base currency</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
          </div>
        )}

        {isLiabilityNature && (
          <FormField
            control={form.control}
            name="isMaterialSupplier"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Materials Supplier
                  </FormLabel>
                  <FormDescription>Mark as supplier for inventory/purchasing modules</FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        )}

        {isLiabilityNature && watchedIsMaterialSupplier && (
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Package className="h-4 w-4" />
              Supplier Contact Details
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="supplierContactPerson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Person</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact name" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supplierPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="Phone number" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supplierEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="Email address" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="supplierAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Supplier address" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="supplierCity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="City" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supplierCountry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input placeholder="Country" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="supplierTaxId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Tax ID" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supplierPaymentTerms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Terms</FormLabel>
                    <Select value={field.value || ""} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select terms" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Net 15">Net 15</SelectItem>
                        <SelectItem value="Net 30">Net 30</SelectItem>
                        <SelectItem value="Net 45">Net 45</SelectItem>
                        <SelectItem value="Net 60">Net 60</SelectItem>
                        <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="supplierCreditLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Credit Limit</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
      </>
    );
  };

  return (
    <DashboardContainer
      title="Chart of Accounts"
      subtitle="Manage ledger accounts organized by account groups"
      actions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="showInactive"
              checked={showInactive}
              onCheckedChange={(v) => setShowInactive(!!v)}
            />
            <Label htmlFor="showInactive" className="text-sm">Show Inactive</Label>
          </div>
          <Button onClick={() => { setPreselectedGroupId(null); setIsCreateDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            New Ledger
          </Button>
        </div>
      }
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Account Structure</CardTitle>
          <CardDescription>Ledger accounts organized under account groups</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by account name or number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {hierarchyLoading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : hierarchy && hierarchy.length > 0 ? (
            <div className="space-y-0.5">
              {hierarchy.map((group) => (
                <GroupTreeRow
                  key={group.id}
                  group={group}
                  level={0}
                  expandedIds={expandedIds}
                  toggleExpanded={toggleExpanded}
                  showInactive={showInactive}
                  searchQuery={searchQuery}
                  matchingGroupIds={matchingGroupIds}
                  onCreateUnderGroup={openCreateUnderGroup}
                  onViewAccount={(a) => { setCurrentAccount(a); setIsViewDialogOpen(true); }}
                  onEditAccount={(a) => { setCurrentAccount(a); setIsEditDialogOpen(true); }}
                  onDeleteAccount={(a) => { setCurrentAccount(a); setIsDeleteDialogOpen(true); }}
                  onToggleAccount={toggleAccount}
                  flatGroups={flatGroups}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No account groups found. Create account groups first, then add ledger accounts.
            </div>
          )}
        </CardContent>
      </Card>

      <AIInsightsPanel 
        context="accounting"
        data={{}}
        className="mt-6"
      />

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ledger Details</DialogTitle>
            <DialogDescription>Viewing ledger account information</DialogDescription>
          </DialogHeader>
          {currentAccount && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Account Number</h4>
                  <p>{currentAccount.accountNumber}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Name</h4>
                  <p>{currentAccount.name}</p>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
                <p>{currentAccount.description || "—"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Account Group</h4>
                  <p>{getGroupName(currentAccount.groupId)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Normal Balance</h4>
                  <p className={currentAccount.normalBalance === "debit" ? "text-blue-600" : "text-amber-600"}>
                    {currentAccount.normalBalance === "debit" ? "Debit" : "Credit"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Opening Balance</h4>
                  <p className="text-purple-600">
                    {(parseFloat(currentAccount.openingBalance || "0")).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Current Balance</h4>
                  <p className={(parseFloat(currentAccount.balance) || 0) >= 0 ? "text-green-600" : "text-red-600"}>
                    {(parseFloat(currentAccount.balance) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
                  <p>{currentAccount.isActive ? <span className="text-green-600">Active</span> : <span className="text-red-600">Inactive</span>}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {currentAccount.isBankAccount && (
                    <Badge className="bg-blue-100 text-blue-800 flex items-center gap-1 w-fit">
                      <Landmark className="h-3 w-3" />
                      Bank Account
                    </Badge>
                  )}
                  {currentAccount.hasInterest && (
                    <Badge className="bg-green-100 text-green-800 flex items-center gap-1 w-fit">
                      <Percent className="h-3 w-3" />
                      Interest Enabled
                    </Badge>
                  )}
                  {currentAccount.isMaterialSupplier && (
                    <Badge className="bg-indigo-100 text-indigo-800 flex items-center gap-1 w-fit">
                      <Package className="h-3 w-3" />
                      Materials Supplier
                    </Badge>
                  )}
                </div>
              </div>
              {currentAccount.isBankAccount && currentAccount.bankAccountDetails && (
                <div className="border rounded-lg p-4 space-y-2 bg-blue-50 dark:bg-blue-950/20">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-blue-600" />
                    Bank Account Details
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {(currentAccount.bankAccountDetails as BankAccountDetails).bankName && (
                      <div>
                        <span className="text-muted-foreground">Bank Name:</span>
                        <p className="font-medium">{(currentAccount.bankAccountDetails as BankAccountDetails).bankName}</p>
                      </div>
                    )}
                    {(currentAccount.bankAccountDetails as BankAccountDetails).accountNumber && (
                      <div>
                        <span className="text-muted-foreground">Account Number:</span>
                        <p className="font-medium">{(currentAccount.bankAccountDetails as BankAccountDetails).accountNumber}</p>
                      </div>
                    )}
                    {(currentAccount.bankAccountDetails as BankAccountDetails).branch && (
                      <div>
                        <span className="text-muted-foreground">Branch:</span>
                        <p className="font-medium">{(currentAccount.bankAccountDetails as BankAccountDetails).branch}</p>
                      </div>
                    )}
                    {(currentAccount.bankAccountDetails as BankAccountDetails).swiftCode && (
                      <div>
                        <span className="text-muted-foreground">SWIFT Code:</span>
                        <p className="font-medium">{(currentAccount.bankAccountDetails as BankAccountDetails).swiftCode}</p>
                      </div>
                    )}
                    {(currentAccount.bankAccountDetails as BankAccountDetails).routingNumber && (
                      <div>
                        <span className="text-muted-foreground">Routing Number:</span>
                        <p className="font-medium">{(currentAccount.bankAccountDetails as BankAccountDetails).routingNumber}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {currentAccount.hasInterest && (
                <div className="border rounded-lg p-4 space-y-2 bg-green-50 dark:bg-green-950/20">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Percent className="h-4 w-4 text-green-600" />
                    Interest Settings
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Yearly Rate:</span>
                      <p className="font-medium">{currentAccount.yearlyInterestRate || "—"}%</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Posting Frequency:</span>
                      <p className="font-medium capitalize">{currentAccount.interestPostingFrequency || "quarterly"}</p>
                    </div>
                    {currentAccount.lastInterestPostedDate && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Last Interest Posted:</span>
                        <p className="font-medium">{new Date(currentAccount.lastInterestPostedDate).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {currentAccount.accountCurrencyCode && (
                <div className="border rounded-lg p-4 space-y-2 bg-blue-50 dark:bg-blue-950/20">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-600" />
                    Foreign Currency Account
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Currency:</span>
                      <p className="font-medium text-blue-600">{currentAccount.accountCurrencyCode}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Maintain FC Balance:</span>
                      <p className="font-medium">{currentAccount.maintainFcBalance ? "Yes" : "No"}</p>
                    </div>
                  </div>
                </div>
              )}
              {currentAccount.isMaterialSupplier && (
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Supplier Information
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {currentAccount.supplierContactPerson && (
                      <div>
                        <span className="text-muted-foreground">Contact Person:</span>
                        <p className="font-medium">{currentAccount.supplierContactPerson}</p>
                      </div>
                    )}
                    {currentAccount.supplierPhone && (
                      <div>
                        <span className="text-muted-foreground">Phone:</span>
                        <p className="font-medium">{currentAccount.supplierPhone}</p>
                      </div>
                    )}
                    {currentAccount.supplierEmail && (
                      <div>
                        <span className="text-muted-foreground">Email:</span>
                        <p className="font-medium">{currentAccount.supplierEmail}</p>
                      </div>
                    )}
                    {currentAccount.supplierAddress && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Address:</span>
                        <p className="font-medium">{currentAccount.supplierAddress}</p>
                      </div>
                    )}
                    {currentAccount.supplierCity && (
                      <div>
                        <span className="text-muted-foreground">City:</span>
                        <p className="font-medium">{currentAccount.supplierCity}</p>
                      </div>
                    )}
                    {currentAccount.supplierCountry && (
                      <div>
                        <span className="text-muted-foreground">Country:</span>
                        <p className="font-medium">{currentAccount.supplierCountry}</p>
                      </div>
                    )}
                    {currentAccount.supplierTaxId && (
                      <div>
                        <span className="text-muted-foreground">Tax ID:</span>
                        <p className="font-medium">{currentAccount.supplierTaxId}</p>
                      </div>
                    )}
                    {currentAccount.supplierPaymentTerms && (
                      <div>
                        <span className="text-muted-foreground">Payment Terms:</span>
                        <p className="font-medium">{currentAccount.supplierPaymentTerms}</p>
                      </div>
                    )}
                    {currentAccount.supplierCreditLimit && (
                      <div>
                        <span className="text-muted-foreground">Credit Limit:</span>
                        <p className="font-medium">{parseFloat(currentAccount.supplierCreditLimit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Created</h4>
                  <p>{new Date(currentAccount.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Last Updated</h4>
                  <p>{new Date(currentAccount.updatedAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
            <Button onClick={() => { setIsViewDialogOpen(false); setIsEditDialogOpen(true); }}>Edit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => { setIsCreateDialogOpen(open); if (!open) setPreselectedGroupId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Ledger</DialogTitle>
            <DialogDescription>Add a new ledger account under an account group</DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
              {renderLedgerFormFields(createForm, false)}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Ledger"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Ledger</DialogTitle>
            <DialogDescription>Modify ledger account details</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((v) => currentAccount && updateMutation.mutate({ id: currentAccount.id, data: v }))} className="space-y-4">
              {renderLedgerFormFields(editForm, true)}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Updating..." : "Update Ledger"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <DeleteLedgerDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        currentAccount={currentAccount}
        deleteMutation={deleteMutation}
      />
    </DashboardContainer>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { format, addDays } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  CalendarIcon, Loader2, Plus, Trash2, ArrowLeft, RefreshCw,
  FileText, Mail, Printer, ChevronDown, ChevronUp, Info, Check, ChevronsUpDown, PackagePlus,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { useToast } from '@/hooks/use-toast';
import { useTenantInfo } from '@/hooks/useTenantInfo';
import { apiRequest, queryClient as globalQueryClient } from '@/lib/queryClient';

const CURRENCIES = ['BDT','USD','EUR','GBP','JPY','CNY','INR','AUD','CAD','CHF','SGD','HKD','MYR','THB','KRW','SAR','AED'];
const CURRENCY_SYMBOLS: Record<string, string> = {
  BDT:'৳', USD:'$', EUR:'€', GBP:'£', JPY:'¥', CNY:'¥', INR:'₹',
  AUD:'A$', CAD:'C$', CHF:'CHF', SGD:'S$', HKD:'HK$', MYR:'RM',
  THB:'฿', KRW:'₩', SAR:'﷼', AED:'د.إ',
};
const sym = (c: string) => CURRENCY_SYMBOLS[c] || c;

const DEPARTMENTS = ["Men's", "Ladies", "Kids", "Infant", "Boys", "Girls", "Unisex"];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  SENT: 'bg-purple-100 text-purple-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const fmtNum = (n: number | string, dec = 2) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

interface MaterialRow {
  id?: number;
  categoryId: number | null;
  subcategoryId: number | null;
  itemId: number | null;
  description: string;
  unit: string;
  consumptionPerDozen: string;
  unitPrice: string;
  currency: string;
  exchangeRate: string;
  amountPerDozen: string;
  totalAmount: string;
  baseAmount: string;
  localAmount: string;
}

interface MfgRow {
  id?: number;
  stylePart: string;
  machinesRequired: string;
  productionPerHour: string;
  productionPerDay: string;
  costPerMachine: string;
  totalLineCost: string;
  costPerDozen: string;
  cmPerPiece: string;
  totalOrderCost: string;
  currency: string;
  exchangeRate: string;
}

interface OtherCostRow {
  id?: number;
  costHead: string;
  costType: 'fixed' | 'percentage';
  value: string;
  basedOn: 'subtotal' | 'material' | 'cm';
  calculatedAmount: string;
  notes: string;
  currency: string;
  exchangeRate: string;
}

interface SizeRatioRow {
  size: string;
  ratioPercentage: string;
  quantity: string;
  fabricFactor: string;
}

const emptyMaterial = (): MaterialRow => ({
  categoryId: null, subcategoryId: null, itemId: null,
  description: '', unit: 'Yard', consumptionPerDozen: '',
  unitPrice: '', currency: 'USD', exchangeRate: '110.50',
  amountPerDozen: '0', totalAmount: '0', baseAmount: '0', localAmount: '0',
});

const emptyMfg = (): MfgRow => ({
  stylePart: '', machinesRequired: '', productionPerHour: '', productionPerDay: '',
  costPerMachine: '', totalLineCost: '', costPerDozen: '', cmPerPiece: '', totalOrderCost: '',
  currency: 'BDT', exchangeRate: '1',
});

const emptyOther = (): OtherCostRow => ({
  costHead: '', costType: 'fixed', value: '', basedOn: 'subtotal',
  calculatedAmount: '0', notes: '', currency: 'BDT', exchangeRate: '1',
});

const emptySizeRatio = (size: string, ratio: string): SizeRatioRow => ({
  size, ratioPercentage: ratio, quantity: '0', fabricFactor: '1.0',
});

const QuotationForm: React.FC = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [_, navigate] = useLocation();
  const params = useParams();
  const isEditing = Boolean(params.id);
  const quotationDbId = params.id ? Number(params.id) : null;

  const searchParams = new URLSearchParams(window.location.search);
  const inquiryIdFromUrl = searchParams.get('inquiryId');
  const { tenantInfo } = useTenantInfo();

  // Header fields
  const [customerId, setCustomerId] = useState<number>(0);
  const [inquiryId, setInquiryId] = useState<number | null>(null);
  const [styleName, setStyleName] = useState('');
  const [department, setDepartment] = useState("Men's");
  const [projectedQuantity, setProjectedQuantity] = useState('');
  const [projectedDeliveryDate, setProjectedDeliveryDate] = useState<Date>(addDays(new Date(), 60));
  const [quotationDate, setQuotationDate] = useState<Date>(new Date());
  const [validUntil, setValidUntil] = useState<Date>(addDays(new Date(), 30));
  const [notes, setNotes] = useState('');
  const [workflowStatus, setWorkflowStatus] = useState('DRAFT');
  const [quotationNumber, setQuotationNumber] = useState('');

  // Pricing
  const [targetPrice, setTargetPrice] = useState('');
  const [targetCurrency, setTargetCurrency] = useState('USD');
  const [baseExchangeRate, setBaseExchangeRate] = useState('110.50');
  const [profitMargin, setProfitMargin] = useState('15');
  const [manualQuotedPrice, setManualQuotedPrice] = useState('');
  const [useManualPrice, setUseManualPrice] = useState(false);

  // Live rates state
  const [liveRates, setLiveRates] = useState<Record<string, number>>({});
  const [fetchingRates, setFetchingRates] = useState(false);
  const [rateSource, setRateSource] = useState('');

  // Tables
  const [materials, setMaterials] = useState<MaterialRow[]>([emptyMaterial()]);
  const [manufacturing, setManufacturing] = useState<MfgRow[]>([emptyMfg()]);
  const [otherCosts, setOtherCosts] = useState<OtherCostRow[]>([]);

  // Size ratio
  const [sizeRatioEnabled, setSizeRatioEnabled] = useState(false);
  const [sizeRatios, setSizeRatios] = useState<SizeRatioRow[]>([
    emptySizeRatio('S', '25'), emptySizeRatio('M', '25'),
    emptySizeRatio('L', '25'), emptySizeRatio('XL', '25'),
  ]);
  const [packRatio, setPackRatio] = useState('');
  const [pcsPerCarton, setPcsPerCarton] = useState('');
  const [sizeRatioCollapsed, setSizeRatioCollapsed] = useState(false);

  // Email dialog
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailName, setEmailName] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Load existing quotation
  const { data: existingQuotation, isLoading: loadingQuotation } = useQuery({
    queryKey: ['/api/quotations', quotationDbId],
    enabled: isEditing && !!quotationDbId,
  });

  // Load customers
  const { data: customersData } = useQuery({ queryKey: ['/api/customers'] });
  const customers: any[] = Array.isArray(customersData) ? customersData : (customersData as any)?.customers || [];

  // Load inquiries
  const { data: inquiriesData } = useQuery({ queryKey: ['/api/inquiries'] });
  const inquiries: any[] = Array.isArray(inquiriesData) ? inquiriesData : (inquiriesData as any)?.inquiries || [];

  // Load item categories
  const { data: categoriesData } = useQuery({ queryKey: ['/api/item-categories'] });
  const categories: any[] = Array.isArray(categoriesData) ? categoriesData : [];

  // Load items
  const { data: itemsData } = useQuery({ queryKey: ['/api/items'] });
  const items: any[] = Array.isArray(itemsData) ? itemsData : (itemsData as any)?.items || [];

  // Load item units for mapping unitId → name
  const { data: itemUnitsData } = useQuery({ queryKey: ['/api/item-units'] });
  const itemUnits: any[] = Array.isArray(itemUnitsData) ? itemUnitsData : [];
  const unitNameById = (unitId: number) => {
    const u = itemUnits.find((x: any) => x.id === unitId);
    return u?.name || u?.abbreviation || '';
  };

  // Add New Item dialog state
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemRowIdx, setAddItemRowIdx] = useState<number>(0);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategoryId, setNewItemCategoryId] = useState<number | null>(null);
  const [newItemUnitId, setNewItemUnitId] = useState<number | null>(null);
  const [newItemCost, setNewItemCost] = useState('');
  const [creatingItem, setCreatingItem] = useState(false);

  // Material item combobox open state per row
  const [openCombobox, setOpenCombobox] = useState<number | null>(null);

  // Populate form from existing quotation
  useEffect(() => {
    if (!existingQuotation || !isEditing) return;
    const q = existingQuotation as any;
    setCustomerId(q.customerId || 0);
    setInquiryId(q.inquiryId || null);
    setStyleName(q.styleName || '');
    setDepartment(q.department || "Men's");
    setProjectedQuantity(String(q.projectedQuantity || ''));
    if (q.projectedDeliveryDate) setProjectedDeliveryDate(new Date(q.projectedDeliveryDate));
    if (q.quotationDate) setQuotationDate(new Date(q.quotationDate));
    if (q.validUntil) setValidUntil(new Date(q.validUntil));
    setNotes(q.notes || '');
    setWorkflowStatus(q.workflowStatus || 'DRAFT');
    setQuotationNumber(q.quotationId || '');
    setTargetPrice(q.targetPrice || '');
    setTargetCurrency(q.targetPriceCurrency || 'USD');
    setBaseExchangeRate(q.exchangeRate || '110.50');
    setProfitMargin(String(q.profitPercentage || '15'));
    if (q.quotedPrice && Number(q.quotedPrice) > 0) {
      setManualQuotedPrice(String(q.quotedPrice));
    }
    setSizeRatioEnabled(q.sizeRatioEnabled || false);
    setPackRatio(q.packRatio || '');
    setPcsPerCarton(String(q.pcsPerCarton || ''));

    if (q.materials?.length > 0) {
      setMaterials(q.materials.map((m: any) => ({
        id: m.id,
        categoryId: m.categoryId || null,
        subcategoryId: m.subcategoryId || null,
        itemId: m.itemId || null,
        description: m.description || '',
        unit: m.unit || 'Yard',
        consumptionPerDozen: String(m.consumptionPerDozen || ''),
        unitPrice: String(m.unitPrice || ''),
        currency: m.currency || 'BDT',
        exchangeRate: String(m.exchangeRate || '1'),
        amountPerDozen: String(m.amountPerDozen || '0'),
        totalAmount: String(m.totalAmount || '0'),
        baseAmount: String(m.baseAmount || '0'),
        localAmount: String(m.localAmount || '0'),
      })));
    }
    if (q.manufacturing?.length > 0) {
      setManufacturing(q.manufacturing.map((m: any) => ({
        id: m.id,
        stylePart: m.stylePart || '',
        machinesRequired: String(m.machinesRequired || ''),
        productionPerHour: String(m.productionPerHour || ''),
        productionPerDay: String(m.productionPerDay || ''),
        costPerMachine: String(m.costPerMachine || ''),
        totalLineCost: String(m.totalLineCost || ''),
        costPerDozen: String(m.costPerDozen || ''),
        cmPerPiece: String(m.cmPerPiece || ''),
        totalOrderCost: String(m.totalOrderCost || ''),
        currency: m.currency || 'BDT',
        exchangeRate: String(m.exchangeRate || '1'),
      })));
    }
    if (q.otherCosts?.length > 0) {
      setOtherCosts(q.otherCosts.map((c: any) => ({
        id: c.id,
        costHead: c.costHead || '',
        costType: c.costType || 'fixed',
        value: String(c.value || c.percentage || ''),
        basedOn: c.basedOn || 'subtotal',
        calculatedAmount: String(c.calculatedAmount || c.totalAmount || '0'),
        notes: c.notes || '',
        currency: c.currency || 'BDT',
        exchangeRate: String(c.exchangeRate || '1'),
      })));
    }
    if (q.sizeRatios?.length > 0) {
      setSizeRatios(q.sizeRatios.map((sr: any) => ({
        size: sr.size,
        ratioPercentage: String(sr.ratioPercentage || '0'),
        quantity: String(sr.quantity || '0'),
        fabricFactor: String(sr.fabricFactor || '1.0'),
      })));
    }
  }, [existingQuotation, isEditing]);

  // Pre-populate from inquiry URL param
  useEffect(() => {
    if (inquiryIdFromUrl && !isEditing) {
      const inqId = Number(inquiryIdFromUrl);
      setInquiryId(inqId);
      const inq = inquiries.find((i: any) => i.id === inqId);
      if (inq) {
        if (inq.customerId) setCustomerId(inq.customerId);
        if (inq.styleName) setStyleName(inq.styleName);
        if (inq.department) setDepartment(inq.department);
        if (inq.projectedQuantity) setProjectedQuantity(String(inq.projectedQuantity));
        if (inq.projectedDeliveryDate) setProjectedDeliveryDate(new Date(inq.projectedDeliveryDate));
        if (inq.targetPrice) setTargetPrice(inq.targetPrice);
      }
    }
  }, [inquiryIdFromUrl, inquiries, isEditing]);

  // Fetch live exchange rates
  const fetchLiveRates = async () => {
    setFetchingRates(true);
    try {
      const res = await fetch('/api/currency/live-rates?base=USD', { credentials: 'include' });
      const data = await res.json();
      if (data.rates) {
        setLiveRates(data.rates);
        setRateSource(data.live ? 'live' : 'fallback');
        // Update current base exchange rate if target currency is USD
        if (targetCurrency === 'USD' && data.rates.BDT) {
          setBaseExchangeRate(String(data.rates.BDT));
        } else if (data.rates[targetCurrency] && data.rates.BDT) {
          const bdtPerTarget = data.rates.BDT / data.rates[targetCurrency];
          setBaseExchangeRate(bdtPerTarget.toFixed(4));
        }
        // Update material rows exchange rates
        setMaterials(prev => prev.map(m => {
          if (m.currency === 'BDT') return { ...m, exchangeRate: '1' };
          const bdtRate = data.rates[m.currency] ? data.rates.BDT / data.rates[m.currency] : Number(m.exchangeRate);
          return { ...m, exchangeRate: bdtRate.toFixed(4) };
        }));
        toast({ title: `Exchange rates ${data.live ? 'fetched live' : 'loaded (fallback)'}`, description: `1 USD = ৳${data.rates.BDT?.toFixed(2) || '?'}` });
      }
    } catch (e) {
      toast({ title: 'Failed to fetch rates', variant: 'destructive' });
    } finally {
      setFetchingRates(false);
    }
  };

  const recalcMaterial = (row: MaterialRow): MaterialRow => {
    const cons = parseFloat(row.consumptionPerDozen) || 0;
    const price = parseFloat(row.unitPrice) || 0;
    const rate = row.currency === 'BDT' ? 1 : (parseFloat(row.exchangeRate) || 110.5);
    const amtPerDzCurr = cons * price;
    const amtPerDzBDT = amtPerDzCurr * rate;
    return {
      ...row,
      amountPerDozen: amtPerDzBDT.toFixed(2),
      baseAmount: amtPerDzCurr.toFixed(2),
    };
  };

  const updateMaterial = (idx: number, field: keyof MaterialRow, val: any) => {
    setMaterials(prev => {
      const updated = [...prev];
      updated[idx] = recalcMaterial({ ...updated[idx], [field]: val });
      return updated;
    });
  };

  const getMatRowTotal = (m: MaterialRow, dzns: number) => (parseFloat(m.amountPerDozen) || 0) * dzns;

  // Auto-calc manufacturing
  const recalcMfg = (row: MfgRow): MfgRow => {
    const machines = parseFloat(row.machinesRequired) || 0;
    const prodHr = parseFloat(row.productionPerHour) || 0;
    const costMach = parseFloat(row.costPerMachine) || 0;
    const hoursPerDay = 8;
    const prodDay = prodHr * hoursPerDay;
    const totalLineCost = machines * costMach;
    const qty = parseFloat(projectedQuantity) || 1;
    const costPerDozen = prodDay > 0 ? (totalLineCost / (prodDay / 12)) : 0;
    const cmPerPiece = costPerDozen / 12;
    const totalOrderCost = cmPerPiece * qty;
    return {
      ...row,
      productionPerDay: prodDay.toFixed(0),
      totalLineCost: totalLineCost.toFixed(2),
      costPerDozen: costPerDozen.toFixed(2),
      cmPerPiece: cmPerPiece.toFixed(2),
      totalOrderCost: totalOrderCost.toFixed(2),
    };
  };

  const updateMfg = (idx: number, field: keyof MfgRow, val: string) => {
    setManufacturing(prev => {
      const updated = [...prev];
      updated[idx] = recalcMfg({ ...updated[idx], [field]: val });
      return updated;
    });
  };

  // Auto-calc other cost
  const recalcOtherCost = (row: OtherCostRow, matTotal: number, cmTotal: number): OtherCostRow => {
    const val = parseFloat(row.value) || 0;
    let base = 0;
    if (row.basedOn === 'material') base = matTotal;
    else if (row.basedOn === 'cm') base = cmTotal;
    else base = matTotal + cmTotal;
    const calc = row.costType === 'percentage' ? (base * val / 100) : val;
    return { ...row, calculatedAmount: calc.toFixed(2) };
  };

  // Totals — derived at render time so they always reflect current projectedQuantity
  const qty = parseFloat(projectedQuantity) || 0;
  const dozens = qty / 12;
  const matSubtotal = materials.reduce((s, m) => s + getMatRowTotal(m, dozens), 0);
  const cmSubtotal = manufacturing.reduce((s, m) => s + (parseFloat(m.totalOrderCost) || 0), 0);
  const otherSubtotal = otherCosts.reduce((s, c) => s + (parseFloat(c.calculatedAmount) || 0), 0);
  const grandTotal = matSubtotal + cmSubtotal + otherSubtotal;
  const profitAmt = grandTotal * (parseFloat(profitMargin) || 0) / 100;
  const calcQuotedPrice = grandTotal + profitAmt;
  const quotedPrice = useManualPrice ? (parseFloat(manualQuotedPrice) || 0) : calcQuotedPrice;
  const quotedPerPiece = qty > 0 ? quotedPrice / qty : 0;
  const quotedPerDozen = dozens > 0 ? quotedPrice / dozens : 0;
  const exchRate = parseFloat(baseExchangeRate) || 110.5;
  const quotedInTargetCurrency = exchRate > 0 ? quotedPerPiece / exchRate : 0;
  const actualMargin = grandTotal > 0 ? ((quotedPrice - grandTotal) / quotedPrice) * 100 : 0;

  const updateOtherCost = (idx: number, field: keyof OtherCostRow, val: any) => {
    setOtherCosts(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: val };
      updated[idx] = recalcOtherCost(updated[idx], matSubtotal, cmSubtotal);
      return updated;
    });
  };

  // Recalculate all other costs when totals change
  useEffect(() => {
    setOtherCosts(prev => prev.map(c => recalcOtherCost(c, matSubtotal, cmSubtotal)));
  }, [matSubtotal, cmSubtotal]);

  // Size ratio helpers
  const weightedFabricFactor = sizeRatioEnabled
    ? sizeRatios.reduce((sum, sr) => sum + (parseFloat(sr.ratioPercentage) || 0) * (parseFloat(sr.fabricFactor) || 1.0) / 100, 0)
    : 1.0;

  const totalRatio = sizeRatios.reduce((s, r) => s + (parseFloat(r.ratioPercentage) || 0), 0);

  const applySizePreset = (preset: 'equal' | 'pyramid' | 'custom') => {
    if (preset === 'equal') {
      setSizeRatios([
        emptySizeRatio('S', '25'), emptySizeRatio('M', '25'),
        emptySizeRatio('L', '25'), emptySizeRatio('XL', '25'),
      ]);
    } else if (preset === 'pyramid') {
      setSizeRatios([
        emptySizeRatio('S', '15'), emptySizeRatio('M', '35'),
        emptySizeRatio('L', '35'), emptySizeRatio('XL', '15'),
      ]);
    }
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (statusOverride?: string) => {
      const payload = {
        customerId: customerId || undefined,
        inquiryId: inquiryId || null,
        styleName: styleName || 'Unnamed Style',
        department: department || "Men's",
        projectedQuantity: parseInt(projectedQuantity) || 0,
        projectedDeliveryDate: format(projectedDeliveryDate, 'yyyy-MM-dd'),
        quotationDate: format(quotationDate, 'yyyy-MM-dd'),
        validUntil: format(validUntil, 'yyyy-MM-dd'),
        targetPrice: targetPrice || '0',
        targetPriceCurrency: targetCurrency,
        exchangeRate: baseExchangeRate,
        profitPercentage: profitMargin,
        quotedPrice: quotedPrice.toFixed(2),
        materialCost: matSubtotal.toFixed(2),
        manufacturingCost: cmSubtotal.toFixed(2),
        otherCost: otherSubtotal.toFixed(2),
        totalCost: grandTotal.toFixed(2),
        costPerPiece: quotedPerPiece.toFixed(2),
        workflowStatus: statusOverride || workflowStatus,
        notes,
        sizeRatioEnabled,
        weightedFabricFactor: weightedFabricFactor.toFixed(4),
        packRatio: packRatio || null,
        pcsPerCarton: parseInt(pcsPerCarton) || null,
        materials: materials.filter(m => m.description || m.categoryId || m.itemId).map((m, i) => ({
          ...m,
          serialNo: i + 1,
          consumptionPerDozen: m.consumptionPerDozen || '0',
          unitPrice: m.unitPrice || '0',
          totalAmount: getMatRowTotal(m, dozens).toFixed(2),
          localAmount: getMatRowTotal(m, dozens).toFixed(2),
        })),
        manufacturing: manufacturing.filter(m => m.stylePart).map((m, i) => ({
          ...m,
          serialNo: i + 1,
        })),
        otherCosts: otherCosts.filter(c => c.costHead).map((c, i) => ({
          ...c,
          serialNo: i + 1,
          percentage: c.costType === 'percentage' ? c.value : '0',
          totalAmount: c.calculatedAmount,
        })),
        sizeRatios: sizeRatioEnabled ? sizeRatios.filter(s => s.size).map((s, i) => ({
          ...s,
          serialNo: i + 1,
        })) : [],
      };

      let res: Response;
      if (isEditing && quotationDbId) {
        res = await apiRequest(`/api/quotations/${quotationDbId}`, 'PUT', payload);
      } else {
        res = await apiRequest('/api/quotations', 'POST', payload);
      }
      return res.json();
    },
    onSuccess: async (data: any) => {
      qc.invalidateQueries({ queryKey: ['/api/quotations'] });
      if (!isEditing && inquiryId) {
        try {
          await apiRequest(`/api/inquiries/${inquiryId}/status`, 'PATCH', { status: 'quotation_sent' });
          qc.invalidateQueries({ queryKey: ['/api/inquiries'] });
        } catch (e) {}
      }
      toast({ title: isEditing ? 'Quotation saved' : 'Quotation created', description: data?.quotationId || '' });
      if (!isEditing && data?.id) {
        navigate(`/quotations/${data.id}`);
      }
    },
    onError: (err: any) => {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    },
  });

  const handleWorkflowAction = async (action: 'submit' | 'approve' | 'send') => {
    const statusMap = { submit: 'SUBMITTED', approve: 'APPROVED', send: 'SENT' };
    saveMutation.mutate(statusMap[action]);
  };

  const handlePrint = () => window.print();

  const handleDownloadPdf = () => {
    if (!quotationDbId) {
      toast({ title: 'Save first before downloading PDF', variant: 'destructive' });
      return;
    }
    window.open(`/api/quotations/${quotationDbId}/pdf`, '_blank');
  };

  const handleSendEmail = async () => {
    if (!quotationDbId) {
      toast({ title: 'Save first before sending email', variant: 'destructive' });
      return;
    }
    setSendingEmail(true);
    try {
      await apiRequest(`/api/quotations/${quotationDbId}/send-email`, 'POST', {
        toEmail: emailTo,
        toName: emailName,
        message: emailMessage,
      });
      toast({ title: 'Email sent successfully' });
      setEmailDialogOpen(false);
      setWorkflowStatus('SENT');
    } catch (e: any) {
      toast({ title: 'Failed to send email', description: String(e), variant: 'destructive' });
    } finally {
      setSendingEmail(false);
    }
  };

  // Handle selecting an item from the combobox
  const handleSelectItem = (rowIdx: number, item: any) => {
    const unitName = item.unitId ? unitNameById(item.unitId) : 'Pcs';
    const mappedUnit = ['Yard','Meter','Kg','Gram','Pcs','Liter','Set','Roll','Dozen'].find(
      u => u.toLowerCase() === unitName.toLowerCase()
    ) || 'Pcs';
    setMaterials(prev => {
      const updated = [...prev];
      updated[rowIdx] = recalcMaterial({
        ...updated[rowIdx],
        itemId: item.id,
        description: item.name,
        unit: mappedUnit,
        categoryId: item.categoryId || updated[rowIdx].categoryId,
        subcategoryId: item.subcategoryId || updated[rowIdx].subcategoryId,
        unitPrice: item.defaultCost && parseFloat(item.defaultCost) > 0 ? String(item.defaultCost) : (item.defaultPrice && parseFloat(item.defaultPrice) > 0 ? String(item.defaultPrice) : updated[rowIdx].unitPrice),
      });
      return updated;
    });
    setOpenCombobox(null);
  };

  // Handle creating a new item from the dialog
  const handleCreateItem = async () => {
    if (!newItemName || !newItemCategoryId || !newItemUnitId) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    setCreatingItem(true);
    try {
      const res = await apiRequest('/api/items', 'POST', {
        name: newItemName,
        categoryId: newItemCategoryId,
        unitId: newItemUnitId,
        defaultCost: newItemCost || '0',
        type: 'standard',
      });
      const newItem = await res.json();
      qc.invalidateQueries({ queryKey: ['/api/items'] });
      handleSelectItem(addItemRowIdx, newItem);
      toast({ title: 'Item created and added' });
      setAddItemOpen(false);
      setNewItemName('');
      setNewItemCost('');
    } catch (e: any) {
      toast({ title: 'Failed to create item', description: String(e), variant: 'destructive' });
    } finally {
      setCreatingItem(false);
    }
  };

  // Quick-add other cost presets
  const addPresetCost = (head: string, type: 'fixed' | 'percentage', val: string, basedOn: 'subtotal' | 'material' | 'cm' = 'subtotal') => {
    const row: OtherCostRow = {
      costHead: head, costType: type, value: val, basedOn,
      calculatedAmount: '0', notes: '', currency: 'BDT', exchangeRate: '1',
    };
    setOtherCosts(prev => [...prev, recalcOtherCost(row, matSubtotal, cmSubtotal)]);
  };

  if (loadingQuotation) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>;
  }

  const statusBadgeClass = STATUS_COLORS[workflowStatus] || 'bg-gray-100 text-gray-700';

  return (
    <div className="quotation-form-container max-w-7xl mx-auto px-4 py-6 space-y-6">

      {/* ===== SECTION A: Header Bar ===== */}
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/quotations')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {isEditing ? `Edit Quotation ${quotationNumber ? `— ${quotationNumber}` : ''}` : 'New Quotation'}
            </h1>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass}`}>
              {workflowStatus}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {workflowStatus === 'DRAFT' && (
            <Button size="sm" variant="outline" onClick={() => handleWorkflowAction('submit')} disabled={saveMutation.isPending}>
              Submit for Review
            </Button>
          )}
          {workflowStatus === 'SUBMITTED' && (
            <Button size="sm" variant="outline" className="border-green-500 text-green-700" onClick={() => handleWorkflowAction('approve')} disabled={saveMutation.isPending}>
              Approve
            </Button>
          )}
          {(workflowStatus === 'APPROVED' || workflowStatus === 'SENT') && (
            <>
              <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />Print</Button>
              <Button size="sm" variant="outline" onClick={handleDownloadPdf}><FileText className="h-4 w-4 mr-1" />PDF</Button>
              <Button size="sm" variant="outline" onClick={() => setEmailDialogOpen(true)}><Mail className="h-4 w-4 mr-1" />Email</Button>
            </>
          )}
          {isEditing && (
            <>
              <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />Print</Button>
              <Button size="sm" variant="outline" onClick={handleDownloadPdf}><FileText className="h-4 w-4 mr-1" />PDF</Button>
              <Button size="sm" variant="outline" onClick={() => setEmailDialogOpen(true)}><Mail className="h-4 w-4 mr-1" />Email</Button>
            </>
          )}
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-orange-500 hover:bg-orange-600 text-white">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save Draft
          </Button>
        </div>
      </div>

      {/* Print-only header — matches PDF style */}
      <div className="hidden print:block print-header mb-4">
        <div className="print-orange-banner" style={{ background: '#F97316', color: 'white', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>{tenantInfo.companyName || 'COST QUOTATION'}</h1>
            {(tenantInfo.companyAddress || tenantInfo.companyPhone || tenantInfo.companyEmail) && (
              <p style={{ fontSize: '7px', margin: '2px 0 0 0', opacity: 0.85 }}>
                {[tenantInfo.companyAddress, tenantInfo.companyPhone, tenantInfo.companyEmail].filter(Boolean).join('  |  ')}
              </p>
            )}
            <p style={{ fontSize: '8px', margin: '2px 0 0 0', opacity: 0.9 }}>Garment Cost Quotation</p>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div>
              <p style={{ fontSize: '12px', fontWeight: 'bold', margin: 0 }}>{quotationNumber || 'NEW'}</p>
              <span style={{ fontSize: '9px', background: 'rgba(255,255,255,0.2)', padding: '1px 8px', borderRadius: '3px' }}>{workflowStatus}</span>
            </div>
            <QRCode value={`${window.location.origin}/verify/quotation/${quotationNumber || 'NEW'}`} size={40} bgColor="transparent" fgColor="white" level="L" />
          </div>
        </div>
      </div>

      {/* ===== SECTION B: Quotation Header ===== */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base font-semibold text-gray-700">Quotation Details</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Customer *</Label>
              <Select value={customerId ? String(customerId) : ''} onValueChange={v => setCustomerId(Number(v))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.customerName || c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Inquiry Reference</Label>
              <Select value={inquiryId ? String(inquiryId) : 'none'} onValueChange={v => {
                if (v === 'none') {
                  setInquiryId(null);
                } else {
                  const selectedId = Number(v);
                  setInquiryId(selectedId);
                  const inq = inquiries.find((i: any) => i.id === selectedId);
                  if (inq) {
                    if (inq.customerId) setCustomerId(inq.customerId);
                    if (inq.styleName) setStyleName(inq.styleName);
                    if (inq.department) setDepartment(inq.department);
                    if (inq.projectedQuantity) setProjectedQuantity(String(inq.projectedQuantity));
                    if (inq.projectedDeliveryDate) setProjectedDeliveryDate(new Date(inq.projectedDeliveryDate));
                    if (inq.targetPrice) setTargetPrice(String(inq.targetPrice));
                  }
                }
              }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Link to inquiry (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {inquiries.map((i: any) => (
                    <SelectItem key={i.id} value={String(i.id)}>{i.inquiryId} — {i.styleName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Style / Product Name *</Label>
              <Input className="h-9" value={styleName} onChange={e => setStyleName(e.target.value)} placeholder="e.g. Men's Polo Shirt" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Department *</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Projected Quantity (Pcs) *</Label>
              <Input className="h-9" type="number" value={projectedQuantity} onChange={e => setProjectedQuantity(e.target.value)} placeholder="e.g. 12000" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Delivery Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-9 w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {projectedDeliveryDate ? format(projectedDeliveryDate, 'MMM dd, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={projectedDeliveryDate} onSelect={d => d && setProjectedDeliveryDate(d)} /></PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Quotation Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-9 w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {quotationDate ? format(quotationDate, 'MMM dd, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={quotationDate} onSelect={d => d && setQuotationDate(d)} /></PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Valid Until</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-9 w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {validUntil ? format(validUntil, 'MMM dd, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={validUntil} onSelect={d => d && setValidUntil(d)} /></PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== SECTION C: Pricing Basis ===== */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base font-semibold text-gray-700">Pricing Basis</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Target Price</Label>
              <div className="flex gap-1">
                <Input className="h-9 flex-1" type="number" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="0.00" />
                <Select value={targetCurrency} onValueChange={setTargetCurrency}>
                  <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {targetPrice && exchRate > 0 && (
                <p className="text-xs text-gray-500 mt-1">≈ ৳{fmtNum(parseFloat(targetPrice) * exchRate)}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Exchange Rate (BDT per {targetCurrency})</Label>
              <div className="flex gap-1">
                <Input className="h-9 flex-1" type="number" value={baseExchangeRate} onChange={e => setBaseExchangeRate(e.target.value)} placeholder="110.50" />
                <Button variant="outline" size="sm" className="h-9 px-2 shrink-0" onClick={fetchLiveRates} disabled={fetchingRates} title="Fetch live rate">
                  {fetchingRates ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
              {rateSource && <p className="text-xs text-gray-500 mt-1">{rateSource === 'live' ? '✓ Live rate' : '⚠ Fallback rate'}</p>}
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Profit Margin %</Label>
              <Input className="h-9" type="number" value={profitMargin} onChange={e => setProfitMargin(e.target.value)} placeholder="15" />
              <p className="text-xs text-gray-500 mt-1">≈ ৳{fmtNum(profitAmt)} profit</p>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Manual Price Override</Label>
              <div className="flex gap-2 items-center">
                <Switch checked={useManualPrice} onCheckedChange={setUseManualPrice} />
                <Input className="h-9 flex-1" type="number" value={manualQuotedPrice} onChange={e => setManualQuotedPrice(e.target.value)} disabled={!useManualPrice} placeholder="Auto" />
              </div>
              {useManualPrice && (
                <p className="text-xs text-orange-600 mt-1">Margin: {fmtNum(actualMargin, 1)}%</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== SECTION D: Size Ratio ===== */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base font-semibold text-gray-700">Size Ratio & Packaging</CardTitle>
              <Switch checked={sizeRatioEnabled} onCheckedChange={setSizeRatioEnabled} />
              {sizeRatioEnabled && (
                <Badge variant="outline" className="text-xs">
                  Weighted Factor: {weightedFabricFactor.toFixed(3)} | Ratio Total: {fmtNum(totalRatio, 0)}%
                </Badge>
              )}
            </div>
            {sizeRatioEnabled && (
              <Button variant="ghost" size="sm" onClick={() => setSizeRatioCollapsed(!sizeRatioCollapsed)}>
                {sizeRatioCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </CardHeader>
        {sizeRatioEnabled && !sizeRatioCollapsed && (
          <CardContent className="pt-3">
            <div className="flex gap-2 mb-3 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => applySizePreset('equal')}>S/M/L/XL Equal (25% each)</Button>
              <Button size="sm" variant="outline" onClick={() => applySizePreset('pyramid')}>Standard Pyramid (15/35/35/15)</Button>
              <Button size="sm" variant="outline" onClick={() => setSizeRatios(prev => [...prev, emptySizeRatio('', '0')])}>
                <Plus className="h-3 w-3 mr-1" />Add Size
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-y">
                    <th className="text-left py-2 px-3 text-xs text-gray-600">Size</th>
                    <th className="text-left py-2 px-3 text-xs text-gray-600">Ratio %</th>
                    <th className="text-left py-2 px-3 text-xs text-gray-600">Qty (Pcs)</th>
                    <th className="text-left py-2 px-3 text-xs text-gray-600">Fabric Factor</th>
                    <th className="py-2 px-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {sizeRatios.map((sr, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="py-1.5 px-3">
                        <Input className="h-7 w-16" value={sr.size} onChange={e => setSizeRatios(prev => { const u = [...prev]; u[i] = {...u[i], size: e.target.value}; return u; })} />
                      </td>
                      <td className="py-1.5 px-3">
                        <Input className="h-7 w-20" type="number" value={sr.ratioPercentage} onChange={e => {
                          const pct = e.target.value;
                          setSizeRatios(prev => {
                            const u = [...prev];
                            const qty2 = Math.round(parseFloat(projectedQuantity || '0') * parseFloat(pct || '0') / 100);
                            u[i] = {...u[i], ratioPercentage: pct, quantity: String(qty2)};
                            return u;
                          });
                        }} />
                      </td>
                      <td className="py-1.5 px-3">
                        <Input className="h-7 w-24" type="number" value={sr.quantity} onChange={e => setSizeRatios(prev => { const u = [...prev]; u[i] = {...u[i], quantity: e.target.value}; return u; })} />
                      </td>
                      <td className="py-1.5 px-3">
                        <Input className="h-7 w-20" type="number" step="0.01" value={sr.fabricFactor} onChange={e => setSizeRatios(prev => { const u = [...prev]; u[i] = {...u[i], fabricFactor: e.target.value}; return u; })} />
                      </td>
                      <td className="py-1.5 px-2">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => setSizeRatios(prev => prev.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-3 border-t">
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Pack Ratio (e.g. 2:3:3:2)</Label>
                <Input className="h-8" value={packRatio} onChange={e => setPackRatio(e.target.value)} placeholder="2:3:3:2" />
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Pcs per Carton</Label>
                <Input className="h-8" type="number" value={pcsPerCarton} onChange={e => setPcsPerCarton(e.target.value)} placeholder="12" />
              </div>
              {pcsPerCarton && qty > 0 && (
                <div className="flex items-end">
                  <p className="text-sm text-gray-600">
                    Total Cartons: <strong>{Math.ceil(qty / parseFloat(pcsPerCarton))}</strong>
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ===== SECTION E: Materials Cost Table ===== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-gray-700">
              Materials Cost
              <span className="ml-2 text-sm font-normal text-gray-500">Subtotal: <span className="text-orange-600 font-semibold">৳{fmtNum(matSubtotal)}</span></span>
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setMaterials(prev => [...prev, emptyMaterial()])}>
              <Plus className="h-4 w-4 mr-1" />Add Material
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-800 text-white">
                  <th className="text-left py-2 px-3 text-xs w-8">#</th>
                  <th className="text-left py-2 px-3 text-xs">Category</th>
                  <th className="text-left py-2 px-3 text-xs">Material / Description</th>
                  <th className="text-left py-2 px-3 text-xs">Unit</th>
                  <th className="text-left py-2 px-3 text-xs">Cons/Dz</th>
                  <th className="text-left py-2 px-3 text-xs">Unit Price</th>
                  <th className="text-left py-2 px-3 text-xs">Currency</th>
                  <th className="text-left py-2 px-3 text-xs">Rate→৳</th>
                  <th className="text-right py-2 px-3 text-xs">Amt/Dz (৳)</th>
                  <th className="text-right py-2 px-3 text-xs">Total (৳)</th>
                  <th className="text-right py-2 px-3 text-xs">%</th>
                  <th className="py-2 px-2 text-xs w-8"></th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m, i) => (
                  <tr key={i} className={`border-b hover:bg-orange-50 ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                    <td className="py-1.5 px-3 text-xs text-gray-500">{i + 1}</td>
                    <td className="py-1.5 px-2">
                      <Select value={m.categoryId ? String(m.categoryId) : 'none'} onValueChange={v => updateMaterial(i, 'categoryId', v === 'none' ? null : Number(v))}>
                        <SelectTrigger className="h-7 text-xs w-28"><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {categories.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-2">
                      <Popover open={openCombobox === i} onOpenChange={open => setOpenCombobox(open ? i : null)}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openCombobox === i}
                            aria-label={`Material description row ${i+1}`}
                            data-testid={`mat-desc-${i}`}
                            className="h-7 text-xs w-44 justify-between font-normal truncate px-2"
                          >
                            <span className="truncate">{m.description || 'Select item...'}</span>
                            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search items..." className="h-8 text-xs" />
                            <CommandList>
                              <CommandEmpty>
                                <span className="text-xs text-gray-500">No items found</span>
                              </CommandEmpty>
                              <CommandGroup>
                                {items
                                  .filter((item: any) => !m.categoryId || item.categoryId === m.categoryId)
                                  .map((item: any) => (
                                    <CommandItem
                                      key={item.id}
                                      value={item.name}
                                      onSelect={() => handleSelectItem(i, item)}
                                      className="text-xs"
                                    >
                                      <Check className={`mr-1 h-3 w-3 ${m.itemId === item.id ? 'opacity-100' : 'opacity-0'}`} />
                                      <span className="truncate">{item.name}</span>
                                      <span className="ml-auto text-[10px] text-gray-400">{item.itemCode}</span>
                                    </CommandItem>
                                  ))
                                }
                              </CommandGroup>
                              <CommandGroup>
                                <CommandItem
                                  onSelect={() => {
                                    setAddItemRowIdx(i);
                                    setNewItemCategoryId(m.categoryId);
                                    setNewItemName('');
                                    setNewItemCost('');
                                    setNewItemUnitId(null);
                                    setAddItemOpen(true);
                                    setOpenCombobox(null);
                                  }}
                                  className="text-xs text-orange-600 font-medium"
                                >
                                  <PackagePlus className="mr-1 h-3 w-3" />
                                  Add New Item
                                </CommandItem>
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </td>
                    <td className="py-1.5 px-2">
                      <Select value={m.unit} onValueChange={v => updateMaterial(i, 'unit', v)}>
                        <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['Yard','Meter','Kg','Gram','Pcs','Liter','Set','Roll','Dozen'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-2">
                      <Input aria-label={`Cons/Dz row ${i+1}`} data-testid={`mat-cons-${i}`} className="h-7 text-xs w-20" type="number" step="0.001" value={m.consumptionPerDozen} onChange={e => updateMaterial(i, 'consumptionPerDozen', e.target.value)} placeholder="0.000" />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input aria-label={`Unit Price row ${i+1}`} data-testid={`mat-price-${i}`} className="h-7 text-xs w-20" type="number" step="0.01" value={m.unitPrice} onChange={e => updateMaterial(i, 'unitPrice', e.target.value)} placeholder="0.00" />
                    </td>
                    <td className="py-1.5 px-2">
                      <Select value={m.currency} onValueChange={v => {
                        const rate = v === 'BDT' ? '1' : (liveRates[v] && liveRates.BDT ? (liveRates.BDT / liveRates[v]).toFixed(4) : m.exchangeRate);
                        setMaterials(prev => {
                          const u = [...prev];
                          u[i] = recalcMaterial({ ...u[i], currency: v, exchangeRate: rate });
                          return u;
                        });
                      }}>
                        <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-2">
                      {m.currency === 'BDT' ? (
                        <span className="text-xs text-gray-400 px-2">—</span>
                      ) : (
                        <Input className="h-7 text-xs w-20" type="number" step="0.01" value={m.exchangeRate} onChange={e => updateMaterial(i, 'exchangeRate', e.target.value)} />
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right text-xs font-mono">
                      {fmtNum(m.amountPerDozen)}
                      {m.currency !== 'BDT' && (
                        <div className="text-gray-400">{sym(m.currency)}{fmtNum(parseFloat(m.consumptionPerDozen || '0') * parseFloat(m.unitPrice || '0'))}</div>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right text-xs font-mono font-semibold">
                      ৳{fmtNum(getMatRowTotal(m, dozens))}
                    </td>
                    <td className="py-1.5 px-3 text-right text-xs text-gray-500">
                      {matSubtotal > 0 ? fmtNum((getMatRowTotal(m, dozens) / matSubtotal) * 100, 1) + '%' : '—'}
                    </td>
                    <td className="py-1.5 px-2">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => setMaterials(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-orange-50 border-t-2 border-orange-200">
                  <td colSpan={8} className="py-2 px-3 text-xs font-semibold text-gray-700">Materials Subtotal</td>
                  <td className="py-2 px-3 text-right text-sm font-bold text-orange-700">৳{fmtNum(matSubtotal)}</td>
                  <td className="py-2 px-3 text-right text-xs text-gray-500">{grandTotal > 0 ? fmtNum((matSubtotal / grandTotal) * 100, 1) + '%' : '—'}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="p-3">
            <Button size="sm" variant="outline" onClick={() => setMaterials(prev => [...prev, emptyMaterial()])}>
              <Plus className="h-3 w-3 mr-1" />Add Material Row
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ===== SECTION F: CM / Manufacturing ===== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-gray-700">
              CM / Manufacturing Cost
              <span className="ml-2 text-sm font-normal text-gray-500">Subtotal: <span className="text-orange-600 font-semibold">৳{fmtNum(cmSubtotal)}</span></span>
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setManufacturing(prev => [...prev, emptyMfg()])}>
              <Plus className="h-4 w-4 mr-1" />Add CM Row
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-800 text-white">
                  <th className="text-left py-2 px-3 text-xs w-8">#</th>
                  <th className="text-left py-2 px-3 text-xs">Style Part</th>
                  <th className="text-left py-2 px-3 text-xs">Machines</th>
                  <th className="text-left py-2 px-3 text-xs">Prod/Hr</th>
                  <th className="text-left py-2 px-3 text-xs">Prod/Day</th>
                  <th className="text-left py-2 px-3 text-xs">Cost/Machine (৳)</th>
                  <th className="text-right py-2 px-3 text-xs">Total Line (৳)</th>
                  <th className="text-right py-2 px-3 text-xs">CM/Dz (৳)</th>
                  <th className="text-right py-2 px-3 text-xs">CM/Pc (৳)</th>
                  <th className="text-right py-2 px-3 text-xs">Total (৳)</th>
                  <th className="text-right py-2 px-3 text-xs">%</th>
                  <th className="py-2 px-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {manufacturing.map((m, i) => (
                  <tr key={i} className={`border-b hover:bg-orange-50 ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                    <td className="py-1.5 px-3 text-xs text-gray-500">{i + 1}</td>
                    <td className="py-1.5 px-2"><Input className="h-7 text-xs w-28" value={m.stylePart} onChange={e => updateMfg(i, 'stylePart', e.target.value)} placeholder="e.g. Body" /></td>
                    <td className="py-1.5 px-2"><Input className="h-7 text-xs w-16" type="number" value={m.machinesRequired} onChange={e => updateMfg(i, 'machinesRequired', e.target.value)} placeholder="0" /></td>
                    <td className="py-1.5 px-2"><Input className="h-7 text-xs w-20" type="number" value={m.productionPerHour} onChange={e => updateMfg(i, 'productionPerHour', e.target.value)} placeholder="0" /></td>
                    <td className="py-1.5 px-2 text-xs text-gray-600 font-mono">{m.productionPerDay || '—'}</td>
                    <td className="py-1.5 px-2"><Input className="h-7 text-xs w-24" type="number" value={m.costPerMachine} onChange={e => updateMfg(i, 'costPerMachine', e.target.value)} placeholder="0.00" /></td>
                    <td className="py-1.5 px-3 text-right text-xs font-mono">{fmtNum(m.totalLineCost)}</td>
                    <td className="py-1.5 px-3 text-right text-xs font-mono">{fmtNum(m.costPerDozen)}</td>
                    <td className="py-1.5 px-3 text-right text-xs font-mono font-semibold">{fmtNum(m.cmPerPiece)}</td>
                    <td className="py-1.5 px-3 text-right text-xs font-mono font-semibold text-orange-700">৳{fmtNum(m.totalOrderCost)}</td>
                    <td className="py-1.5 px-3 text-right text-xs text-gray-500">
                      {cmSubtotal > 0 ? fmtNum((parseFloat(m.totalOrderCost) / cmSubtotal) * 100, 1) + '%' : '—'}
                    </td>
                    <td className="py-1.5 px-2">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => setManufacturing(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-orange-50 border-t-2 border-orange-200">
                  <td colSpan={9} className="py-2 px-3 text-xs font-semibold text-gray-700">CM Subtotal</td>
                  <td className="py-2 px-3 text-right text-sm font-bold text-orange-700">৳{fmtNum(cmSubtotal)}</td>
                  <td className="py-2 px-3 text-right text-xs text-gray-500">{grandTotal > 0 ? fmtNum((cmSubtotal / grandTotal) * 100, 1) + '%' : '—'}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="p-3">
            <Button size="sm" variant="outline" onClick={() => setManufacturing(prev => [...prev, emptyMfg()])}>
              <Plus className="h-3 w-3 mr-1" />Add CM Row
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ===== SECTION G: Commercial / Other Costs ===== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-gray-700">
              Commercial / Other Costs
              <span className="ml-2 text-sm font-normal text-gray-500">Subtotal: <span className="text-orange-600 font-semibold">৳{fmtNum(otherSubtotal)}</span></span>
            </CardTitle>
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            <span className="text-xs text-gray-500 self-center">Quick add:</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addPresetCost('Commercial', 'percentage', '2', 'subtotal')}>Commercial 2%</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addPresetCost('Bank Charge', 'percentage', '1', 'subtotal')}>Bank Charge 1%</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addPresetCost('Agent Commission', 'percentage', '2', 'subtotal')}>Agent Comm. 2%</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addPresetCost('Transport', 'fixed', '0', 'subtotal')}>Transport (Fixed)</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addPresetCost('Inspection', 'fixed', '0', 'subtotal')}>Inspection</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-800 text-white">
                  <th className="text-left py-2 px-3 text-xs w-8">#</th>
                  <th className="text-left py-2 px-3 text-xs">Cost Head</th>
                  <th className="text-left py-2 px-3 text-xs">Type</th>
                  <th className="text-left py-2 px-3 text-xs">Value</th>
                  <th className="text-left py-2 px-3 text-xs">Based On</th>
                  <th className="text-right py-2 px-3 text-xs">Calc. Amount (৳)</th>
                  <th className="text-left py-2 px-3 text-xs">Notes</th>
                  <th className="text-right py-2 px-3 text-xs">%</th>
                  <th className="py-2 px-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {otherCosts.map((c, i) => (
                  <tr key={i} className={`border-b hover:bg-orange-50 ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                    <td className="py-1.5 px-3 text-xs text-gray-500">{i + 1}</td>
                    <td className="py-1.5 px-2"><Input className="h-7 text-xs w-32" value={c.costHead} onChange={e => updateOtherCost(i, 'costHead', e.target.value)} placeholder="e.g. Commercial" /></td>
                    <td className="py-1.5 px-2">
                      <Select value={c.costType} onValueChange={v => updateOtherCost(i, 'costType', v)}>
                        <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Fixed (৳)</SelectItem>
                          <SelectItem value="percentage">Percentage (%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-2">
                      <Input className="h-7 text-xs w-20" type="number" step="0.01" value={c.value} onChange={e => updateOtherCost(i, 'value', e.target.value)} placeholder={c.costType === 'percentage' ? '0.00%' : '৳0.00'} />
                    </td>
                    <td className="py-1.5 px-2">
                      <Select value={c.basedOn} onValueChange={v => updateOtherCost(i, 'basedOn', v)}>
                        <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="subtotal">Subtotal</SelectItem>
                          <SelectItem value="material">Material Only</SelectItem>
                          <SelectItem value="cm">CM Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-3 text-right text-xs font-mono font-semibold text-orange-700">৳{fmtNum(c.calculatedAmount)}</td>
                    <td className="py-1.5 px-2"><Input className="h-7 text-xs w-32" value={c.notes} onChange={e => updateOtherCost(i, 'notes', e.target.value)} placeholder="Optional notes" /></td>
                    <td className="py-1.5 px-3 text-right text-xs text-gray-500">
                      {grandTotal > 0 ? fmtNum((parseFloat(c.calculatedAmount) / grandTotal) * 100, 1) + '%' : '—'}
                    </td>
                    <td className="py-1.5 px-2">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => setOtherCosts(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-orange-50 border-t-2 border-orange-200">
                  <td colSpan={5} className="py-2 px-3 text-xs font-semibold text-gray-700">Commercial Subtotal</td>
                  <td className="py-2 px-3 text-right text-sm font-bold text-orange-700">৳{fmtNum(otherSubtotal)}</td>
                  <td></td>
                  <td className="py-2 px-3 text-right text-xs text-gray-500">{grandTotal > 0 ? fmtNum((otherSubtotal / grandTotal) * 100, 1) + '%' : '—'}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="p-3">
            <Button size="sm" variant="outline" onClick={() => setOtherCosts(prev => [...prev, emptyOther()])}>
              <Plus className="h-3 w-3 mr-1" />Add Cost Row
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ===== SECTION H: Cost Summary Card ===== */}
      <Card className="border-2 border-orange-200 bg-orange-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-orange-800">Cost Summary & Quoted Price</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Breakdown table */}
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-orange-200">
                    <th className="text-left py-1.5 text-xs text-gray-600">Category</th>
                    <th className="text-right py-1.5 text-xs text-gray-600">Amount (৳)</th>
                    <th className="text-right py-1.5 text-xs text-gray-600">Per Piece</th>
                    <th className="text-right py-1.5 text-xs text-gray-600">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-1.5 text-sm">Material Cost</td>
                    <td className="py-1.5 text-right font-mono text-sm">৳{fmtNum(matSubtotal)}</td>
                    <td className="py-1.5 text-right font-mono text-sm">৳{fmtNum(qty > 0 ? matSubtotal / qty : 0)}</td>
                    <td className="py-1.5 text-right text-sm">{grandTotal > 0 ? fmtNum((matSubtotal / grandTotal) * 100, 1) + '%' : '—'}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5 text-sm">CM / Manufacturing</td>
                    <td className="py-1.5 text-right font-mono text-sm">৳{fmtNum(cmSubtotal)}</td>
                    <td className="py-1.5 text-right font-mono text-sm">৳{fmtNum(qty > 0 ? cmSubtotal / qty : 0)}</td>
                    <td className="py-1.5 text-right text-sm">{grandTotal > 0 ? fmtNum((cmSubtotal / grandTotal) * 100, 1) + '%' : '—'}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5 text-sm">Commercial / Other</td>
                    <td className="py-1.5 text-right font-mono text-sm">৳{fmtNum(otherSubtotal)}</td>
                    <td className="py-1.5 text-right font-mono text-sm">৳{fmtNum(qty > 0 ? otherSubtotal / qty : 0)}</td>
                    <td className="py-1.5 text-right text-sm">{grandTotal > 0 ? fmtNum((otherSubtotal / grandTotal) * 100, 1) + '%' : '—'}</td>
                  </tr>
                  <tr className="border-b-2 border-orange-300 font-semibold bg-white">
                    <td className="py-2 text-sm text-orange-800">Total Cost</td>
                    <td className="py-2 text-right font-mono text-sm text-orange-800">৳{fmtNum(grandTotal)}</td>
                    <td className="py-2 text-right font-mono text-sm text-orange-800">৳{fmtNum(qty > 0 ? grandTotal / qty : 0)}</td>
                    <td className="py-2 text-right text-sm">100%</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5 text-sm text-green-700">Profit ({profitMargin}%)</td>
                    <td className="py-1.5 text-right font-mono text-sm text-green-700">৳{fmtNum(useManualPrice ? (quotedPrice - grandTotal) : profitAmt)}</td>
                    <td className="py-1.5 text-right font-mono text-sm text-green-700">৳{fmtNum(qty > 0 ? (useManualPrice ? (quotedPrice - grandTotal) : profitAmt) / qty : 0)}</td>
                    <td className="py-1.5 text-right text-sm text-green-700">{fmtNum(actualMargin, 1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Quoted price highlight */}
            <div className="space-y-4">
              <div className="bg-white rounded-lg p-4 border border-orange-200">
                <p className="text-xs text-gray-500 mb-1">Quoted Price (Total)</p>
                <p className="text-3xl font-bold text-orange-600">৳{fmtNum(quotedPrice)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-lg p-3 border border-orange-200">
                  <p className="text-xs text-gray-500 mb-1">Per Piece</p>
                  <p className="text-xl font-bold text-gray-800">৳{fmtNum(quotedPerPiece)}</p>
                  <p className="text-xs text-gray-500 mt-1">{sym(targetCurrency)}{fmtNum(quotedInTargetCurrency, 4)}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-orange-200">
                  <p className="text-xs text-gray-500 mb-1">Per Dozen</p>
                  <p className="text-xl font-bold text-gray-800">৳{fmtNum(quotedPerDozen)}</p>
                  <p className="text-xs text-gray-500 mt-1">{sym(targetCurrency)}{fmtNum(dozens > 0 ? quotedPrice / dozens / exchRate : 0, 4)}</p>
                </div>
              </div>
              {targetPrice && (
                <div className={`rounded-lg p-3 border ${parseFloat(targetPrice) * exchRate >= quotedPerPiece ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <p className="text-xs text-gray-600">vs. Target ({sym(targetCurrency)}{targetPrice})</p>
                  <p className={`text-sm font-semibold ${parseFloat(targetPrice) * exchRate >= quotedPerPiece ? 'text-green-700' : 'text-red-700'}`}>
                    {parseFloat(targetPrice) * exchRate >= quotedPerPiece ? '✓ Within Target' : '✗ Exceeds Target'}
                    {' '} by {sym(targetCurrency)}{Math.abs(parseFloat(targetPrice) - quotedInTargetCurrency).toFixed(4)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== SECTION I: Notes ===== */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base font-semibold text-gray-700">Notes & Special Instructions</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Enter any special notes, payment terms, or instructions..." rows={3} />
        </CardContent>
      </Card>

      {/* ===== SECTION J: Footer Actions ===== */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-8 no-print">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/quotations')}>Cancel</Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />Print</Button>
          {isEditing && (
            <>
              <Button variant="outline" onClick={handleDownloadPdf}><FileText className="h-4 w-4 mr-1" />PDF</Button>
              <Button variant="outline" onClick={() => setEmailDialogOpen(true)}><Mail className="h-4 w-4 mr-1" />Email</Button>
            </>
          )}
          {workflowStatus === 'DRAFT' && (
            <Button variant="outline" onClick={() => handleWorkflowAction('submit')} disabled={saveMutation.isPending}>
              Submit for Review
            </Button>
          )}
          {workflowStatus === 'SUBMITTED' && (
            <Button variant="outline" className="border-green-500 text-green-700" onClick={() => handleWorkflowAction('approve')} disabled={saveMutation.isPending}>
              Approve
            </Button>
          )}
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-orange-500 hover:bg-orange-600 text-white">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {isEditing ? 'Save Changes' : 'Create Quotation'}
          </Button>
        </div>
      </div>

      {/* Print-only signature footer */}
      <div className="hidden print:block print-signature-footer" style={{ marginTop: '24px', pageBreakInside: 'avoid' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px 8px' }}>
          {['Prepared by', 'Checked by', 'Recommended by', 'Audited by', 'Approved by'].map((label) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '8px', fontWeight: 'bold', color: '#1F2937', marginBottom: '24px' }}>{label}</p>
              <div style={{ borderTop: '1px solid #9CA3AF', marginBottom: '4px' }} />
              <p style={{ fontSize: '7px', color: '#6B7280' }}>Name: ________________</p>
              <p style={{ fontSize: '7px', color: '#6B7280' }}>Date: ________________</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '7px', color: '#9CA3AF' }}>
          <span>Generated: {new Date().toLocaleString()}</span>
          <QRCode value={`${window.location.origin}/verify/quotation/${quotationNumber || 'NEW'}`} size={28} level="L" />
        </div>
      </div>

      {/* ===== Add New Item Dialog ===== */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Inventory Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs mb-1 block">Item Name *</Label>
              <Input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="e.g. Single Jersey 160 GSM" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Category *</Label>
              <Select value={newItemCategoryId ? String(newItemCategoryId) : ''} onValueChange={v => setNewItemCategoryId(Number(v))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Unit of Measure *</Label>
              <Select value={newItemUnitId ? String(newItemUnitId) : ''} onValueChange={v => setNewItemUnitId(Number(v))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {itemUnits.map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.name}{u.abbreviation ? ` (${u.abbreviation})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Default Cost (optional)</Label>
              <Input type="number" step="0.01" value={newItemCost} onChange={e => setNewItemCost(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateItem} disabled={creatingItem || !newItemName || !newItemCategoryId || !newItemUnitId} className="bg-orange-500 hover:bg-orange-600 text-white">
              {creatingItem ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PackagePlus className="h-4 w-4 mr-1" />}
              Create Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Email Dialog ===== */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Quotation by Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs mb-1 block">To Email *</Label>
              <Input value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="customer@example.com" type="email" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Recipient Name</Label>
              <Input value={emailName} onChange={e => setEmailName(e.target.value)} placeholder="Customer name" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Optional Message</Label>
              <Textarea value={emailMessage} onChange={e => setEmailMessage(e.target.value)} rows={3} placeholder="Add a personal message..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSendEmail} disabled={sendingEmail || !emailTo} className="bg-orange-500 hover:bg-orange-600 text-white">
              {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Mail className="h-4 w-4 mr-1" />}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuotationForm;

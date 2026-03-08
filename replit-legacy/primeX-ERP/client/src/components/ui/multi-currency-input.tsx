import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CurrencySelector } from "@/components/ui/currency-selector";
import { useTenantCurrencySettings, useExchangeRates } from "@/lib/currency";
import { formatCurrency, convertCurrency, getCurrencySymbol } from "@/lib/currency";

interface CurrencyRate {
  fromCurrency: string;
  toCurrency: string;
  exchangeRate: number;
  isActive: boolean;
}

interface MultiCurrencyInputProps {
  value: number;
  currency: string;
  onValueChange: (value: number, currency: string, exchangeRate: number, baseAmount: number, localAmount: number) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  showLocalEquivalent?: boolean;
}

export function MultiCurrencyInput({
  value,
  currency,
  onValueChange,
  label = "Amount",
  placeholder = "0.00",
  disabled = false,
  showLocalEquivalent = true
}: MultiCurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState(value.toString());
  const { data: currencySettings } = useTenantCurrencySettings();
  const { data: exchangeRatesData } = useExchangeRates();
  const exchangeRates = (exchangeRatesData as CurrencyRate[]) || [];

  const baseCurrency = currencySettings?.baseCurrency || "BDT";
  const localCurrency = currencySettings?.localCurrency || "BDT";

  // Calculate conversions when value or currency changes
  useEffect(() => {
    if (value && currency && exchangeRates.length > 0) {
      const currentExchangeRate = getExchangeRate(currency, baseCurrency);
      const baseAmount = currency === baseCurrency ? value : convertCurrency(value, currency, baseCurrency, exchangeRates);
      const localAmount = currency === localCurrency ? value : convertCurrency(value, currency, localCurrency, exchangeRates);
      
      onValueChange(value, currency, currentExchangeRate, baseAmount, localAmount);
    }
  }, [value, currency, exchangeRates, baseCurrency, localCurrency]);

  const getExchangeRate = (fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return 1;
    
    const rate = exchangeRates.find((rate: any) => 
      rate.fromCurrency === fromCurrency && 
      rate.toCurrency === toCurrency && 
      rate.isActive
    );
    
    if (rate) return Number(rate.exchangeRate);
    
    // Try reverse rate
    const reverseRate = exchangeRates.find((rate: any) => 
      rate.fromCurrency === toCurrency && 
      rate.toCurrency === fromCurrency && 
      rate.isActive
    );
    
    return reverseRate ? 1 / Number(reverseRate.exchangeRate) : 1;
  };

  const handleValueChange = (newValue: string) => {
    setDisplayValue(newValue);
    const numericValue = parseFloat(newValue) || 0;
    
    if (numericValue >= 0) {
      const currentExchangeRate = getExchangeRate(currency, baseCurrency);
      const baseAmount = currency === baseCurrency ? numericValue : convertCurrency(numericValue, currency, baseCurrency, exchangeRates);
      const localAmount = currency === localCurrency ? numericValue : convertCurrency(numericValue, currency, localCurrency, exchangeRates);
      
      onValueChange(numericValue, currency, currentExchangeRate, baseAmount, localAmount);
    }
  };

  const handleCurrencyChange = (newCurrency: string) => {
    const currentExchangeRate = getExchangeRate(newCurrency, baseCurrency);
    const baseAmount = newCurrency === baseCurrency ? value : convertCurrency(value, newCurrency, baseCurrency, exchangeRates);
    const localAmount = newCurrency === localCurrency ? value : convertCurrency(value, newCurrency, localCurrency, exchangeRates);
    
    onValueChange(value, newCurrency, currentExchangeRate, baseAmount, localAmount);
  };

  const getLocalEquivalent = () => {
    if (!showLocalEquivalent || currency === localCurrency) return null;
    
    const localAmount = convertCurrency(value, currency, localCurrency, exchangeRates);
    return formatCurrency(localAmount, localCurrency);
  };

  const getBaseEquivalent = () => {
    if (!showLocalEquivalent || currency === baseCurrency) return null;
    
    const baseAmount = convertCurrency(value, currency, baseCurrency, exchangeRates);
    return formatCurrency(baseAmount, baseCurrency);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
              {getCurrencySymbol(currency)}
            </span>
            <Input
              type="number"
              step="0.01"
              value={displayValue}
              onChange={(e) => handleValueChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="pl-8"
            />
          </div>
        </div>
        <div className="w-32">
          <CurrencySelector
            value={currency}
            onValueChange={handleCurrencyChange}
            disabled={disabled}
          />
        </div>
      </div>
      
      {showLocalEquivalent && (value > 0) && (
        <div className="flex flex-wrap gap-2 text-sm text-gray-600">
          {getBaseEquivalent() && (
            <Badge variant="outline" className="text-blue-600 border-blue-200">
              Base: {getBaseEquivalent()}
            </Badge>
          )}
          {getLocalEquivalent() && (
            <Badge variant="outline" className="text-green-600 border-green-200">
              Local: {getLocalEquivalent()}
            </Badge>
          )}
          {currency !== baseCurrency && currency !== localCurrency && (
            <Badge variant="outline" className="text-purple-600 border-purple-200">
              Rate: 1 {currency} = {getExchangeRate(currency, baseCurrency).toFixed(4)} {baseCurrency}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
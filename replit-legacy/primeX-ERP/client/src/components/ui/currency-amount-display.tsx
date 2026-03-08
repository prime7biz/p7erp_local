import { Badge } from "@/components/ui/badge";
import { formatCurrency, getCurrencySymbol } from "@/lib/currency";

interface CurrencyAmountDisplayProps {
  amount: number;
  currency: string;
  baseCurrency?: string;
  localCurrency?: string;
  exchangeRate?: number;
  showConversions?: boolean;
}

export function CurrencyAmountDisplay({
  amount,
  currency,
  baseCurrency = "BDT",
  localCurrency = "BDT",
  exchangeRate = 1,
  showConversions = true
}: CurrencyAmountDisplayProps) {
  const baseAmount = currency === baseCurrency ? amount : amount * exchangeRate;
  const localAmount = currency === localCurrency ? amount : amount * exchangeRate;

  return (
    <div className="space-y-1">
      <div className="font-medium">
        {getCurrencySymbol(currency)}{amount.toFixed(2)} {currency}
      </div>
      
      {showConversions && amount > 0 && (
        <div className="flex flex-wrap gap-1 text-xs">
          {currency !== baseCurrency && (
            <Badge variant="outline" className="text-blue-600 border-blue-200">
              {formatCurrency(baseAmount, baseCurrency)}
            </Badge>
          )}
          {currency !== localCurrency && (
            <Badge variant="outline" className="text-green-600 border-green-200">
              {formatCurrency(localAmount, localCurrency)}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
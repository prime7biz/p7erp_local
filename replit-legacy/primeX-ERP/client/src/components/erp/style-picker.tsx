import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Search, X, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StyleData {
  id: number;
  styleNo: string;
  season: string | null;
  productType: string | null;
  description: string | null;
  status: string;
  buyerName: string | null;
  buyerId: number | null;
}

interface StylePickerProps {
  value?: number | null;
  styleName?: string;
  onChange: (styleId: number | null, styleName: string) => void;
  disabled?: boolean;
}

export function StylePicker({ value, styleName = '', onChange, disabled = false }: StylePickerProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState(styleName);
  const [selectedStyle, setSelectedStyle] = useState<StyleData | null>(null);

  const { data: stylesResponse, isLoading } = useQuery<{ success: boolean; data: StyleData[] }>({
    queryKey: ['/api/merch/styles'],
  });

  const styles = stylesResponse?.data || [];

  const filteredStyles = styles.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.styleNo.toLowerCase().includes(q) ||
      (s.season && s.season.toLowerCase().includes(q)) ||
      (s.productType && s.productType.toLowerCase().includes(q)) ||
      (s.buyerName && s.buyerName.toLowerCase().includes(q)) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  });

  useEffect(() => {
    if (value && styles.length > 0 && !selectedStyle) {
      const found = styles.find((s) => s.id === value);
      if (found) {
        setSelectedStyle(found);
        setManualMode(false);
      }
    }
  }, [value, styles, selectedStyle]);

  useEffect(() => {
    if (!value && styleName && !selectedStyle) {
      setManualName(styleName);
      setManualMode(true);
    }
  }, [styleName, value, selectedStyle]);

  const handleSelect = (style: StyleData) => {
    setSelectedStyle(style);
    setManualMode(false);
    setOpen(false);
    onChange(style.id, style.styleNo);
  };

  const handleClear = () => {
    setSelectedStyle(null);
    setManualMode(false);
    setManualName('');
    onChange(null, '');
  };

  const handleManualToggle = () => {
    setManualMode(true);
    setSelectedStyle(null);
    setOpen(false);
    onChange(null, manualName);
  };

  const handleManualChange = (val: string) => {
    setManualName(val);
    onChange(null, val);
  };

  if (manualMode) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={manualName}
            onChange={(e) => handleManualChange(e.target.value)}
            placeholder="Enter style name manually"
            disabled={disabled}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setManualMode(false);
              setManualName('');
            }}
            disabled={disabled}
          >
            <Search className="h-4 w-4 mr-1" />
            Search
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Manual entry mode. Click Search to pick from master styles.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between font-normal",
              !selectedStyle && !value && "text-muted-foreground"
            )}
            disabled={disabled}
          >
            {selectedStyle
              ? `${selectedStyle.styleNo}${selectedStyle.season ? ` — ${selectedStyle.season}` : ''}`
              : "Select a style..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search styles..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>
                {isLoading ? "Loading styles..." : "No styles found."}
              </CommandEmpty>
              <CommandGroup>
                {filteredStyles.map((style) => (
                  <CommandItem
                    key={style.id}
                    value={style.id.toString()}
                    onSelect={() => handleSelect(style)}
                    className="flex flex-col items-start py-2"
                  >
                    <div className="flex w-full items-center">
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedStyle?.id === style.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{style.styleNo}</div>
                        <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                          {style.season && <span>{style.season}</span>}
                          {style.productType && <span>• {style.productType}</span>}
                          {style.buyerName && <span>• {style.buyerName}</span>}
                        </div>
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="border-t p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={handleManualToggle}
              >
                Enter style name manually instead
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedStyle && (
        <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2">
          <div className="text-xs text-muted-foreground space-x-2">
            <span className="font-medium text-foreground">{selectedStyle.styleNo}</span>
            {selectedStyle.season && <span>| {selectedStyle.season}</span>}
            {selectedStyle.productType && <span>| {selectedStyle.productType}</span>}
            {selectedStyle.buyerName && <span>| Buyer: {selectedStyle.buyerName}</span>}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleClear}
            disabled={disabled}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

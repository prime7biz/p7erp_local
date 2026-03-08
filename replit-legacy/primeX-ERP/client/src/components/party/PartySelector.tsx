import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PartySelectorProps {
  value: number | null | undefined;
  onChange: (partyId: number | null, party?: any) => void;
  partyType?: "vendor" | "customer" | "both";
  placeholder?: string;
  disabled?: boolean;
}

export function PartySelector({ value, onChange, partyType, placeholder = "Select party...", disabled }: PartySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useQuery<any>({
    queryKey: ['/api/parties', 'selector', partyType],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "500" });
      if (partyType) params.set("partyType", partyType);
      const res = await fetch(`/api/parties?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch parties");
      return res.json();
    },
  });

  const parties = data?.parties || [];

  const filtered = useMemo(() => {
    if (!search) return parties;
    const q = search.toLowerCase();
    return parties.filter((p: any) =>
      p.name.toLowerCase().includes(q) || p.partyCode.toLowerCase().includes(q)
    );
  }, [parties, search]);

  const selectedParty = parties.find((p: any) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} disabled={disabled}
          className="w-full justify-between font-normal">
          {selectedParty ? `${selectedParty.partyCode} — ${selectedParty.name}` : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search parties..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No parties found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((party: any) => (
                <CommandItem
                  key={party.id}
                  value={String(party.id)}
                  onSelect={() => {
                    onChange(party.id === value ? null : party.id, party);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === party.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col">
                    <span className="font-medium">{party.partyCode} — {party.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {party.partyType.charAt(0).toUpperCase() + party.partyType.slice(1)}
                      {party.groupLabel ? ` • ${party.groupLabel}` : ""}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
import { useState } from "react";
import { PartySelector } from "./PartySelector";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Keyboard, List } from "lucide-react";

interface FlexiblePartySelectorProps {
  partyId: number | null | undefined;
  partyName: string;
  onPartyIdChange: (id: number | null) => void;
  onPartyNameChange: (name: string) => void;
  partyType?: "vendor" | "customer" | "both";
  placeholder?: string;
  disabled?: boolean;
}

export function FlexiblePartySelector({
  partyId,
  partyName,
  onPartyIdChange,
  onPartyNameChange,
  partyType,
  placeholder = "Select party...",
  disabled,
}: FlexiblePartySelectorProps) {
  const [adHocMode, setAdHocMode] = useState(false);

  const switchToAdHoc = () => {
    setAdHocMode(true);
    onPartyIdChange(null);
  };

  const switchToList = () => {
    setAdHocMode(false);
    onPartyNameChange("");
  };

  if (adHocMode) {
    return (
      <div className="space-y-1">
        <Input
          value={partyName}
          onChange={(e) => onPartyNameChange(e.target.value)}
          placeholder="Type party name..."
          disabled={disabled}
        />
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs text-muted-foreground"
          onClick={switchToList}
          disabled={disabled}
        >
          <List className="mr-1 h-3 w-3" />
          Select from list
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <PartySelector
        value={partyId ?? null}
        onChange={(id, party) => {
          onPartyIdChange(id);
          onPartyNameChange(party?.name ?? "");
        }}
        partyType={partyType}
        placeholder={placeholder}
        disabled={disabled}
      />
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0 text-xs text-muted-foreground"
        onClick={switchToAdHoc}
        disabled={disabled}
      >
        <Keyboard className="mr-1 h-3 w-3" />
        Type manually
      </Button>
    </div>
  );
}

import type { KpiCard as KpiCardData } from "../../api/kpiEngine";
import { KpiCard } from "./KpiCard";

type Props = {
  cards: KpiCardData[];
  onDrill?: (code: string) => void;
  emptyMessage?: string;
};

export function KpiGrid({ cards, onDrill, emptyMessage = "No KPIs available for this view." }: Props) {
  if (!cards.length) {
    return <p className="text-sm text-text-muted">{emptyMessage}</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((card) => (
        <KpiCard key={card.definition.code} card={card} onDrill={onDrill} />
      ))}
    </div>
  );
}

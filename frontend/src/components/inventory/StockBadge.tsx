/** Small on-hand quantity badge for inventory lists (reusable). */

type Props = {
  qty: number;
  lowThreshold?: number;
};

export function StockBadge({ qty, lowThreshold = 10 }: Props) {
  const low = qty < lowThreshold;
  return (
    <span
      className={
        low
          ? "inline-flex rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-100"
          : "inline-flex rounded-md bg-surface-subtle px-2 py-0.5 text-xs font-medium text-text-secondary"
      }
    >
      {Number.isFinite(qty) ? qty.toFixed(3) : "—"}
    </span>
  );
}

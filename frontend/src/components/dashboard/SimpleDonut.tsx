import { memo } from "react";

function SimpleDonutInner({
  segments,
  total,
  centerLabel,
}: {
  segments: { label: string; value: number; color: string }[];
  total: number;
  centerLabel: string;
}) {
  if (total <= 0) {
    return (
      <div className="flex h-[140px] w-[140px] items-center justify-center rounded-full border border-border text-xs text-text-muted">
        No data
      </div>
    );
  }
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative h-[140px] w-[140px]" role="img" aria-label={`${centerLabel}: ${total}`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--color-border-subtle)"
          strokeWidth="12"
        />
        {segments.map((s) => {
          const len = (s.value / total) * circumference;
          const circle = (
            <circle
              key={s.label}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth="12"
              strokeLinecap="butt"
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-offset}
              className="transition-opacity hover:opacity-80"
            />
          );
          offset += len;
          return circle;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-xl font-bold text-text-primary">{total}</p>
        <p className="text-[10px] text-text-muted">{centerLabel}</p>
      </div>
    </div>
  );
}

export const SimpleDonut = memo(SimpleDonutInner);

interface Props {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ values, width = 160, height = 40, className = "text-brand-primary" }: Props) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-9, max - min);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => `${i * step},${height - ((v - min) / span) * (height - 4) - 2}`).join(" ");
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth={1.5} points={points} />
    </svg>
  );
}

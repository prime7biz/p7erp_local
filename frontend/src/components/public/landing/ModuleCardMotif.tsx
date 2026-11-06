/**
 * Small decorative line drawings shown in the corner of a module card on hover.
 * Inline SVG on purpose: the photo-style PNGs in /public/images are 1–1.6 MB each and would slow the landing page.
 */
export type ModuleMotif = "swatches" | "document" | "grid" | "flow" | "bars" | "people" | "checklist" | "nodes" | "ledger";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function MotifShapes({ motif }: { motif: ModuleMotif }) {
  switch (motif) {
    case "swatches":
      return (
        <g {...stroke}>
          <rect x="20" y="30" width="44" height="80" rx="6" />
          <rect x="58" y="22" width="44" height="80" rx="6" transform="rotate(12 80 62)" />
          <rect x="92" y="18" width="44" height="80" rx="6" transform="rotate(24 114 58)" />
        </g>
      );
    case "document":
      return (
        <g {...stroke}>
          <path d="M40 16h52l24 24v84H40z" />
          <path d="M92 16v24h24" />
          <path d="M56 64h44M56 80h44M56 96h28" />
        </g>
      );
    case "grid":
      return (
        <g {...stroke}>
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => <rect key={`${r}-${c}`} x={24 + c * 38} y={22 + r * 34} width="30" height="26" rx="4" />),
          )}
        </g>
      );
    case "flow":
      return (
        <g {...stroke}>
          <circle cx="30" cy="70" r="12" />
          <circle cx="80" cy="70" r="12" />
          <circle cx="130" cy="70" r="12" />
          <path d="M42 70h26M92 70h26" />
          <path d="M62 64l6 6-6 6M112 64l6 6-6 6" />
        </g>
      );
    case "bars":
      return (
        <g {...stroke}>
          <path d="M20 120h130" />
          <rect x="30" y="80" width="18" height="40" rx="3" />
          <rect x="62" y="56" width="18" height="64" rx="3" />
          <rect x="94" y="70" width="18" height="50" rx="3" />
          <rect x="126" y="34" width="18" height="86" rx="3" />
        </g>
      );
    case "people":
      return (
        <g {...stroke}>
          <circle cx="56" cy="48" r="16" />
          <path d="M26 116c0-20 14-34 30-34s30 14 30 34" />
          <circle cx="110" cy="56" r="13" />
          <path d="M90 116c2-16 10-26 20-26s20 10 22 26" />
        </g>
      );
    case "checklist":
      return (
        <g {...stroke}>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x="30" y={26 + i * 34} width="22" height="22" rx="4" />
              <path d={`M35 ${37 + i * 34}l5 5 8-9`} />
              <path d={`M66 ${37 + i * 34}h64`} />
            </g>
          ))}
        </g>
      );
    case "nodes":
      return (
        <g {...stroke}>
          <circle cx="80" cy="70" r="14" />
          <circle cx="30" cy="30" r="9" />
          <circle cx="136" cy="34" r="9" />
          <circle cx="34" cy="116" r="9" />
          <circle cx="132" cy="112" r="9" />
          <path d="M38 36l30 24M128 40l-36 22M42 110l28-30M124 106l-32-26" />
        </g>
      );
    case "ledger":
      return (
        <g {...stroke}>
          <path d="M24 52l56-30 56 30" />
          <path d="M24 52h112M24 122h112" />
          <path d="M40 60v54M66 60v54M94 60v54M120 60v54" />
        </g>
      );
  }
}

export function ModuleCardMotif({ motif }: { motif: ModuleMotif }) {
  return (
    <svg
      viewBox="0 0 160 140"
      aria-hidden
      focusable="false"
      className="pointer-events-none absolute -right-6 -bottom-6 h-36 w-40 text-brand-primary opacity-0 transition-all duration-500 group-hover:-translate-x-2 group-hover:-translate-y-2 group-hover:opacity-[0.16] group-focus-visible:opacity-[0.16]"
    >
      <MotifShapes motif={motif} />
    </svg>
  );
}

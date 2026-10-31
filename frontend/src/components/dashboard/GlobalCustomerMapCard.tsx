import { memo, useEffect, useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { Globe, MapPin } from "lucide-react";
import { getCountryCoordinates } from "@/data/countryCoordinates";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

/** Professional slate map palette (light) + brand highlight for markers. */
const MAP_OCEAN = "#e2e8f0"; // slate-200
const MAP_LAND = "#f8fafc"; // slate-50
const MAP_STROKE = "#94a3b8"; // slate-400
const MAP_BG = "#f1f5f9"; // slate-100
const MAP_HIGHLIGHT = "var(--color-brand-primary)";
const MAP_HIGHLIGHT_SOLID = "#ea580c"; // SVG gradient stop fallback
const MAP_HIGHLIGHT_GLOW = "rgba(234, 88, 12, 0.35)";

const MAP_LIGHT = {
  ocean: MAP_OCEAN,
  land: MAP_LAND,
  stroke: MAP_STROKE,
  bg: MAP_BG,
  landHover: MAP_OCEAN,
} as const;

const MAP_DARK = {
  ocean: "#0f172a",
  land: "#1e293b",
  stroke: "#475569",
  bg: "#020617",
  landHover: "#334155",
} as const;

function useIsDarkClass() {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setIsDark(el.classList.contains("dark"));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export interface CustomerMapPoint {
  country: string;
  count: number;
}

interface GlobalCustomerMapCardProps {
  points: CustomerMapPoint[];
}

export function GlobalCustomerMapCardInner({ points }: GlobalCustomerMapCardProps) {
  const isDark = useIsDarkClass();
  const mapColors = isDark ? MAP_DARK : MAP_LIGHT;
  const { markers, maxCount, sortedPoints } = useMemo(() => {
    const withCoords = points
      .map((p) => ({
        ...p,
        coordinates: getCountryCoordinates(p.country),
      }))
      .filter((p): p is typeof p & { coordinates: [number, number] } => p.coordinates != null);
    const max = Math.max(1, ...withCoords.map((p) => p.count));
    const sorted = [...points].sort((a, b) => b.count - a.count).slice(0, 12);
    return { markers: withCoords, maxCount: max, sortedPoints: sorted };
  }, [points]);

  const countryCount = points.length;

  return (
    <div className="rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-subtle">
            <Globe className="h-5 w-5 text-brand-primary" aria-hidden />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">
            Global Customer &amp; Export Destinations
          </h3>
        </div>
        <span className="inline-flex items-center rounded-full border border-border bg-surface-subtle px-2.5 py-0.5 text-xs font-medium text-text-secondary">
          {countryCount} {countryCount === 1 ? "country" : "countries"}
        </span>
      </div>

      <div className="px-4 pb-3" style={{ background: mapColors.bg }}>
        <div className="rounded-lg overflow-hidden border border-border" style={{ background: mapColors.ocean }}>
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{
              scale: 140,
              center: [20, 30],
            }}
            width={800}
            height={400}
            style={{ width: "100%", height: "auto", maxHeight: 320 }}
          >
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id="bubbleGradient" cx="0.3" cy="0.3" r="0.7">
                <stop offset="0%" stopColor="#FED7AA" stopOpacity={0.9} />
                <stop offset="100%" stopColor={MAP_HIGHLIGHT_SOLID} stopOpacity={1} />
              </radialGradient>
            </defs>
            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: Array<{ rsmKey: string; [key: string]: unknown }> }) =>
                geographies.map((geo: { rsmKey: string; [key: string]: unknown }) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={mapColors.land}
                    stroke={mapColors.stroke}
                    strokeWidth={0.65}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fill: mapColors.landHover },
                      pressed: { outline: "none" },
                    }}
                  />
                ))
              }
            </Geographies>
            {markers.map(({ country, count, coordinates }) => {
              const r = Math.max(3.5, Math.min(9, (count / maxCount) * 5.5 + 3.5));
              return (
                <Marker key={country} coordinates={coordinates}>
                  <g filter="url(#glow)">
                    <circle r={r + 1.5} fill={MAP_HIGHLIGHT_GLOW} fillOpacity={0.45} />
                    <circle
                      r={r}
                      fill="url(#bubbleGradient)"
                      stroke={MAP_HIGHLIGHT}
                      strokeWidth={0.75}
                      strokeOpacity={0.75}
                    />
                  </g>
                </Marker>
              );
            })}
          </ComposableMap>
        </div>
      </div>

      <div className="px-5 pb-4 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          {sortedPoints.length > 0 ? (
            sortedPoints.map((point) => (
              <span
                key={point.country}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5 text-xs text-text-secondary"
              >
                <MapPin className="h-3.5 w-3.5 text-brand-primary shrink-0" aria-hidden />
                <span className="font-medium text-text-primary">{point.country}</span>
                <span className="text-text-muted">·</span>
                <span className="font-semibold text-text-primary">{point.count}</span>
              </span>
            ))
          ) : (
            <p className="text-xs text-text-muted">No customer location data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export const GlobalCustomerMapCard = memo(GlobalCustomerMapCardInner);

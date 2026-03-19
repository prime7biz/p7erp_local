import { useMemo } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { Globe, MapPin } from "lucide-react";
import { getCountryCoordinates } from "@/data/countryCoordinates";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const MAP_ORANGE = "#F97316";
const MAP_ORANGE_GLOW = "rgba(249, 115, 22, 0.35)";
/** Ocean / map canvas — bright so land outlines read clearly */
const MAP_OCEAN = "#7DD3FC";
/** Land fill — light but distinct from water */
const MAP_LAND = "#F0F9FF";
const MAP_STROKE = "#0369A1";
const MAP_BG = "#E0F2FE";

export interface CustomerMapPoint {
  country: string;
  count: number;
}

interface GlobalCustomerMapCardProps {
  points: CustomerMapPoint[];
}

export function GlobalCustomerMapCard({ points }: GlobalCustomerMapCardProps) {
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
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100">
            <Globe className="h-5 w-5 text-orange-600" aria-hidden />
          </div>
          <h3 className="text-sm font-semibold text-gray-800">
            Global Customer &amp; Export Destinations
          </h3>
        </div>
        <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600">
          {countryCount} {countryCount === 1 ? "country" : "countries"}
        </span>
      </div>

      {/* Map */}
      <div className="px-4 pb-3" style={{ background: MAP_BG }}>
        <div className="rounded-lg overflow-hidden border border-sky-200" style={{ background: MAP_OCEAN }}>
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
                <stop offset="100%" stopColor={MAP_ORANGE} stopOpacity={1} />
              </radialGradient>
            </defs>
            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: Array<{ rsmKey: string; [key: string]: unknown }> }) =>
                geographies.map((geo: { rsmKey: string; [key: string]: unknown }) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={MAP_LAND}
                    stroke={MAP_STROKE}
                    strokeWidth={0.65}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fill: "#E0F2FE" },
                      pressed: { outline: "none" },
                    }}
                  />
                ))
              }
            </Geographies>
            {markers.map(({ country, count, coordinates }) => {
              // Small, count-scaled dots so nearby countries (e.g. UK / DE) stay readable
              const r = Math.max(3.5, Math.min(9, (count / maxCount) * 5.5 + 3.5));
              return (
                <Marker key={country} coordinates={coordinates}>
                  <g filter="url(#glow)">
                    <circle
                      r={r + 1.5}
                      fill={MAP_ORANGE_GLOW}
                      fillOpacity={0.45}
                    />
                    <circle
                      r={r}
                      fill="url(#bubbleGradient)"
                      stroke="#EA580C"
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

      {/* Footer: country tags */}
      <div className="px-5 pb-4 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          {sortedPoints.length > 0 ? (
            sortedPoints.map((point) => (
              <span
                key={point.country}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700"
              >
                <MapPin className="h-3.5 w-3.5 text-orange-500 shrink-0" aria-hidden />
                <span className="font-medium">{point.country}</span>
                <span className="text-gray-500">·</span>
                <span className="font-semibold text-gray-800">{point.count}</span>
              </span>
            ))
          ) : (
            <p className="text-xs text-gray-500">No customer location data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

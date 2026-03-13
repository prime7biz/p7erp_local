import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  api,
  type StyleResponse,
  type StyleComponentResponse,
  type StyleColorwayResponse,
  type StyleSizeScaleResponse,
} from "@/api/client";

export function StyleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const styleId = Number(id);
  const [style, setStyle] = useState<StyleResponse | null>(null);
  const [components, setComponents] = useState<StyleComponentResponse[]>([]);
  const [colorways, setColorways] = useState<StyleColorwayResponse[]>([]);
  const [scales, setScales] = useState<StyleSizeScaleResponse[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [componentName, setComponentName] = useState("");
  const [colorName, setColorName] = useState("");
  const [scaleName, setScaleName] = useState("");
  const [sizesCsv, setSizesCsv] = useState("");

  const load = async () => {
    if (!styleId) return;
    setLoading(true);
    setError("");
    try {
      const [s, comps, cols, sz] = await Promise.all([
        api.getStyle(styleId),
        api.listStyleComponents(styleId),
        api.listStyleColorways(styleId),
        api.listStyleSizeScales(styleId),
      ]);
      setStyle(s);
      setComponents(comps);
      setColorways(cols);
      setScales(sz);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load style details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [styleId]);

  const handleStyleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !styleId) return;
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);
    if (!allowedTypes.has(file.type)) {
      setError("Unsupported image type. Please upload PNG, JPG, GIF, or WEBP.");
      event.target.value = "";
      return;
    }
    setUploadingImage(true);
    setError("");
    try {
      await api.uploadStyleImage(styleId, file);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload style image");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Loading style…</div>;
  if (!style) return <div className="p-6 text-red-600 text-sm">{error || "Style not found"}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{style.style_code} · {style.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{style.status} · {style.department ?? "No department"}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
            {uploadingImage ? "Uploading..." : "Upload style image"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
              onChange={handleStyleImageUpload}
              disabled={uploadingImage}
              className="hidden"
            />
          </label>
          <button onClick={() => navigate("/app/merchandising/styles")} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700">
            Back
          </button>
        </div>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Style Picture</h2>
        {style.style_image_url ? (
          <img
            src={style.style_image_url}
            alt={style.name}
            className="h-36 w-36 rounded object-cover border border-gray-200"
          />
        ) : (
          <div className="h-36 w-36 rounded bg-gray-100 border border-gray-200 text-xs text-gray-500 flex items-center justify-center">
            No style image
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Components</h2>
          <div className="flex gap-2">
            <input value={componentName} onChange={(e) => setComponentName(e.target.value)} placeholder="Component name" className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm" />
            <button
              onClick={async () => {
                if (!componentName.trim()) return;
                await api.createStyleComponent(styleId, { component_name: componentName.trim() });
                setComponentName("");
                await load();
              }}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            >
              Add
            </button>
          </div>
          <div className="space-y-1">
            {components.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded border border-gray-200 px-2 py-1 text-sm">
                <span>{c.component_name}</span>
                <button onClick={async () => { await api.deleteStyleComponent(styleId, c.id); await load(); }} className="text-xs text-red-600">Delete</button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Colorways</h2>
          <div className="flex gap-2">
            <input value={colorName} onChange={(e) => setColorName(e.target.value)} placeholder="Color name" className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm" />
            <button
              onClick={async () => {
                if (!colorName.trim()) return;
                await api.createStyleColorway(styleId, { color_name: colorName.trim() });
                setColorName("");
                await load();
              }}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            >
              Add
            </button>
          </div>
          <div className="space-y-1">
            {colorways.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded border border-gray-200 px-2 py-1 text-sm">
                <span>{c.color_name}</span>
                <button onClick={async () => { await api.deleteStyleColorway(styleId, c.id); await load(); }} className="text-xs text-red-600">Delete</button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Size Scales</h2>
          <input value={scaleName} onChange={(e) => setScaleName(e.target.value)} placeholder="Scale name" className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          <input value={sizesCsv} onChange={(e) => setSizesCsv(e.target.value)} placeholder="Sizes CSV (S,M,L,XL)" className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          <button
            onClick={async () => {
              if (!scaleName.trim()) return;
              await api.createStyleSizeScale(styleId, { scale_name: scaleName.trim(), sizes_csv: sizesCsv || null });
              setScaleName("");
              setSizesCsv("");
              await load();
            }}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            Add
          </button>
          <div className="space-y-1">
            {scales.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded border border-gray-200 px-2 py-1 text-sm">
                <span>{s.scale_name} ({s.sizes_csv ?? "—"})</span>
                <button onClick={async () => { await api.deleteStyleSizeScale(styleId, s.id); await load(); }} className="text-xs text-red-600">Delete</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

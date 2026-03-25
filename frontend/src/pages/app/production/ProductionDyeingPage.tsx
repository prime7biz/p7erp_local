import { useCallback, useEffect, useState } from "react";

import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ProductionDyeingPage() {
  const [recipes, setRecipes] = useState<Array<{ id: number; recipe_code: string; status: string }>>([]);
  const [batches, setBatches] = useState<Array<{ id: number; batch_code: string; status: string }>>([]);
  const [recipeCode, setRecipeCode] = useState("");
  const [colorName, setColorName] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [recipeId, setRecipeId] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, b] = await Promise.all([api.listDyeRecipes(), api.listDyeBatches()]);
      setRecipes((r.items as typeof recipes) ?? []);
      setBatches((b.items as typeof batches) ?? []);
    } catch (e) {
      logApiError(e, "ProductionDyeingPage.load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveRecipe = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await api.createDyeRecipe({ recipe_code: recipeCode.trim(), color_name: colorName || undefined });
      setRecipeCode("");
      setColorName("");
      await load();
    } catch (e) {
      logApiError(e, "ProductionDyeingPage.recipe");
    }
  };

  const saveBatch = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await api.createDyeBatch({
        batch_code: batchCode.trim(),
        recipe_id: recipeId ? Number(recipeId) : null,
      });
      setBatchCode("");
      await load();
    } catch (e) {
      logApiError(e, "ProductionDyeingPage.batch");
    }
  };

  const statuses = Array.from(new Set(batches.map((b) => b.status))).sort();

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Dyeing</h1>
        <p className="text-sm text-text-secondary">Recipes and batch board (grouped by status).</p>
      </div>

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <h2 className="text-sm font-medium mb-2">Recipes</h2>
        <form onSubmit={saveRecipe} className="flex flex-wrap gap-2 mb-3">
          <input className="rounded-md border px-2 py-1" placeholder="Recipe code" value={recipeCode} onChange={(e) => setRecipeCode(e.target.value)} required />
          <input className="rounded-md border px-2 py-1" placeholder="Color name" value={colorName} onChange={(e) => setColorName(e.target.value)} />
          <button type="submit" className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white">
            Add
          </button>
        </form>
        <ul className="text-sm space-y-1">
          {recipes.map((x) => (
            <li key={x.id}>
              {x.recipe_code} — {x.status}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <h2 className="text-sm font-medium mb-2">New batch</h2>
        <form onSubmit={saveBatch} className="flex flex-wrap gap-2">
          <input className="rounded-md border px-2 py-1" placeholder="Batch code" value={batchCode} onChange={(e) => setBatchCode(e.target.value)} required />
          <input className="rounded-md border px-2 py-1 w-28" placeholder="Recipe ID" value={recipeId} onChange={(e) => setRecipeId(e.target.value)} />
          <button type="submit" className="rounded-lg border px-3 py-1.5 text-sm">
            Create
          </button>
        </form>
      </section>

      <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
        {(statuses.length ? statuses : ["planned"]).map((col) => (
          <div key={col} className="rounded-lg border border-border-subtle p-3 min-h-[120px]">
            <h3 className="text-xs font-semibold uppercase text-text-muted mb-2">{col}</h3>
            {batches
              .filter((b) => b.status === col)
              .map((b) => (
                <div key={b.id} className="text-sm py-1 border-b border-border-subtle/50">
                  {b.batch_code}
                </div>
              ))}
          </div>
        ))}
      </section>
    </div>
  );
}

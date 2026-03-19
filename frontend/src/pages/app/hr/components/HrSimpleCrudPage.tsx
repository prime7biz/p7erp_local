import { useCallback, useEffect, useState } from "react";

export interface HrColumn<TItem> {
  header: string;
  cell: (item: TItem) => string | number | boolean | null;
}

export interface HrFormField<TCreate extends object> {
  key: keyof TCreate;
  label: string;
  type: "text" | "number" | "date" | "datetime-local";
  required?: boolean;
}

interface HrSimpleCrudPageProps<TItem, TCreate extends object> {
  title: string;
  description: string;
  emptyMessage: string;
  columns: HrColumn<TItem>[];
  loadItems: () => Promise<TItem[]>;
  createItem?: (payload: TCreate) => Promise<unknown>;
  createLabel?: string;
  fields?: HrFormField<TCreate>[];
  initialForm?: TCreate;
}

export function HrSimpleCrudPage<TItem, TCreate extends object>(
  props: HrSimpleCrudPageProps<TItem, TCreate>
) {
  const {
    title,
    description,
    emptyMessage,
    columns,
    loadItems,
    createItem,
    createLabel = "Add",
    fields = [],
    initialForm,
  } = props;
  const [items, setItems] = useState<TItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [form, setForm] = useState<TCreate | null>(initialForm ?? null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const rows = await loadItems();
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [loadItems]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setField = (fieldKey: keyof TCreate, rawValue: string): void => {
    if (!form) return;
    const current = form[fieldKey];
    const field = fields.find((f) => f.key === fieldKey);
    let nextValue: unknown = rawValue;
    if (field?.type === "number") {
      if (rawValue === "") {
        nextValue = current === null ? null : 0;
      } else {
        nextValue = Number(rawValue);
      }
    }
    setForm((prev) => (prev ? ({ ...prev, [fieldKey]: nextValue } as TCreate) : prev));
  };

  const onSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!createItem || !form) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await createItem(form);
      setSuccess("Saved successfully.");
      setForm(initialForm ?? null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
          <p className="text-sm text-text-muted">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
        >
          Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">{error}</div>}
      {success && <div className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">{success}</div>}

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-text-muted">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">{emptyMessage}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface-subtle">
                <tr>
                  {columns.map((column) => (
                    <th key={column.header} className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface-raised">
                {items.map((item, idx) => (
                  <tr key={idx}>
                    {columns.map((column) => (
                      <td key={`${column.header}-${idx}`} className="px-4 py-3 text-sm text-text-secondary">
                        {String(column.cell(item) ?? "-")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createItem && form && fields.length > 0 && (
        <form onSubmit={onSubmit} className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
          <h2 className="text-lg font-semibold text-text-primary">{createLabel}</h2>
          <p className="text-xs text-text-muted">Fields marked with ** are mandatory.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={String(field.key)} className="space-y-1 text-sm text-text-secondary">
                <span>{field.required ? `${field.label} **` : field.label}</span>
                <input
                  type={field.type}
                  required={field.required}
                  className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                  value={String(form[field.key] ?? "")}
                  onChange={(e) => setField(field.key, e.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

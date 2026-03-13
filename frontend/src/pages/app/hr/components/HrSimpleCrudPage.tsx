import { useEffect, useState } from "react";

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

  const refresh = async (): Promise<void> => {
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
  };

  useEffect(() => {
    void refresh();
  }, []);

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
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        >
          Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{success}</div>}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">{emptyMessage}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {columns.map((column) => (
                    <th key={column.header} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {items.map((item, idx) => (
                  <tr key={idx}>
                    {columns.map((column) => (
                      <td key={`${column.header}-${idx}`} className="px-4 py-3 text-sm text-gray-700">
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
        <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">{createLabel}</h2>
          <p className="text-xs text-gray-500">Fields marked with ** are mandatory.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={String(field.key)} className="space-y-1 text-sm text-gray-700">
                <span>{field.required ? `${field.label} **` : field.label}</span>
                <input
                  type={field.type}
                  required={field.required}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
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
              className="rounded bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

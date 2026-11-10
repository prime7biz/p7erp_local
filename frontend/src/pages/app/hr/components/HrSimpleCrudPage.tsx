import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrStatusBadge } from "@/components/hr/HrStatusBadge";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrEmployeeCell, HrEmployeeSelect } from "@/components/hr/kit/HrEmployeeFields";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import type { HrRowAction } from "@/components/hr/kit/rowActions";
import { useEmployeeLookup } from "@/components/hr/kit/useEmployeeLookup";
import { useAuth } from "@/context/AuthContext";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";
import { canExportHrData } from "@/lib/roles";

type CellPrimitive = string | number | boolean | null;

export interface HrColumn<TItem> {
  header: string;
  cell: (item: TItem) => CellPrimitive;
  /**
   * How the value is shown: `employee` (cell returns the employee id → avatar + name),
   * `status` (coloured badge + status filter chips), `money` (right-aligned, 2 decimals).
   */
  kind?: "text" | "employee" | "status" | "money";
  hideOnMobile?: boolean;
}

export interface HrFormOption {
  value: string | number;
  label: string;
}

export interface HrFormField<TCreate extends object> {
  key: keyof TCreate;
  label: string;
  /** `employee` = search by code or name; `select` = pick from `options`. */
  type: "text" | "number" | "date" | "datetime-local" | "textarea" | "employee" | "select";
  required?: boolean;
  options?: HrFormOption[];
  placeholder?: string;
  hint?: string;
}

interface HrSimpleCrudPageProps<TItem, TCreate extends object> {
  title: string;
  description: string;
  emptyMessage: string;
  /** Shown under the empty-state title (what to do first). */
  emptyHint?: string;
  columns: HrColumn<TItem>[];
  loadItems: () => Promise<TItem[]>;
  createItem?: (payload: TCreate) => Promise<unknown>;
  createLabel?: string;
  fields?: HrFormField<TCreate>[];
  initialForm?: TCreate;
  /** Optional breadcrumbs for enterprise HR layout */
  breadcrumbs?: { label: string; href?: string }[];
  /** Extra content below the table (e.g. batch actions) */
  footer?: ReactNode;
  /** Show the English / বাংলা switch (employee self-service pages). */
  showLanguageSwitcher?: boolean;
  /** Row buttons: up to two `primary` actions are shown, the rest go in the Actions menu. */
  rowActions?: (item: TItem, ctx: { refresh: () => Promise<void> }) => HrRowAction[];
  /** Enables Export CSV (managers and admins only) with this file name. */
  exportFileName?: string;
  rowKey?: (item: TItem) => string | number;
}

const inputClass =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary/40";

function formatMoney(v: CellPrimitive): string {
  if (v == null || v === "") return "-";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v);
}

function defaultRowKey(item: unknown, index: number): string | number {
  const id = (item as { id?: unknown } | null)?.id;
  return typeof id === "number" || typeof id === "string" ? id : index;
}

export function HrSimpleCrudPage<TItem, TCreate extends object>(props: HrSimpleCrudPageProps<TItem, TCreate>) {
  const {
    title,
    description,
    emptyMessage,
    emptyHint,
    columns,
    loadItems,
    createItem,
    createLabel,
    fields = [],
    initialForm,
    breadcrumbs,
    footer,
    showLanguageSwitcher = false,
    rowActions,
    exportFileName,
    rowKey,
  } = props;
  const { t } = useTranslation();
  const { me } = useAuth();
  // Pages pass `loadItems` inline; keep the latest in a ref so `refresh` is stable and doesn't refetch every render.
  const loadItemsRef = useRef(loadItems);
  loadItemsRef.current = loadItems;
  const [items, setItems] = useState<TItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [formError, setFormError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [form, setForm] = useState<TCreate | null>(initialForm ?? null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const rows = await loadItemsRef.current();
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("crud.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const employeeColumns = columns.filter((c) => c.kind === "employee");
  const employeeIds = useMemo(
    () => items.flatMap((item) => employeeColumns.map((c) => c.cell(item))).filter((v): v is number => typeof v === "number"),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- columns are recreated by pages each render; ids depend on items.
    [items],
  );
  const lookup = useEmployeeLookup(employeeIds);

  const tableColumns: HrTableColumn<TItem>[] = columns.map((c, index) => {
    const key = `${index}-${c.header}`;
    if (c.kind === "employee") {
      return {
        key,
        header: c.header,
        hideOnMobile: c.hideOnMobile,
        render: (row) => <HrEmployeeCell id={c.cell(row) as number | null} lookup={lookup} />,
        value: (row) => {
          const id = c.cell(row);
          const emp = typeof id === "number" ? lookup(id) : null;
          return emp ? `${emp.full_name} ${emp.employee_code}` : id == null ? "" : `#${String(id)}`;
        },
      };
    }
    if (c.kind === "status") {
      return {
        key,
        header: c.header,
        hideOnMobile: c.hideOnMobile,
        render: (row) => {
          const v = c.cell(row);
          return v == null || v === "" ? <span className="text-text-muted">-</span> : <HrStatusBadge status={String(v)} />;
        },
        value: (row) => c.cell(row),
      };
    }
    if (c.kind === "money") {
      return {
        key,
        header: c.header,
        align: "right",
        hideOnMobile: c.hideOnMobile,
        render: (row) => <span className="tabular-nums">{formatMoney(c.cell(row))}</span>,
        value: (row) => c.cell(row),
      };
    }
    return {
      key,
      header: c.header,
      hideOnMobile: c.hideOnMobile,
      render: (row) => String(c.cell(row) ?? "-"),
      value: (row) => c.cell(row),
    };
  });
  const statusColumn = columns.find((c) => c.kind === "status");

  const setField = (field: HrFormField<TCreate>, rawValue: string | number | null): void => {
    setForm((prev) => {
      if (!prev) return prev;
      let next: unknown = rawValue;
      const current = prev[field.key];
      if (field.type === "number") {
        next = rawValue === "" || rawValue == null ? (current === null ? null : 0) : Number(rawValue);
      } else if (field.type === "employee") {
        next = rawValue == null ? 0 : Number(rawValue);
      } else if (field.type === "select") {
        const opt = field.options?.find((o) => String(o.value) === String(rawValue));
        const numeric = (field.options ?? []).some((o) => typeof o.value === "number");
        // Cleared optional number pickers send null (not ""), so the API sees "no value".
        next = opt ? opt.value : numeric ? (field.required ? 0 : null) : "";
      }
      return { ...prev, [field.key]: next } as TCreate;
    });
  };

  const openCreate = () => {
    setForm(initialForm ?? null);
    setFormError("");
    setSuccess("");
    setDrawerOpen(true);
  };

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!createItem || !form) return;
    const missing = fields.find((f) => {
      if (!f.required || (f.type !== "employee" && f.type !== "select")) return false;
      const v = form[f.key] as unknown;
      return v == null || v === "" || v === 0;
    });
    if (missing) {
      setFormError(`${missing.label}: ${t("crud.chooseOption")}`);
      return;
    }
    setSubmitting(true);
    setFormError("");
    setSuccess("");
    try {
      await createItem(form);
      setSuccess(t("crud.savedOk"));
      setForm(initialForm ?? null);
      setDrawerOpen(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("crud.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const canCreate = Boolean(createItem && form && fields.length > 0);
  const createButton = canCreate ? (
    <button
      type="button"
      onClick={openCreate}
      className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90"
    >
      + {createLabel ?? t("crud.add")}
    </button>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader title={title} description={description} breadcrumbs={breadcrumbs} />
        <div className="flex flex-wrap items-center gap-2">
          {showLanguageSwitcher ? <LanguageSwitcher /> : null}
          {createButton}
        </div>
      </div>

      {success && (
        <div role="status" className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">
          {success}
        </div>
      )}

      <HrDataTable<TItem>
        rows={items}
        rowKey={(item) => (rowKey ? rowKey(item) : defaultRowKey(item, items.indexOf(item)))}
        columns={tableColumns}
        loading={loading}
        error={error}
        onRetry={() => void refresh()}
        onRefresh={() => void refresh()}
        emptyTitle={emptyMessage}
        emptyHint={emptyHint}
        emptyAction={createButton}
        searchPlaceholder={t("crud.search")}
        statusOf={statusColumn ? (row) => String(statusColumn.cell(row) ?? "") : undefined}
        rowActions={rowActions ? (row) => rowActions(row, { refresh }) : undefined}
        exportFileName={exportFileName}
        canExport={canExportHrData(me?.role_name)}
        labels={{
          refresh: t("crud.refresh"),
          exportCsv: t("crud.exportCsv"),
          retry: t("crud.retry"),
          clearSearch: t("crud.clearSearch"),
          all: t("crud.all"),
          actions: t("crud.actions"),
          filterByStatus: t("crud.filterByStatus"),
          loading: t("crud.loading"),
          // i18next would fill {{query}} itself; keep the placeholder for the table to replace.
          noMatch: t("crud.noMatch", { query: "{{query}}", interpolation: { escapeValue: false } }),
        }}
      />

      {footer}

      {canCreate && form ? (
        <HrFormDrawer
          open={drawerOpen}
          title={createLabel ?? t("crud.add")}
          description={t("crud.mandatoryNote")}
          onClose={() => setDrawerOpen(false)}
          onSubmit={(e) => void onSubmit(e)}
          submitLabel={t("crud.save")}
          submitting={submitting}
          error={formError}
          labels={{ cancel: t("crud.cancel"), saving: t("crud.saving"), close: t("crud.close") }}
        >
          <div className="grid grid-cols-1 gap-4">
            {fields.map((field) => {
              const id = `hr-crud-${String(field.key)}`;
              const value = form[field.key] as unknown;
              return (
                <div key={String(field.key)} className="space-y-1">
                  <label htmlFor={id} className="block text-sm font-medium text-text-secondary">
                    {field.required ? `${field.label} **` : field.label}
                  </label>
                  {field.type === "employee" ? (
                    <HrEmployeeSelect
                      id={id}
                      value={typeof value === "number" && value > 0 ? value : null}
                      onChange={(next) => setField(field, next)}
                      required={field.required}
                    />
                  ) : field.type === "select" ? (
                    <select
                      id={id}
                      required={field.required}
                      className={inputClass}
                      value={value == null || value === 0 ? "" : String(value)}
                      onChange={(e) => setField(field, e.target.value)}
                    >
                      <option value="">{field.placeholder ?? t("crud.chooseOption")}</option>
                      {(field.options ?? []).map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      id={id}
                      required={field.required}
                      rows={3}
                      className={inputClass}
                      placeholder={field.placeholder}
                      value={String(value ?? "")}
                      onChange={(e) => setField(field, e.target.value)}
                    />
                  ) : (
                    <input
                      id={id}
                      type={field.type}
                      required={field.required}
                      className={inputClass}
                      placeholder={field.placeholder}
                      value={value == null ? "" : String(value)}
                      onChange={(e) => setField(field, e.target.value)}
                    />
                  )}
                  {field.hint ? <p className="text-xs text-text-muted">{field.hint}</p> : null}
                </div>
              );
            })}
          </div>
        </HrFormDrawer>
      ) : null}
    </div>
  );
}

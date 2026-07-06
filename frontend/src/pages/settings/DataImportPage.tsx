import { useEffect, useState } from "react";

import { api, type DataMigrationImportResponse, type DataMigrationTemplateEntity } from "@/api/client";
import { listPageErrorClass, listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";
import { Button } from "@/components/ui/button";

export function DataImportPage() {
  const [templates, setTemplates] = useState<DataMigrationTemplateEntity[]>([]);
  const [entityType, setEntityType] = useState("customers");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DataMigrationImportResponse | null>(null);

  useEffect(() => {
    api
      .listDataMigrationTemplates()
      .then((data) => {
        const entities = data.entities ?? [];
        setTemplates(entities);
        const first = entities[0];
        if (first) setEntityType(first.entity_type);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load import templates"))
      .finally(() => setLoading(false));
  }, []);

  const selectedTemplate = templates.find((t) => t.entity_type === entityType);

  async function runImport(dryRun: boolean) {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    if (!dryRun) {
      const ok = window.confirm(
        "Import will create records in your tenant. Continue only after a successful dry-run preview.",
      );
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await api.importDataMigrationCsv({
        entity_type: entityType,
        dry_run: dryRun,
        file,
      });
      setResult(data);
      if (data.errors?.length) {
        setError(data.errors.join("; "));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadSampleCsv() {
    const cols = selectedTemplate?.required_columns ?? ["code", "name"];
    const header = cols.join(",");
    const sampleRow =
      entityType === "items"
        ? "ITEM-001,Sample item,PCS"
        : entityType === "employees"
          ? "EMP-001,First name"
          : "CODE-001,Sample name";
    const blob = new Blob([`${header}\n${sampleRow}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entityType}-import-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p>Loading data import templates…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary">Data import</h2>
        <p className="text-sm text-text-muted">
          Upload CSV files to migrate customers, vendors, items, and more. Always run a dry-run preview first.
        </p>
      </div>

      {error && <div className={listPageErrorClass}>{error}</div>}

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-4">
        <label className="block text-sm">
          <span className="text-text-muted">Entity type</span>
          <select
            className="mt-1 w-full max-w-md rounded-lg border border-border px-3 py-2 text-sm"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setResult(null);
            }}
          >
            {templates.map((t) => (
              <option key={t.entity_type} value={t.entity_type}>
                {t.entity_type}
              </option>
            ))}
          </select>
        </label>

        {selectedTemplate && (
          <div className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">Required columns: </span>
            {selectedTemplate.required_columns.join(", ")}
            <button
              type="button"
              onClick={downloadSampleCsv}
              className="ml-3 text-brand-primary hover:underline"
            >
              Download sample CSV
            </button>
          </div>
        )}

        <label className="block text-sm">
          <span className="text-text-muted">CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="mt-1 block w-full max-w-md text-sm"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy || !file} onClick={() => void runImport(true)}>
            {busy ? "Running…" : "Dry-run preview"}
          </Button>
          <Button type="button" disabled={busy || !file} onClick={() => void runImport(false)}>
            {busy ? "Importing…" : "Commit import"}
          </Button>
        </div>
      </div>

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              Mode: <strong>{result.dry_run ? "Dry-run" : "Committed"}</strong>
            </span>
            {result.total_rows != null && <span>Rows: {result.total_rows}</span>}
            {result.ok_count != null && <span className="text-status-success-foreground">OK: {result.ok_count}</span>}
            {result.skip_count != null && <span>Skipped: {result.skip_count}</span>}
            {result.error_count != null && (
              <span className="text-status-danger-foreground">Errors: {result.error_count}</span>
            )}
            {result.message && <span>{result.message}</span>}
          </div>

          {result.rows && result.rows.length > 0 && (
            <div className="rounded-xl border border-border bg-surface-raised overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle border-b border-border text-left">
                  <tr>
                    <th className={listTableHeadCellClass}>Row</th>
                    <th className={listTableHeadCellClass}>Status</th>
                    <th className={listTableHeadCellClass}>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.row_number} className={listTableRowClass}>
                      <td className="py-2 px-4">{row.row_number}</td>
                      <td className="py-2 px-4">
                        <span
                          className={
                            row.status === "error"
                              ? "text-status-danger-foreground"
                              : row.status === "skip"
                                ? "text-text-muted"
                                : "text-status-success-foreground"
                          }
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-text-secondary">{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

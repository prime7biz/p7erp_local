import { useEffect, useState, type FormEvent } from "react";

import { mfgPlanningApi as mp, type SmvConfidence, type SmvSource } from "@/api/mfgPlanning";
import { useMfgResource } from "@/hooks/useManufacturingIntelligence";
import { logApiError } from "@/utils/logApiError";

import { formatDate } from "../formatDecimal";
import { Chip } from "../IntelligenceUi";
import { friendlyError, SMV_CONFIDENCES, SMV_SOURCE_LABEL, SMV_SOURCES, smvDraftErrors } from "./phase2Logic";
import { ErrorBox, ErrorList, inputCls, labelCls, NoticeBox, primaryBtn, SelectField, TextField } from "./Phase2Ui";

/** Shows and approves a style's standard SMV (minutes per piece). Saving needs production.planning.approve. */
export function StyleSmvEditor({ styleId, styleLabel, canEdit = true }: { styleId: number; styleLabel?: string; canEdit?: boolean }) {
  const current = useMfgResource("StyleSmvEditor", String(styleId), () => mp.getStyleSmv(styleId));
  const [smv, setSmv] = useState("");
  const [source, setSource] = useState<string>("");
  const [confidence, setConfidence] = useState<string>("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const d = current.data;

  useEffect(() => {
    if (!d) return;
    setSmv(d.standard_smv ?? "");
    setSource(d.standard_smv_source ?? "");
    setConfidence(d.standard_smv_confidence ?? "");
    setReason("");
  }, [d]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const errs = smvDraftErrors({ smv, source, confidence, reason });
    setErrors(errs);
    if (errs.length || saving) return;
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const res = await mp.putStyleSmv(styleId, { smv: smv.trim(), source: source as SmvSource, confidence: confidence as SmvConfidence, reason: reason.trim() });
      setSaved(res.changed === false ? "Nothing changed (same values)." : "Standard SMV approved.");
      current.reload();
    } catch (err) {
      logApiError("StyleSmvEditor.save", err);
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-subtle p-3" data-testid="mfg-style-smv">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-text-primary">Standard SMV for {d?.style_code ?? styleLabel ?? `style #${styleId}`}</span>
        {d?.standard_smv ? (
          <Chip tone="good">
            {d.standard_smv} min · {SMV_SOURCE_LABEL[d.standard_smv_source ?? ""] ?? d.standard_smv_source} · {d.standard_smv_confidence}
          </Chip>
        ) : d ? (
          <Chip tone="warn">Not set</Chip>
        ) : null}
        {d?.standard_smv_updated_at ? (
          <span className="text-[11px] text-text-muted">
            updated {formatDate(d.standard_smv_updated_at)}
            {d.standard_smv_approved_by_name ? ` by ${d.standard_smv_approved_by_name}` : ""}
          </span>
        ) : null}
      </div>
      {current.loading ? <p className="text-xs text-text-muted" role="status">Loading…</p> : null}
      <ErrorBox message={current.error} />
      {d && !canEdit ? <p className="text-[11px] text-text-muted">Approving a style SMV needs planning approval rights.</p> : null}
      {d && canEdit ? (
        <form className="space-y-2" onSubmit={(e) => void save(e)}>
          <p className="text-[11px] text-text-muted">Planning uses this SMV for the style when no approved operation bulletin is linked.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField id={`smv-${styleId}-value`} label="SMV (minutes per piece)" required inputMode="decimal" value={smv} onChange={setSmv} />
            <SelectField
              id={`smv-${styleId}-source`}
              label="Comes from"
              required
              value={source}
              onChange={setSource}
              options={SMV_SOURCES.map((s) => ({ value: s, label: SMV_SOURCE_LABEL[s] ?? s }))}
            />
            <SelectField
              id={`smv-${styleId}-conf`}
              label="Confidence"
              required
              value={confidence}
              onChange={setConfidence}
              options={SMV_CONFIDENCES.map((c) => ({ value: c, label: c.charAt(0) + c.slice(1).toLowerCase() }))}
            />
          </div>
          <div>
            <label htmlFor={`smv-${styleId}-reason`} className={labelCls}>
              Reason * (at least 5 characters)
            </label>
            <textarea id={`smv-${styleId}-reason`} rows={2} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <ErrorList errors={errors} />
          <ErrorBox message={error} />
          {saved ? <NoticeBox tone="good">{saved}</NoticeBox> : null}
          <button type="submit" className={primaryBtn} disabled={saving}>
            {saving ? "Saving…" : "Approve SMV"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

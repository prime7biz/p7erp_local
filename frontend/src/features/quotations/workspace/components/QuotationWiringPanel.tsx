import { useState } from "react";
import { Link } from "react-router-dom";
import type {
  CostingItemResponse,
  ItemUnitResponse,
  QuotationDetailResponse,
  QuotationManufacturingLine,
  QuotationMaterialLine,
  QuotationOtherCostLine,
  QuotationSizeRatioLine,
} from "@/api/client";
import type { QuotationPrefillContext, QuotationWiringContext } from "@/api/quotationWiring.types";
import { LocalSearchSelect } from "@/components/app/LocalSearchSelect";
import {
  computeManufacturingLineAmounts,
  computeMaterialLineAmounts,
  sizeQuantityFromRatio,
} from "../mappers/quotationNumeric";
import { bomLinesToMaterialRows, copyLines, sizesToRatioRows } from "../mappers/wiringDraftRows";
import { CopyCostingModal, type CopyCostingChoice } from "./CopyCostingModal";

interface Props {
  quotation: QuotationDetailResponse;
  isNew: boolean;
  isEditing: boolean;
  /** APPROVED / SENT / CONVERTED / superseded: costing cannot change. */
  locked: boolean;
  prefill: QuotationPrefillContext | null;
  wiring: QuotationWiringContext | null;
  items: CostingItemResponse[];
  units: ItemUnitResponse[];
  materials: QuotationMaterialLine[];
  sizeRatios: QuotationSizeRatioLine[];
  projectedQty: number;
  setMaterials: (rows: QuotationMaterialLine[]) => void;
  setManufacturing: (rows: QuotationManufacturingLine[]) => void;
  setOtherCosts: (rows: QuotationOtherCostLine[]) => void;
  setSizeRatios: (rows: QuotationSizeRatioLine[]) => void;
  updateQuotationHeader: (patch: Partial<QuotationDetailResponse>) => void;
}

const btn =
  "rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50";

/** Suggestions from other modules. Buttons only fill DRAFT rows; the user confirms with Save. */
export function QuotationWiringPanel(props: Props) {
  const { quotation, isNew, isEditing, locked, prefill, wiring, items, units, materials, sizeRatios, projectedQty } = props;
  const [scaleId, setScaleId] = useState<number | "">("");
  const [showCopy, setShowCopy] = useState(false);
  const [notice, setNotice] = useState("");

  const bom = prefill?.style_bom ?? wiring?.style_bom ?? null;
  const scales = prefill?.style_size_scales ?? wiring?.style_size_scales ?? [];
  const bookings = wiring?.tentative_bookings ?? [];
  const canEdit = isEditing && !locked;
  const hasStyle = Boolean(quotation.style_id);
  const effectiveScale = scales.find((s) => s.id === scaleId) ?? scales[0] ?? null;
  const currency = quotation.currency ?? "USD";

  const lockedHint = locked ? "Costing is locked (approved / sent / converted). Create a new version to change it." : "";
  const editHint = !isEditing && !locked ? "Click Edit to use suggestions." : "";

  function suggestMaterials() {
    if (!bom) return;
    const { rows, skipped } = bomLinesToMaterialRows({
      lines: bom.lines,
      existing: materials,
      items,
      units,
      projectedQuantity: projectedQty,
      quotationCurrency: currency,
    });
    props.setMaterials([...materials, ...rows]);
    setNotice(
      `Added ${rows.length} material line(s) from BOM ${bom.bom_code ?? `#${bom.bom_id}`}` +
        `${skipped ? ` (${skipped} already on the quotation)` : ""}. ` +
        "Consumption is per piece x 12; wastage is not applied and prices are 0. Review, then Save.",
    );
  }

  function loadSizes() {
    if (!effectiveScale) return;
    const rows = sizesToRatioRows(effectiveScale.sizes, projectedQty);
    if (rows.length === 0) return;
    if (
      sizeRatios.length > 0 &&
      !window.confirm("Replace the current size ratio rows with the style size scale (equal split)?")
    ) {
      return;
    }
    props.setSizeRatios(rows);
    props.updateQuotationHeader({ size_ratio_enabled: true });
    setNotice(`Loaded ${rows.length} size(s) from scale "${effectiveScale.scale_name ?? effectiveScale.id}" with an equal split. Adjust ratios, then Save.`);
  }

  function importFrom(source: QuotationDetailResponse, choice: CopyCostingChoice) {
    const parts: string[] = [];
    if (choice.materials) {
      props.setMaterials(
        copyLines(source.materials ?? []).map((m) => ({ ...m, ...computeMaterialLineAmounts(m, projectedQty, currency) })),
      );
      parts.push("materials");
    }
    if (choice.manufacturing) {
      props.setManufacturing(
        copyLines(source.manufacturing ?? []).map((m) => ({ ...m, ...computeManufacturingLineAmounts(m, projectedQty) })),
      );
      parts.push("labor / CM");
    }
    if (choice.otherCosts) {
      props.setOtherCosts(copyLines(source.other_costs ?? []));
      parts.push("other costs");
    }
    if (choice.sizeRatios) {
      props.setSizeRatios(
        copyLines(source.size_ratios ?? []).map((r) => ({ ...r, quantity: sizeQuantityFromRatio(projectedQty, r.ratio_percentage) })),
      );
      props.updateQuotationHeader({ size_ratio_enabled: Boolean(source.size_ratio_enabled) });
      parts.push("size ratios");
    }
    setNotice(`Copied ${parts.join(", ")} from ${source.quotation_code} into the draft. Check prices and currency, then Save.`);
  }

  const showAnything = canEdit || locked || bookings.length > 0 || hasStyle;
  if (!showAnything) return null;

  return (
    <div className="no-print rounded-2xl border border-border bg-surface-raised p-4 shadow-sm" aria-label="Costing suggestions">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-text-primary">Suggestions</span>
        <button
          type="button"
          className={btn}
          disabled={!canEdit || !hasStyle || !bom || bom.lines.length === 0}
          title={lockedHint || editHint || (!hasStyle ? "Pick a style first" : !bom ? "This style has no BOM yet" : "")}
          onClick={suggestMaterials}
        >
          Suggest materials from Style BOM
        </button>
        <button
          type="button"
          className={btn}
          disabled={!canEdit || !hasStyle || !effectiveScale || effectiveScale.sizes.length === 0}
          title={lockedHint || editHint || (!hasStyle ? "Pick a style first" : scales.length === 0 ? "This style has no size scale" : "")}
          onClick={loadSizes}
        >
          Load sizes from Style Scale
        </button>
        {scales.length > 1 ? (
          <div className="w-44">
            <LocalSearchSelect
              value={effectiveScale?.id ?? ""}
              onChange={(next) => setScaleId(next === "" ? "" : Number(next))}
              options={scales.map((s) => ({ value: s.id, label: s.scale_name ?? `Scale #${s.id}` }))}
              placeholder="Size scale"
              aria-label="Style size scale"
              disabled={!canEdit}
              menuPortal
            />
          </div>
        ) : null}
        <button
          type="button"
          className={btn}
          disabled={!canEdit}
          title={lockedHint || editHint}
          onClick={() => setShowCopy(true)}
        >
          Copy costing from another quotation
        </button>
      </div>

      {locked ? <p className="mt-2 text-xs text-text-muted">{lockedHint}</p> : null}
      {notice ? (
        <p className="mt-2 text-xs text-text-secondary" role="status">
          {notice}
        </p>
      ) : null}
      {hasStyle && prefill && !bom && prefill.omitted?.style_bom == null ? (
        <p className="mt-2 text-xs text-text-muted">No BOM found for this style, so there is nothing to suggest.</p>
      ) : null}

      {bookings.length > 0 ? (
        <div className="mt-3 text-xs text-text-secondary">
          <div className="font-medium text-text-primary">Tentative line bookings for this quotation</div>
          <ul className="mt-1 space-y-0.5">
            {bookings.map((b) => (
              <li key={b.id}>
                {b.status} · starts {b.start_date}
                {b.planned_end_date ? ` – ${b.planned_end_date}` : ""}
                {b.planned_qty ? ` · ${b.planned_qty} pcs` : ""}
                {b.confidence_pct ? ` · ${b.confidence_pct}%` : ""}
              </li>
            ))}
          </ul>
          <Link to="/app/control-tower?tab=tentative" className="mt-1 inline-block text-brand-primary hover:underline">
            Open Tentative demand
          </Link>
        </div>
      ) : null}

      {showCopy ? (
        <CopyCostingModal currentId={isNew ? 0 : quotation.id} onClose={() => setShowCopy(false)} onImport={importFrom} />
      ) : null}
    </div>
  );
}

/** One line of helper text near Labor / CM: style SMV and factory cost per minute, when the caller may see them. */
export function ManufacturingWiringHint({
  prefill,
  wiring,
}: {
  prefill: QuotationPrefillContext | null;
  wiring: QuotationWiringContext | null;
}) {
  const planning = wiring?.style_planning ?? prefill?.style_planning ?? null;
  const cpm = wiring?.factory_cpm ?? prefill?.factory_cpm ?? null;
  const smv = planning?.standard_smv ?? null;
  const cpmValue = cpm?.value ?? null;
  if (!smv && !cpmValue) return null;
  return (
    <p className="no-print mb-2 text-xs text-text-muted">
      {smv ? (
        <span>
          Style standard SMV: <strong>{smv}</strong> min
          {planning?.standard_smv_source ? ` (${planning.standard_smv_source})` : ""}.{" "}
        </span>
      ) : null}
      {cpmValue ? (
        <span>
          Factory cost per minute (CPM): <strong>{cpmValue}</strong>
          {cpm?.source ? ` (${cpm.source})` : ""}.{" "}
        </span>
      ) : null}
      <span>For guidance only; enter your own CM figures.</span>
    </p>
  );
}

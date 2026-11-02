import { useEffect, useState } from "react";
import { api, type SettingsConfigUpdate, type TenantType } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

const TENANT_TYPE_OPTIONS: Array<{ value: TenantType; label: string }> = [
  { value: "manufacturer", label: "Manufacturer" },
  { value: "buying_house", label: "Buying House" },
  { value: "both", label: "Both" },
];

export function ConfigurationPage() {
  const { refetch: refetchMe } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean | string | number | null>>({});
  const [form, setForm] = useState<SettingsConfigUpdate>({
    company_name: "",
    domain: "",
    logo: "",
    tenant_type: "both",
    country_code: null,
    timezone: null,
  });

  useEffect(() => {
    api
      .getSettingsConfig()
      .then((data) => {
        setCompanyCode(data.company_code ?? "N/A");
        setFeatureFlags(
          data.feature_flags && typeof data.feature_flags === "object" && !Array.isArray(data.feature_flags)
            ? { ...data.feature_flags }
            : {},
        );
        setForm({
          company_name: data.company_name,
          domain: data.domain ?? "",
          logo: data.logo ?? "",
          tenant_type: data.tenant_type,
          country_code: data.country_code ?? null,
          timezone: data.timezone ?? null,
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await api.updateSettingsConfig({
        company_name: form.company_name.trim(),
        domain: form.domain?.trim() || null,
        logo: form.logo?.trim() || null,
        tenant_type: form.tenant_type,
        feature_flags: { ...featureFlags },
        country_code: form.country_code?.trim() || null,
        timezone: form.timezone?.trim() || null,
      });
      setFeatureFlags(
        updated.feature_flags && typeof updated.feature_flags === "object" && !Array.isArray(updated.feature_flags)
          ? { ...updated.feature_flags }
          : {},
      );
      setForm({
        company_name: updated.company_name,
        domain: updated.domain ?? "",
        logo: updated.logo ?? "",
        tenant_type: updated.tenant_type,
        country_code: updated.country_code ?? null,
        timezone: updated.timezone ?? null,
      });
      await refetchMe();
      setSuccess("Configuration updated successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading configuration...</p>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-text-primary">Configuration</h2>
        <p className="text-sm text-text-secondary">
          Update basic company settings for this tenant.
        </p>
        <p className="text-xs text-text-muted mt-1">Fields marked with ** are mandatory.</p>
      </div>

      {(error || success) && (
        <div className="space-y-2">
          {error && <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div>}
          {success && <div className="rounded border border-status-success/20 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div>}
        </div>
      )}

      <div className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm text-text-secondary">
        Company code: <span className="font-semibold">{companyCode}</span>
      </div>

      <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-border bg-surface-raised p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Company name **</label>
          <input
            value={form.company_name}
            onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Domain (optional)</label>
          <input
            value={form.domain ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, domain: e.target.value }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            placeholder="example.com"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Logo URL (optional)</label>
          <input
            value={form.logo ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, logo: e.target.value }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Tenant type</label>
          <select
            value={form.tenant_type}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, tenant_type: e.target.value as TenantType }))
            }
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          >
            {TENANT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Country code (ISO)</label>
          <input
            value={form.country_code ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, country_code: e.target.value || null }))}
            className="w-full max-w-[140px] rounded-lg border border-border px-3 py-2 text-sm uppercase"
            placeholder="e.g. BD"
            maxLength={4}
          />
          <p className="mt-1 text-xs text-text-muted">Used for factory calendar public holiday import.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Timezone (IANA)</label>
          <input
            value={form.timezone ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value || null }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            placeholder="e.g. Asia/Dhaka"
            maxLength={64}
          />
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3">
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.require_master_contract_for_rm === true}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  require_master_contract_for_rm: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Require master contract for RM procurement</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                When enabled, purchase orders and GRNs linked to an order (or BTB LC without a master contract) are
                blocked until <code className="rounded bg-surface-raised px-1">Order.master_contract_id</code> or BTB →
                master contract is set. Recommended for bank-financed workflows.
              </span>
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3">
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.trade_enabled !== false}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  trade_enabled: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Enable Trade module</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                When unchecked, Trade Cases, Trade dashboard, Logistics, and trade reports are hidden for this tenant
                (requires <code className="rounded bg-surface-raised px-1">buying_house</code> or{" "}
                <code className="rounded bg-surface-raised px-1">both</code> tenant type). Leave checked for default
                behaviour.
              </span>
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3">
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.knitting_enabled === true}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  knitting_enabled: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Enable Knitting module</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                When checked, Manufacturing shows <strong>Knitting</strong> (hub page), APIs open, charge rates/work orders
                are available. Turn off for tenants without an in‑house knitting unit. Keep <strong>Knitting</strong> in{" "}
                <strong>Production setup → optional units</strong> enabled for machines and hourly capture.
              </span>
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-3">
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.control_tower_enabled === true}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  control_tower_enabled: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Enable Operations Control Tower</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                Shows the <strong>Operations → Control Tower</strong> screen and allows related read APIs (order grid,
                master LC snapshot, capacity heatmap, finance exposure). Off by default during rollout.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.auto_line_booking_enabled === true}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  auto_line_booking_enabled: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Auto-propose line bookings</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                When enabled, the system may create a <strong>DRAFT</strong> sewing-line reservation as orders move
                through the pipeline (requires planning data). Manual planning still works when off.
              </span>
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Finance &amp; costing</p>
          <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
            <span className="font-medium text-text-primary">Budget enforcement mode</span>
            <select
              className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary"
              value={
                typeof featureFlags.budget_enforcement_mode === "string"
                  ? featureFlags.budget_enforcement_mode
                  : "off"
              }
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  budget_enforcement_mode: e.target.value,
                }))
              }
            >
              <option value="off">Off — no checks on voucher post</option>
              <option value="warn">Warn — allow post, show budget warnings</option>
              <option value="block">Block — refuse over-budget posts (override with permission)</option>
            </select>
            <span className="text-xs text-text-muted">
              Applies when posting vouchers that have cost-center lines and a FINAL budget for that month.
              Override requires <code className="text-[11px]">finance.budget_override</code>.
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.auto_post_wip_journal !== false}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  auto_post_wip_journal: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Auto-post WIP journals</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                When on (default), material issue / process-order paths post Inv↔WIP GL journals. Turn off to skip
                WIP auto-posting (production material issues fall back to COGS posting).
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.mis_reports_enabled !== false}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  mis_reports_enabled: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Enable MIS reports (fund flow, ratios, comparative)</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                On by default. Read-only financial MIS dashboard, fund flow, ratio analysis, comparative statements,
                and cash scenarios. Turn off to hide sidebar links and return 404 from MIS APIs.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.party_ledger_enabled === true}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  party_ledger_enabled: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Enable party ledger (bill-wise AR/AP)</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                Tracks customer/vendor bills, FIFO receipt/payment allocation, aging, and interest. Off by default.
                Related flags: <code className="text-[11px]">party_ledger_auto_allocate</code>,{" "}
                <code className="text-[11px]">party_ledger_interest_calc</code>.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.stock_hierarchy_enabled === true}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  stock_hierarchy_enabled: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Enable stock hierarchy</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                Nested stock groups, godown matrix, multi-price lists, and batch-aware stock transfers. Off by default.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.batch_tracking_enabled === true}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  batch_tracking_enabled: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Enable batch tracking</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                Auto-create batches on GRN and FIFO allocate on delivery challan when the item has batch tracking on.
                Requires stock hierarchy for full UI. Off by default.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.gst_system_enabled === true}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  gst_system_enabled: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Enable GST / tax ledger system</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                Tax ledgers, voucher tax preview/apply, and GSTR-1/2/3B. Off by default. Related:{" "}
                <code className="text-[11px]">auto_tax_calculation</code> (default on when GST is enabled).
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.auto_tax_calculation !== false}
              disabled={featureFlags.gst_system_enabled !== true}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  auto_tax_calculation: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Auto-calculate tax on vouchers</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                When GST is on, attempt to apply tax lines on voucher create/update (best-effort; needs tax ledgers).
              </span>
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Advanced vouchers (Sprint 4)</p>
          {(
            [
              ["credit_debit_note_enabled", "Credit / debit notes", "Create credit and debit notes linked to party bills."],
              ["stock_transfer_voucher_enabled", "Stock transfer vouchers", "Finance vouchers for inter-godown stock moves."],
              ["memorandum_voucher_enabled", "Memorandum vouchers", "Non-book memorandum register and convert to regular."],
              ["optional_voucher_enabled", "Optional vouchers", "Optional vouchers excluded from books until included."],
              ["post_dated_voucher_enabled", "Post-dated vouchers", "Post-dated register and activate-due workflow."],
              ["recurring_voucher_enabled", "Recurring vouchers", "Recurring templates with manual generate and history."],
              ["voucher_class_enabled", "Voucher classes", "Reusable voucher class templates with line prefills."],
            ] as const
          ).map(([key, title, desc]) => (
            <label key={key} className="flex items-start gap-3 text-sm text-text-secondary">
              <input
                type="checkbox"
                className="mt-1 rounded border-border-strong"
                checked={featureFlags[key] === true}
                onChange={(e) =>
                  setFeatureFlags((prev) => ({
                    ...prev,
                    [key]: e.target.checked,
                  }))
                }
              />
              <span>
                <span className="font-medium text-text-primary">{title}</span>
                <span className="mt-0.5 block text-xs text-text-muted">{desc} Off by default.</span>
              </span>
            </label>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Sprint 5 — TDS & statutory payroll</p>
          {(
            [
              [
                "tds_system_enabled",
                "TDS system",
                "TDS sections, deductions, Form 26Q/24Q reports, and party TDS assignment.",
              ],
              [
                "statutory_payroll_enabled",
                "Statutory payroll",
                "PF, ESI, PT auto-calculation on payroll runs and statutory config screen.",
              ],
            ] as const
          ).map(([key, title, desc]) => (
            <label key={key} className="flex items-start gap-3 text-sm text-text-secondary">
              <input
                type="checkbox"
                className="mt-1 rounded border-border-strong"
                checked={featureFlags[key] === true}
                onChange={(e) =>
                  setFeatureFlags((prev) => ({
                    ...prev,
                    [key]: e.target.checked,
                  }))
                }
              />
              <span>
                <span className="font-medium text-text-primary">{title}</span>
                <span className="mt-0.5 block text-xs text-text-muted">{desc} Off by default.</span>
              </span>
            </label>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Order execution spine</p>
          {(
            [
              [
                "tna_event_sync",
                "TNA event sync",
                "Auto-complete Follow-up TNA milestones from GRN, sample approval, challan, and hourly production.",
              ],
              [
                "require_order_id_on_shop_floor",
                "Require order on shop floor",
                "Hourly production upsert must include order_id (recommended for OTD tracking).",
              ],
              [
                "line_allocation_confirm_enabled",
                "Line allocation → TNA sync",
                "When firm line booking is confirmed, sync related TNA milestones (also needs TNA event sync).",
              ],
              [
                "sample_approval_gates_for_po",
                "Sample approvals gate BOM→PO",
                "Block generate PO from BOM until lab-dip / PP / bulk fabric approval TNA steps are done.",
              ],
              [
                "capa_blocks_challan",
                "Open CAPA blocks challan",
                "Refuse delivery challan POST while the order has open manufacturing CAPA records.",
              ],
              [
                "order_color_size_matrix_enabled",
                "Colour / size breakdown on orders",
                "Show a colour × size quantity grid on each order page. Confirmed orders can be redistributed but keep their confirmed total.",
              ],
              [
                "shop_floor_scan_enabled",
                "Shop-floor scan station",
                "Production → Scan station: scan bundles per operation on a tablet; keeps working when Wi-Fi drops and never double-counts a bundle.",
              ],
              [
                "packing_list_cartons_enabled",
                "Carton detail on packing lists",
                "Carton-range × colour × size lines on each packing list, with weights, CBM and the order's left-to-pack balance (uses the order colour/size breakdown when present).",
              ],
              [
                "traceability_enabled",
                "Traceability & certificates",
                "Inventory → Certificates & order trace: GOTS/OEKO-TEX/GRS certificates, fabric lots on cut tickets, and a buyer traceability report per order. Fabric lots need batch tracking (above) on at goods receipt.",
              ],
              [
                "commission_engine_enabled",
                "Commission engine",
                "Export & Import → Commission: commission earned from factories/buyers and paid to agents per shipment, with statements and draft vouchers.",
              ],
              [
                "po_color_size_matrix_enabled",
                "Colour / size breakdown on purchase orders",
                "Purchase order trace view: a colour × size grid per PO line (breakdown only; approved POs must keep the line quantity).",
              ],
              [
                "bd_bond_compliance_enabled",
                "Bangladesh bond & VAT registers",
                "Export & Import → Bond & VAT registers: UD entitlements and utilization, bond register, and Mushak 6.1 / 6.2 style registers with spreadsheet export.",
              ],
              [
                "ai_exception_agents_enabled",
                "AI exception agents",
                "AI Tools → Exception agents: finds overdue TNA actions, expiring LCs and BOM materials not on PO, plus an owner brief. Nothing is sent until a manager confirms.",
              ],
              [
                "ai_dashboard_cards_enabled",
                "Ask-a-metric dashboard cards",
                "Type a question on the dashboard (e.g. “late orders”) and pin the answer as a card. Answers come only from a fixed list of figures.",
              ],
            ] as const
          ).map(([key, title, help]) => (
            <label key={key} className="flex items-start gap-3 text-sm text-text-secondary">
              <input
                type="checkbox"
                className="mt-1 rounded border-border-strong"
                checked={featureFlags[key] === true}
                onChange={(e) =>
                  setFeatureFlags((prev) => ({
                    ...prev,
                    [key]: e.target.checked,
                  }))
                }
              />
              <span>
                <span className="font-medium text-text-primary">{title}</span>
                <span className="mt-0.5 block text-xs text-text-muted">{help}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">HR payroll</p>
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.payroll_auto_calculate_enabled === true}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  payroll_auto_calculate_enabled: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Payroll auto-calculate</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                Allows applying auto-calculated run lines from employee structure assignments (preview always
                available). Off by default.
              </span>
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            HR compliance / OCR / AI (Sprint H1)
          </p>
          {(
            [
              [
                "compliance_tracking_enabled",
                "Compliance tracking",
                "BSCI / WRAP / SEDEX frameworks, scoring, and audit readiness.",
              ],
              [
                "age_verification_required",
                "Age verification required",
                "Block under-15 hires and require DOB on create / Excel import.",
              ],
              [
                "medical_certificate_tracking_enabled",
                "Medical certificate tracking",
                "Medical records on employees and expiry reminders.",
              ],
              ["ocr_cv_extraction_enabled", "OCR: CV extraction", "AI Onboarding can extract fields from CVs."],
              [
                "ocr_id_extraction_enabled",
                "OCR: ID / birth certificate",
                "AI Onboarding can extract from national ID and birth certificates.",
              ],
              [
                "ocr_medical_extraction_enabled",
                "OCR: Medical certificate",
                "AI Onboarding can extract medical fitness fields.",
              ],
              [
                "auto_document_generation_enabled",
                "Auto document generation",
                "Generate ID cards, letters, age certs, and payslip PDFs.",
              ],
              [
                "ai_attendance_analysis_enabled",
                "AI: Attendance analysis",
                "Show attendance patterns on HR AI Insights.",
              ],
              [
                "ai_turnover_prediction_enabled",
                "AI: Turnover prediction",
                "Show turnover risk scores on HR AI Insights.",
              ],
              [
                "ai_payroll_anomaly_detection_enabled",
                "AI: Payroll anomaly detection",
                "Analyze payroll runs for anomalies on HR AI Insights.",
              ],
              [
                "ai_compliance_risk_prediction_enabled",
                "AI: Compliance risk prediction",
                "Framework readiness risks on HR AI Insights.",
              ],
            ] as const
          ).map(([key, title, help]) => (
            <label key={key} className="flex items-start gap-3 text-sm text-text-secondary">
              <input
                type="checkbox"
                className="mt-1 rounded border-border-strong"
                checked={featureFlags[key] === true}
                onChange={(e) =>
                  setFeatureFlags((prev) => ({
                    ...prev,
                    [key]: e.target.checked,
                  }))
                }
              />
              <span>
                <span className="font-medium text-text-primary">{title}</span>
                <span className="mt-0.5 block text-xs text-text-muted">{help}</span>
              </span>
            </label>
          ))}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save configuration"}
        </button>
      </form>
    </div>
  );
}


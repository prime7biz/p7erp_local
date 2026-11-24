import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { postBondTransfer, postPrincipalClaim, postRtv } from "@/api/materialControl";
import { useEmbeddedPage } from "@/components/app/embeddedPage";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import { useAuth } from "@/context/AuthContext";
import { fetchCustomerPage, hydrateCustomer } from "@/lib/remoteSelectFetchers";
import { logApiError } from "@/utils/logApiError";

type Mode = "bond" | "claim" | "rtv";

export function BondClaimRtvPage() {
  const embedded = useEmbeddedPage();
  const flags = useAuth().me?.feature_flags;
  const canBondClaim =
    flags?.material_physical_v1 === true && flags?.inbound_job_work_v1 === true;
  const canRtv = flags?.material_returns_v1 === true;
  const availableModes = useMemo(() => {
    const modes: Mode[] = [];
    if (canBondClaim) {
      modes.push("bond", "claim");
    }
    if (canRtv) modes.push("rtv");
    return modes;
  }, [canBondClaim, canRtv]);
  const [mode, setMode] = useState<Mode>(() => (canBondClaim ? "bond" : canRtv ? "rtv" : "bond"));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const first = availableModes[0];
    if (first && !availableModes.includes(mode)) {
      setMode(first);
    }
  }, [availableModes, mode]);

  // Bond
  const [contractId, setContractId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [bondQty, setBondQty] = useState("");

  // Claim
  const [customerId, setCustomerId] = useState<number | "">("");
  const [claimAmount, setClaimAmount] = useState("");

  // RTV
  const [vendorId, setVendorId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [itemId, setItemId] = useState("");
  const [rtvQty, setRtvQty] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "bond") {
        const res = await postBondTransfer({
          contract_id: Number(contractId),
          lines: [{ material_id: Number(materialId), qty: bondQty.trim() }],
          request_id: `ui-bond-${Date.now()}`,
        });
        setMessage(`Bond transfer ${res.transfer_no} (#${res.id}).`);
      } else if (mode === "claim") {
        if (typeof customerId !== "number" || customerId < 1) {
          setError("Select a customer");
          return;
        }
        const res = await postPrincipalClaim({
          customer_id: customerId,
          amount: claimAmount.trim(),
          contract_id: contractId ? Number(contractId) : null,
          request_id: `ui-claim-${Date.now()}`,
        });
        setMessage(`Principal claim ${res.claim_no} (#${res.id}).`);
      } else {
        const res = await postRtv({
          vendor_id: Number(vendorId),
          warehouse_id: Number(warehouseId),
          lines: [{ item_id: Number(itemId), qty: rtvQty.trim() }],
          request_id: `ui-rtv-${Date.now()}`,
        });
        setMessage(`RTV ${res.rtv_no} (#${res.id}).`);
      }
    } catch (err) {
      logApiError("BondClaimRtvPage.submit", err);
      setError(
        mode === "bond"
          ? "Bond transfer failed (need material_physical_v1 + inbound_job_work_v1)."
          : mode === "claim"
            ? "Claim failed (need material_physical_v1)."
            : "RTV failed (need material_returns_v1).",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!embedded ? (
        <AppPageHeader
          title="Bond / claim / RTV"
          description="Job-work bond (qty-only), principal claim, and vendor return"
        />
      ) : null}
      <p className="text-sm text-text-secondary">
        Physical counts stay on{" "}
        <Link className="text-brand-primary underline" to="/app/inventory/stock-adjustments">
          Stock adjustments
        </Link>
        .
      </p>
      {availableModes.length === 0 ? (
        <p className="text-sm text-status-warning-foreground">
          Turn on <code>material_physical_v1</code> + <code>inbound_job_work_v1</code> for bond/claim, or{" "}
          <code>material_returns_v1</code> for RTV.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["bond", "Bond transfer"],
            ["claim", "Principal claim"],
            ["rtv", "RTV"],
          ] as const
        )
          .filter(([id]) => availableModes.includes(id))
          .map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id);
              setError(null);
              setMessage(null);
            }}
            className={`rounded border px-2.5 py-1 text-sm ${
              mode === id ? "border-brand-primary bg-brand-primary/10" : "border-border"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <form onSubmit={onSubmit} className="max-w-md space-y-3">
        {mode === "bond" ? (
          <>
            <label className="block text-sm">
              <span className="text-text-secondary">Job-work contract id</span>
              <input
                className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                required
                inputMode="numeric"
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-secondary">Material id</span>
              <input
                className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
                value={materialId}
                onChange={(e) => setMaterialId(e.target.value)}
                required
                inputMode="numeric"
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-secondary">Qty</span>
              <input
                className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
                value={bondQty}
                onChange={(e) => setBondQty(e.target.value)}
                required
              />
            </label>
          </>
        ) : null}
        {mode === "claim" ? (
          <>
            <label className="block text-sm">
              <span className="text-text-secondary">Customer (principal)</span>
              <RemoteSearchSelect
                className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
                placeholder="Search customer…"
                value={customerId}
                onChange={(next) => setCustomerId(typeof next === "number" && next > 0 ? next : "")}
                fetchPage={fetchCustomerPage}
                hydrateById={hydrateCustomer}
                allowClear
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-secondary">Amount</span>
              <input
                className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
                value={claimAmount}
                onChange={(e) => setClaimAmount(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-secondary">Contract id (optional)</span>
              <input
                className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                inputMode="numeric"
              />
            </label>
          </>
        ) : null}
        {mode === "rtv" ? (
          <>
            <label className="block text-sm">
              <span className="text-text-secondary">Vendor id</span>
              <input
                className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                required
                inputMode="numeric"
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-secondary">Warehouse id</span>
              <input
                className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                required
                inputMode="numeric"
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-secondary">Item id</span>
              <input
                className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                required
                inputMode="numeric"
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-secondary">Qty</span>
              <input
                className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
                value={rtvQty}
                onChange={(e) => setRtvQty(e.target.value)}
                required
              />
            </label>
          </>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Saving…" : "Submit"}
        </button>
      </form>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

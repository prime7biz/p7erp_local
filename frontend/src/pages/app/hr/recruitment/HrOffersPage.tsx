import { useState } from "react";
import { api, type HrOfferCreate, type HrOfferResponse } from "@/api/client";
import type { HrRowAction } from "@/components/hr/kit/rowActions";
import { useHrOptions } from "@/components/hr/kit/useHrOptions";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

type OfferStatus = "sent" | "accepted" | "rejected" | "withdrawn";

export function HrOffersPage() {
  const [msg, setMsg] = useState("");
  const candidates = useHrOptions(
    "candidates",
    () => api.listHrCandidates(),
    (c) => ({ value: c.id, label: c.full_name }),
  );

  const setStatus = async (row: HrOfferResponse, status: OfferStatus, refresh: () => Promise<void>) => {
    if (status === "withdrawn" && !window.confirm(`Withdraw the offer for ${candidates.labelOf(row.candidate_id)}?`)) return;
    setMsg("");
    try {
      await api.postHrOfferStatus(row.id, { status });
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not update the offer");
    }
  };

  const actionsFor = (row: HrOfferResponse, refresh: () => Promise<void>): HrRowAction[] => {
    const go = (status: OfferStatus) => () => void setStatus(row, status, refresh);
    if (row.status === "draft") {
      return [
        { key: "send", label: "Mark sent", primary: true, onClick: go("sent") },
        { key: "withdraw", label: "Withdraw", danger: true, onClick: go("withdrawn") },
      ];
    }
    if (row.status === "sent") {
      return [
        { key: "accept", label: "Accepted", primary: true, tone: "positive", onClick: go("accepted") },
        { key: "reject", label: "Rejected", primary: true, onClick: go("rejected") },
        { key: "withdraw", label: "Withdraw", danger: true, onClick: go("withdrawn") },
      ];
    }
    return [];
  };

  return (
    <HrSimpleCrudPage<HrOfferResponse, HrOfferCreate>
      title="Offers"
      description="Create offers, mark them sent, and record the candidate's answer (manager / admin)."
      emptyMessage="No offers found."
      emptyHint="Make an offer to a candidate who passed the interview."
      breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Offers" }]}
      loadItems={() => api.listHrOffers()}
      createItem={(p) =>
        api.createHrOffer({
          ...p,
          currency: p.currency?.trim().toUpperCase() || "BDT",
          proposed_salary: p.proposed_salary || null,
          joining_date: p.joining_date || null,
          notes: p.notes?.trim() || null,
        })
      }
      createLabel="Add offer"
      exportFileName="offers"
      initialForm={{
        candidate_id: 0,
        offered_role: "",
        proposed_salary: 0,
        currency: "BDT",
        joining_date: "",
        notes: "",
      }}
      fields={[
        { key: "candidate_id", label: "Candidate", type: "select", required: true, options: candidates.options },
        { key: "offered_role", label: "Position offered", type: "text", required: true },
        { key: "proposed_salary", label: "Proposed salary (monthly)", type: "number" },
        { key: "currency", label: "Currency", type: "text" },
        { key: "joining_date", label: "Joining date", type: "date" },
        { key: "notes", label: "Notes", type: "textarea" },
      ]}
      columns={[
        { header: "Candidate", cell: (row) => candidates.labelOf(row.candidate_id) },
        { header: "Position", cell: (row) => row.offered_role },
        { header: "Salary", cell: (row) => row.proposed_salary, kind: "money" },
        { header: "Currency", cell: (row) => row.currency, hideOnMobile: true },
        { header: "Joining", cell: (row) => row.joining_date, hideOnMobile: true },
        { header: "Status", cell: (row) => row.status, kind: "status" },
      ]}
      rowActions={(row, { refresh }) => actionsFor(row, refresh)}
      footer={
        msg ? (
          <div role="alert" className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
            {msg}
          </div>
        ) : null
      }
    />
  );
}

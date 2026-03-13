import { api, type HrOfferCreate, type HrOfferResponse } from "@/api/client";
import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";

export function HrOffersPage() {
  return (
    <HrSimpleCrudPage<HrOfferResponse, HrOfferCreate>
      title="Offers"
      description="Create and monitor candidate offer lifecycle."
      emptyMessage="No offers found."
      loadItems={() => api.listHrOffers()}
      createItem={(payload) => api.createHrOffer(payload)}
      createLabel="Add offer"
      initialForm={{
        candidate_id: 0,
        offered_position: "",
        offered_salary: 0,
        offer_date: "",
      }}
      fields={[
        { key: "candidate_id", label: "Candidate ID", type: "number", required: true },
        { key: "offered_position", label: "Position", type: "text", required: true },
        { key: "offered_salary", label: "Offered Salary", type: "number", required: true },
        { key: "offer_date", label: "Offer Date", type: "date", required: true },
      ]}
      columns={[
        { header: "Candidate ID", cell: (row) => row.candidate_id },
        { header: "Position", cell: (row) => row.offered_position },
        { header: "Salary", cell: (row) => row.offered_salary },
        { header: "Offer Date", cell: (row) => row.offer_date },
        { header: "Status", cell: (row) => row.status },
      ]}
    />
  );
}

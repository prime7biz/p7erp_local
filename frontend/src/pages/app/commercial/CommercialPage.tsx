import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import {
  ArrowRightLeft,
  FileText,
  Globe,
  Truck,
} from "lucide-react";

const BASE = "/app";

type CountState = "loading" | number | "error";

export function CommercialPage() {
  const [exportCasesCount, setExportCasesCount] = useState<CountState>("loading");
  const [masterContractsCount, setMasterContractsCount] = useState<CountState>("loading");
  const [proformaCount, setProformaCount] = useState<CountState>("loading");
  const [btbLcsCount, setBtbLcsCount] = useState<CountState>("loading");

  useEffect(() => {
    let cancelled = false;

    const loadCounts = async () => {
      const [exportRes, masterRes, proformaRes, btbRes] = await Promise.allSettled([
        api.listExportCases(),
        api.listMasterContracts(),
        api.listProformaInvoices(),
        api.listBtbLcs(),
      ]);

      if (cancelled) return;

      setExportCasesCount(
        exportRes.status === "fulfilled" && Array.isArray(exportRes.value)
          ? exportRes.value.length
          : "error"
      );
      setProformaCount(
        proformaRes.status === "fulfilled" && Array.isArray(proformaRes.value)
          ? proformaRes.value.length
          : "error"
      );
      setMasterContractsCount(
        masterRes.status === "fulfilled" && Array.isArray(masterRes.value)
          ? masterRes.value.length
          : "error"
      );
      setBtbLcsCount(
        btbRes.status === "fulfilled" && Array.isArray(btbRes.value)
          ? btbRes.value.length
          : "error"
      );
    };

    void loadCounts();
    return () => {
      cancelled = true;
    };
  }, []);

  function Badge({ state }: { state: CountState }) {
    if (state === "loading") {
      return (
        <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-gray-100 px-2 text-xs font-medium text-gray-500">
          …
        </span>
      );
    }
    if (state === "error") {
      return (
        <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-amber-50 px-2 text-xs font-medium text-amber-700" title="Count unavailable">
          —
        </span>
      );
    }
    return (
      <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary">
        {state}
      </span>
    );
  }

  const cards = [
    {
      title: "Export Cases",
      description: "View and manage export cases linked to orders and documentation.",
      to: `${BASE}/commercial/export-cases`,
      icon: Globe,
      count: exportCasesCount,
    },
    {
      title: "Master Contracts",
      description: "Track customer master export LCs or sales contracts and utilization by BTB LCs.",
      to: `${BASE}/commercial/master-contracts`,
      icon: FileText,
      count: masterContractsCount,
    },
    {
      title: "Proforma Invoices",
      description: "Create and manage proforma invoices for LC, advance TT, and commercial documentation.",
      to: `${BASE}/commercial/proforma-invoices`,
      icon: FileText,
      count: proformaCount,
    },
    {
      title: "BTB LCs",
      description: "Back-to-back letters of credit for commercial and export finance.",
      to: `${BASE}/commercial/btb-lcs`,
      icon: ArrowRightLeft,
      count: btbLcsCount,
    },
    {
      title: "Logistics",
      description: "Import & export tracking, shipment booking, and document management for orders and commercial documents.",
      to: `${BASE}/logistics`,
      icon: Truck,
      count: null as CountState | null,
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Commercial / Export & Import</h1>
        <p className="mt-1 text-sm text-gray-600 max-w-2xl">
          Central hub for export and import operations: letters of credit (LC), advance TT, proforma invoices,
          export cases, and logistics. Manage documentation and track shipments in one place.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.to}
              to={card.to}
              className="group rounded-xl border border-gray-200 bg-white p-5 transition hover:border-primary/30 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                {card.count != null && (
                  <Badge state={card.count} />
                )}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-gray-900 group-hover:text-primary">
                {card.title}
              </h3>
              <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                {card.description}
              </p>
              <span className="mt-3 inline-flex items-center text-xs font-medium text-primary">
                Open
                <svg className="ml-1 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

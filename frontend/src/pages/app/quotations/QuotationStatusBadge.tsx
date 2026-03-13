import { cn } from "@/lib/utils";

export function QuotationStatusBadge({ status }: { status: string }) {
  const cls =
    status === "APPROVED"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : status === "SUBMITTED"
        ? "bg-blue-100 text-blue-700 border-blue-200"
        : status === "SENT"
          ? "bg-violet-100 text-violet-700 border-violet-200"
          : "bg-gray-100 text-gray-700 border-gray-200";

  return <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", cls)}>{status}</span>;
}

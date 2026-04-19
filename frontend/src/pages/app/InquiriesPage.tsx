import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type InquiryResponse } from "@/api/client";
import { useListPagination } from "@/hooks/useListPagination";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import { ResponsiveTableContainer } from "@/components/app/ResponsiveTableContainer";
import {
  canConvertInquiryToQuotation,
  canSubmitInquiry,
  humanizeStatus,
  INQUIRY_STATUS_FILTER_OPTIONS,
  inquiryListRowPrimaryTextClass,
  inquiryListRowSecondaryTextClass,
  inquiryListRowTertiaryTextClass,
} from "@/features/merch/workflow";
import { SecureImage } from "@/components/SecureImage";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageErrorClass,
  listPageFilterBarClass,
  listPageEmptyClass,
  listPageLoadingClass,
  listPageRootClass,
  listPageTableCardClass,
  listPageToolbarInputClass,
  listPageToolbarSelectClass,
  listTableBaseClass,
  listTableThCenterClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { cn } from "@/lib/utils";

const statusClass = (status: string) => {
  const value = status.toUpperCase();
  if (value === "CONVERTED") return "bg-status-success-subtle text-status-success-foreground";
  if (value === "LOST") return "bg-status-warning-subtle text-status-warning-foreground";
  if (value === "CANCELLED") return "bg-status-danger-subtle text-status-danger-foreground";
  if (value === "SUBMITTED") return "bg-status-info-subtle text-status-info-foreground";
  return "bg-status-neutral-subtle text-status-neutral-foreground";
};

function formatInquiryCreatedAt(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InquiriesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InquiryResponse[]>([]);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const { page, setPage, pageSize, setPageSize } = useListPagination();
  const [listTotal, setListTotal] = useState(0);
  const [submittingInquiryId, setSubmittingInquiryId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.listInquiriesPaginated({
        search: search || undefined,
        status: statusFilter || undefined,
        department: departmentFilter || undefined,
        page,
        page_size: pageSize,
        ai_indicators: 1,
      });
      setItems(res.items);
      setListTotal(res.total);
      if (res.page !== page) setPage(res.page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inquiries");
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => items, [items]);

  const displayCustomerName = (row: InquiryResponse) =>
    row.customer_name?.trim() ? row.customer_name : `#${row.customer_id}`;

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, departmentFilter, page, pageSize]);

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Inquiries"
        description="Merchandising intake · Complete buyer requirements, then convert to quotation. List data and AI indicators come from the API."
        actions={
          <button
            type="button"
            onClick={() => navigate("/app/inquiries/new")}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
          >
            New Inquiry
          </button>
        }
      />
      <div className={listPageFilterBarClass}>
        <input
          type="text"
          placeholder="Search by code..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className={listPageToolbarInputClass}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className={listPageToolbarSelectClass}
        >
          <option value="">All statuses</option>
          {INQUIRY_STATUS_FILTER_OPTIONS.map((statusValue) => (
            <option key={statusValue} value={statusValue}>
              {humanizeStatus(statusValue)}
            </option>
          ))}
        </select>
        <select
          value={departmentFilter}
          onChange={(e) => {
            setDepartmentFilter(e.target.value);
            setPage(1);
          }}
          className={listPageToolbarSelectClass}
        >
          <option value="">All departments</option>
          <option value="Infant">Infant</option>
          <option value="Kids">Kids</option>
          <option value="Boys">Boys</option>
          <option value="Girls">Girls</option>
          <option value="Men">Men</option>
          <option value="Ladies">Ladies</option>
          <option value="Knit">Knit</option>
          <option value="Fleece">Fleece</option>
        </select>
      </div>

      {error && (
        <div className={listPageErrorClass}>
          {error}
        </div>
      )}

      <div className={listPageTableCardClass}>
        {loading ? (
          <div className={listPageLoadingClass}>Loading inquiries...</div>
        ) : items.length === 0 ? (
          <div className={listPageEmptyClass}>No inquiries yet.</div>
        ) : (
          <>
          <ResponsiveTableContainer>
            <table className={cn(listTableBaseClass, "min-w-[1220px]")}>
              <thead className={listTableTheadClass}>
                <tr>
                  <th className={cn(listTableThClass, "w-24 whitespace-nowrap")}>Code</th>
                  <th className={cn(listTableThClass, "w-36 whitespace-nowrap")} title="Server time when the inquiry was created">
                    Created
                  </th>
                  <th className={cn(listTableThClass, "min-w-[120px]")}>Customer</th>
                  <th className={cn(listTableThClass, "min-w-[160px]")}>Style</th>
                  <th className={cn(listTableThClass, "min-w-[100px] whitespace-nowrap")}>Intermediary</th>
                  <th className={cn(listTableThClass, "w-20 whitespace-nowrap")}>Shipping</th>
                  <th className={cn(listTableThRightClass, "w-20 whitespace-nowrap")}>Qty</th>
                  <th className={cn(listTableThClass, "min-w-[140px] whitespace-nowrap")}>Status</th>
                  <th
                    className={cn(listTableThCenterClass, "w-28 whitespace-nowrap")}
                    title="Rules-based quotation readiness (no LLM)"
                  >
                    Q-ready
                  </th>
                  <th className={cn(listTableThRightClass, "w-24 whitespace-nowrap")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((inq) => {
                  const rowTone = inq.status;
                  return (
                  <tr key={inq.id} className={listTableTrClass}>
                    <td className={cn("px-4 py-3 text-sm whitespace-nowrap", inquiryListRowPrimaryTextClass(rowTone))}>
                      <Link
                        to={`/app/inquiries/${inq.id}`}
                        className={cn(inquiryListRowPrimaryTextClass(rowTone), "hover:underline")}
                      >
                        {inq.inquiry_code}
                      </Link>
                    </td>
                    <td
                      className={cn("px-4 py-3 text-sm whitespace-nowrap", inquiryListRowSecondaryTextClass(rowTone))}
                      title={inq.created_at}
                    >
                      {formatInquiryCreatedAt(inq.created_at)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-sm whitespace-nowrap overflow-hidden text-ellipsis",
                        inquiryListRowSecondaryTextClass(rowTone),
                      )}
                      title={displayCustomerName(inq)}
                    >
                      {displayCustomerName(inq)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        {inq.style_image_url ? (
                          <SecureImage
                            url={inq.style_image_url}
                            alt={inq.style_name ?? inq.style_ref ?? "style"}
                            className="h-9 w-9 shrink-0 rounded object-cover border border-border"
                          />
                        ) : (
                          <div className="h-9 w-9 shrink-0 rounded bg-surface-subtle border border-border" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div
                            className={cn("truncate", inquiryListRowPrimaryTextClass(rowTone))}
                            title={inq.style_name ?? inq.style_ref ?? undefined}
                          >
                            {inq.style_name ?? inq.style_ref ?? "—"}
                          </div>
                          <div
                            className={cn("whitespace-nowrap truncate", inquiryListRowTertiaryTextClass(rowTone))}
                            title={
                              inq.style_ref && inq.style_name && inq.style_ref !== inq.style_name
                                ? inq.style_ref
                                : inq.department ?? undefined
                            }
                          >
                            {inq.style_ref && inq.style_name && inq.style_ref !== inq.style_name
                              ? inq.style_ref
                              : inq.department ?? "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-sm whitespace-nowrap overflow-hidden text-ellipsis",
                        inquiryListRowSecondaryTextClass(rowTone),
                      )}
                      title={inq.intermediary_name ?? undefined}
                    >
                      {inq.intermediary_name ?? "—"}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-sm whitespace-nowrap overflow-hidden text-ellipsis",
                        inquiryListRowSecondaryTextClass(rowTone),
                      )}
                      title={inq.shipping_term ?? undefined}
                    >
                      {inq.shipping_term ?? "—"}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-sm text-right whitespace-nowrap",
                        inquiryListRowSecondaryTextClass(rowTone),
                      )}
                    >
                      {inq.quantity != null ? inq.quantity.toLocaleString() : "—"}
                    </td>
                    <td
                      className={cn("px-4 py-3 text-sm overflow-hidden text-ellipsis", inquiryListRowSecondaryTextClass(rowTone))}
                      title={[inq.status, inq.is_converted_to_quotation ? "Converted to quotation" : null].filter(Boolean).join(" · ")}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap whitespace-nowrap min-w-0">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(inq.status)}`}>
                          {inq.status}
                        </span>
                        {inq.is_converted_to_quotation && (
                          <span className="inline-flex rounded-full bg-status-info-subtle px-2 py-0.5 text-xs font-medium text-status-info-foreground">
                            Converted to quotation
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-center text-xs whitespace-nowrap",
                        inquiryListRowSecondaryTextClass(rowTone),
                      )}
                    >
                      {inq.ai_indicators ? (
                        <span
                          title={
                            inq.ai_indicators.flags.length
                              ? `Flags: ${inq.ai_indicators.flags.join(", ")}`
                              : "No blocking flags"
                          }
                        >
                          {inq.ai_indicators.quotation_readiness_score}%
                          {inq.ai_indicators.flags.length > 0 ? (
                            <span className="ml-1 text-status-warning-foreground">!</span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={cn("px-4 py-3 text-sm text-right whitespace-nowrap", inquiryListRowSecondaryTextClass(rowTone))}>
                      <div className="relative inline-block text-left">
                        <button
                          type="button"
                          onClick={() => setOpenActionsId((prev) => (prev === inq.id ? null : inq.id))}
                          className={cn(
                            "rounded-lg border border-border-strong px-2.5 py-1 text-xs hover:bg-surface-subtle",
                            inquiryListRowSecondaryTextClass(rowTone),
                          )}
                        >
                          Actions
                        </button>
                        {openActionsId === inq.id && (
                          <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                            <Link
                              to={`/app/inquiries/${inq.id}`}
                              onClick={() => setOpenActionsId(null)}
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              View
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionsId(null);
                                navigate(`/app/inquiries/${inq.id}/edit`);
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Edit
                            </button>
                            <Link
                              to={`/app/inquiries/${inq.id}/print`}
                              onClick={() => setOpenActionsId(null)}
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Print
                            </Link>
                            {inq.is_converted_to_quotation ? (
                              <div className="block rounded-md px-2 py-1.5 text-left text-xs text-text-muted">
                                Already converted
                              </div>
                            ) : canSubmitInquiry(inq.status) ? (
                              <button
                                type="button"
                                disabled={submittingInquiryId === inq.id}
                                onClick={async () => {
                                  try {
                                    setError("");
                                    setSubmittingInquiryId(inq.id);
                                    await api.updateInquiryStatus(inq.id, "SUBMITTED");
                                    setOpenActionsId(null);
                                    await load();
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : "Submit inquiry failed");
                                  } finally {
                                    setSubmittingInquiryId(null);
                                  }
                                }}
                                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-60"
                              >
                                {submittingInquiryId === inq.id ? "Submitting…" : "Submit inquiry"}
                              </button>
                            ) : null}
                            {!inq.is_converted_to_quotation && canConvertInquiryToQuotation(inq.status) ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  setOpenActionsId(null);
                                  try {
                                    setError("");
                                    const quotation = await api.convertInquiryToQuotation(inq.id, {
                                      profit_percentage: 15,
                                    });
                                    await load();
                                    alert(`Quotation ${quotation.quotation_code} created from inquiry.`);
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : "Convert to quotation failed");
                                  }
                                }}
                                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-info-foreground hover:bg-status-info-subtle"
                              >
                                To quotation
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={async () => {
                                setOpenActionsId(null);
                                if (!window.confirm("Delete this inquiry?")) return;
                                try {
                                  setError("");
                                  await api.deleteInquiry(inq.id);
                                  await load();
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : "Delete failed");
                                }
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </ResponsiveTableContainer>
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={listTotal}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
          </>
        )}
      </div>
    </div>
  );
}


import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listTenants } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/SearchInput";
import { useDebounce } from "@/hooks/useDebounce";
import { LoadingState } from "@/components/ui/LoadingState";

export function FeatureFlagsPage() {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [items, setItems] = useState<{ id: number; name: string; company_code: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listTenants({ page: 1, page_size: 100, search: debounced || undefined })
      .then((r) => setItems(r.items.map((t) => ({ id: t.id, name: t.name, company_code: t.company_code }))))
      .finally(() => setLoading(false));
  }, [debounced]);

  if (loading && items.length === 0) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Feature flags"
        description="Jump to a tenant to edit JSON feature_flags on the tenant detail tab."
      />
      <SearchInput value={search} onChange={setSearch} className="max-w-md mb-4" placeholder="Search tenants…" />
      <DataTable
        columns={[
          { key: "id", header: "ID", cell: (t) => t.id },
          { key: "n", header: "Name", cell: (t) => t.name },
          { key: "c", header: "Code", cell: (t) => t.company_code ?? "—" },
          {
            key: "a",
            header: "",
            cell: (t) => (
              <Link className="text-indigo-600 text-sm font-medium hover:underline" to={`/tenants/${t.id}`}>
                Open tenant
              </Link>
            ),
          },
        ]}
        rows={items}
        rowKey={(t) => t.id}
        emptyMessage="No tenants."
      />
    </div>
  );
}

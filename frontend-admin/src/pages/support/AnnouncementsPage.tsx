import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listAnnouncements, deleteAnnouncement, type AnnouncementItem } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/context/ToastContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatDateTime } from "@/utils/format";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ActionsMenu } from "@/components/ui/ActionsMenu";

export function AnnouncementsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [delId, setDelId] = useState<number | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  function load() {
    listAnnouncements()
      .then((r) => setItems(r.items))
      .catch((e: unknown) => showToast(e instanceof Error ? e.message : "Failed", "error"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Platform-wide or targeted notices for tenants."
        actions={
          <Link
            to="/support/announcements/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            New announcement
          </Link>
        }
      />
      <DataTable
        columns={[
          { key: "id", header: "ID", cell: (a) => a.id },
          { key: "t", header: "Title", cell: (a) => a.title },
          { key: "ty", header: "Type", cell: (a) => a.type },
          { key: "tg", header: "Target", cell: (a) => a.target },
          {
            key: "a",
            header: "Active",
            cell: (a) => <StatusBadge variant={a.is_active ? "success" : "neutral"}>{a.is_active ? "Yes" : "No"}</StatusBadge>,
          },
          { key: "s", header: "Starts", cell: (a) => formatDateTime(a.starts_at) },
          { key: "e", header: "Expires", cell: (a) => formatDateTime(a.expires_at) },
          {
            key: "x",
            header: "Actions",
            cell: (a) => (
              <ActionsMenu
                rowId={a.id}
                openId={openActionsId}
                onOpenChange={setOpenActionsId}
                actions={[
                  {
                    label: "Edit",
                    onClick: () => navigate(`/support/announcements/${a.id}/edit`),
                  },
                  {
                    label: "Delete",
                    danger: true,
                    onClick: () => setDelId(a.id),
                  },
                ]}
              />
            ),
          },
        ]}
        rows={items}
        rowKey={(a) => a.id}
        emptyMessage="No announcements."
      />

      <ConfirmDialog
        open={delId != null}
        onClose={() => setDelId(null)}
        onConfirm={async () => {
          if (delId == null) return;
          const id = delId;
          setDelId(null);
          try {
            await deleteAnnouncement(id);
            showToast("Deleted", "success");
            load();
          } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : "Delete failed", "error");
          }
        }}
        title="Delete announcement?"
        message="This cannot be undone."
        danger
      />
    </div>
  );
}

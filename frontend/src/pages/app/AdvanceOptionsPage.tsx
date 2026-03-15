import { Link } from "react-router-dom";
import { FolderTree } from "lucide-react";

const PREFIX = "/app";

const ADVANCE_ITEMS: Array<{
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}> = [
  {
    title: "Account Groups (Advanced)",
    description:
      "Manage chart of accounts hierarchy with standard and advanced fields: description, reporting code, default normal balance, allow posting, summary group, and last reviewed date. Use list, hierarchy tree, or advance design view.",
    href: `${PREFIX}/accounts/groups`,
    icon: <FolderTree className="h-8 w-8 text-indigo-600" />,
  },
];

export function AdvanceOptionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Finance — Advance Options</h1>
        <p className="mt-1 text-sm text-slate-500">
          Advanced configuration for finance masters: account groups hierarchy, reporting codes, and structure design.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        {ADVANCE_ITEMS.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="flex gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
              {item.icon}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-medium text-slate-900">{item.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{item.description}</p>
              <span className="mt-2 inline-block text-sm font-medium text-indigo-600">Open →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

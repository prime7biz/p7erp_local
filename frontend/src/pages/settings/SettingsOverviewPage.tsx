import { Link } from "react-router-dom";

const cards = [
  {
    title: "Configuration",
    description: "Company profile, domain, logo, and tenant type.",
    to: "/app/settings/config",
  },
  {
    title: "Users",
    description: "Create users, assign roles, and control account status.",
    to: "/app/settings/users",
  },
  {
    title: "Roles & Permissions",
    description: "Manage role definitions and permission matrix.",
    to: "/app/settings/roles",
  },
  {
    title: "Activity Logs",
    description: "Track settings and operational actions with filters.",
    to: "/app/settings/audit",
  },
  {
    title: "Currency",
    description: "Maintain exchange rates for multi-currency operations.",
    to: "/app/settings/currency",
  },
  {
    title: "Backup & Restore",
    description: "Trigger backups, review history, and start restore actions.",
    to: "/app/settings/backup",
  },
];

export function SettingsOverviewPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Settings overview</h2>
        <p className="text-sm text-gray-600">
          Use this page as your central hub for system administration.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="rounded-xl border border-gray-200 bg-white p-4 hover:border-primary/30 hover:shadow-sm transition"
          >
            <h3 className="text-sm font-semibold text-gray-900">{card.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}


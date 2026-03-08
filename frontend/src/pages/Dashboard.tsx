import { useAuth } from "@/context/AuthContext";

export function Dashboard() {
  const { me } = useAuth();
  if (!me) return null;

  const typeLabel =
    me.tenant_type === "both"
      ? "Manufacturer & Buying house"
      : me.tenant_type === "manufacturer"
        ? "Manufacturer"
        : "Buying house";

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>
      <p>
        <strong>Tenant:</strong> {me.tenant_name}
      </p>
      <p>
        <strong>Tenant type:</strong> {typeLabel}
      </p>
      <p>
        <strong>User:</strong> {me.email} ({me.username})
      </p>
    </div>
  );
}

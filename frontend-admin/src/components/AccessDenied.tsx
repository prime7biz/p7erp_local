export function AccessDenied() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 max-w-lg">
      <h1 className="text-lg font-semibold text-amber-900">Access denied</h1>
      <p className="text-sm text-amber-800 mt-2">
        Your platform admin role does not include permission to view this page. Contact a super admin if you need
        access.
      </p>
    </div>
  );
}

/** Shown by error boundaries when page code from an older release could not be loaded. */
export function NewVersionNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-subtle px-4">
      <div className="max-w-md rounded-lg border border-border bg-surface-raised p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-text-primary">A new version is available</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Prime7 ERP was updated while this tab was open. Reload to continue with the latest version.
        </p>
        <button
          type="button"
          className="mt-6 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primary-foreground hover:bg-brand-primary/90"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    </div>
  );
}

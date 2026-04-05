import { listPageEmptyClass } from "@/components/app/listPageLayout";

export function PortalEmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className={listPageEmptyClass}>
      <p className="font-medium text-text-primary">{title}</p>
      {hint ? <p className="mt-2 text-sm text-text-muted">{hint}</p> : null}
    </div>
  );
}

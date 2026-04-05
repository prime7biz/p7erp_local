import { listPageErrorClass } from "@/components/app/listPageLayout";

export function PortalErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className={listPageErrorClass}>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="mt-2 text-sm underline" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

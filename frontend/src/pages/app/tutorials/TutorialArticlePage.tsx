import { useParams } from "react-router-dom";

export function TutorialArticlePage() {
  const { articleId } = useParams<{ articleId: string }>();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          {articleId ? `Tutorial: ${articleId}` : "Tutorial"}
        </h1>
        <p className="text-sm text-text-muted">
          How-to and guide articles for Prime7 ERP.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface-raised p-8 text-center">
        {articleId ? (
          <>
            <p className="text-text-secondary">
              This article is not available yet or is under development.
            </p>
            <p className="mt-2 text-sm text-text-muted">Coming soon.</p>
          </>
        ) : (
          <p className="text-text-secondary">Article not found.</p>
        )}
      </div>
    </div>
  );
}

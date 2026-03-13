import { useParams } from "react-router-dom";

export function TutorialArticlePage() {
  const { articleId } = useParams<{ articleId: string }>();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {articleId ? `Tutorial: ${articleId}` : "Tutorial"}
        </h1>
        <p className="text-sm text-slate-500">
          How-to and guide articles for P7 ERP.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        {articleId ? (
          <>
            <p className="text-slate-600">
              This article is not available yet or is under development.
            </p>
            <p className="mt-2 text-sm text-slate-500">Coming soon.</p>
          </>
        ) : (
          <p className="text-slate-600">Article not found.</p>
        )}
      </div>
    </div>
  );
}

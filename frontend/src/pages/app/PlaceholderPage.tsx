import { useLocation } from "react-router-dom";

/** Shows "Coming soon" for app routes not yet implemented. Title from path segment. */
export function PlaceholderPage({ title }: { title?: string }) {
  const location = useLocation();
  const segment = title ?? location.pathname.split("/").filter(Boolean).pop() ?? "Page";
  const label = segment.replace(/-/g, " ");
  const displayTitle = label.charAt(0).toUpperCase() + label.slice(1);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{displayTitle}</h2>
      <p className="text-gray-500">This module is coming soon. Same structure as the reference; we will implement it in the next phases.</p>
    </div>
  );
}

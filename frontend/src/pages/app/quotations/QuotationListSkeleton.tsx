export function QuotationListSkeleton() {
  return (
    <div className="p-4">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="mb-3 h-10 animate-pulse rounded bg-gray-100" />
      ))}
    </div>
  );
}

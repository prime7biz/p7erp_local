export function HrFilterBar(props: {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input
        className="rounded border border-border-strong px-3 py-2 text-sm min-w-[200px]"
        placeholder={props.searchPlaceholder ?? "Search..."}
        value={props.search}
        onChange={(e) => props.onSearchChange(e.target.value)}
      />
      {props.children}
    </div>
  );
}

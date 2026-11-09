import { getInitials } from "@/pages/app/hr/hrEmployeesListLogic";

const PALETTE = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-indigo-100 text-indigo-700",
];

/** Same name always gets the same color. */
function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length] ?? "bg-sky-100 text-sky-700";
}

const SIZES = {
  sm: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

interface EmployeeAvatarProps {
  name: string;
  size?: keyof typeof SIZES;
  inactive?: boolean;
}

export function EmployeeAvatar({ name, size = "sm", inactive = false }: EmployeeAvatarProps) {
  const color = inactive ? "bg-surface-subtle text-text-muted" : colorFor(name);
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ${SIZES[size]} ${color}`}
    >
      {getInitials(name)}
    </span>
  );
}

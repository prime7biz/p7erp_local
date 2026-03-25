import clsx, { type ClassValue } from "clsx";

/** Merge Tailwind-friendly class names. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

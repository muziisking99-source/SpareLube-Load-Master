import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Sort doc numbers so 2 comes before 10, even with prefixes (INV-2 vs INV-10). */
export function compareDocNumbers(a: string, b: string): number {
  return a.trim().localeCompare(b.trim(), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

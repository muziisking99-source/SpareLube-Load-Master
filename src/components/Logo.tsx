"use client";

import { cn } from "@/lib/utils";
import { getStoredTheme } from "@/lib/theme";

/** SpareLube logo. Official mark from /public, scaled to fit (not redrawn). */
export function Logo({
  className,
  variant = "auto",
}: {
  className?: string;
  variant?: "auto" | "light";
}) {
  const useLightMark =
    variant === "light" ||
    (variant === "auto" && typeof document !== "undefined" && getStoredTheme() === "light");

  return (
    <img
      src="/sparelube-logo.png"
      alt="SpareLube — Auto Lubricant Distributors"
      width={1024}
      height={730}
      className={cn("object-contain", !useLightMark && "brightness-110 contrast-105", className)}
    />
  );
}

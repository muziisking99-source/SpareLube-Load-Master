import { cn } from "@/lib/utils";

/** SpareLube logo. Official mark from /public, scaled to fit (not redrawn). */
export function Logo({
  className,
}: {
  className?: string;
  variant?: "auto" | "light";
}) {
  return (
    <img
      src="/sparelube-logo.png"
      alt="SpareLube — Auto Lubricant Distributors"
      width={1024}
      height={730}
      className={cn("object-contain", className)}
    />
  );
}

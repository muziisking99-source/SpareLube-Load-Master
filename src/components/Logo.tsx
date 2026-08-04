import lightLogo from "@/assets/sparelube-logo.png.asset.json";
import darkLogo from "@/assets/sparelube-logo-dark.png.asset.json";
import { cn } from "@/lib/utils";

/** SpareLube logo. Swaps to a light-ink variant in dark mode. */
export function Logo({
  className,
  variant = "auto",
}: {
  className?: string;
  variant?: "auto" | "light";
}) {
  if (variant === "light") {
    return (
      <img src={lightLogo.url} alt="SpareLube — Auto Lubricant Distributors" className={className} />
    );
  }
  return (
    <>
      <img
        src={lightLogo.url}
        alt="SpareLube — Auto Lubricant Distributors"
        className={cn("dark:hidden", className)}
      />
      <img
        src={darkLogo.url}
        alt=""
        aria-hidden="true"
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}

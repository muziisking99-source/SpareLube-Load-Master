import { cn } from "@/lib/utils";

/** SpareLube logo. Uses static /public SVGs so it works on Vercel (not Lovable __l5e URLs). */
export function Logo({
  className,
  variant = "auto",
}: {
  className?: string;
  variant?: "auto" | "light";
}) {
  if (variant === "light") {
    return (
      <img
        src="/sparelube-logo.svg"
        alt="SpareLube — Auto Lubricant Distributors"
        className={className}
      />
    );
  }
  return (
    <>
      <img
        src="/sparelube-logo.svg"
        alt="SpareLube — Auto Lubricant Distributors"
        className={cn("dark:hidden", className)}
      />
      <img
        src="/sparelube-logo-dark.svg"
        alt=""
        aria-hidden="true"
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}

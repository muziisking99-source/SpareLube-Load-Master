import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/planner/ui/FormField";
import { Logo } from "@/components/Logo";
import { unlockAdmin } from "@/lib/adminGate.functions";

export const Route = createFileRoute("/admin-unlock")({
  head: () => ({
    meta: [
      { title: "Admin Access — Load Planner" },
      {
        name: "description",
        content: "Enter the admin password to open the Load Planner admin console.",
      },
      { property: "og:title", content: "Admin Access — Load Planner" },
      {
        property: "og:description",
        content: "Password-protected entry to the Load Planner admin console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminUnlockPage,
});

function unlockErrorMessage(error: string | undefined): string {
  switch (error) {
    case "not_configured":
      return "Admin password is not configured on the server. Set ADMIN_PASSWORD (and ADMIN_SESSION_SECRET, 32+ chars) in environment variables.";
    case "session_secret":
      return "Admin session secret is missing or invalid. Set ADMIN_SESSION_SECRET to a random string of at least 32 characters.";
    case "incorrect":
      return "Incorrect password";
    default:
      return "Could not verify password. Try again.";
  }
}

function AdminUnlockPage() {
  const router = useRouter();
  const unlock = useServerFn(unlockAdmin);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await unlock({ data: { password } });
      if (res.ok) {
        toast.success("Admin unlocked");
        await router.invalidate();
        await router.navigate({ to: "/admin", replace: true });
      } else {
        const msg = unlockErrorMessage(res.error);
        setError(msg);
        toast.error(msg);
        setPassword("");
      }
    } catch (err) {
      console.error(err);
      const msg = "Could not verify password. Try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo className="h-24 w-auto" />
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="size-4 text-primary" />
            Admin access
          </div>
          <p className="text-xs text-muted-foreground">
            Enter the admin password to open the console.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <FormField label="Admin password" error={error}>
            <Input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              placeholder="••••••••"
            />
          </FormField>
          <Button type="submit" className="w-full" disabled={busy || !password}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Unlock admin
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Back to planner
          </Link>
        </div>
      </div>
    </div>
  );
}

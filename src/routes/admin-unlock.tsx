import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
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
        await router.navigate({ to: "/admin", replace: true });
      } else {
        setError("Incorrect password");
        setPassword("");
      }
    } catch {
      setError("Could not verify password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo className="h-10 w-auto" />
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

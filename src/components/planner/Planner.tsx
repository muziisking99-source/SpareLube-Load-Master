import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { stepLabels, stepList, useStore } from "@/lib/store";
import { SetupScreen } from "./SetupScreen";
import { ImportScreen } from "./ImportScreen";
import { AllocateScreen } from "./AllocateScreen";
import { LockScreen } from "./LockScreen";
import { PrintScreen } from "./PrintScreen";
import { Assistant } from "./Assistant";

export function Planner() {
  const hydrated = useStore((s) => s.hydrated);
  const hydrate = useStore((s) => s.hydrate);
  const currentDate = useStore((s) => s.currentDate);
  const plan = useStore((s) => s.plans[currentDate]);
  const setStep = useStore((s) => s.setStep);
  const showResume = useStore((s) => s.showResume);
  const dismissResume = useStore((s) => s.dismissResume);
  const newPlan = useStore((s) => s.newPlan);
  const ensureTruckDay = useStore((s) => s.ensureTruckDay);
  const undo = useStore((s) => s.undo);
  const [q, setQ] = useState("");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && !plan) {
      newPlan(currentDate);
    }
  }, [hydrated, plan, currentDate, newPlan]);

  useEffect(() => {
    if (plan) ensureTruckDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.date]);

  // global shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [undo]);

  const searchResults = useMemo(() => {
    if (!q.trim() || !plan) return null;
    const term = q.toLowerCase();
    return plan.invoices
      .filter(
        (i) =>
          i.doc.toLowerCase().includes(term) ||
          i.customer.toLowerCase().includes(term) ||
          i.area.toLowerCase().includes(term),
      )
      .slice(0, 12);
  }, [q, plan]);

  if (!hydrated || !plan) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  const step = plan.step;

  return (
    <div className="min-h-screen">
      <TopBar q={q} setQ={setQ} />
      <Stepper current={step} onGo={setStep} locked={plan.locked} />

      {searchResults && (
        <div className="mx-auto max-w-7xl px-4">
          <div className="panel p-3 my-2 text-sm">
            <div className="text-xs text-muted-foreground mb-1">
              {searchResults.length} match{searchResults.length === 1 ? "" : "es"}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {searchResults.map((i) => (
                <span key={i.id} className="chip">
                  <span className="font-mono">{i.doc}</span> {i.customer} · {i.area || "—"} ·{" "}
                  {i.weight}kg
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          {step === "setup" && <SetupScreen />}
          {step === "import" && <ImportScreen />}
          {step === "allocate" && <AllocateScreen mode="allocate" />}
          {step === "adjust" && <AllocateScreen mode="adjust" />}
          {step === "lock" && <LockScreen />}
          {step === "print" && <PrintScreen />}
        </div>
        <Assistant />
      </main>

      {showResume && (
        <ResumeModal
          date={currentDate}
          onResume={() => dismissResume()}
          onNew={() => newPlan(currentDate)}
        />
      )}
    </div>
  );
}

function TopBar({ q, setQ }: { q: string; setQ: (v: string) => void }) {
  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border no-print">
      <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-primary text-primary-foreground grid place-items-center font-bold">
            L
          </div>
          <div className="font-semibold">Load Planner</div>
        </div>
        <div className="flex-1 max-w-md">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search doc / customer / truck / area…"
            className="w-full bg-panel-2 border border-border rounded px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <Link
          to="/admin"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Admin
        </Link>
      </div>
    </header>
  );
}

function Stepper({
  current,
  onGo,
  locked,
}: {
  current: string;
  onGo: (s: any) => void;
  locked: boolean;
}) {
  return (
    <nav className="border-b border-border no-print">
      <div className="mx-auto max-w-7xl px-4 flex overflow-x-auto">
        {stepList.map((s) => {
          const active = s === current;
          return (
            <button
              key={s}
              onClick={() => onGo(s)}
              className={`px-4 py-3 text-sm border-b-2 whitespace-nowrap ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {stepLabels[s]}
            </button>
          );
        })}
        {locked && (
          <span className="ml-auto self-center chip" style={{ color: "var(--good)", borderColor: "var(--good)" }}>
            🔒 Locked
          </span>
        )}
      </div>
    </nav>
  );
}

function ResumeModal({
  date,
  onResume,
  onNew,
}: {
  date: string;
  onResume: () => void;
  onNew: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 no-print">
      <div className="panel p-6 max-w-md w-full">
        <h2 className="text-lg font-semibold mb-2">Resume today's plan?</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Unsaved plan found for <b>{date}</b>. Would you like to resume, or start fresh?
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onNew}
            className="px-4 py-2 rounded border border-border hover:bg-panel-2"
          >
            Start new
          </button>
          <button
            onClick={onResume}
            className="px-4 py-2 rounded bg-primary text-primary-foreground font-semibold"
          >
            Resume
          </button>
        </div>
      </div>
    </div>
  );
}

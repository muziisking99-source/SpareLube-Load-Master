import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { stepList, useStore } from "@/lib/store";
import { isWarehouseDirty } from "@/lib/cloudSync";
import { SetupScreen } from "./SetupScreen";
import { ImportScreen } from "./ImportScreen";
import { AllocateScreen } from "./AllocateScreen";
import { LockScreen } from "./LockScreen";
import { PrintScreen } from "./PrintScreen";
import { Assistant } from "./Assistant";
import { TopBar } from "./TopBar";
import { Stepper } from "./Stepper";
import { PlannerSkeleton } from "./PlannerSkeleton";
import { StepTransition } from "./StepTransition";
import { ResumeModal } from "./ResumeModal";

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
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    // Errors are surfaced via SyncStatusChip + auto-retry toast; avoid noisy mount toasts.
  }, [hydrated]);

  useEffect(() => {
    const onOnline = () => {
      const flush = useStore.getState().flushSave;
      void (async () => {
        if (isWarehouseDirty()) {
          const status = await flush();
          if (status === "cloud") toast.success("Back online — synced");
        } else {
          await hydrate({ force: true });
          toast.success("Back online — synced");
        }
      })();
    };
    const onOffline = () => {
      useStore.setState({ cloudStatus: "offline", syncState: "offline" });
    };
    const flushPending = () => {
      void useStore.getState().flushSave();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushPending();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      flushPending();
      if (isWarehouseDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pagehide", flushPending);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pagehide", flushPending);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
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
    return <PlannerSkeleton />;
  }

  const step = plan.step;

  return (
    <div className="min-h-[100dvh]">
      <TopBar q={q} setQ={setQ} searchResults={searchResults} />
      <Stepper current={step} onGo={setStep} locked={plan.locked} />

      <main className="mx-auto grid max-w-7xl gap-4 px-3 py-4 pb-24 sm:px-4 lg:grid-cols-[1fr_320px] lg:pb-4">
        <div className="min-w-0">
          <StepTransition stepKey={step}>
            {step === "setup" && <SetupScreen />}
            {step === "import" && <ImportScreen />}
            {step === "allocate" && <AllocateScreen mode="allocate" />}
            {step === "adjust" && <AllocateScreen mode="adjust" />}
            {step === "lock" && <LockScreen />}
            {step === "print" && <PrintScreen />}
          </StepTransition>
        </div>
        <Assistant />
      </main>

      <ResumeModal
        date={currentDate}
        open={showResume}
        onResume={() => dismissResume()}
        onNew={() => newPlan(currentDate)}
      />
    </div>
  );
}

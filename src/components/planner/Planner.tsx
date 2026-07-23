import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { stepList, useStore } from "@/lib/store";
import { isCloudConfigured } from "@/lib/supabase";
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
  const cloudStatus = useStore((s) => s.cloudStatus);
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
    if (cloudStatus === "error") {
      toast.error("Cloud sync unavailable — using data on this device");
    } else if (cloudStatus === "cloud" && isCloudConfigured()) {
      // silent success
    } else if (cloudStatus === "local" && !isCloudConfigured()) {
      // no env — silent; TopBar shows Local
    }
  }, [hydrated, cloudStatus]);

  useEffect(() => {
    const onOnline = () => {
      void hydrate();
    };
    const onOffline = () => {
      useStore.setState({ cloudStatus: "offline" });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
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

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[1fr_320px]">
        <div>
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

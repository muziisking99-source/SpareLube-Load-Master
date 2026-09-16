import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { stepList, useStore } from "@/lib/store";
import { isWarehouseDirty } from "@/lib/cloudSync";
import { HEARTBEAT_MS } from "@/lib/planLease";
import {
  buildSearchResults,
  scrollToSearchTarget,
  stepForSearchResult,
  type SearchResult,
} from "@/lib/searchNavigation";
import { SetupScreen } from "./SetupScreen";
import { ImportScreen } from "./ImportScreen";
import { AllocateScreen } from "./AllocateScreen";
import { LockScreen } from "./LockScreen";
import { PrintScreen } from "./PrintScreen";
import { AssistantDesktopPanel, AssistantDesktopReopen, AssistantMobile } from "./Assistant";
import { TopBar } from "./TopBar";
import { Stepper } from "./Stepper";
import { PlannerSkeleton } from "./PlannerSkeleton";
import { StepTransition } from "./StepTransition";
import { ResumeModal } from "./ResumeModal";
import { LeaseBanner, PlanConflictBanner } from "./SyncBanners";

export function Planner() {
  const hydrated = useStore((s) => s.hydrated);
  const hydrate = useStore((s) => s.hydrate);
  const currentDate = useStore((s) => s.currentDate);
  const plan = useStore((s) => s.plans[currentDate]);
  const heldInvoices = useStore((s) => s.heldInvoices);
  const setStep = useStore((s) => s.setStep);
  const setSearchHighlightId = useStore((s) => s.setSearchHighlightId);
  const showResume = useStore((s) => s.showResume);
  const dismissResume = useStore((s) => s.dismissResume);
  const newPlan = useStore((s) => s.newPlan);
  const ensureTruckDay = useStore((s) => s.ensureTruckDay);
  const undo = useStore((s) => s.undo);
  const restoredUnsaved = useStore((s) => s.restoredUnsaved);
  const clearRestoredUnsaved = useStore((s) => s.clearRestoredUnsaved);
  const softRefreshPlan = useStore((s) => s.softRefreshPlan);
  const ensurePlanLease = useStore((s) => s.ensurePlanLease);
  const releaseCurrentLease = useStore((s) => s.releaseCurrentLease);
  const leaseBlocked = useStore((s) => s.leaseBlocked);
  const [q, setQ] = useState("");
  const [snapshotOpen, setSnapshotOpen] = useState(true);

  const handleSelectSearchResult = useCallback(
    (result: SearchResult) => {
      if (!plan) return;
      const step = stepForSearchResult(result, plan.invoices);
      setStep(step);
      setSearchHighlightId(result.id);
      scrollToSearchTarget(result.id);
    },
    [plan, setStep, setSearchHighlightId],
  );

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated || !restoredUnsaved) return;
    toast.message("Restored unsaved work from this device");
    clearRestoredUnsaved();
  }, [hydrated, restoredUnsaved, clearRestoredUnsaved]);

  useEffect(() => {
    if (!hydrated) return;
    void ensurePlanLease();
  }, [hydrated, currentDate, ensurePlanLease]);

  useEffect(() => {
    if (!hydrated || leaseBlocked) return;
    const id = window.setInterval(() => {
      void ensurePlanLease();
    }, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [hydrated, leaseBlocked, ensurePlanLease, currentDate]);

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
    const flushPending = (keepalive?: boolean) => {
      void useStore.getState().flushSave(keepalive ? { keepalive: true } : undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushPending(true);
      } else if (document.visibilityState === "visible") {
        void softRefreshPlan();
        void ensurePlanLease();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      flushPending(true);
      if (isWarehouseDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const onPageHide = () => {
      flushPending(true);
      void releaseCurrentLease();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [hydrate, softRefreshPlan, ensurePlanLease, releaseCurrentLease]);

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

  const searchResults = useMemo(
    () => buildSearchResults(q, plan, heldInvoices),
    [q, plan, heldInvoices],
  );

  const searchDisabled =
    !plan || (plan.step === "setup" && plan.invoices.length === 0 && heldInvoices.length === 0);

  if (!hydrated || !plan) {
    return <PlannerSkeleton />;
  }

  const step = plan.step;
  const currentIdx = stepList.indexOf(step);

  return (
    <div className="min-h-[100dvh]">
      <TopBar
        q={q}
        setQ={setQ}
        searchResults={searchResults}
        searchDisabled={searchDisabled}
        onSelectResult={handleSelectSearchResult}
        currentStep={step}
      />
      <LeaseBanner />
      <PlanConflictBanner />
      <Stepper current={step} onGo={setStep} locked={plan.locked} />

      <AssistantMobile />
      {!snapshotOpen && (
        <AssistantDesktopReopen onOpen={() => setSnapshotOpen(true)} />
      )}

      <div className="mx-auto flex w-full max-w-[1600px] items-start gap-4 px-3 py-4 pb-24 sm:px-4 lg:pb-4">
        <div className="min-w-0 flex-1">
          <StepTransition stepKey={step} stepIndex={currentIdx}>
            {step === "setup" && <SetupScreen />}
            {step === "import" && <ImportScreen />}
            {step === "allocate" && <AllocateScreen mode="allocate" />}
            {step === "adjust" && <AllocateScreen mode="adjust" />}
            {step === "lock" && <LockScreen />}
            {step === "print" && <PrintScreen />}
          </StepTransition>
        </div>
        {snapshotOpen && (
          <AssistantDesktopPanel onClose={() => setSnapshotOpen(false)} />
        )}
      </div>

      <ResumeModal
        date={currentDate}
        open={showResume}
        onResume={() => dismissResume()}
        onNew={() => newPlan(currentDate)}
      />
    </div>
  );
}

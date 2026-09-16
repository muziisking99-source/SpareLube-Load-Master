import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

/** Banner when another browser holds the plan-day edit lease. */
export function LeaseBanner() {
  const leaseBlocked = useStore((s) => s.leaseBlocked);
  const planLease = useStore((s) => s.planLease);
  const ensurePlanLease = useStore((s) => s.ensurePlanLease);

  if (!leaseBlocked || !planLease) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warn/40 bg-warn/10 px-3 py-2 text-sm text-foreground">
      <p>
        <span className="font-medium">{planLease.ownerLabel}</span> is editing this day — View
        only
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          if (
            !window.confirm(
              `${planLease.ownerLabel} may still be editing. Take over this day anyway?`,
            )
          ) {
            return;
          }
          void ensurePlanLease({ steal: true }).then((ok) => {
            if (ok) toast.success("You now have the edit lease for this day");
          });
        }}
      >
        Take over
      </Button>
    </div>
  );
}

/** Banner when plan version conflict needs a choice. */
export function PlanConflictBanner() {
  const planConflict = useStore((s) => s.planConflict);
  const resolvePlanConflict = useStore((s) => s.resolvePlanConflict);

  if (!planConflict) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-crit/40 bg-crit/10 px-3 py-2 text-sm text-foreground">
      <p>
        Cloud has a newer plan for{" "}
        <span className="font-medium">{planConflict.dates.join(", ")}</span>
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void resolvePlanConflict("reload");
          }}
        >
          Reload cloud
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            void resolvePlanConflict("keep");
          }}
        >
          Keep this device
        </Button>
      </div>
    </div>
  );
}

import { useStore } from "@/lib/store";

/** True when plan is locked (except lock/print) or another editor holds the day lease. */
export function usePlanReadOnly() {
  const leaseBlocked = useStore((s) => s.leaseBlocked);
  const plan = useStore((s) => s.plans[s.currentDate]);
  if (leaseBlocked) return true;
  if (!plan?.locked) return false;
  return plan.step !== "lock" && plan.step !== "print";
}

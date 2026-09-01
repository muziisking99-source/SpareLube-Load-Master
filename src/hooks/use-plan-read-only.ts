import { useStore } from "@/lib/store";

/** True when plan is locked and user is on a step that should not allow edits. */
export function usePlanReadOnly() {
  const plan = useStore((s) => s.plans[s.currentDate]);
  if (!plan?.locked) return false;
  return plan.step !== "lock" && plan.step !== "print";
}

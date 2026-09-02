"use client";

import { useState } from "react";
import { BarChart3, PanelRightClose, PanelRightOpen } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { DaySnapshotBody } from "./DaySnapshotBody";
import { useDaySnapshot } from "./useDaySnapshot";

/** Mobile FAB + bottom drawer — rendered outside the main flex row. */
export function AssistantMobile() {
  const snapshot = useDaySnapshot();
  const [mobileOpen, setMobileOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  if (!snapshot) return null;

  const { plan, ...stats } = snapshot;
  const body = (
    <DaySnapshotBody
      step={plan.step}
      planDate={plan.date}
      blockersOnly={plan.step === "lock" || plan.step === "print"}
      reducedMotion={reducedMotion}
      {...stats}
    />
  );

  return (
    <div className="no-print lg:hidden">
      <motion.div whileTap={reducedMotion ? undefined : { scale: 0.96 }}>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => setMobileOpen(true)}
          className="glass-panel fixed bottom-4 right-4 z-30 gap-2 rounded-full border-0 px-4 py-6 shadow-lg"
          style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <BarChart3 className="size-4" />
          Day snapshot
        </Button>
      </motion.div>
      <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
        <DrawerContent className="max-h-[85dvh] pb-[env(safe-area-inset-bottom,0px)]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Day snapshot</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">{body}</div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/** Desktop sidebar panel — render inside the main flex row when open. */
export function AssistantDesktopPanel({ onClose }: { onClose: () => void }) {
  const snapshot = useDaySnapshot();
  const reducedMotion = usePrefersReducedMotion();

  if (!snapshot) return null;

  const { plan, ...stats } = snapshot;

  return (
    <aside className="glass-panel sticky top-[6.5rem] hidden h-fit w-52 shrink-0 p-3 no-print lg:block">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight">Day snapshot</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 gap-1 px-2 text-xs text-muted-foreground"
        >
          <PanelRightClose className="size-3.5" />
          Collapse
        </Button>
      </div>
      <DaySnapshotBody
        step={plan.step}
        planDate={plan.date}
        blockersOnly={plan.step === "lock" || plan.step === "print"}
        reducedMotion={reducedMotion}
        {...stats}
      />
    </aside>
  );
}

/** Fixed tab to reopen — rendered outside the flex row so it stays visible. */
export function AssistantDesktopReopen({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onOpen}
      className="glass-chrome fixed right-0 top-1/2 z-40 hidden h-auto -translate-y-1/2 rounded-l-xl rounded-r-none border-r-0 px-2 py-4 shadow-md no-print lg:inline-flex"
      aria-label="Open day snapshot"
    >
      <PanelRightOpen className="size-4" />
    </Button>
  );
}

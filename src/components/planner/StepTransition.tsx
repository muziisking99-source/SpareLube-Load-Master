"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export function StepTransition({
  stepKey,
  stepIndex,
  children,
}: {
  stepKey: string;
  stepIndex: number;
  children: React.ReactNode;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const prevIndexRef = useRef(stepIndex);
  const forward = stepIndex >= prevIndexRef.current;
  prevIndexRef.current = stepIndex;

  if (reducedMotion) {
    return <div key={stepKey}>{children}</div>;
  }

  const enterX = forward ? 12 : -12;
  const exitX = forward ? -8 : 8;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stepKey}
        initial={{ opacity: 0, x: enterX, filter: "blur(4px)" }}
        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, x: exitX, filter: "blur(4px)" }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

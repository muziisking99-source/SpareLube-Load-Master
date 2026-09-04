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

  const enterX = forward ? 10 : -10;
  const exitX = forward ? -6 : 6;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stepKey}
        initial={{ opacity: 0, x: enterX }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: exitX }}
        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

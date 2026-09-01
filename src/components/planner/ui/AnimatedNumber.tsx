"use client";

import { memo, useEffect } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

function AnimatedNumberInner({ value, suffix = "" }: { value: number; suffix?: string }) {
  const reducedMotion = usePrefersReducedMotion();
  const spring = useSpring(value, { stiffness: 100, damping: 20 });
  const display = useTransform(spring, (v) => `${Math.round(v)}${suffix}`);

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  if (reducedMotion) {
    return (
      <span className="metric-mono">
        {Math.round(value)}
        {suffix}
      </span>
    );
  }

  return <motion.span className="metric-mono">{display}</motion.span>;
}

export const AnimatedNumber = memo(AnimatedNumberInner);

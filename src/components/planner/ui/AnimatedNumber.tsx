"use client";

import { memo, useEffect } from "react";
import { motion, useSpring, useTransform } from "framer-motion";

function AnimatedNumberInner({ value, suffix = "" }: { value: number; suffix?: string }) {
  const spring = useSpring(value, { stiffness: 100, damping: 20 });
  const display = useTransform(spring, (v) => `${Math.round(v)}${suffix}`);

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span className="metric-mono">{display}</motion.span>;
}

export const AnimatedNumber = memo(AnimatedNumberInner);

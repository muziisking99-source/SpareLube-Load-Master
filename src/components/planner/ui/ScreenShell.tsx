"use client";

import { Children } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 20 },
  },
};

export function ScreenShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const items = Children.toArray(children);

  if (reducedMotion) {
    return <div className={cn("space-y-4", className)}>{children}</div>;
  }

  return (
    <motion.div
      className={cn("space-y-4", className)}
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {items.map((child, i) => (
        <motion.div key={i} variants={itemVariants}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

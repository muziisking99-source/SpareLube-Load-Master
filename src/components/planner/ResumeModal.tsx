"use client";

import { motion } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export function ResumeModal({
  date,
  open,
  onResume,
  onNew,
}: {
  date: string;
  open: boolean;
  onResume: () => void;
  onNew: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md border-border">
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Resume today&apos;s plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Unsaved plan found for <strong className="text-foreground">{date}</strong>. Resume where
              you left off, or start with a fresh plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 sm:w-auto"
              onClick={onNew}
            >
              Start new plan
            </Button>
            <AlertDialogAction className="w-full sm:w-auto" onClick={onResume}>
              Resume plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </motion.div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

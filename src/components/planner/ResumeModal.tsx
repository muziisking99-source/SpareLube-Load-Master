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
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="panel max-w-md border-border">
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
      </AlertDialogContent>
    </AlertDialog>
  );
}

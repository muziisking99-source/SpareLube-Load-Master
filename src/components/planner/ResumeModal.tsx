import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onNew}>Start new</AlertDialogCancel>
          <AlertDialogAction onClick={onResume}>Resume plan</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

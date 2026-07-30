import { Cloud, CloudOff, Loader2, WifiOff } from "lucide-react";
import { useStore, type SyncState } from "@/lib/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatSyncedAt(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

function chipMeta(state: SyncState): {
  text: string;
  icon: typeof Cloud;
  className: string;
  pulse?: boolean;
} {
  switch (state) {
    case "saving":
      return {
        text: "Saving…",
        icon: Loader2,
        className: "text-muted-foreground",
        pulse: true,
      };
    case "saved":
      return { text: "Saved", icon: Cloud, className: "text-good" };
    case "offline":
      return { text: "Offline", icon: WifiOff, className: "text-warn" };
    case "error":
      return { text: "Sync failed", icon: CloudOff, className: "text-crit" };
    default:
      return { text: "Local", icon: CloudOff, className: "text-muted-foreground" };
  }
}

function chipTitle(
  state: SyncState,
  lastSyncedAt: string | null,
  pendingSummary: string,
): string {
  switch (state) {
    case "saving":
      return pendingSummary || "Saving to cloud… — click to sync now";
    case "saved": {
      const t = formatSyncedAt(lastSyncedAt);
      return t ? `Last synced ${t} — click to sync now` : "Synced with cloud — click to sync now";
    }
    case "offline":
      return "Offline — saving on this device until you reconnect";
    case "error":
      return "Cloud sync failed — click to retry";
    default:
      return "Cloud not configured — data stays on this device";
  }
}

export function SyncStatusChip({ className }: { className?: string }) {
  const syncState = useStore((s) => s.syncState);
  const lastSyncedAt = useStore((s) => s.lastSyncedAt);
  const pendingSummary = useStore((s) => s.pendingSummary);
  const flushSave = useStore((s) => s.flushSave);
  const meta = chipMeta(syncState);
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => {
        void (async () => {
          const status = await flushSave();
          if (status === "cloud") {
            toast.success("Synced to cloud");
          } else if (status === "error") {
            toast.error("Cloud sync failed — will retry");
          } else if (status === "offline") {
            toast.message("You're offline — changes stay on this device");
          }
        })();
      }}
      title={chipTitle(syncState, lastSyncedAt, pendingSummary)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium transition-colors hover:bg-secondary/60",
        meta.className,
        className,
      )}
      aria-label={chipTitle(syncState, lastSyncedAt, pendingSummary)}
    >
      <Icon className={cn("size-3.5", meta.pulse && "animate-spin")} />
      <span className="hidden sm:inline">{meta.text}</span>
    </button>
  );
}

import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { AnimatedNumber } from "./ui/AnimatedNumber";
import type { PlanStep } from "@/lib/types";

export function DaySnapshotBody({
  step,
  planDate,
  blockersOnly,
  invoiceCount,
  totalWeight,
  activeCount,
  cap,
  tripsAssigned,
  tripsSelected,
  tripCatalog,
  known,
  newly,
  duplicates,
  missingWeights,
  missingTowns,
  heldCount,
  allocatedCount,
  unallocatedCount,
  needsTruckCount,
  util,
  above90,
  heaviest,
  lightest,
  topTown,
  lowTown,
  reducedMotion,
}: {
  step: PlanStep;
  planDate: string;
  blockersOnly?: boolean;
  invoiceCount: number;
  totalWeight: number;
  activeCount: number;
  cap: number;
  tripsAssigned: number;
  tripsSelected: number;
  tripCatalog: number;
  known: number;
  newly: number;
  duplicates: number;
  missingWeights: number;
  missingTowns: number;
  heldCount: number;
  allocatedCount: number;
  unallocatedCount: number;
  needsTruckCount: number;
  util: number;
  above90: number;
  heaviest: string | null;
  lightest: string | null;
  topTown: string | null;
  lowTown: string | null;
  reducedMotion: boolean;
}) {
  const isSetup = step === "setup";
  const isImport = step === "import";
  const isAllocate = step === "allocate" || step === "adjust";
  const isSummary = step === "lock" || step === "print";

  if (blockersOnly) {
    const blockers: { label: string; value: string | number; tone?: "good" | "warn" | "crit" }[] =
      [];
    if (needsTruckCount > 0) {
      blockers.push({ label: "Need truck", value: needsTruckCount, tone: "crit" });
    }
    if (unallocatedCount > 0) {
      blockers.push({ label: "Unallocated", value: unallocatedCount, tone: "crit" });
    }
    if (missingWeights > 0) {
      blockers.push({ label: "Missing weights", value: missingWeights, tone: "warn" });
    }
    if (missingTowns > 0) {
      blockers.push({ label: "Missing towns", value: missingTowns, tone: "warn" });
    }
    if (duplicates > 0) {
      blockers.push({ label: "Duplicate docs", value: duplicates, tone: "warn" });
    }
    return (
      <>
        <p className="mb-3 text-xs text-muted-foreground">
          Plan for <span className="font-medium text-foreground">{planDate}</span>
        </p>
        <Section title="Blockers">
          {blockers.length === 0 ? (
            <p className="text-sm text-good">No blockers — ready to lock or print</p>
          ) : (
            blockers.map((b) => (
              <Row key={b.label} label={b.label} value={b.value} tone={b.tone} />
            ))
          )}
        </Section>
      </>
    );
  }

  return (
    <>
      <p className="mb-3 text-xs text-muted-foreground">
        Plan for <span className="font-medium text-foreground">{planDate}</span>
      </p>

      {isSetup && (
        <Section title="Readiness">
          <Row label="Trips in catalog" value={tripCatalog} />
          <Row
            label="Trips selected"
            value={tripsSelected}
            tone={tripsSelected ? "good" : "warn"}
          />
          <Row label="Held for later" value={heldCount} tone={heldCount ? "warn" : undefined} />
        </Section>
      )}

      {isImport && (
        <>
          <Section title="Overview">
            <Row label="Total invoices" value={invoiceCount} />
            <Row label="Total weight" value={`${totalWeight.toFixed(0)} kg`} />
            <Row label="Trips selected" value={tripsSelected} />
            <Row label="Held for later" value={heldCount} tone={heldCount ? "warn" : undefined} />
          </Section>
          <Separator className="my-3 bg-border/60" />
          <Section title="Entry health">
            <Row label="Known customers" value={known} />
            <Row label="New customers" value={newly} tone={newly ? "warn" : undefined} />
            <Row label="Duplicate docs" value={duplicates} tone={duplicates ? "crit" : undefined} />
            <Row label="Missing weights" value={missingWeights} tone={missingWeights ? "warn" : undefined} />
            <Row label="Missing towns" value={missingTowns} tone={missingTowns ? "warn" : undefined} />
          </Section>
        </>
      )}

      {isAllocate && (
        <>
          <Section title="Overview">
            <Row label="Total invoices" value={invoiceCount} />
            <Row label="Total weight" value={`${totalWeight.toFixed(0)} kg`} />
            <Row label="Active trucks" value={activeCount} />
            <Row label="Fleet capacity" value={`${cap} kg`} />
            <Row
              label="Trucks with trip"
              value={`${tripsAssigned}/${activeCount || 0}`}
              tone={activeCount > 0 && tripsAssigned === activeCount ? "good" : "warn"}
            />
          </Section>
          <Separator className="my-3 bg-border/60" />
          <Section title="Allocation">
            <Row label="Allocated" value={allocatedCount} tone="good" />
            <Row
              label="Unallocated"
              value={unallocatedCount}
              tone={unallocatedCount ? "crit" : "good"}
            />
            <div className="space-y-1.5 py-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Fleet utilisation</span>
                <span className="metric-mono shrink-0 font-medium text-foreground">
                  {reducedMotion ? (
                    `${Math.round(util)}%`
                  ) : (
                    <AnimatedNumber value={Math.round(util)} suffix="%" />
                  )}
                </span>
              </div>
              <Progress
                value={util}
                className={reducedMotion ? "h-1.5" : "animate-breathe h-1.5"}
              />
            </div>
            <Row label="Trucks at 90%+" value={above90} tone={above90 ? "warn" : undefined} />
            {heaviest && <Row label="Heaviest" value={heaviest} />}
            {lightest && <Row label="Lightest" value={lightest} />}
            {topTown && <Row label="Top town" value={topTown} />}
            {lowTown && <Row label="Low town" value={lowTown} />}
          </Section>
        </>
      )}

      {isSummary && !blockersOnly && (
        <Section title="Summary">
          <Row label="Total invoices" value={invoiceCount} />
          <Row label="Total weight" value={`${totalWeight.toFixed(0)} kg`} />
          <Row label="Allocated" value={allocatedCount} tone="good" />
          <Row
            label="Unallocated"
            value={unallocatedCount}
            tone={unallocatedCount ? "crit" : "good"}
          />
          <Row label="Fleet utilisation" value={`${Math.round(util)}%`} />
          <Row label="Active trucks" value={activeCount} />
        </Section>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "good" | "warn" | "crit";
}) {
  const color =
    tone === "good"
      ? "text-good"
      : tone === "warn"
        ? "text-warn"
        : tone === "crit"
          ? "text-crit"
          : "";
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="min-w-0 shrink text-muted-foreground">{label}</span>
      <span
        className={`metric-mono min-w-0 max-w-[55%] truncate text-right text-xs font-medium ${color}`}
        title={String(value)}
      >
        {value}
      </span>
    </div>
  );
}

import { getSupabase, isCloudConfigured } from "./supabase";

const OWNER_KEY = "lp:leaseOwnerId";
const LABEL_KEY = "lp:leaseOwnerLabel";
const LEASE_TTL_MS = 3 * 60_000;
const HEARTBEAT_MS = 60_000;

export type PlanLeaseInfo = {
  date: string;
  ownerId: string;
  ownerLabel: string;
  expiresAt: string;
  heldByUs: boolean;
};

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function getLeaseOwnerId(): string {
  if (typeof sessionStorage === "undefined") return "server";
  let id = sessionStorage.getItem(OWNER_KEY);
  if (!id) {
    id = randomId();
    sessionStorage.setItem(OWNER_KEY, id);
  }
  return id;
}

export function getLeaseOwnerLabel(): string {
  if (typeof sessionStorage === "undefined") return "Editor";
  let label = sessionStorage.getItem(LABEL_KEY);
  if (!label) {
    label = `LM-${getLeaseOwnerId().slice(0, 4).toUpperCase()}`;
    sessionStorage.setItem(LABEL_KEY, label);
  }
  return label;
}

function expiresAtISO(fromMs = Date.now()): string {
  return new Date(fromMs + LEASE_TTL_MS).toISOString();
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

export async function fetchPlanLease(date: string): Promise<PlanLeaseInfo | null> {
  const sb = getSupabase();
  if (!sb || !date) return null;
  const { data, error } = await sb
    .from("plan_leases")
    .select("date,owner_id,owner_label,expires_at")
    .eq("date", date)
    .maybeSingle();
  if (error) {
    if (/plan_leases|schema cache|does not exist/i.test(error.message)) return null;
    throw error;
  }
  if (!data) return null;
  const row = data as {
    date: string;
    owner_id: string;
    owner_label: string;
    expires_at: string;
  };
  if (isExpired(row.expires_at)) return null;
  const ownerId = getLeaseOwnerId();
  return {
    date: row.date,
    ownerId: row.owner_id,
    ownerLabel: row.owner_label || "Someone",
    expiresAt: row.expires_at,
    heldByUs: row.owner_id === ownerId,
  };
}

/**
 * Acquire or renew lease for a plan date.
 * @param steal — take over another editor's lease after confirm
 */
export async function acquirePlanLease(
  date: string,
  opts?: { steal?: boolean },
): Promise<{ ok: true; lease: PlanLeaseInfo } | { ok: false; lease: PlanLeaseInfo }> {
  if (!isCloudConfigured() || !date) {
    const lease: PlanLeaseInfo = {
      date,
      ownerId: getLeaseOwnerId(),
      ownerLabel: getLeaseOwnerLabel(),
      expiresAt: expiresAtISO(),
      heldByUs: true,
    };
    return { ok: true, lease };
  }

  const sb = getSupabase()!;
  const ownerId = getLeaseOwnerId();
  const ownerLabel = getLeaseOwnerLabel();
  const expiresAt = expiresAtISO();

  const existing = await fetchPlanLease(date);
  if (existing && !existing.heldByUs && !opts?.steal) {
    return { ok: false, lease: existing };
  }

  const { error } = await sb.from("plan_leases").upsert(
    {
      date,
      owner_id: ownerId,
      owner_label: ownerLabel,
      expires_at: expiresAt,
    },
    { onConflict: "date" },
  );

  if (error) {
    if (/plan_leases|schema cache|does not exist/i.test(error.message)) {
      return {
        ok: true,
        lease: {
          date,
          ownerId,
          ownerLabel,
          expiresAt,
          heldByUs: true,
        },
      };
    }
    throw error;
  }

  return {
    ok: true,
    lease: {
      date,
      ownerId,
      ownerLabel,
      expiresAt,
      heldByUs: true,
    },
  };
}

export async function renewPlanLease(date: string): Promise<PlanLeaseInfo | null> {
  const result = await acquirePlanLease(date);
  return result.ok ? result.lease : null;
}

export async function releasePlanLease(date: string): Promise<void> {
  const sb = getSupabase();
  if (!sb || !date) return;
  const ownerId = getLeaseOwnerId();
  const { error } = await sb
    .from("plan_leases")
    .delete()
    .eq("date", date)
    .eq("owner_id", ownerId);
  if (error && !/plan_leases|schema cache|does not exist/i.test(error.message)) {
    console.warn("Failed to release plan lease", error);
  }
}

export { HEARTBEAT_MS, LEASE_TTL_MS };

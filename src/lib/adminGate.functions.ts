import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type AdminSession = { unlocked?: boolean };

export type UnlockResult =
  | { ok: true }
  | { ok: false; error: "incorrect" | "not_configured" | "session_secret" };

function sessionSecret(): string | null {
  const secret = process.env["ADMIN_SESSION_SECRET"]?.trim();
  if (!secret || secret.length < 32) return null;
  return secret;
}

function sessionConfig() {
  const password = sessionSecret();
  if (!password) {
    throw new Error("ADMIN_SESSION_SECRET is missing or shorter than 32 characters");
  }
  const isProd = process.env.NODE_ENV === "production";
  return {
    password,
    name: "lp-admin",
    maxAge: 60 * 60 * 12,
    cookie: {
      httpOnly: true,
      // secure cookies are dropped on http://localhost — unlock would appear to do nothing
      secure: isProd,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export const getAdminGateStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      if (!sessionSecret()) return { unlocked: false };
      const session = await useSession<AdminSession>(sessionConfig());
      return { unlocked: session.data.unlocked === true };
    } catch {
      return { unlocked: false };
    }
  },
);

export const unlockAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => ({
    password: String(data?.password ?? "").slice(0, 200),
  }))
  .handler(async ({ data }): Promise<UnlockResult> => {
    const expected = process.env["ADMIN_PASSWORD"]?.trim();
    if (!expected) {
      return { ok: false, error: "not_configured" };
    }
    if (!sessionSecret()) {
      return { ok: false, error: "session_secret" };
    }
    if (!data.password || !passwordMatches(data.password, expected)) {
      return { ok: false, error: "incorrect" };
    }
    try {
      const session = await useSession<AdminSession>(sessionConfig());
      await session.update({ unlocked: true });
      return { ok: true };
    } catch (err) {
      console.error("Admin unlock session failed", err);
      return { ok: false, error: "session_secret" };
    }
  });

export const lockAdmin = createServerFn({ method: "POST" }).handler(async () => {
  try {
    if (!sessionSecret()) return { ok: true as const };
    const session = await useSession<AdminSession>(sessionConfig());
    await session.clear();
  } catch (err) {
    console.error("Admin lock session failed", err);
  }
  return { ok: true as const };
});

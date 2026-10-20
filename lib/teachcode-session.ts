import crypto from "node:crypto";
import { db, assertDatabase } from "./db";
import type { User } from "./auth";

export type TeachCodeIdentity = {
  email: string;
  displayName: string;
  role: "admin" | "staff" | "student";
  mustChangePassword: boolean;
};

const UNUSABLE_PASSWORD_HASH = "unusable";

export function teachcodeApiOrigin(): string | null {
  const raw = process.env.TEACHCODE_API_ORIGIN?.trim() || "http://127.0.0.1:8002";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function parseTeachCodeIdentity(body: unknown): TeachCodeIdentity | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  if (!email.includes("@") || email.length > 254) return null;
  const role =
    record.role === "admin" || record.role === "staff" ? record.role : "student";
  const displayName =
    typeof record.display_name === "string" && record.display_name.trim()
      ? record.display_name.trim().slice(0, 120)
      : email;
  return {
    email,
    displayName,
    role,
    mustChangePassword: record.must_change_password === true,
  };
}

async function readIdentity(path: string, init: RequestInit): Promise<TeachCodeIdentity | null> {
  const origin = teachcodeApiOrigin();
  if (!origin) return null;
  try {
    const response = await fetch(`${origin}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { user?: unknown };
    return parseTeachCodeIdentity(path === "/v1/auth/me" ? body : body.user);
  } catch {
    return null;
  }
}

/** Validates the student-app session. Does not return the token. */
export async function teachCodeIdentity(token: string): Promise<TeachCodeIdentity | null> {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 512) return null;
  return readIdentity("/v1/auth/me", {
    headers: { Authorization: `Bearer ${trimmed}` },
  });
}

/**
 * Checks the TeachCode password, then deletes the session that login created.
 * The token is not returned.
 */
export async function teachCodePasswordLogin(
  email: string,
  password: string,
): Promise<TeachCodeIdentity | null> {
  const origin = teachcodeApiOrigin();
  if (!origin) return null;
  try {
    const response = await fetch(`${origin}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { access_token?: unknown; user?: unknown };
    if (typeof body.access_token === "string" && body.access_token) {
      await fetch(`${origin}/v1/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${body.access_token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      }).catch(() => undefined);
    }
    return parseTeachCodeIdentity(body.user);
  } catch {
    return null;
  }
}

/** Copies a TeachCode teacher or admin into this Studio database, matched by email. */
export async function upsertStudioProfile(
  identity: Pick<TeachCodeIdentity, "email" | "displayName" | "role"> & {
    role: "admin" | "staff";
  },
): Promise<User> {
  await assertDatabase();
  const email = identity.email.trim().toLowerCase();
  const displayName = identity.displayName.trim().slice(0, 120) || email;
  const existing = (
    await db().query<User>(
      "SELECT id, email, display_name, role FROM profiles WHERE lower(email)=lower($1)",
      [email],
    )
  ).rows[0];
  if (existing) {
    if (existing.display_name !== displayName || existing.role !== identity.role) {
      await db().query("UPDATE profiles SET display_name=$1, role=$2 WHERE id=$3", [
        displayName,
        identity.role,
        existing.id,
      ]);
    }
    return {
      id: existing.id,
      email: existing.email,
      display_name: displayName,
      role: identity.role,
    };
  }
  const id = crypto.randomUUID();
  try {
    await db().query(
      "INSERT INTO profiles(id,email,display_name,role,password_hash) VALUES($1,$2,$3,$4,$5)",
      [id, email, displayName, identity.role, UNUSABLE_PASSWORD_HASH],
    );
  } catch (error) {
    const raced = (
      await db().query<User>(
        "SELECT id, email, display_name, role FROM profiles WHERE lower(email)=lower($1)",
        [email],
      )
    ).rows[0];
    if (!raced) throw error;
    return raced;
  }
  return { id, email, display_name: displayName, role: identity.role };
}

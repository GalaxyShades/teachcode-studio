import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db, assertDatabase } from "./db";
import { CmsError } from "./repository";
export type User = {
  id: string;
  email: string;
  display_name: string;
  role: string;
};
const cookie = "teachcode_cms_session";
export function verifyPassword(password: string, stored: string) {
  const [kind, count, salt, digest] = String(stored).split("$"),
    iterations = Number(count);
  if (
    kind !== "pbkdf2_sha256" ||
    !Number.isSafeInteger(iterations) ||
    iterations < 1 ||
    iterations > 2000000 ||
    !salt ||
    !digest ||
    !/^[a-f\d]{64}$/i.test(digest)
  )
    return false;
  return crypto.timingSafeEqual(
    crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256"),
    Buffer.from(digest, "hex"),
  );
}
// Replaceable shared identity adapter. Never provisions or modifies shared profiles.
export async function authenticate(
  email: string,
  password: string,
): Promise<User | null> {
  await assertDatabase();
  const u = (
    await db().query<User & { password_hash: string }>(
      "SELECT id,email,display_name,role,password_hash FROM profiles WHERE lower(email)=lower($1)",
      [email],
    )
  ).rows[0];
  if (
    !u ||
    !verifyPassword(password, u.password_hash) ||
    !["admin", "staff"].includes(u.role)
  )
    return null;
  return {
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    role: u.role,
  };
}
export async function sessionUser(token: string): Promise<User | null> {
  const u = (
    await db().query<User>(
      "SELECT p.id,p.email,p.display_name,p.role FROM auth_sessions s JOIN profiles p ON p.id=s.user_id WHERE s.token=$1 AND s.expires_at>$2",
      [token, new Date().toISOString()],
    )
  ).rows[0];
  return u && ["admin", "staff"].includes(u.role) ? u : null;
}
export async function login(email: string, password: string) {
  const u = await authenticate(email, password);
  if (!u) return false;
  const jar = await cookies(),
    old = jar.get(cookie)?.value,
    token = crypto.randomBytes(32).toString("hex");
  await db().transaction(async (c) => {
    if (old) await c.query("DELETE FROM auth_sessions WHERE token=$1", [old]);
    await c.query(
      "INSERT INTO auth_sessions(token,user_id,created_at,expires_at) VALUES($1,$2,$3,$4)",
      [
        token,
        u.id,
        new Date().toISOString(),
        new Date(Date.now() + 604800000).toISOString(),
      ],
    );
  });
  jar.set(cookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 604800,
  });
  return true;
}
export async function currentUser() {
  const token = (await cookies()).get(cookie)?.value;
  return token ? sessionUser(token) : null;
}
export async function requireUser() {
  const u = await currentUser();
  if (!u) throw new CmsError(401, "Sign in to use Content Studio");
  return u;
}
export async function logout() {
  const jar = await cookies(),
    token = jar.get(cookie)?.value;
  if (token)
    await db().query("DELETE FROM auth_sessions WHERE token=$1", [token]);
  jar.delete(cookie);
}

import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import type { AppEnv } from "./types";
import { Layout } from "./views/layout";

const MEMBER_COOKIE = "pw_member";
const ADMIN_COOKIE = "pw_admin";
const MEMBER_MAX_AGE = 400 * 24 * 60 * 60; // browsers cap cookies at 400 days
const ADMIN_MAX_AGE = 30 * 24 * 60 * 60;

/** Constant-time string comparison (compares SHA-256 digests so lengths don't leak). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function cookieOptions(c: Context<AppEnv>, maxAge: number) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "Lax" as const,
    // Plain http on the LAN during local dev; Secure everywhere else.
    secure: c.env.LOCAL_DEV !== "1",
    maxAge,
  };
}

// Signing the admin cookie with both secrets means changing either logs admins out.
const adminSecret = (env: Env) => `${env.ADMIN_PIN}:${env.GROUP_TOKEN}`;

export async function joinGroup(c: Context<AppEnv>, token: string): Promise<boolean> {
  if (!(await safeEqual(token, c.env.GROUP_TOKEN))) return false;
  await setSignedCookie(c, MEMBER_COOKIE, "1", c.env.GROUP_TOKEN, cookieOptions(c, MEMBER_MAX_AGE));
  return true;
}

export async function loginAdmin(c: Context<AppEnv>, pin: string): Promise<boolean> {
  if (!c.env.ADMIN_PIN || !(await safeEqual(pin, c.env.ADMIN_PIN))) return false;
  const expires = Date.now() + ADMIN_MAX_AGE * 1000;
  await setSignedCookie(c, ADMIN_COOKIE, String(expires), adminSecret(c.env), cookieOptions(c, ADMIN_MAX_AGE));
  return true;
}

export function logoutAdmin(c: Context<AppEnv>) {
  deleteCookie(c, ADMIN_COOKIE, { path: "/" });
}

async function isAdmin(c: Context<AppEnv>): Promise<boolean> {
  if (!c.env.ADMIN_PIN) return false;
  const v = await getSignedCookie(c, adminSecret(c.env), ADMIN_COOKIE);
  return typeof v === "string" && Number(v) > Date.now();
}

/** Every page except /join needs the signed member cookie. Also works out isAdmin. */
export const requireMember = createMiddleware<AppEnv>(async (c, next) => {
  const v = await getSignedCookie(c, c.env.GROUP_TOKEN, MEMBER_COOKIE);
  if (v !== "1") {
    return c.html(
      <Layout title="Padel Wednesdays" isAdmin={false} nav={false}>
        <h1>Padel Wednesdays</h1>
        <p>This is a private group app. Open it from the link in the group chat.</p>
      </Layout>,
      403,
    );
  }
  c.set("isAdmin", await isAdmin(c));
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("isAdmin")) {
    if (c.req.method === "GET") return c.redirect(`/admin?next=${encodeURIComponent(c.req.path)}`);
    return c.text("Admin only", 403);
  }
  await next();
});

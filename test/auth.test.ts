import { describe, expect, it } from "vitest";
import app from "../src/index";
import { safeEqual } from "../src/auth";

// Routes exercised here never touch the database.
const env = { GROUP_TOKEN: "test-token", ADMIN_PIN: "246810", LOCAL_DEV: "1" } as unknown as Env;
const prodEnv = { ...env, LOCAL_DEV: undefined } as unknown as Env;

const cookiesFrom = (res: Response) =>
  res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

async function memberCookie(e = env) {
  return cookiesFrom(await app.request("/join/test-token", {}, e));
}

describe("safeEqual", () => {
  it("compares strings", async () => {
    expect(await safeEqual("abc", "abc")).toBe(true);
    expect(await safeEqual("abc", "abd")).toBe(false);
    expect(await safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("group token", () => {
  it("blocks visitors without the cookie", async () => {
    expect((await app.request("/", {}, env)).status).toBe(403);
  });

  it("rejects a wrong token", async () => {
    const res = await app.request("/join/nope", {}, env);
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("sets a cookie and redirects away from the token URL", async () => {
    const res = await app.request("/join/test-token", {}, env);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    const cookie = await memberCookie();
    expect((await app.request("/", { headers: { cookie } }, env)).status).toBe(200);
  });

  it("only sets Secure outside local dev", async () => {
    const local = (await app.request("/join/test-token", {}, env)).headers.get("set-cookie")!;
    const prod = (await app.request("/join/test-token", {}, prodEnv)).headers.get("set-cookie")!;
    expect(local).not.toMatch(/Secure/i);
    expect(prod).toMatch(/Secure/i);
    expect(prod).toMatch(/HttpOnly/i);
  });

  it("invalidates cookies when the token changes", async () => {
    const cookie = await memberCookie();
    const rotated = { ...env, GROUP_TOKEN: "new-token" } as Env;
    expect((await app.request("/", { headers: { cookie } }, rotated)).status).toBe(403);
  });

  it("rejects a forged cookie", async () => {
    const res = await app.request("/", { headers: { cookie: "pw_member=1" } }, env);
    expect(res.status).toBe(403);
  });
});

describe("admin PIN", () => {
  const post = (path: string, body: Record<string, string>, cookie: string, e = env) =>
    app.request(
      path,
      {
        method: "POST",
        headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: "http://localhost" },
        body: new URLSearchParams(body),
      },
      e,
    );

  it("redirects non-admins from admin pages to the PIN form", async () => {
    const res = await app.request("/settings", { headers: { cookie: await memberCookie() } }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin?next=%2Fsettings");
  });

  it("rejects a wrong PIN", async () => {
    const res = await post("/admin/login", { pin: "000000" }, await memberCookie());
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("signs in with the right PIN and redirects to a local path only", async () => {
    const member = await memberCookie();
    const ok = await post("/admin/login", { pin: "246810", next: "/settings" }, member);
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/settings");
    const evil = await post("/admin/login", { pin: "246810", next: "//evil.com" }, member);
    expect(evil.headers.get("location")).toBe("/");
  });

  it("admin cookie stops working when the PIN changes", async () => {
    const member = await memberCookie();
    const admin = cookiesFrom(await post("/admin/login", { pin: "246810" }, member));
    const cookie = `${member}; ${admin}`;
    const page = await app.request("/admin", { headers: { cookie } }, env);
    expect(await page.text()).toContain("signed in as admin");
    const changed = { ...env, ADMIN_PIN: "135790" } as Env;
    const after = await app.request("/admin", { headers: { cookie } }, changed);
    expect(await after.text()).not.toContain("signed in as admin");
  });

  it("blocks cross-site form posts", async () => {
    const res = await app.request(
      "/admin/login",
      {
        method: "POST",
        headers: { cookie: await memberCookie(), "content-type": "application/x-www-form-urlencoded", origin: "https://evil.com" },
        body: "pin=246810",
      },
      env,
    );
    expect(res.status).toBe(403);
  });
});

import { Hono } from "hono";
import { loginAdmin, logoutAdmin } from "../auth";
import type { AppEnv } from "../types";
import { ErrorText, Layout } from "../views/layout";

const admin = new Hono<AppEnv>();

// Only allow redirecting back to a local path (no "//evil.com").
const safeNext = (v: unknown) => (typeof v === "string" && /^\/(?!\/)/.test(v) ? v : "/");

admin.get("/", (c) => {
  const isAdmin = c.get("isAdmin");
  const next = safeNext(c.req.query("next"));
  return c.html(
    <Layout title="Admin" isAdmin={isAdmin}>
      <h1>Admin</h1>
      {isAdmin ? (
        <>
          <p>You're signed in as admin on this device.</p>
          <ul class="list">
            <li><a class="name" href="/players">Players & ball order</a></li>
            <li><a class="name" href="/settings">Settings</a></li>
          </ul>
          <p></p>
          <form method="post" action="/admin/logout">
            <button class="secondary">Sign out of admin</button>
          </form>
        </>
      ) : (
        <LoginForm next={next} />
      )}
    </Layout>,
  );
});

const LoginForm = ({ next, error }: { next: string; error?: string }) => (
  <form method="post" action="/admin/login" class="stack">
    <ErrorText error={error} />
    <input type="hidden" name="next" value={next} />
    <label>
      Admin PIN
      <input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required />
    </label>
    <button>Sign in</button>
  </form>
);

admin.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const next = safeNext(body.next);
  if (await loginAdmin(c, String(body.pin ?? ""))) return c.redirect(next, 303);
  return c.html(
    <Layout title="Admin" isAdmin={false}>
      <h1>Admin</h1>
      <LoginForm next={next} error="Wrong PIN." />
    </Layout>,
    401,
  );
});

admin.post("/logout", (c) => {
  logoutAdmin(c);
  return c.redirect("/", 303);
});

export default admin;

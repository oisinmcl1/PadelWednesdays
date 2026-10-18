import type { Context } from "hono";
import { Hono } from "hono";
import { requireAdmin } from "../auth";
import * as db from "../db";
import { formatEuros, parseEuros } from "../money";
import { rebuildRatingsFrom } from "../ratings";
import type { AppEnv } from "../types";
import { ErrorText, Layout } from "../views/layout";

const settings = new Hono<AppEnv>();
settings.use(requireAdmin);

type Form = { price: string; revolut: string; payer: string };

async function page(c: Context<AppEnv>, form: Form, error?: string, saved = false) {
  const players = (await db.listPlayers(c.env.DB)).filter((p) => p.active);
  return c.html(
    <Layout title="Settings" isAdmin={true}>
      <h1>Settings</h1>
      <ErrorText error={error} />
      {saved && <p class="ok">Saved.</p>}
      <form method="post" action="/settings" class="stack">
        <label>
          Court price (€)
          <input name="price" value={form.price} inputmode="decimal" placeholder="e.g. 40" required />
        </label>
        <label>
          Revolut.me link
          <input name="revolut" value={form.revolut} type="url" placeholder="https://revolut.me/yourname" />
        </label>
        <label>
          Who books and pays for the court
          <select name="payer">
            <option value="">— choose —</option>
            {players.map((p) => (
              <option value={String(p.id)} selected={form.payer === String(p.id)}>{p.name}</option>
            ))}
          </select>
        </label>
        <button>Save</button>
      </form>
      <h2>Ratings</h2>
      <p class="hint">Ratings update automatically. This rebuilds them from every result, just in case.</p>
      <form method="post" action="/settings/recompute-ratings">
        <button class="secondary">Recompute all ratings</button>
      </form>
    </Layout>,
    error ? 400 : 200,
  );
}

settings.get("/", async (c) => {
  const s = await db.getSettings(c.env.DB);
  return page(c, {
    price: formatEuros(s.courtPriceCents).slice(1),
    revolut: s.revolutUrl,
    payer: s.payerPlayerId === null ? "" : String(s.payerPlayerId),
  }, undefined, c.req.query("saved") === "1");
});

settings.post("/", async (c) => {
  const body = await c.req.parseBody();
  const form: Form = {
    price: String(body.price ?? ""),
    revolut: String(body.revolut ?? "").trim(),
    payer: String(body.payer ?? ""),
  };
  const cents = parseEuros(form.price);
  if (cents === null) return page(c, form, "Court price should look like 40 or 42.50.");
  if (form.revolut && !/^https:\/\/revolut\.me\/[A-Za-z0-9._-]+\/?$/.test(form.revolut)) {
    return page(c, form, "Revolut link should look like https://revolut.me/yourname.");
  }
  const payerId = form.payer ? Number(form.payer) : null;
  if (payerId !== null && !(await db.getPlayer(c.env.DB, payerId))) return page(c, form, "Unknown player.");
  await db.saveSettings(c.env.DB, { courtPriceCents: cents, revolutUrl: form.revolut, payerPlayerId: payerId });
  return c.redirect("/settings?saved=1", 303);
});

settings.post("/recompute-ratings", async (c) => {
  await rebuildRatingsFrom(c.env.DB, null);
  return c.redirect("/settings?saved=1", 303);
});

export default settings;

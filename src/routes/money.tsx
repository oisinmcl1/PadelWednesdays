import { Hono } from "hono";
import { requireAdmin } from "../auth";
import * as db from "../db";
import * as ledger from "../ledger";
import { formatEuros } from "../money";
import { formatDate } from "../sessions";
import type { AppEnv } from "../types";
import { Layout, PayButton } from "../views/layout";

const money = new Hono<AppEnv>();

money.get("/", async (c) => {
  const [players, debts, settings] = await Promise.all([
    db.listPlayers(c.env.DB),
    ledger.unpaidDebts(c.env.DB),
    db.getSettings(c.env.DB),
  ]);
  const isAdmin = c.get("isAdmin");
  const name = new Map(players.map((p) => [p.id, p.name]));
  const payer = settings.payerPlayerId !== null ? name.get(settings.payerPlayerId) : undefined;

  const byPlayer = new Map<number, ledger.Debt[]>();
  for (const d of debts) byPlayer.set(d.player_id, [...(byPlayer.get(d.player_id) ?? []), d]);
  const owing = [...byPlayer.entries()]
    .map(([id, ds]) => ({ id, debts: ds, total: ds.reduce((sum, d) => sum + d.share_cents, 0) }))
    .sort((a, b) => b.total - a.total);

  return c.html(
    <Layout title="Money" isAdmin={isAdmin}>
      <h1>Money</h1>
      {owing.length === 0 ? (
        <p>Everyone's paid up. 🎉</p>
      ) : (
        <ul class="list">
          {owing.map((o) => (
            <li class="debt">
              <details>
                <summary>
                  <span class="name">{name.get(o.id)}</span>
                  <b>{formatEuros(o.total)}</b>
                </summary>
                <ul class="plain">
                  {o.debts.map((d) => (
                    <li>
                      <a href={`/history/${d.session_id}`}>{formatDate(d.date)}</a>: {formatEuros(d.share_cents)}
                      {isAdmin && (
                        <form method="post" action="/money/paid" class="inline">
                          <input type="hidden" name="session" value={String(d.session_id)} />
                          <input type="hidden" name="player" value={String(o.id)} />
                          <input type="hidden" name="paid" value="1" />
                          <button class="secondary small">Mark paid</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
                {isAdmin && o.debts.length > 1 && (
                  <form method="post" action="/money/settle">
                    <input type="hidden" name="player" value={String(o.id)} />
                    <button class="secondary small">Mark all {formatEuros(o.total)} paid</button>
                  </form>
                )}
              </details>
              <PayButton cents={o.total} url={settings.revolutUrl} />
            </li>
          ))}
        </ul>
      )}
      <p class="hint">
        {payer ? `${payer} books and pays for the court.` : "Nobody is set as the court payer yet."} Tap a name to see
        which weeks. Pay opens Revolut: enter the amount shown.
      </p>
    </Layout>,
  );
});

/** Only allow redirecting back to a local path. */
const safeBack = (v: unknown) => (typeof v === "string" && /^\/(?!\/)/.test(v) ? v : "/money");

money.post("/paid", requireAdmin, async (c) => {
  const body = await c.req.parseBody();
  await ledger.setPaid(c.env.DB, Number(body.session), Number(body.player), body.paid === "1");
  return c.redirect(safeBack(body.back), 303);
});

money.post("/settle", requireAdmin, async (c) => {
  await ledger.settleUp(c.env.DB, Number((await c.req.parseBody()).player));
  return c.redirect("/money", 303);
});

export default money;

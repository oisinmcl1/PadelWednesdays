import type { Context } from "hono";
import { Hono } from "hono";
import { requireAdmin } from "../auth";
import * as db from "../db";
import type { AppEnv } from "../types";
import { ErrorText, Layout } from "../views/layout";

const players = new Hono<AppEnv>();

const cleanName = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const validName = (n: string) => n.length >= 1 && n.length <= 30;

async function page(c: Context<AppEnv>, error?: string) {
  const isAdmin: boolean = c.get("isAdmin");
  const list = await db.listPlayers(c.env.DB);
  const active = list.filter((p) => p.active);
  const inactive = list.filter((p) => !p.active);
  return c.html(
    <Layout title="Players" isAdmin={isAdmin}>
      <h1>Players</h1>
      <ErrorText error={error} />
      {isAdmin && (
        <form method="post" action="/players" class="row">
          <input name="name" placeholder="New player name" maxlength={30} required />
          <button>Add</button>
        </form>
      )}
      <p class="hint">Listed in ball-rotation order.</p>
      <ol class="list">
        {active.map((p, i) => (
          <li>
            <span class="name">{p.name}</span>
            {isAdmin && (
              <span class="actions">
                <form method="post" action={`/players/${p.id}/ball`}>
                  <button name="dir" value="up" disabled={i === 0} aria-label="Move up">↑</button>
                  <button name="dir" value="down" disabled={i === active.length - 1} aria-label="Move down">↓</button>
                </form>
                <a href={`/players/${p.id}`} class="button">Edit</a>
              </span>
            )}
          </li>
        ))}
      </ol>
      {inactive.length > 0 && (
        <>
          <h2>Inactive</h2>
          <ul class="list muted">
            {inactive.map((p) => (
              <li>
                <span class="name">{p.name}</span>
                {isAdmin && <a href={`/players/${p.id}`} class="button">Edit</a>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Layout>,
    error ? 400 : 200,
  );
}

async function editPage(c: Context<AppEnv>, p: db.Player, error?: string) {
  return c.html(
    <Layout title={`Edit ${p.name}`} isAdmin={true}>
      <h1>Edit {p.name}</h1>
      <ErrorText error={error} />
      <form method="post" action={`/players/${p.id}/rename`} class="row">
        <input name="name" value={p.name} maxlength={30} required />
        <button>Rename</button>
      </form>
      <form method="post" action={`/players/${p.id}/active`}>
        <input type="hidden" name="active" value={p.active ? "0" : "1"} />
        <button class={p.active ? "secondary" : ""}>{p.active ? "Mark inactive" : "Mark active"}</button>
      </form>
      <p class="hint">Inactive players are hidden from attendance but keep their history.</p>
      <p><a href="/players">← Back to players</a></p>
    </Layout>,
    error ? 400 : 200,
  );
}

players.get("/", (c) => page(c));

players.post("/", requireAdmin, async (c) => {
  const name = cleanName((await c.req.parseBody()).name);
  if (!validName(name)) return page(c, "Name must be 1–30 characters.");
  if (!(await db.addPlayer(c.env.DB, name))) return page(c, `There's already a player called ${name}.`);
  return c.redirect("/players", 303);
});

players.get("/:id{[0-9]+}", requireAdmin, async (c) => {
  const p = await db.getPlayer(c.env.DB, Number(c.req.param("id")));
  return p ? editPage(c, p) : c.notFound();
});

players.post("/:id{[0-9]+}/rename", requireAdmin, async (c) => {
  const p = await db.getPlayer(c.env.DB, Number(c.req.param("id")));
  if (!p) return c.notFound();
  const name = cleanName((await c.req.parseBody()).name);
  if (!validName(name)) return editPage(c, p, "Name must be 1–30 characters.");
  if (!(await db.renamePlayer(c.env.DB, p.id, name))) return editPage(c, p, `There's already a player called ${name}.`);
  return c.redirect("/players", 303);
});

players.post("/:id{[0-9]+}/active", requireAdmin, async (c) => {
  const body = await c.req.parseBody();
  await db.setPlayerActive(c.env.DB, Number(c.req.param("id")), body.active === "1");
  return c.redirect("/players", 303);
});

players.post("/:id{[0-9]+}/ball", requireAdmin, async (c) => {
  const dir = (await c.req.parseBody()).dir;
  if (dir === "up" || dir === "down") await db.moveBallOrder(c.env.DB, Number(c.req.param("id")), dir);
  return c.redirect("/players", 303);
});

export default players;

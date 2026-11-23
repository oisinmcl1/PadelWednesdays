// Small typed query helpers. No ORM: every query is plain SQL you can read here.

export type Player = {
  id: number;
  name: string;
  active: number;
  ball_order: number | null;
  guest: number;
};

export type Settings = {
  courtPriceCents: number;
  revolutUrl: string;
  payerPlayerId: number | null;
};

// ---------- players ----------

export const cleanName = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
export const validName = (n: string) => n.length >= 1 && n.length <= 30;

/** Comma-separated guest names, tidied and de-duplicated. Null if any name is too long. */
export function parseGuestNames(v: unknown): string[] | null {
  const names = String(v ?? "").split(",").map(cleanName).filter((n) => n !== "");
  if (!names.every(validName)) return null;
  const seen = new Set<string>();
  return names.filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
}

/** Active players first, each group in ball-rotation order. */
export async function listPlayers(db: D1Database): Promise<Player[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, active, ball_order, guest FROM players
       ORDER BY active DESC, ball_order IS NULL, ball_order, name`,
    )
    .all<Player>();
  return results;
}

export async function getPlayer(db: D1Database, id: number): Promise<Player | null> {
  return db.prepare("SELECT id, name, active, ball_order, guest FROM players WHERE id = ?").bind(id).first<Player>();
}

/** New players join the end of the ball rotation. Returns false if the name is taken. */
export async function addPlayer(db: D1Database, name: string): Promise<boolean> {
  try {
    await db
      .prepare(
        `INSERT INTO players (name, ball_order)
         VALUES (?, (SELECT COALESCE(MAX(ball_order), 0) + 1 FROM players))`,
      )
      .bind(name)
      .run();
    return true;
  } catch (e) {
    if (String(e).includes("UNIQUE")) return false;
    throw e;
  }
}

export async function renamePlayer(db: D1Database, id: number, name: string): Promise<boolean> {
  try {
    await db.prepare("UPDATE players SET name = ? WHERE id = ?").bind(name, id).run();
    return true;
  } catch (e) {
    if (String(e).includes("UNIQUE")) return false;
    throw e;
  }
}

/**
 * The id of the player with this name, adding them as a guest if there's nobody by that
 * name. So a returning guest (or a lapsed regular) keeps their history.
 */
export async function guestId(db: D1Database, name: string): Promise<number> {
  await db
    .prepare("INSERT INTO players (name, active, guest) VALUES (?, 0, 1) ON CONFLICT(name) DO NOTHING")
    .bind(name)
    .run();
  return (await db.prepare("SELECT id FROM players WHERE name = ?").bind(name).first<{ id: number }>())!.id;
}

/** Turns a guest into a regular: active, at the end of the ball rotation. */
export async function makeRegular(db: D1Database, id: number): Promise<void> {
  await db
    .prepare(
      `UPDATE players SET guest = 0, active = 1,
         ball_order = (SELECT COALESCE(MAX(ball_order), 0) + 1 FROM players)
       WHERE id = ? AND guest = 1`,
    )
    .bind(id)
    .run();
}

export async function setPlayerActive(db: D1Database, id: number, active: boolean): Promise<void> {
  await db.prepare("UPDATE players SET active = ? WHERE id = ?").bind(active ? 1 : 0, id).run();
}

/** Swaps a player's ball-rotation slot with the active player just above/below them. */
export async function moveBallOrder(db: D1Database, id: number, dir: "up" | "down"): Promise<void> {
  const order = (await listPlayers(db)).filter((p) => p.active && p.ball_order !== null);
  const i = order.findIndex((p) => p.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length) return;
  const stmt = db.prepare("UPDATE players SET ball_order = ? WHERE id = ?");
  await db.batch([stmt.bind(order[j].ball_order, order[i].id), stmt.bind(order[i].ball_order, order[j].id)]);
}

// ---------- settings ----------

export async function getSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const map = new Map(results.map((r) => [r.key, r.value]));
  const payer = map.get("payer_player_id");
  return {
    courtPriceCents: Number(map.get("court_price_cents") ?? 0),
    revolutUrl: map.get("revolut_url") ?? "",
    payerPlayerId: payer ? Number(payer) : null,
  };
}

export async function saveSettings(db: D1Database, s: Settings): Promise<void> {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  await db.batch([
    stmt.bind("court_price_cents", String(s.courtPriceCents)),
    stmt.bind("revolut_url", s.revolutUrl),
    stmt.bind("payer_player_id", s.payerPlayerId === null ? "" : String(s.payerPlayerId)),
  ]);
}

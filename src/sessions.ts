// Session and match queries, plus scheduling matches from the rotation engine.
import { rebuildRatingsFrom, type PlayedMatch } from "./ratings";
import { nextCycle, type Match } from "./rotation";

export type Session = {
  id: number;
  date: string;
  court_price_cents: number;
  ball_buyer_id: number | null;
  status: "active" | "ended";
};

export type MatchRow = {
  id: number;
  seq: number;
  cycle: number;
  a1: number;
  a2: number;
  b1: number;
  b2: number;
  sit1: number | null;
  sit2: number | null;
  games_a: number | null;
  games_b: number | null;
};

/** Today's date in Ireland, as YYYY-MM-DD. */
export function todayInIreland(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(now);
}

/** Session date for display, e.g. "Wed 22 Oct". */
export const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" });

export async function getSession(db: D1Database, id: number): Promise<Session | null> {
  return db
    .prepare("SELECT id, date, court_price_cents, ball_buyer_id, status FROM sessions WHERE id = ?")
    .bind(id)
    .first<Session>();
}

export async function listEndedSessions(db: D1Database): Promise<(Session & { match_count: number })[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.date, s.court_price_cents, s.ball_buyer_id, s.status,
              (SELECT COUNT(*) FROM matches m WHERE m.session_id = s.id AND m.games_a IS NOT NULL) AS match_count
       FROM sessions s WHERE s.status = 'ended' ORDER BY s.date DESC, s.id DESC`,
    )
    .all<Session & { match_count: number }>();
  return results;
}

/** Every played match, all sessions, in no particular order. */
export async function playedMatches(db: D1Database): Promise<PlayedMatch[]> {
  const { results } = await db
    .prepare("SELECT id, a1, a2, b1, b2, games_a, games_b FROM matches WHERE games_a IS NOT NULL")
    .all<PlayedMatch>();
  return results;
}

export async function getActiveSession(db: D1Database): Promise<Session | null> {
  return db
    .prepare("SELECT id, date, court_price_cents, ball_buyer_id, status FROM sessions WHERE status = 'active'")
    .first<Session>();
}

export async function sessionPlayerIds(db: D1Database, sessionId: number): Promise<number[]> {
  const { results } = await db
    .prepare("SELECT player_id FROM session_players WHERE session_id = ? ORDER BY player_id")
    .bind(sessionId)
    .all<{ player_id: number }>();
  return results.map((r) => r.player_id);
}

export async function listMatches(db: D1Database, sessionId: number): Promise<MatchRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, seq, cycle, a1, a2, b1, b2, sit1, sit2, games_a, games_b
       FROM matches WHERE session_id = ? ORDER BY seq`,
    )
    .bind(sessionId)
    .all<MatchRow>();
  return results;
}

/**
 * Creates the session and its attendance in one transaction, then schedules the
 * first cycle. Returns null if another session is already in progress.
 */
export async function startSession(
  db: D1Database,
  date: string,
  courtPriceCents: number,
  playerIds: number[],
): Promise<number | null> {
  const add = db.prepare(
    `INSERT INTO session_players (session_id, player_id)
     VALUES ((SELECT id FROM sessions WHERE status = 'active'), ?)`,
  );
  try {
    await db.batch([
      db.prepare("INSERT INTO sessions (date, court_price_cents) VALUES (?, ?)").bind(date, courtPriceCents),
      ...playerIds.map((p) => add.bind(p)),
    ]);
  } catch (e) {
    if (String(e).includes("UNIQUE")) return null; // sessions_one_active
    throw e;
  }
  const session = (await getActiveSession(db))!;
  await ensureUpcoming(db, session.id);
  return session.id;
}

/** Ends the session. A session with no results is deleted, so a mistaken start leaves no trace. */
export async function endSession(db: D1Database, sessionId: number): Promise<void> {
  const played = await db
    .prepare("SELECT COUNT(*) AS n FROM matches WHERE session_id = ? AND games_a IS NOT NULL")
    .bind(sessionId)
    .first<{ n: number }>();
  if (played!.n === 0) {
    await db.batch([
      db.prepare("DELETE FROM matches WHERE session_id = ?").bind(sessionId),
      db.prepare("DELETE FROM session_players WHERE session_id = ?").bind(sessionId),
      db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId),
    ]);
  } else {
    await db.batch([
      db.prepare("DELETE FROM matches WHERE session_id = ? AND games_a IS NULL").bind(sessionId),
      db.prepare("UPDATE sessions SET status = 'ended' WHERE id = ?").bind(sessionId),
    ]);
  }
}

const toMatch = (m: MatchRow): Match => ({
  a: [m.a1, m.a2],
  b: [m.b1, m.b2],
  sittingOut: [m.sit1, m.sit2].filter((p): p is number => p !== null),
});

/**
 * Makes sure there's always a current and a next match: when fewer than two
 * unplayed matches remain, schedules another cycle.
 */
export async function ensureUpcoming(db: D1Database, sessionId: number): Promise<void> {
  const matches = await listMatches(db, sessionId);
  if (matches.filter((m) => m.games_a === null).length >= 2) return;

  const players = await sessionPlayerIds(db, sessionId);
  const { results: recent } = await db
    .prepare(
      `SELECT * FROM (
         SELECT m.id, m.seq, m.cycle, m.a1, m.a2, m.b1, m.b2, m.sit1, m.sit2, m.games_a, m.games_b
         FROM matches m WHERE m.session_id != ? AND m.games_a IS NOT NULL
         ORDER BY m.id DESC LIMIT 30
       ) ORDER BY id`,
    )
    .bind(sessionId)
    .all<MatchRow>();

  const cycle = nextCycle(players, { session: matches.map(toMatch), recent: recent.map(toMatch) });
  const lastSeq = matches.at(-1)?.seq ?? 0;
  const cycleNo = (matches.at(-1)?.cycle ?? 0) + 1;
  const insert = db.prepare(
    `INSERT INTO matches (session_id, seq, cycle, a1, a2, b1, b2, sit1, sit2)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  try {
    await db.batch(
      cycle.map((m, i) =>
        insert.bind(
          sessionId, lastSeq + i + 1, cycleNo,
          m.a[0], m.a[1], m.b[0], m.b[1],
          m.sittingOut[0] ?? null, m.sittingOut[1] ?? null,
        ),
      ),
    );
  } catch (e) {
    // Two phones scheduled the same cycle at once; the other one won. Fine.
    if (!String(e).includes("UNIQUE")) throw e;
  }
}

// ---------- results ----------

/** Games per team: whole numbers 0-99, not both zero. Draws are allowed. */
export function parseGames(a: unknown, b: unknown): [number, number] | null {
  const ok = (v: unknown) => typeof v === "string" && /^\d{1,2}$/.test(v);
  if (!ok(a) || !ok(b)) return null;
  const [ga, gb] = [Number(a), Number(b)];
  return ga + gb === 0 ? null : [ga, gb];
}

export async function getMatch(db: D1Database, matchId: number): Promise<(MatchRow & { session_id: number }) | null> {
  return db
    .prepare(
      `SELECT id, session_id, seq, cycle, a1, a2, b1, b2, sit1, sit2, games_a, games_b
       FROM matches WHERE id = ?`,
    )
    .bind(matchId)
    .first();
}

/** Logs a result for an unplayed match. A second phone logging the same match is a no-op. */
export async function logResult(db: D1Database, matchId: number, games: [number, number]): Promise<void> {
  const res = await db
    .prepare(
      `UPDATE matches SET games_a = ?, games_b = ?, played_at = datetime('now')
       WHERE id = ? AND games_a IS NULL`,
    )
    .bind(games[0], games[1], matchId)
    .run();
  if (res.meta.changes === 0) return;
  await rebuildRatingsFrom(db, matchId);
  const match = await getMatch(db, matchId);
  await ensureUpcoming(db, match!.session_id);
}

/** Changes the score of an already-played match (admin). */
export async function editResult(db: D1Database, matchId: number, games: [number, number]): Promise<void> {
  const res = await db
    .prepare("UPDATE matches SET games_a = ?, games_b = ? WHERE id = ? AND games_a IS NOT NULL")
    .bind(games[0], games[1], matchId)
    .run();
  if (res.meta.changes > 0) await rebuildRatingsFrom(db, matchId);
}

/** Clears the most recent result in a session, making that match current again. */
export async function undoLastResult(db: D1Database, sessionId: number, matchId: number): Promise<void> {
  // matchId must still be the latest result, so a stale Undo button can't undo the wrong match.
  const res = await db
    .prepare(
      `UPDATE matches SET games_a = NULL, games_b = NULL, played_at = NULL
       WHERE id = ? AND session_id = ? AND seq = (
         SELECT MAX(seq) FROM matches WHERE session_id = ? AND games_a IS NOT NULL)`,
    )
    .bind(matchId, sessionId, sessionId)
    .run();
  if (res.meta.changes > 0) await rebuildRatingsFrom(db, matchId);
}

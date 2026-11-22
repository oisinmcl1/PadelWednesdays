// Session and match queries, plus scheduling matches from the rotation engine.
import { ballTurn } from "./balls";
import { splitCost } from "./money";
import { rebuildRatingsFrom, withSets } from "./ratings";
import type { DatedMatch } from "./stats";
import { nextCycle, type Match } from "./rotation";

export type Session = {
  id: number;
  date: string;
  court_price_cents: number;
  ball_buyer_id: number | null;
  payer_id: number | null;
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
  sets_a: number | null; // sets won; null until the match is decided
  sets_b: number | null;
};

/** A match with its set scores so far, in order: [games_a, games_b]. */
export type MatchWithSets = MatchRow & { sets: [number, number][] };

/** Today's date in Ireland, as YYYY-MM-DD. */
export function todayInIreland(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(now);
}

/** Session date for display, e.g. "Wed 22 Oct". */
export const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" });

export async function getSession(db: D1Database, id: number): Promise<Session | null> {
  return db
    .prepare("SELECT id, date, court_price_cents, ball_buyer_id, payer_id, status FROM sessions WHERE id = ?")
    .bind(id)
    .first<Session>();
}

export async function listEndedSessions(db: D1Database): Promise<(Session & { match_count: number })[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.date, s.court_price_cents, s.ball_buyer_id, s.payer_id, s.status,
              (SELECT COUNT(*) FROM matches m WHERE m.session_id = s.id AND m.sets_a IS NOT NULL) AS match_count
       FROM sessions s WHERE s.status = 'ended' ORDER BY s.date DESC, s.id DESC`,
    )
    .all<Session & { match_count: number }>();
  return results;
}

/** Every played match, all sessions, in play order (session date, session, match number). */
export async function playedMatches(db: D1Database): Promise<DatedMatch[]> {
  const { results } = await db
    .prepare(
      `SELECT m.id, m.a1, m.a2, m.b1, m.b2, m.sets_a, m.sets_b, m.session_id, s.date
       FROM matches m JOIN sessions s ON s.id = m.session_id
       WHERE m.sets_a IS NOT NULL
       ORDER BY s.date, s.id, m.seq`,
    )
    .all<Omit<DatedMatch, "sets">>();
  return withSets(db, results);
}

export async function getActiveSession(db: D1Database): Promise<Session | null> {
  return db
    .prepare("SELECT id, date, court_price_cents, ball_buyer_id, payer_id, status FROM sessions WHERE status = 'active'")
    .first<Session>();
}

export async function sessionPlayerIds(db: D1Database, sessionId: number): Promise<number[]> {
  const { results } = await db
    .prepare("SELECT player_id FROM session_players WHERE session_id = ? ORDER BY player_id")
    .bind(sessionId)
    .all<{ player_id: number }>();
  return results.map((r) => r.player_id);
}

export async function listMatches(db: D1Database, sessionId: number): Promise<MatchWithSets[]> {
  const [{ results }, { results: sets }] = await Promise.all([
    db
      .prepare(
        `SELECT id, seq, cycle, a1, a2, b1, b2, sit1, sit2, sets_a, sets_b
         FROM matches WHERE session_id = ? ORDER BY seq`,
      )
      .bind(sessionId)
      .all<MatchRow>(),
    db
      .prepare(
        `SELECT st.match_id, st.games_a, st.games_b FROM sets st JOIN matches m ON m.id = st.match_id
         WHERE m.session_id = ? ORDER BY st.match_id, st.n`,
      )
      .bind(sessionId)
      .all<{ match_id: number; games_a: number; games_b: number }>(),
  ]);
  return results.map((m) => ({
    ...m,
    sets: sets.filter((st) => st.match_id === m.id).map((st): [number, number] => [st.games_a, st.games_b]),
  }));
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

/**
 * Ends the session: drops unplayed matches, records the ball buyer and payer, and
 * works out everyone's share of the court. A session with no results is deleted
 * instead, so a mistaken start leaves no trace.
 */
export async function endSession(
  db: D1Database,
  sessionId: number,
  ballBuyerId: number | null,
  payerId: number | null,
): Promise<"ended" | "deleted"> {
  const played = await db
    .prepare("SELECT COUNT(*) AS n FROM matches WHERE session_id = ? AND sets_a IS NOT NULL")
    .bind(sessionId)
    .first<{ n: number }>();
  if (played!.n === 0) {
    await db.batch([
      db.prepare("DELETE FROM matches WHERE session_id = ?").bind(sessionId),
      db.prepare("DELETE FROM session_players WHERE session_id = ?").bind(sessionId),
      db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId),
    ]);
    return "deleted";
  }
  await db.batch([
    db.prepare("DELETE FROM matches WHERE session_id = ? AND sets_a IS NULL").bind(sessionId),
    db
      .prepare("UPDATE sessions SET status = 'ended', ball_buyer_id = ?, payer_id = ? WHERE id = ?")
      .bind(ballBuyerId, payerId, sessionId),
    ...(await shareUpdates(db, sessionId, payerId)),
  ]);
  return "ended";
}

/** Changes a session's court price and re-splits it. Paid marks are kept. */
export async function setSessionPrice(db: D1Database, sessionId: number, cents: number): Promise<void> {
  await db.prepare("UPDATE sessions SET court_price_cents = ? WHERE id = ?").bind(cents, sessionId).run();
  const session = (await getSession(db, sessionId))!;
  if (session.status === "ended") await db.batch(await shareUpdates(db, sessionId, session.payer_id));
}

async function shareUpdates(db: D1Database, sessionId: number, payerId: number | null) {
  const session = (await getSession(db, sessionId))!;
  const attendees = await sessionPlayerIds(db, sessionId);
  const shares = splitCost(session.court_price_cents, attendees, payerId);
  const stmt = db.prepare("UPDATE session_players SET share_cents = ? WHERE session_id = ? AND player_id = ?");
  return attendees.map((id) => stmt.bind(shares.get(id)!, sessionId, id));
}

/** Whose turn it is to bring balls, among the people at this session. */
export async function ballTurnFor(db: D1Database, sessionId: number): Promise<number | null> {
  const [players, present, last] = await Promise.all([
    db.prepare("SELECT id, ball_order FROM players WHERE active = 1").all<{ id: number; ball_order: number | null }>(),
    sessionPlayerIds(db, sessionId),
    // The last recorded buyer. Before any session has one, fall back to the
    // last_ball_buyer_id setting, which seeds the rotation (e.g. "Shane just bought").
    db
      .prepare(
        `SELECT ball_order FROM (
           SELECT p.ball_order, 1 AS pri, s.date, s.id FROM sessions s JOIN players p ON p.id = s.ball_buyer_id
           WHERE s.status = 'ended'
           UNION ALL
           SELECT p.ball_order, 2, '', 0 FROM settings st JOIN players p ON p.id = CAST(st.value AS INTEGER)
           WHERE st.key = 'last_ball_buyer_id'
         ) ORDER BY pri, date DESC, id DESC LIMIT 1`,
      )
      .first<{ ball_order: number | null }>(),
  ]);
  return ballTurn(players.results, last?.ball_order ?? null, new Set(present));
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
  if (matches.filter((m) => m.sets_a === null).length >= 2) return;

  const players = await sessionPlayerIds(db, sessionId);
  const { results: recent } = await db
    .prepare(
      `SELECT * FROM (
         SELECT m.id, m.seq, m.cycle, m.a1, m.a2, m.b1, m.b2, m.sit1, m.sit2, m.sets_a, m.sets_b
         FROM matches m WHERE m.session_id != ? AND m.sets_a IS NOT NULL
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

/**
 * Matches are best of 3 sets. Each set is first to 5 games. Reaching 4 puts you
 * on set point; you must win the next game from there, and losing a game on set
 * point drops you back to 3. So every set score is 5 for the winner and 0-4 for
 * the loser. No draws.
 */
export const WIN_GAMES = 5;
export const SETS_TO_WIN = 2;

/** Parses one set score. Valid: one team on WIN_GAMES, the other on 0 to WIN_GAMES - 1. */
export function parseGames(a: unknown, b: unknown): [number, number] | null {
  const ok = (v: unknown) => typeof v === "string" && /^\d{1,2}$/.test(v);
  if (!ok(a) || !ok(b)) return null;
  const [ga, gb] = [Number(a), Number(b)];
  const valid = Math.max(ga, gb) === WIN_GAMES && Math.min(ga, gb) < WIN_GAMES;
  return valid ? [ga, gb] : null;
}

/** Sets won by each team from set scores. */
export function setsWon(sets: [number, number][]): [number, number] {
  const a = sets.filter(([ga, gb]) => ga > gb).length;
  return [a, sets.length - a];
}

/** True once a team has won SETS_TO_WIN sets. */
export const isDecided = (sets: [number, number][]) => Math.max(...setsWon(sets)) >= SETS_TO_WIN;

/**
 * Checks a whole match's set scores (for editing). Valid: every set is a valid
 * score and the last set is the one that gives a team SETS_TO_WIN, so no sets
 * are missing and none come after the match is won. Returns the sets won.
 */
export function parseSets(sets: [number, number][]): [number, number] | null {
  if (sets.length === 0) return null;
  for (let i = 0; i < sets.length; i++) {
    if (parseGames(String(sets[i][0]), String(sets[i][1])) === null) return null;
    if (isDecided(sets.slice(0, i + 1)) !== (i === sets.length - 1)) return null;
  }
  return setsWon(sets);
}

/** Set scores for display, e.g. "5–3 2–5 5–4". */
export const formatSets = (sets: [number, number][]) => sets.map(([a, b]) => `${a}–${b}`).join(" ");

export async function getMatch(db: D1Database, matchId: number): Promise<(MatchWithSets & { session_id: number }) | null> {
  const match = await db
    .prepare(
      `SELECT id, session_id, seq, cycle, a1, a2, b1, b2, sit1, sit2, sets_a, sets_b
       FROM matches WHERE id = ?`,
    )
    .bind(matchId)
    .first<MatchRow & { session_id: number }>();
  if (!match) return null;
  const { results } = await db
    .prepare("SELECT games_a, games_b FROM sets WHERE match_id = ? ORDER BY n")
    .bind(matchId)
    .all<{ games_a: number; games_b: number }>();
  return { ...match, sets: results.map((st): [number, number] => [st.games_a, st.games_b]) };
}

/**
 * Logs set n of an undecided match. If two phones log the same set, only the
 * first counts. When the set decides the match, records the sets won, updates
 * ratings and tops up the schedule.
 */
export async function logSet(db: D1Database, matchId: number, n: number, games: [number, number]): Promise<void> {
  const match = await getMatch(db, matchId);
  if (!match || match.sets_a !== null || n !== match.sets.length + 1) return;
  const res = await db
    .prepare("INSERT OR IGNORE INTO sets (match_id, n, games_a, games_b) VALUES (?, ?, ?, ?)")
    .bind(matchId, n, games[0], games[1])
    .run();
  if (res.meta.changes === 0) return;
  const sets = [...match.sets, games];
  if (!isDecided(sets)) return;
  const [a, b] = setsWon(sets);
  const done = await db
    .prepare(
      `UPDATE matches SET sets_a = ?, sets_b = ?, played_at = datetime('now')
       WHERE id = ? AND sets_a IS NULL`,
    )
    .bind(a, b, matchId)
    .run();
  if (done.meta.changes === 0) return;
  await rebuildRatingsFrom(db, matchId);
  await ensureUpcoming(db, match.session_id);
}

/** Replaces the set scores of an already-played match (admin). Takes sets checked by parseSets. */
export async function editResult(db: D1Database, matchId: number, sets: [number, number][]): Promise<void> {
  const [a, b] = setsWon(sets);
  const ins = db.prepare("INSERT INTO sets (match_id, n, games_a, games_b) VALUES (?, ?, ?, ?)");
  await db.batch([
    db.prepare("UPDATE matches SET sets_a = ?, sets_b = ? WHERE id = ?").bind(a, b, matchId),
    db.prepare("DELETE FROM sets WHERE match_id = ?").bind(matchId),
    ...sets.map(([ga, gb], i) => ins.bind(matchId, i + 1, ga, gb)),
  ]);
  await rebuildRatingsFrom(db, matchId);
}

/**
 * Deletes set n of a match, if it's still the latest set logged in the session
 * (so a stale Undo button can't undo the wrong set). If the match was decided,
 * it becomes current again.
 */
export async function undoLastSet(db: D1Database, sessionId: number, matchId: number, n: number): Promise<void> {
  const latest = await db
    .prepare(
      `SELECT st.match_id, st.n FROM sets st JOIN matches m ON m.id = st.match_id
       WHERE m.session_id = ? ORDER BY m.seq DESC, st.n DESC LIMIT 1`,
    )
    .bind(sessionId)
    .first<{ match_id: number; n: number }>();
  if (!latest || latest.match_id !== matchId || latest.n !== n) return;
  const [, reopened] = await db.batch([
    db.prepare("DELETE FROM sets WHERE match_id = ? AND n = ?").bind(matchId, n),
    db.prepare("UPDATE matches SET sets_a = NULL, sets_b = NULL, played_at = NULL WHERE id = ? AND sets_a IS NOT NULL").bind(matchId),
  ]);
  if (reopened.meta.changes > 0) await rebuildRatingsFrom(db, matchId);
}

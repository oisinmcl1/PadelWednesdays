// openskill ratings, one per player, updated after every match.
//
// rating_history stores each player's rating after each match. When a result is
// logged, edited or undone, we replay only from that match onward, starting from
// the stored ratings just before it. Replaying everything from scratch gives the
// same answer (tested), it would just cost more CPU as history grows.
import { ordinal, rate, rating, type Rating } from "openskill";

export type PlayedMatch = {
  id: number;
  a1: number;
  a2: number;
  b1: number;
  b2: number;
  games_a: number;
  games_b: number;
};

export type RatingRow = { match_id: number; player_id: number; mu: number; sigma: number };

/**
 * The winning margin counts, using openskill's built-in margin option: each rating
 * change is scaled by 1 + ln(1 + games difference - MARGIN). With MARGIN = 1, a 5-4
 * win moves ratings like a plain win (x1.0), and bigger wins count more with
 * diminishing returns: 5-3 x1.7, 5-2 x2.1, 5-1 x2.4, 5-0 x2.6. Only mu (the level)
 * is scaled; sigma (how sure we are) updates as normal.
 */
const MARGIN = 1;

/** Applies matches in order on top of `start`. Returns every player's rating after each match. */
export function applyMatches(start: Map<number, Rating>, matches: PlayedMatch[]): RatingRow[] {
  const current = new Map(start);
  const get = (id: number) => current.get(id) ?? rating();
  const rows: RatingRow[] = [];
  for (const m of matches) {
    const [[a1, a2], [b1, b2]] = rate(
      [[get(m.a1), get(m.a2)], [get(m.b1), get(m.b2)]],
      { score: [m.games_a, m.games_b], margin: MARGIN },
    );
    for (const [id, r] of [[m.a1, a1], [m.a2, a2], [m.b1, b1], [m.b2, b2]] as const) {
      current.set(id, r);
      rows.push({ match_id: m.id, player_id: id, mu: r.mu, sigma: r.sigma });
    }
  }
  return rows;
}

/** Latest rating per player from rows in match order. */
export function latestRatings(rows: RatingRow[]): Map<number, Rating> {
  return new Map(rows.map((r) => [r.player_id, { mu: r.mu, sigma: r.sigma }]));
}

/**
 * The number shown to people: openskill's conservative estimate (mu - 3 sigma).
 * Everyone starts at 0 and it rises as the system gets more sure of you.
 */
export const displayRating = (r: Rating) => Math.round(ordinal(r) * 10) / 10;

// ---------- database ----------

/** Rating order for matches: by session date, then session, then match number. */
const MATCH_ORDER = "s.date, s.id, m.seq";

type OrderedMatch = Omit<PlayedMatch, "games_a" | "games_b"> & { games_a: number | null; games_b: number | null };

async function allMatchesInOrder(db: D1Database): Promise<OrderedMatch[]> {
  const { results } = await db
    .prepare(
      `SELECT m.id, m.a1, m.a2, m.b1, m.b2, m.games_a, m.games_b
       FROM matches m JOIN sessions s ON s.id = m.session_id
       ORDER BY ${MATCH_ORDER}`,
    )
    .all<OrderedMatch>();
  return results;
}

const isPlayed = (m: OrderedMatch): m is PlayedMatch => m.games_a !== null && m.games_b !== null;

/** All stored rating rows, in match order. */
export async function ratingRowsInOrder(db: D1Database): Promise<RatingRow[]> {
  const { results } = await db
    .prepare(
      `SELECT rh.match_id, rh.player_id, rh.mu, rh.sigma
       FROM rating_history rh
       JOIN matches m ON m.id = rh.match_id JOIN sessions s ON s.id = m.session_id
       ORDER BY ${MATCH_ORDER}`,
    )
    .all<RatingRow>();
  return results;
}

/**
 * Call after a match's result changes (logged, edited or undone). Recomputes
 * ratings for that match and everything after it. Pass null to rebuild everything.
 */
export async function rebuildRatingsFrom(db: D1Database, matchId: number | null): Promise<void> {
  const all = await allMatchesInOrder(db);
  const i = matchId === null ? 0 : all.findIndex((m) => m.id === matchId);
  if (i < 0) return;
  const before = new Set(all.slice(0, i).map((m) => m.id));
  const redo = all.slice(i);

  const stored = await ratingRowsInOrder(db);
  const start = latestRatings(stored.filter((r) => before.has(r.match_id)));
  const rows = applyMatches(start, redo.filter(isPlayed));

  const del = db.prepare("DELETE FROM rating_history WHERE match_id = ?");
  const ins = db.prepare("INSERT INTO rating_history (match_id, player_id, mu, sigma) VALUES (?, ?, ?, ?)");
  // Only touch matches that have (or had) rating rows, so logging the newest match is ~5 writes.
  const storedIds = new Set(stored.map((r) => r.match_id));
  const stale = redo.filter((m) => storedIds.has(m.id));
  const writes = [
    ...stale.map((m) => del.bind(m.id)),
    ...rows.map((r) => ins.bind(r.match_id, r.player_id, r.mu, r.sigma)),
  ];
  if (writes.length > 0) await db.batch(writes); // D1 rejects an empty batch
}

export type TimelinePoint = { session_id: number; date: string; player_id: number; rating: number };

/** Each player's displayed rating at the end of every session they played in, oldest first. */
export async function ratingTimeline(db: D1Database): Promise<TimelinePoint[]> {
  const { results } = await db
    .prepare(
      `SELECT rh.player_id, rh.mu, rh.sigma, s.id AS session_id, s.date
       FROM rating_history rh
       JOIN matches m ON m.id = rh.match_id JOIN sessions s ON s.id = m.session_id
       ORDER BY ${MATCH_ORDER}`,
    )
    .all<RatingRow & { session_id: number; date: string }>();
  // Later rows overwrite earlier ones, leaving the last match of each session.
  const last = new Map<string, TimelinePoint>();
  for (const r of results) {
    last.set(`${r.session_id}:${r.player_id}`, {
      session_id: r.session_id,
      date: r.date,
      player_id: r.player_id,
      rating: displayRating(r),
    });
  }
  return [...last.values()];
}

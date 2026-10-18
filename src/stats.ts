// Stats computed from played matches. Pure functions; routes do the querying.
import type { PlayedMatch } from "./ratings";

export type DatedMatch = PlayedMatch & { session_id: number; date: string };
export type Record = { played: number; wins: number; draws: number; losses: number };

/** Partner/nemesis/heatmap stats need at least this many matches together to show. */
export const MIN_GAMES = 3;

const emptyRecord = (): Record => ({ played: 0, wins: 0, draws: 0, losses: 0 });

function add(map: Map<number | string, Record>, key: number | string, result: number) {
  if (!map.has(key)) map.set(key, emptyRecord());
  const r = map.get(key)!;
  r.played++;
  if (result > 0) r.wins++;
  else if (result < 0) r.losses++;
  else r.draws++;
}

/** One match from a player's point of view, or null if they didn't play in it. */
export function perspective(m: PlayedMatch, id: number) {
  const resultA = Math.sign(m.games_a - m.games_b); // 1 = A won, 0 = draw, -1 = B won
  if (m.a1 === id || m.a2 === id) {
    return { partner: m.a1 === id ? m.a2 : m.a1, opponents: [m.b1, m.b2], result: resultA };
  }
  if (m.b1 === id || m.b2 === id) {
    return { partner: m.b1 === id ? m.b2 : m.b1, opponents: [m.a1, m.a2], result: -resultA };
  }
  return null;
}

/** Win/draw/loss record per player. */
export function records(matches: PlayedMatch[]): Map<number, Record> {
  const out = new Map<number, Record>();
  for (const m of matches) {
    const resultA = Math.sign(m.games_a - m.games_b);
    for (const id of [m.a1, m.a2]) add(out, id, resultA);
    for (const id of [m.b1, m.b2]) add(out, id, -resultA);
  }
  return out;
}

export const winPct = (r: Record) => (r.played === 0 ? 0 : Math.round((100 * r.wins) / r.played));

/** Record with each partner and against each opponent. */
export function headToHead(matches: PlayedMatch[], id: number) {
  const partners = new Map<number, Record>();
  const opponents = new Map<number, Record>();
  for (const m of matches) {
    const p = perspective(m, id);
    if (!p) continue;
    add(partners, p.partner, p.result);
    for (const o of p.opponents) add(opponents, o, p.result);
  }
  return { partners, opponents };
}

/** Current run of wins, losses or draws, from matches in play order. */
export function streak(matchesInOrder: PlayedMatch[], id: number): { kind: "W" | "L" | "D"; length: number } | null {
  const results = matchesInOrder.map((m) => perspective(m, id)?.result).filter((r) => r !== undefined);
  const last = results.at(-1);
  if (last === undefined) return null;
  let length = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === last; i--) length++;
  return { kind: last > 0 ? "W" : last < 0 ? "L" : "D", length };
}

/** Partner you win most with (ties: more matches together). Needs MIN_GAMES together. */
export function bestPartner(partners: Map<number, Record>, min = MIN_GAMES) {
  return pick(partners, min, (r) => r.wins / r.played);
}

/** Opponent you lose to most often (ties: more matches against). Needs MIN_GAMES and at least one loss. */
export function nemesis(opponents: Map<number, Record>, min = MIN_GAMES) {
  const withLosses = new Map([...opponents].filter(([, r]) => r.losses > 0));
  return pick(withLosses, min, (r) => r.losses / r.played);
}

function pick(map: Map<number, Record>, min: number, score: (r: Record) => number) {
  let best: { id: number; record: Record } | null = null;
  for (const [id, r] of map) {
    if (r.played < min) continue;
    if (!best || score(r) > score(best.record) || (score(r) === score(best.record) && r.played > best.record.played)) {
      best = { id, record: r };
    }
  }
  return best;
}

export const pairKey = (x: number, y: number) => (x < y ? `${x}-${y}` : `${y}-${x}`);

/** Record of every partnership, keyed by pairKey. */
export function partnerships(matches: PlayedMatch[]): Map<string, Record> {
  const out = new Map<string, Record>();
  for (const m of matches) {
    const resultA = Math.sign(m.games_a - m.games_b);
    add(out, pairKey(m.a1, m.a2), resultA);
    add(out, pairKey(m.b1, m.b2), -resultA);
  }
  return out as Map<string, Record>;
}

/** Seasons are calendar months: "2026-10". */
export const seasonOf = (date: string) => date.slice(0, 7);

export const formatSeason = (season: string) =>
  new Date(`${season}-15T12:00:00Z`).toLocaleDateString("en-IE", { month: "long", year: "numeric" });

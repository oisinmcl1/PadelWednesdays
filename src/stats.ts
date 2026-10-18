// Stats computed from played matches. Pure functions; routes do the querying.
import type { PlayedMatch } from "./ratings";

export type Record = { played: number; wins: number; draws: number; losses: number };

/** Win/draw/loss record per player. */
export function records(matches: PlayedMatch[]): Map<number, Record> {
  const out = new Map<number, Record>();
  const get = (id: number) => {
    if (!out.has(id)) out.set(id, { played: 0, wins: 0, draws: 0, losses: 0 });
    return out.get(id)!;
  };
  for (const m of matches) {
    const resultA = Math.sign(m.games_a - m.games_b); // 1 = A won, 0 = draw, -1 = B won
    for (const [ids, result] of [[[m.a1, m.a2], resultA], [[m.b1, m.b2], -resultA]] as const) {
      for (const id of ids) {
        const r = get(id);
        r.played++;
        if (result > 0) r.wins++;
        else if (result < 0) r.losses++;
        else r.draws++;
      }
    }
  }
  return out;
}

export const winPct = (r: Record) => (r.played === 0 ? 0 : Math.round((100 * r.wins) / r.played));

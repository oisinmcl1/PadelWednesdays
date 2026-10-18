// Rotation engine: pure functions, no database. Player ids in, matches out.
//
//   4 players: the 3 pairings (AB v CD, AC v BD, AD v BC). Nobody sits out.
//   5 players: 5 matches. Match k: p[k] sits; (p[k+1], p[k+4]) v (p[k+2], p[k+3]), mod 5.
//              Everyone sits once and partners everyone else once.
//   6 players: 3 fixed pairs, round robin (each pair sits one match). Pairs are chosen to
//              avoid partners who already played together this session, then recently.
//
// Each cycle reshuffles the order. Nobody sits out two matches in a row across cycles.

export type Pair = [number, number];
export type Match = { a: Pair; b: Pair; sittingOut: number[] };

export type History = {
  /** Matches already scheduled this session, in order. */
  session: Match[];
  /** Matches from earlier sessions, most recent last. Only used for 6 players. */
  recent: Match[];
};

type Rng = () => number;

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function nextCycle(players: number[], history: History, rng: Rng = Math.random): Match[] {
  const lastSat = history.session.at(-1)?.sittingOut ?? [];
  switch (players.length) {
    case 4:
      return cycleOf4(shuffle(players, rng));
    case 5:
      return cycleOf5(shuffle(players, rng), lastSat);
    case 6:
      return cycleOf6(shuffle(players, rng), history, lastSat);
    default:
      throw new Error(`Rotation needs 4, 5 or 6 players, got ${players.length}`);
  }
}

function cycleOf4([a, b, c, d]: number[]): Match[] {
  return [
    { a: [a, b], b: [c, d], sittingOut: [] },
    { a: [a, c], b: [b, d], sittingOut: [] },
    { a: [a, d], b: [b, c], sittingOut: [] },
  ];
}

function cycleOf5(p: number[], lastSat: number[]): Match[] {
  // p[0] sits first; if they sat out the previous match, swap them with p[1].
  if (lastSat.includes(p[0])) [p[0], p[1]] = [p[1], p[0]];
  const at = (i: number) => p[i % 5];
  return [0, 1, 2, 3, 4].map((k) => ({
    a: [at(k + 1), at(k + 4)],
    b: [at(k + 2), at(k + 3)],
    sittingOut: [at(k)],
  }));
}

function cycleOf6(shuffled: number[], history: History, lastSat: number[]): Match[] {
  // Pick the 3 pairs: fewest repeats this session, then fewest recent repeats.
  // `shuffled` order breaks ties randomly, since the first best matching wins.
  const sessionCounts = partnerCounts(history.session);
  const recentCounts = partnerCounts(history.recent.slice(-RECENT_MATCHES));
  let best: Pair[] = [];
  let bestCost = Infinity;
  for (const pairs of perfectMatchings(shuffled)) {
    const cost = pairs.reduce(
      (sum, [x, y]) => sum + 1000 * (sessionCounts.get(key(x, y)) ?? 0) + (recentCounts.get(key(x, y)) ?? 0),
      0,
    );
    if (cost < bestCost) [best, bestCost] = [pairs, cost];
  }

  // Order the pairs so the one sitting first contains nobody who sat out the last match.
  const firstOut = best.findIndex(([x, y]) => !lastSat.includes(x) && !lastSat.includes(y));
  const [p, q, r] = [best[firstOut], ...best.filter((_, i) => i !== firstOut)];
  return [
    { a: q, b: r, sittingOut: [...p] },
    { a: p, b: r, sittingOut: [...q] },
    { a: p, b: q, sittingOut: [...r] },
  ];
}

/** How many past matches count as "recent" when choosing pairs for 6 players. */
const RECENT_MATCHES = 30;

const key = (x: number, y: number) => (x < y ? `${x}-${y}` : `${y}-${x}`);

function partnerCounts(matches: Match[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of matches) {
    for (const [x, y] of [m.a, m.b]) counts.set(key(x, y), (counts.get(key(x, y)) ?? 0) + 1);
  }
  return counts;
}

/** All ways to split an even-sized list into pairs (15 ways for 6 players). */
export function perfectMatchings(players: number[]): Pair[][] {
  if (players.length === 0) return [[]];
  const [first, ...rest] = players;
  return rest.flatMap((partner) =>
    perfectMatchings(rest.filter((p) => p !== partner)).map((m) => [[first, partner] as Pair, ...m]),
  );
}

import { describe, expect, it } from "vitest";
import { nextCycle, perfectMatchings, type History, type Match } from "../src/rotation";

const empty: History = { session: [], recent: [] };

/** Deterministic RNG so failures are reproducible. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

const pairKey = ([x, y]: number[]) => [x, y].sort((m, n) => m - n).join("-");
const partnerships = (ms: Match[]) => ms.flatMap((m) => [pairKey(m.a), pairKey(m.b)]);

/** Every player appears exactly once per match, either playing or sitting out. */
function expectValid(ms: Match[], players: number[]) {
  for (const m of ms) {
    expect([...m.a, ...m.b, ...m.sittingOut].sort()).toEqual([...players].sort());
  }
}

/** Runs `n` cycles, feeding each one back in as session history. */
function runCycles(players: number[], n: number, seed: number): Match[][] {
  const rng = seeded(seed);
  const cycles: Match[][] = [];
  for (let i = 0; i < n; i++) cycles.push(nextCycle(players, { session: cycles.flat(), recent: [] }, rng));
  return cycles;
}

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

describe("4 players", () => {
  const players = [1, 2, 3, 4];

  it.each(SEEDS)("seed %i: 3 matches, everyone partners everyone once, nobody sits", (seed) => {
    const [cycle] = runCycles(players, 1, seed);
    expect(cycle).toHaveLength(3);
    expectValid(cycle, players);
    expect(cycle.every((m) => m.sittingOut.length === 0)).toBe(true);
    expect(new Set(partnerships(cycle)).size).toBe(6);
  });
});

describe("5 players", () => {
  const players = [1, 2, 3, 4, 5];

  it.each(SEEDS)("seed %i: everyone sits once and partners everyone once per cycle", (seed) => {
    for (const cycle of runCycles(players, 4, seed)) {
      expect(cycle).toHaveLength(5);
      expectValid(cycle, players);
      expect(cycle.flatMap((m) => m.sittingOut).sort()).toEqual(players);
      expect(new Set(partnerships(cycle)).size).toBe(10);
    }
  });

  it.each(SEEDS)("seed %i: nobody sits out twice in a row across cycles", (seed) => {
    const all = runCycles(players, 6, seed).flat();
    for (let i = 1; i < all.length; i++) {
      expect(all[i].sittingOut).not.toEqual(all[i - 1].sittingOut);
    }
  });
});

describe("6 players", () => {
  const players = [1, 2, 3, 4, 5, 6];

  it.each(SEEDS)("seed %i: 3 pairs round robin, each pair sits once", (seed) => {
    for (const cycle of runCycles(players, 5, seed)) {
      expect(cycle).toHaveLength(3);
      expectValid(cycle, players);
      expect(cycle.flatMap((m) => m.sittingOut).sort()).toEqual(players);
      // Same 3 pairs all cycle.
      expect(new Set(partnerships(cycle)).size).toBe(3);
    }
  });

  it.each(SEEDS)("seed %i: new partners in the second and third cycle", (seed) => {
    const [c1, c2, c3] = runCycles(players, 3, seed);
    // 3 cycles x 3 pairs = 9 distinct partnerships (out of 15 possible).
    expect(new Set([...partnerships(c1), ...partnerships(c2), ...partnerships(c3)]).size).toBe(9);
  });

  it.each(SEEDS)("seed %i: nobody sits out twice in a row across cycles", (seed) => {
    const all = runCycles(players, 6, seed).flat();
    for (let i = 1; i < all.length; i++) {
      const overlap = all[i].sittingOut.filter((p) => all[i - 1].sittingOut.includes(p));
      expect(overlap).toEqual([]);
    }
  });

  it("prefers partners who haven't played together recently", () => {
    // Recent history: every pairing except 1-2, 3-4, 5-6 has been played lots.
    const allPairs = perfectMatchings(players).flat();
    const recent: Match[] = allPairs
      .filter((p) => !["1-2", "3-4", "5-6"].includes(pairKey(p)))
      .map((p) => ({ a: p, b: p, sittingOut: [] }));
    const cycle = nextCycle(players, { session: [], recent }, seeded(7));
    expect(new Set(partnerships(cycle))).toEqual(new Set(["1-2", "3-4", "5-6"]));
  });
});

describe("never the same match twice in a row", () => {
  const sameMatch = (x: Match, y: Match) =>
    [pairKey(x.a), pairKey(x.b)].sort().join() === [pairKey(y.a), pairKey(y.b)].sort().join();

  it.each([4, 5, 6])("%i players, across cycles", (n) => {
    const players = Array.from({ length: n }, (_, i) => i + 1);
    for (const seed of SEEDS) {
      const all = runCycles(players, 8, seed).flat();
      for (let i = 1; i < all.length; i++) expect(sameMatch(all[i], all[i - 1])).toBe(false);
    }
  });
});

describe("other sizes", () => {
  it("rejects fewer than 4 or more than 6", () => {
    expect(() => nextCycle([1, 2, 3], empty)).toThrow();
    expect(() => nextCycle([1, 2, 3, 4, 5, 6, 7], empty)).toThrow();
  });

  it("finds all 15 pairings of 6 players", () => {
    expect(perfectMatchings([1, 2, 3, 4, 5, 6])).toHaveLength(15);
  });
});

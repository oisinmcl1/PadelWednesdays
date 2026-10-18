import { describe, expect, it } from "vitest";
import { rate, rating } from "openskill";
import { applyMatches, displayRating, latestRatings, type PlayedMatch } from "../src/ratings";

const m = (id: number, a: [number, number], b: [number, number], ga: number, gb: number): PlayedMatch => ({
  id, a1: a[0], a2: a[1], b1: b[0], b2: b[1], games_a: ga, games_b: gb,
});

/** A plausible evening across 6 players. */
const history: PlayedMatch[] = [
  m(1, [1, 2], [3, 4], 5, 3),
  m(2, [1, 3], [5, 6], 4, 5),
  m(3, [2, 4], [5, 6], 5, 4),
  m(4, [1, 4], [2, 3], 5, 0),
  m(5, [5, 1], [6, 3], 2, 5),
  m(6, [2, 6], [4, 5], 5, 1),
];

describe("applyMatches", () => {
  it("winners go up, losers go down", () => {
    const after = latestRatings(applyMatches(new Map(), [m(1, [1, 2], [3, 4], 5, 2)]));
    expect(after.get(1)!.mu).toBeGreaterThan(25);
    expect(after.get(3)!.mu).toBeLessThan(25);
    expect(displayRating(after.get(1)!)).toBeGreaterThan(displayRating(after.get(3)!));
  });

  it("bigger wins move ratings further", () => {
    const winnerMu = (gb: number) => latestRatings(applyMatches(new Map(), [m(1, [1, 2], [3, 4], 5, gb)])).get(1)!.mu;
    const loserMu = (gb: number) => latestRatings(applyMatches(new Map(), [m(1, [1, 2], [3, 4], 5, gb)])).get(3)!.mu;
    for (let gb = 4; gb > 0; gb--) {
      expect(winnerMu(gb - 1)).toBeGreaterThan(winnerMu(gb));
      expect(loserMu(gb - 1)).toBeLessThan(loserMu(gb));
    }
  });

  it("a 5-4 win counts the same as a plain win", () => {
    const plain = rate([[rating(), rating()], [rating(), rating()]], { rank: [1, 2] });
    const after = latestRatings(applyMatches(new Map(), [m(1, [1, 2], [3, 4], 5, 4)]));
    expect(after.get(1)!.mu).toBeCloseTo(plain[0][0].mu, 9);
    expect(after.get(3)!.mu).toBeCloseTo(plain[1][0].mu, 9);
  });

  it("a 5-0 win moves mu about 2.6 times as far as a 5-4", () => {
    const delta = (gb: number) => latestRatings(applyMatches(new Map(), [m(1, [1, 2], [3, 4], 5, gb)])).get(1)!.mu - 25;
    expect(delta(0) / delta(4)).toBeCloseTo(1 + Math.log(5), 6);
  });

  it("writes 4 rows per match", () => {
    expect(applyMatches(new Map(), history)).toHaveLength(history.length * 4);
  });

  it("replaying from a stored midpoint equals replaying everything", () => {
    const full = applyMatches(new Map(), history);
    for (let k = 0; k <= history.length; k++) {
      const start = latestRatings(full.filter((r) => r.match_id <= k));
      const partial = applyMatches(start, history.slice(k));
      expect(partial).toEqual(full.filter((r) => r.match_id > k));
    }
  });

  it("editing an old result changes later ratings, not earlier ones", () => {
    const original = applyMatches(new Map(), history);
    const edited = history.map((x) => (x.id === 3 ? { ...x, games_a: 1, games_b: 5 } : x));
    const after = applyMatches(new Map(), edited);
    expect(after.filter((r) => r.match_id < 3)).toEqual(original.filter((r) => r.match_id < 3));
    expect(after.filter((r) => r.match_id >= 3)).not.toEqual(original.filter((r) => r.match_id >= 3));
  });
});

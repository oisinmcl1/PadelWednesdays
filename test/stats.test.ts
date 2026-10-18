import { describe, expect, it } from "vitest";
import { records, winPct } from "../src/stats";

const m = (a: [number, number], b: [number, number], ga: number, gb: number) => ({
  id: 0, a1: a[0], a2: a[1], b1: b[0], b2: b[1], games_a: ga, games_b: gb,
});

describe("records", () => {
  it("counts wins, draws and losses per player", () => {
    const r = records([m([1, 2], [3, 4], 6, 3), m([1, 3], [2, 4], 4, 4), m([1, 4], [2, 3], 2, 6)]);
    expect(r.get(1)).toEqual({ played: 3, wins: 1, draws: 1, losses: 1 });
    expect(r.get(2)).toEqual({ played: 3, wins: 2, draws: 1, losses: 0 });
    expect(r.get(4)).toEqual({ played: 3, wins: 0, draws: 1, losses: 2 });
    expect(r.has(5)).toBe(false);
  });

  it("win % rounds and handles zero games", () => {
    expect(winPct({ played: 3, wins: 2, draws: 0, losses: 1 })).toBe(67);
    expect(winPct({ played: 0, wins: 0, draws: 0, losses: 0 })).toBe(0);
  });
});

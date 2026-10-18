import { describe, expect, it } from "vitest";
import { bestPartner, headToHead, nemesis, pairKey, partnerships, records, seasonOf, streak, winPct } from "../src/stats";

let nextId = 1;
const m = (a: [number, number], b: [number, number], ga: number, gb: number) => ({
  id: nextId++, a1: a[0], a2: a[1], b1: b[0], b2: b[1], games_a: ga, games_b: gb,
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

describe("streak", () => {
  const ms = [m([1, 2], [3, 4], 2, 6), m([1, 3], [2, 4], 6, 1), m([4, 1], [2, 3], 6, 4), m([2, 3], [4, 5], 6, 0)];

  it("counts the current run, ignoring matches the player missed", () => {
    expect(streak(ms, 1)).toEqual({ kind: "W", length: 2 });
    expect(streak(ms, 4)).toEqual({ kind: "L", length: 1 });
    expect(streak(ms, 3)).toEqual({ kind: "W", length: 1 });
  });

  it("handles draws and no games", () => {
    expect(streak([m([1, 2], [3, 4], 5, 5)], 1)).toEqual({ kind: "D", length: 1 });
    expect(streak(ms, 9)).toBeNull();
  });
});

describe("partners and opponents", () => {
  // Player 1 wins 3 of 3 with partner 2 and 1 of 3 with partner 3.
  // Opponent 5: met 3 times, lost 2. Opponent 4: met 3 times, lost 1.
  const ms = [
    m([1, 2], [5, 6], 6, 2),
    m([1, 2], [3, 4], 6, 3),
    m([1, 2], [7, 8], 6, 1),
    m([1, 3], [5, 4], 2, 6),
    m([1, 3], [5, 6], 1, 6),
    m([3, 1], [2, 4], 6, 0),
  ];

  it("counts per partner and per opponent", () => {
    const { partners, opponents } = headToHead(ms, 1);
    expect(partners.get(2)).toEqual({ played: 3, wins: 3, draws: 0, losses: 0 });
    expect(partners.get(3)).toEqual({ played: 3, wins: 1, draws: 0, losses: 2 });
    expect(opponents.get(5)).toEqual({ played: 3, wins: 1, draws: 0, losses: 2 });
  });

  it("best partner and nemesis respect the minimum games", () => {
    const { partners, opponents } = headToHead(ms, 1);
    expect(bestPartner(partners)?.id).toBe(2);
    expect(nemesis(opponents)?.id).toBe(5);
    expect(bestPartner(partners, 4)).toBeNull();
    expect(nemesis(opponents, 4)).toBeNull();
  });

  it("no nemesis if you never lost", () => {
    const { opponents } = headToHead([m([1, 2], [3, 4], 6, 0), m([1, 2], [3, 4], 6, 1), m([1, 2], [3, 4], 6, 2)], 1);
    expect(nemesis(opponents)).toBeNull();
  });

  it("partnerships are keyed regardless of order", () => {
    const p = partnerships([m([2, 1], [3, 4], 6, 0), m([1, 2], [4, 3], 0, 6)]);
    expect(p.get(pairKey(1, 2))).toEqual({ played: 2, wins: 1, draws: 0, losses: 1 });
    expect(p.get("3-4")).toEqual({ played: 2, wins: 1, draws: 0, losses: 1 });
  });
});

describe("seasons", () => {
  it("are calendar months", () => {
    expect(seasonOf("2026-10-21")).toBe("2026-10");
  });
});

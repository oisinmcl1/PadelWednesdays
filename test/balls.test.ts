import { describe, expect, it } from "vitest";
import { ballTurn } from "../src/balls";

// Ball order: Aoife(1) -> Ciarán(2) -> Niamh(3) -> Oisín(4) -> Seán(5)
const players = [
  { id: 10, ball_order: 1 },
  { id: 20, ball_order: 2 },
  { id: 30, ball_order: 3 },
  { id: 40, ball_order: 4 },
  { id: 50, ball_order: 5 },
  { id: 60, ball_order: null }, // not in the rotation
];
const all = new Set([10, 20, 30, 40, 50, 60]);

describe("ballTurn", () => {
  it("starts at the top when nobody has bought yet", () => {
    expect(ballTurn(players, null, all)).toBe(10);
  });

  it("goes to the next in order", () => {
    expect(ballTurn(players, 1, all)).toBe(20);
    expect(ballTurn(players, 4, all)).toBe(50);
  });

  it("wraps around", () => {
    expect(ballTurn(players, 5, all)).toBe(10);
  });

  it("skips anyone absent", () => {
    expect(ballTurn(players, 1, new Set([10, 40, 50]))).toBe(40);
    expect(ballTurn(players, 4, new Set([20, 30, 40]))).toBe(20);
  });

  it("works if the last buyer has since left the rotation", () => {
    const without4 = players.filter((p) => p.id !== 40);
    expect(ballTurn(without4, 4, all)).toBe(50);
  });

  it("returns null if nobody present is in the rotation", () => {
    expect(ballTurn(players, 1, new Set([60]))).toBeNull();
  });
});

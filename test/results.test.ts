import { describe, expect, it } from "vitest";
import { formatSets, parseGames, parseSets, SETS_TO_WIN, WIN_GAMES } from "../src/sessions";

describe("parseGames (a set: first to 5, set point on 4)", () => {
  it("is first to 5", () => expect(WIN_GAMES).toBe(5));

  it.each([
    ["5", "0"], ["5", "3"], ["5", "4"], ["0", "5"], ["4", "5"],
  ])("accepts %s–%s", (a, b) => expect(parseGames(a, b)).toEqual([Number(a), Number(b)]));

  it.each([
    ["5", "5"], // both can't win
    ["4", "4"], // nobody has won yet
    ["4", "3"],
    ["6", "4"], // nobody gets past 5
    ["0", "0"],
    ["", "5"],
    ["x", "5"],
    [undefined, "5"],
  ])("rejects %s–%s", (a, b) => expect(parseGames(a, b)).toBeNull());
});

describe("parseSets (best of 3)", () => {
  it("is best of 3", () => expect(SETS_TO_WIN).toBe(2));

  it.each([
    [[[5, 3], [5, 4]], [2, 0]],
    [[[0, 5], [3, 5]], [0, 2]],
    [[[5, 3], [2, 5], [5, 4]], [2, 1]],
    [[[1, 5], [5, 2], [4, 5]], [1, 2]],
  ] as [[number, number][], [number, number]][])("accepts %j", (sets, won) => expect(parseSets(sets)).toEqual(won));

  it.each([
    [[]],
    [[[5, 3]]], // not finished
    [[[5, 3], [2, 5]]], // 1-1, needs a third set
    [[[5, 3], [5, 4], [5, 0]]], // a set after the match was won
    [[[5, 3], [4, 4]]], // invalid set score
    [[[5, 3], [3, 5], [6, 4]]],
  ] as [[number, number][]][])("rejects %j", (sets) => expect(parseSets(sets)).toBeNull());

  it("formats set scores", () => expect(formatSets([[5, 3], [2, 5]])).toBe("5–3 2–5"));
});

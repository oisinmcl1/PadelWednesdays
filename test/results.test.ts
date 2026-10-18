import { describe, expect, it } from "vitest";
import { parseGames, WIN_GAMES } from "../src/sessions";

describe("parseGames (first to 5, match point on 4)", () => {
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

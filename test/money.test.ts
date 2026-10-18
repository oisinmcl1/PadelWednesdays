import { describe, expect, it } from "vitest";
import { formatEuros, parseEuros } from "../src/money";

describe("parseEuros", () => {
  it.each([
    ["40", 4000],
    ["42.5", 4250],
    ["42.50", 4250],
    ["42,50", 4250],
    ["€ 7.05", 705],
    ["0", 0],
  ])("%s -> %i cents", (input, cents) => expect(parseEuros(input)).toBe(cents));

  it.each(["", "abc", "-5", "1.234", "12.", "1e3"])("rejects %j", (input) =>
    expect(parseEuros(input)).toBeNull(),
  );
});

describe("formatEuros", () => {
  it("formats cents", () => {
    expect(formatEuros(4250)).toBe("€42.50");
    expect(formatEuros(5)).toBe("€0.05");
    expect(formatEuros(-1234)).toBe("-€12.34");
  });
});

import { describe, expect, it } from "vitest";
import { formatMoney, normaliseRevolutUrl, parseMoney } from "../src/money";

describe("parseMoney", () => {
  it.each([
    ["40", 4000],
    ["42.5", 4250],
    ["42.50", 4250],
    ["42,50", 4250],
    ["£ 7.05", 705],
    ["£64", 6400],
    ["0", 0],
  ])("%s -> %i pence", (input, cents) => expect(parseMoney(input)).toBe(cents));

  it.each(["", "abc", "-5", "1.234", "12.", "1e3"])("rejects %j", (input) =>
    expect(parseMoney(input)).toBeNull(),
  );
});

describe("formatMoney", () => {
  it("formats cents", () => {
    expect(formatMoney(4250)).toBe("£42.50");
    expect(formatMoney(5)).toBe("£0.05");
    expect(formatMoney(-1234)).toBe("-£12.34");
  });
});

describe("normaliseRevolutUrl", () => {
  it.each([
    "revolut.me/oisinmcl",
    "https://revolut.me/oisinmcl",
    "http://revolut.me/oisinmcl",
    "www.revolut.me/oisinmcl",
    "  https://www.Revolut.me/oisinmcl/  ",
  ])("%j -> https://revolut.me/oisinmcl", (input) =>
    expect(normaliseRevolutUrl(input)).toBe("https://revolut.me/oisinmcl"),
  );

  it.each(["oisinmcl", "revolut.com/oisinmcl", "https://evil.com/revolut.me/x", "revolut.me/", "revolut.me/a b"])(
    "rejects %j",
    (input) => expect(normaliseRevolutUrl(input)).toBeNull(),
  );
});

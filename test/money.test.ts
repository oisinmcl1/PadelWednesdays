import { describe, expect, it } from "vitest";
import { formatMoney, normaliseRevolutUrl, parseMoney, paymentReference, revolutPayUrl } from "../src/money";

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

describe("revolutPayUrl", () => {
  const base = "https://revolut.me/oisinmcl";

  it("adds currency, amount in pence and note", () => {
    const url = revolutPayUrl(base, 1050, "Padel 18 Nov");
    expect(url).toBe("https://revolut.me/oisinmcl?currency=GBP&amount=1050&note=Padel+18+Nov");
    const params = new URL(url).searchParams;
    expect(params.get("currency")).toBe("GBP");
    expect(params.get("amount")).toBe("1050");
  });

  it("encodes spaces and commas in the note", () => {
    const url = revolutPayUrl(base, 800, "Padel 11 Nov, 18 Nov");
    expect(url).toContain("note=Padel+11+Nov%2C+18+Nov");
    expect(new URL(url).searchParams.get("note")).toBe("Padel 11 Nov, 18 Nov");
  });

  it("cuts the note to 64 chars", () => {
    const long = "x".repeat(70);
    expect(new URL(revolutPayUrl(base, 100, long)).searchParams.get("note")).toBe("x".repeat(64));
  });
});

describe("paymentReference", () => {
  it("names one session", () => expect(paymentReference(["2026-11-18"])).toBe("Padel 18 Nov"));

  it("lists several", () =>
    expect(paymentReference(["2026-11-04", "2026-11-11", "2026-11-18", "2026-11-25"])).toBe(
      "Padel 4 Nov, 11 Nov, 18 Nov, 25 Nov",
    ));

  const fits = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];

  it("lists every date up to exactly 64 chars", () => {
    const ref = paymentReference(fits);
    expect(ref).toBe("Padel 1 Nov, 2 Nov, 3 Nov, 4 Nov, 10 Nov, 11 Nov, 12 Nov, 13 Nov");
    expect(ref).toHaveLength(64);
  });

  it("summarises when the list wouldn't fit", () =>
    expect(paymentReference([...fits, "2026-11-14"])).toBe("Padel 9 weeks to 14 Nov"));
});

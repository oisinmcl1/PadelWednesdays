import { describe, expect, it } from "vitest";
import { parseGuestNames } from "../src/db";

describe("parseGuestNames", () => {
  it("is empty when blank", () => {
    expect(parseGuestNames("")).toEqual([]);
    expect(parseGuestNames(undefined)).toEqual([]);
    expect(parseGuestNames(" , ")).toEqual([]);
  });

  it("splits on commas and tidies spaces", () =>
    expect(parseGuestNames("  Tom ,Mary   Kate,")).toEqual(["Tom", "Mary Kate"]));

  it("drops repeats, ignoring case", () => expect(parseGuestNames("Tom, tom, TOM")).toEqual(["Tom"]));

  it("rejects a name over 30 characters", () => expect(parseGuestNames("Tom, " + "x".repeat(31))).toBeNull());
});

import { describe, expect, it } from "vitest";
import { splitCost } from "../src/money";

const sum = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe("splitCost", () => {
  it("splits evenly when it divides", () => {
    expect([...splitCost(4000, [1, 2, 3, 4], 1)]).toEqual([[1, 1000], [2, 1000], [3, 1000], [4, 1000]]);
  });

  it("gives the leftover cents to the payer", () => {
    const s = splitCost(4000, [1, 2, 3, 4, 5, 6], 3);
    expect(s.get(3)).toBe(670);
    for (const id of [1, 2, 4, 5, 6]) expect(s.get(id)).toBe(666);
    expect(sum(s)).toBe(4000);
  });

  it("everyone pays the rounded-down share if the payer isn't there", () => {
    const s = splitCost(4250, [2, 3, 4, 5, 6], 1);
    expect([...s.values()]).toEqual([850, 850, 850, 850, 850]);
    const odd = splitCost(4001, [2, 3, 4], 1);
    expect([...odd.values()]).toEqual([1333, 1333, 1333]); // payer covers the 2c
  });

  it("always adds up exactly when the payer plays", () => {
    for (let total = 0; total <= 10000; total += 37) {
      for (const n of [4, 5, 6]) {
        const ids = Array.from({ length: n }, (_, i) => i + 1);
        const s = splitCost(total, ids, 1);
        expect(sum(s)).toBe(total);
        expect(s.get(1)! - s.get(2)!).toBeLessThan(n);
      }
    }
  });
});

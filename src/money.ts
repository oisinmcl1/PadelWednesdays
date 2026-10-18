// All money is integer cents. These helpers convert to/from what people type and read.

/** Parses "12", "12.5", "12,50" or "€12.50" into cents. Returns null if invalid. */
export function parseEuros(input: string): number | null {
  const s = input.trim().replace(/^€\s*/, "").replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatEuros(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}€${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

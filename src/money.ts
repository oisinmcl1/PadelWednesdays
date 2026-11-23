// All money is integer pence, in pounds sterling. (Columns and variables say "cents":
// read that as the currency's smallest unit.) These helpers convert to/from what
// people type and read.

/** Parses "12", "12.5", "12,50" or "£12.50" into pence. Returns null if invalid. */
export function parseMoney(input: string): number | null {
  const s = input.trim().replace(/^£\s*/, "").replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}£${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Splits the court cost equally among attendees, to the penny. Everyone pays the
 * rounded-down share; the payer (who booked the court) absorbs the leftover pence.
 * Returns each attendee's share. The payer's share is what they're out of pocket.
 */
export function splitCost(totalCents: number, attendees: number[], payerId: number | null): Map<number, number> {
  const base = Math.floor(totalCents / attendees.length);
  const remainder = totalCents - base * attendees.length;
  const shares = new Map(attendees.map((id) => [id, base]));
  if (payerId !== null && shares.has(payerId)) shares.set(payerId, base + remainder);
  return shares;
}

/**
 * Tidies a Revolut.me link: "revolut.me/name", "www.revolut.me/name" and
 * "http://revolut.me/name" all become "https://revolut.me/name". Returns null if
 * it isn't a revolut.me link.
 */
export function normaliseRevolutUrl(input: string): string | null {
  const rest = input.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const m = /^revolut\.me\/([A-Za-z0-9._-]+)\/?$/i.exec(rest);
  return m ? `https://revolut.me/${m[1]}` : null;
}

/**
 * The reference to put on a payment, so the payer can match it in their Revolut feed:
 * "Padel 19 Nov", "Padel 12 Nov, 19 Nov", or "Padel 4 weeks to 19 Nov" past three dates.
 * Dates are ISO (YYYY-MM-DD), oldest first.
 */
export function paymentReference(dates: string[]): string {
  const short = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  if (dates.length > 3) return `Padel ${dates.length} weeks to ${short(dates[dates.length - 1])}`;
  return `Padel ${dates.map(short).join(", ")}`;
}

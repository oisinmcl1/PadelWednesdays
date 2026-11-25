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

/** Revolut's limit on a payment note. */
const REVOLUT_NOTE_MAX = 64;

/**
 * The Revolut.me link with the amount (pence), currency and note pre-filled. revolut.me
 * accepts these query params but doesn't document them, so callers keep a fallback.
 */
export function revolutPayUrl(base: string, cents: number, reference: string): string {
  const params = new URLSearchParams({
    currency: "GBP",
    amount: String(cents),
    note: reference.slice(0, REVOLUT_NOTE_MAX),
  });
  return `${base}?${params}`;
}

/**
 * The reference to put on a payment, so the payer can match it in their Revolut feed.
 * Lists every date while it fits in Revolut's 64-char note ("Padel 12 Nov, 19 Nov, 26 Nov"),
 * otherwise summarises ("Padel 9 weeks to 26 Nov"). Dates are ISO (YYYY-MM-DD), oldest first.
 */
export function paymentReference(dates: string[]): string {
  const short = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const all = `Padel ${dates.map(short).join(", ")}`;
  if (all.length <= REVOLUT_NOTE_MAX) return all;
  return `Padel ${dates.length} weeks to ${short(dates[dates.length - 1])}`;
}

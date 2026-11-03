/** All numbers and dates render through the design's formatter conventions. */

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const monthFmt = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" });
const monthYear2 = new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" });

export function fmtMoney(v: number | null | undefined): string {
  return v == null ? "—" : money.format(v);
}

export function fmtSignMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v < 0 ? "−" : "+") + money.format(Math.abs(v));
}

export function fmtPct(v: number | null | undefined): string {
  return v == null ? "—" : pct.format(v);
}

/** "2025-09-01" → "Sep 2025" (design convention) */
export function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  return monthFmt.format(new Date(iso + "T00:00:00"));
}

/** "2023-11-01" → "Nov 23" (used by the reconstructed-notes range) */
export function fmtMonthShort2(iso: string | null | undefined): string {
  if (!iso) return "—";
  return monthYear2.format(new Date(iso + "T00:00:00"));
}

/** The k-th month after iso (k=1 → the next month), normalized to day 01. */
export function addMonths(iso: string, k: number): string {
  const d = new Date(iso + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1)).toISOString().slice(0, 10);
}

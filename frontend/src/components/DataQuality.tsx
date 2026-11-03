import { apiClient, getForecastLatest, getHistory } from "@/lib/client";
import type { HistoryPoint } from "@/lib/client";
import { fmtMoney, fmtMonth, fmtMonthShort2 } from "@/lib/format";

const fmtPctInline = (v: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(v);

function previousMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
}

interface Row {
  time: string;
  headline: string;
  sub: string;
  flagged: boolean;
}

/**
 * Data quality notes. Flag codes (from the observation screens) map to the
 * plain-English sentences of the design; the reconstruction row comes from the
 * history's interpolated months; the first row compares the last observed price
 * with the forecast horizon h1.
 */
export default async function DataQuality() {
  const unreachable = (
    <section className="card" id="quality">
      <div className="card__h"><h2>Data quality</h2></div>
      <p className="muted">
        Backend not reachable at {process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"}
      </p>
    </section>
  );

  const hist = await getHistory();
  if (!hist) return unreachable;
  const [run, flaggedRes] = await Promise.all([
    getForecastLatest(),
    apiClient.GET("/api/v1/observations/").then((r) => r.data ?? null).catch(() => null),
  ]);
  const flagged = (flaggedRes ?? []) as HistoryPoint[];

  const priceOf = new Map(hist.points.map((p) => [String(p.month), Number(p.price)]));
  const lastObs = hist.points[hist.points.length - 1];
  const rows: Row[] = [];

  // Row 1: last observed vs the h1 of the stored forecast (inside/outside the 80 % band)
  const h1 = run?.points[0];
  if (lastObs && h1) {
    const price = Number(lastObs.price);
    const fc = Number(h1.forecast);
    const within80 = Number(h1.lower_80) <= price && price <= Number(h1.upper_80);
    const within95 = Number(h1.lower_95) <= price && price <= Number(h1.upper_95);
    const err = Math.abs((price - fc) / price) * 100;
    rows.push({
      time: fmtMonth(String(lastObs.month)),
      headline: within80
        ? "Inside the 80 % band."
        : within95
          ? "Outside the 80 % band."
          : "Outside the 95 % band.",
      sub: `${fmtMoney(price)} vs forecast ${fmtMoney(fc)}, error ${fmtPctInline(err)} %.`,
      flagged: false,
    });
  }

  // Flagged observations → plain English (the observation anomaly screens)
  const flaggedRows: Row[] = flagged
    .slice()
    .sort((a, b) => (String(a.month) < String(b.month) ? 1 : -1))
    .map((o) => {
      const prev = priceOf.get(previousMonth(String(o.month)));
      const pctJump = prev ? Math.round((Number(o.price) / prev - 1) * 100) : null;
      const headline = o.flags.includes("mom_jump_gt_20pct")
        ? `Jumped ${Math.abs(pctJump ?? 0)} % in a month.`
        : o.flags.includes("repeat_of_previous")
          ? "Same price as the previous month."
          : o.flags.includes("outside_95_interval")
            ? "Outside the 95 % forecast interval."
            : "Outside the 80 % forecast interval.";
      const sub = o.flags.includes("outside_95_interval")
        ? "Treated as a regime change."
        : "Kept after review; inside the 95 % band.";
      return { time: fmtMonth(String(o.month)), headline, sub, flagged: true };
    });

  // Reconstruction row (range of interpolated months from the cleaning step)
  const interp = hist.points.filter((p) => p.is_interpolated).map((p) => String(p.month));
  if (interp.length) {
    rows.push({
      time: `${fmtMonthShort2(interp[0])} – ${fmtMonthShort2(interp[interp.length - 1])}`,
      headline: `${hist.summary.n_interpolated} months copied from earlier runs.`,
      sub: "Replaced with a log-linear estimate.",
      flagged: true,
    });
  }

  return (
    <section className="card" id="quality" aria-labelledby="qh">
      <div className="card__h"><h2 id="qh">Data quality</h2></div>
      <ul className="notes">
        {[...rows, ...flaggedRows].map((r, i) => (
          <li key={i} className={r.flagged ? "flag" : undefined}>
            <time>{r.time}</time>
            <div><b>{r.headline}</b> <span>{r.sub}</span></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

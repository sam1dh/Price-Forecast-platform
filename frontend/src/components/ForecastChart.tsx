import { getForecastLatest, getHealthSummary, getHistory } from "@/lib/client";
import { buildChart } from "@/lib/chart";
import { fmtMonth, fmtMoney } from "@/lib/format";

const WINDOW = 36; // observed months on screen (design: Oct 2022 – Sep 2025)

/**
 * Server Component. Rebuilds the design SVG from live data:
 * x/y scales computed here, observed line, dashed overlay + shaded column for
 * interpolated months, 80/95 band polygons, median line, "today" rule and
 * right-edge labels, plus 20 faint simulated paths from a seeded PRNG.
 */
export default async function ForecastChart() {
  const [hist, run, summary] = await Promise.all([getHistory(), getForecastLatest(), getHealthSummary()]);
  if (!hist || !run || !summary || !hist.points.length || !run.points.length) {
    const unreachable = hist === null || run === null || summary === null;
    return (
      <div className="card" role="status">
        <div className="card__h"><h2>Monthly price and 12-month forecast</h2><p>The forecast is a band, not a line.</p></div>
        <ChartSkeleton />
        <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
          {unreachable
            ? `Backend not reachable at ${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"}`
            : "No forecast stored yet — run `python manage.py seed` on the backend."}
        </p>
      </div>
    );
  }

  const obs = hist.points.slice(-WINDOW).map((p) => ({
    month: String(p.month),
    price: Number(p.price),
    is_interpolated: Boolean(p.is_interpolated),
  }));
  const fc = run.points.map((p) => ({
    month: String(p.month),
    forecast: Number(p.forecast),
    lower_80: Number(p.lower_80),
    upper_80: Number(p.upper_80),
    lower_95: Number(p.lower_95),
    upper_95: Number(p.upper_95),
  }));
  const sigma = (fc[0].upper_95 - fc[0].lower_95) / (2 * 1.96);
  const spec = buildChart({ obs, forecast: fc, drift: Number(summary.monthly_drift), sigma });

  const lastInterpHist = obs.findLast((p) => p.is_interpolated)?.month ?? "";
  const reconMonths = spec.recon ? `${fmtMonth(obs[0].month)} to ${fmtMonth(lastInterpHist)}` : null;

  return (
    <section className="chartwrap" aria-labelledby="ch">
      <div className="card__h"><h2 id="ch">Monthly price and 12-month forecast</h2><p>The forecast is a band, not a line.</p></div>
      <svg
        className="c-svg"
        viewBox="0 0 1120 400"
        role="img"
        aria-label={`Monthly price ${fmtMonth(obs[0].month)} to ${fmtMonth(obs[obs.length - 1].month)} observed and a 12-month forecast to ${fmtMonth(fc[fc.length - 1].month)} shown as a median with 80 and 95 percent bands${reconMonths ? `; ${reconMonths} is reconstructed` : ""}.`}
      >
        {spec.recon && (
          <rect className="c-recon" x={spec.recon.x} y={20} width={spec.recon.width} height={330} rx={4} />
        )}
        {spec.gridlines.map((gl) => (
          <g key={gl.y}>
            <line className="c-grid" x1={44} x2={1044} y1={gl.y} y2={gl.y} />
            <text className="c-yl" x={34} y={gl.y + 4}>{gl.label}</text>
          </g>
        ))}
        {spec.yearLabels.map((yl) => (
          <text key={yl.label} className="c-xl" x={yl.x} y={376}>{yl.label}</text>
        ))}
        <line className="c-today" x1={spec.today.x} x2={spec.today.x} y1={20} y2={350} />
        <text className="c-tl" x={spec.today.x} y={14}>Last observed · {fmtMonth(spec.today.label)}</text>
        {spec.recon && <text className="c-rl" x={56} y={42}>{spec.recon.label}</text>}
        {spec.sims.map((s, i) => <polyline className="c-sim" key={i} points={s} />)}
        <polygon className="c-b95" points={spec.bands.b95} />
        <polygon className="c-b80" points={spec.bands.b80} />
        <polyline className="c-obs c-obs--r" points={spec.reconLine} />
        <polyline className="c-obs" points={spec.obsLine} />
        <polyline className="c-med" pathLength={1} points={spec.median} />
        <circle className="c-last" cx={spec.lastPoint.x} cy={spec.lastPoint.y} r={4.5} />
        <text className="c-end" x={1056} y={spec.endLabels[0].y}>{fmtMoney(fc[fc.length - 1].upper_95)}</text>
        <text className="c-end c-end--m" x={1056} y={spec.endLabels[1].y}>{fmtMoney(fc[fc.length - 1].forecast)}</text>
        <text className="c-end" x={1056} y={spec.endLabels[2].y}>{fmtMoney(fc[fc.length - 1].lower_95)}</text>
      </svg>
      <ul className="legend" aria-label="Legend">
        <li><span className="sw" aria-hidden="true"></span>Observed</li>
        {reconMonths && (
          <li><span className="sw sw--r" aria-hidden="true"></span>Reconstructed ({reconMonths.replace("–", "–").replace(/ to /, " – ")})</li>
        )}
        <li><span className="sw sw--fc" aria-hidden="true"></span>Forecast median</li>
        <li><span className="sw sw--b" aria-hidden="true"></span>80 % and 95 % bands</li>
      </ul>
    </section>
  );
}

/** Design-plain skeleton while the chart data loads. */
function ChartSkeleton() {
  return (
    <div className="c-svg-skeleton" aria-hidden="true">
      <div className="sk sk-line" style={{ width: "70%" }} />
      <div className="sk sk-area" />
      <div className="sk sk-line" style={{ width: "45%" }} />
    </div>
  );
}

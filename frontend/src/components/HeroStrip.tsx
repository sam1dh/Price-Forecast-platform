import { getHealthSummary } from "@/lib/client";
import { fmtMoney, fmtPct, fmtMonth } from "@/lib/format";

/** `GET /health/summary/` — the 16,232 / +3.1 % / 95 % range / three stats. */
export default async function HeroStrip() {
  const s = await getHealthSummary();
  if (!s) {
    return (
      <section className="hero" aria-labelledby="h1">
        <div>
          <h1 id="h1">Forecast</h1>
          <p className="hero__sub">
            Backend not reachable at {process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"}
          </p>
        </div>
      </section>
    );
  }
  return (
    <section className="hero" aria-labelledby="h1">
      <div>
        <h1 id="h1">Forecast for {fmtMonth(s.end_month)}</h1>
        <div className="hero__num">{fmtMoney(s.end_forecast)}</div>
        <p className="hero__sub">
          Up <b>{fmtPct(s.pct_change_vs_last)} %</b> on the last observed price of{" "}
          {fmtMoney(s.last_observed_price)}. The honest range is wide: 95 % of outcomes fall
          between <b>{fmtMoney(s.band_95_h12?.lower)}</b> and <b>{fmtMoney(s.band_95_h12?.upper)}</b>.
        </p>
      </div>
      <div className="stats">
        <div className="stat">
          <span>Last observed</span>
          <strong>{fmtMoney(s.last_observed_price)}</strong>
        </div>
        <div className="stat">
          <span>Back-test error</span>
          <strong>{fmtPct(s.backtest_error_pct)} %</strong>
        </div>
        <div className="stat">
          <span>Reconstructed</span>
          <strong>{s.n_interpolated} / {s.n_obs} mo</strong>
        </div>
      </div>
    </section>
  );
}

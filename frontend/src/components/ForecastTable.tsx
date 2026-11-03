import { getForecastLatest } from "@/lib/client";
import { fmtMonth, fmtMoney } from "@/lib/format";

/** `GET /forecast/latest/` — the 12 month-by-month rows. */
export default async function ForecastTable() {
  const run = await getForecastLatest();
  if (!run || !run.points.length) {
    return (
      <section className="card">
        <div className="card__h"><h2>Month by month</h2><p>Holt linear trend, refit monthly</p></div>
        <p className="muted">
          {run === null
            ? `Backend not reachable at ${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"}`
            : "No forecast stored yet."}
        </p>
      </section>
    );
  }
  const rows = run.points;
  return (
    <section className="card" aria-labelledby="th">
      <div className="card__h"><h2 id="th">Month by month</h2><p>Holt linear trend, refit monthly</p></div>
      <table className="tbl">
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Forecast</th>
            <th scope="col">80 % band</th>
            <th scope="col">95 % band</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={String(p.month)}>
              <th scope="row">{fmtMonth(String(p.month))}</th>
              <td className="fcv">{fmtMoney(Number(p.forecast))}</td>
              <td>{fmtMoney(Number(p.lower_80))} – {fmtMoney(Number(p.upper_80))}</td>
              <td>{fmtMoney(Number(p.lower_95))} – {fmtMoney(Number(p.upper_95))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

import { getModelCompare } from "@/lib/client";
import { fmtPct } from "@/lib/format";

/** `GET /models/compare/` — bars scaled to the max RMSE (max · 1.1 headroom, as in the design). */
export default async function ModelRace() {
  const mc = await getModelCompare();
  if (!mc || !mc.rows.length) {
    return (
      <section className="card" id="models">
        <div className="card__h"><h2>Model race</h2><p>12-step RMSE, lower is better</p></div>
        <p className="muted">
          {mc === null
            ? `Backend not reachable at ${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"}`
            : "No comparison metrics yet."}
        </p>
      </section>
    );
  }
  const max = Math.max(...mc.rows.map((r) => Number(r.rmse)));
  const widthPct = (rmse: number) => Math.round((rmse / (max * 1.1)) * 100);
  return (
    <section className="card" id="models" aria-labelledby="mh">
      <div className="card__h"><h2 id="mh">Model race</h2><p>12-step RMSE, lower is better</p></div>
      <ol className="mrace">
        {mc.rows.map((r) => (
          <li key={r.name} className={r.selected ? "mr mr--sel" : "mr"}>
            <span className="mr__n">{r.display_name}</span>
            <span className="mr__t">
              <span className="mr__b" style={{ width: `${widthPct(Number(r.rmse))}%` }}></span>
            </span>
            <span className="mr__v">{fmtPct(r.rmse)}</span>
          </li>
        ))}
      </ol>
      <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
        The leader is ahead by {fmtPct(mc.lead_vs_next_pct)} %, so treat the order as indicative.
        {mc.metric ? ` ${mc.metric}.` : ""}
      </p>
    </section>
  );
}

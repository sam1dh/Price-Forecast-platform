import { getHealthSummary } from "@/lib/client";
import ScenarioForm from "./ScenarioForm";

/** Server wrapper: resolves the scenario months from the API's data_as_of. */
export default async function ScenarioSection() {
  const s = await getHealthSummary();
  if (!s) {
    return (
      <section className="card" id="scenario">
        <div className="card__h"><h2>Scenario</h2><p>Override the next two months</p></div>
        <p className="muted">
          Backend not reachable at {process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"}
        </p>
      </section>
    );
  }
  return <ScenarioForm dataAsOf={s.data_as_of} />;
}

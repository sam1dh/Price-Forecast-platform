import { getHealthSummary } from "@/lib/client";
import { addMonths } from "@/lib/format";
import Nav from "@/components/Nav";
import HeroStrip from "@/components/HeroStrip";
import ForecastChart from "@/components/ForecastChart";
import ForecastTable from "@/components/ForecastTable";
import ModelRace from "@/components/ModelRace";
import DataQuality from "@/components/DataQuality";
import ScenarioSection from "@/components/ScenarioSection";

/**
 * Data freshness: every GET in src/lib/api.ts passes `next: { revalidate: 300 }`.
 * Each component renders its own "backend not reachable" fallback so a build or
 * runtime without the API never yields a blank page.
 */

export default async function Dashboard() {
  const s = await getHealthSummary();
  const navNextMonth = s?.data_as_of ? addMonths(s.data_as_of, 1) : null;
  const seriesNote = s ? `Series of ${s.n_obs} months · model refits when the price lands.` : "";
  return (
    <>
      <div className="band">
        <header className="wrap">
          <Nav nextMonth={navNextMonth} />
          <HeroStrip />
          <ForecastChart />
        </header>
      </div>
      <main className="wrap">
        <div className="row">
          <ForecastTable />
          <div className="stack">
            <ModelRace />
            <DataQuality />
            <ScenarioSection />
          </div>
        </div>
      </main>
      <footer className="wrap">{seriesNote || "Series of 249 months · model refits when a new price lands."}</footer>
    </>
  );
}

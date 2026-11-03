"use client";

/**
 * Client Component. Overrides the two months after data_as_of with POST
 * /predict/, shows the scenario end value, the baseline end value, and the
 * difference — or the backend's `scenario_gap` message inline on 422.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/client";
import { addMonths, fmtMonth, fmtMoney, fmtSignMoney } from "@/lib/format";

const money = (v: string) => Number(String(v).replace(/[, ]/g, ""));

/** Small inline hint under a section: muted, subtle, never interferes with the
 * primary action (keeps the design's card flow, just adds a second info line). */
const Wh = ({ children }: { children: React.ReactNode }) => (
  <p className="wh">{children}</p>
);

/** Replace the inline `style` hint paragraphs with a shared component so the
 * picker (below) can be extended per card instead of duplicated inline. */
export { Wh };


export default function ScenarioForm({ dataAsOf }: { dataAsOf: string | null }) {
  const router = useRouter();
  // Pre-filled as in the design's mock (17,000 / 17,200).
  const [one, setOne] = useState("17,000");
  const [two, setTwo] = useState("17,200");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const monthA = dataAsOf ? addMonths(dataAsOf, 1) : null;
  const monthB = dataAsOf ? addMonths(dataAsOf, 2) : null;
  const endMonth = monthB ? addMonths(monthB, 12) : null;

  // Reset the debounce on every keystroke so the submit waits for the
  // latest values before the background check re-runs.
  const onOne = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOne(e.target.value);
  };
  const onTwo = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTwo(e.target.value);
  };
  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!monthA || !monthB) return;
    let body;
    try {
      body = [
        { month: monthA, price: money(one) },
        { month: monthB, price: money(two) },
      ];
      if (body.some((s) => !(s.price > 0))) throw new Error("Enter both months' prices.");
    } catch (err) {
      setError((err as Error).message);
      return;
    }
  const { data, error: apiError } = await apiClient.POST("/api/v1/predict/", {
    body: { horizon: 12, scenario: body, persist: false },
  });
  if (apiError || !data) {
    // 422 scenario_gap → show the backend's message inline
    const msg = (apiError as { error?: { code?: string; message?: string } } | null)?.error;
    setError(msg?.message ?? "Prediction failed.");
    return;
  }
  const scenarioEnd = Number((data as { points?: { forecast?: number }[] }).points?.slice(-1)[0]?.forecast ?? Number.NaN);
  const baselineEnd = Number(
    (data as { baseline?: { points?: { forecast?: number }[] } }).baseline?.points?.slice(-1)[0]?.forecast ?? Number.NaN
  );
  const diff = scenarioEnd - baselineEnd;
  setResult(`${fmtMonth(endMonth)} ${fmtMoney(scenarioEnd)} · ${fmtSignMoney(diff)} vs baseline`);
  startTransition(() => router.refresh());
}

  return (
    <section className="card card--scenario" id="scenario" aria-labelledby="sh">
      <div className="card__h"><h2 id="sh">Scenario</h2><p>Override the next two months</p></div>
      <form className="scn" onSubmit={run}>
        {monthA && monthB ? (
          <>
            <label htmlFor="o">{fmtMonth(monthA)}</label>
            <input id="o" inputMode="numeric" value={one} onChange={onOne} />
            <label htmlFor="n">{fmtMonth(monthB)}</label>
            <input id="n" inputMode="numeric" value={two} onChange={onTwo} />
          </>
        ) : (
          <label>Waiting for the API to provide the scenario months…</label>
        )}
        <button className="btn btn--p" type="submit" disabled={pending}>
          {pending ? "Running…" : "Run"}
        </button>
        {result && <p className="res">{result}</p>}
      </form>
      {error && (
        <p className="muted" style={{ marginTop: 12, fontSize: 14 }} role="alert">
          {error}
        </p>
      )}
      <Wh>Scenario months must be the next months after {fmtMonth(dataAsOf ?? "")} with no gaps.</Wh>
    </section>
  );
}

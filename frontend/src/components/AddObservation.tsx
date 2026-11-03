"use client";

/**
 * Small form in the nav: append the next month's observed price.
 * On 201 the DB is re-forecast server-side → router.refresh() re-renders the
 * server components; the returned anomaly screens are shown inline.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/client";
import { fmtMonth, fmtMonthShort2 } from "@/lib/format";

export default function AddObservation({ nextMonth }: { nextMonth?: string | null }) {
  const router = useRouter();
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [flags, setFlags] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  if (!nextMonth) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setFlags(null);
    const value = Number(String(price).replace(/[, ]/g, ""));
    if (!Number.isFinite(value) || value <= 0) {
      setStatus("Enter a price for " + fmtMonth(nextMonth) + ".");
      return;
    }
    const { data, error } = await apiClient.POST("/api/v1/observations/", {
      body: { month: nextMonth as string, price: value },
    });
    if (error) {
      const msg = (error as { error?: { code?: string; message?: string } }).error;
      if (msg?.code === "duplicate") {
        setStatus(`Already have a price for ${fmtMonthShort2(nextMonth)}.`);
      } else if (msg?.code === "gap") {
        setStatus(msg.message ?? "Unexpected month.");
      } else {
        setStatus("Could not add the observation.");
      }
      return;
    }
    const obs = (data as { observation?: { flags?: string[] } })?.observation;
    setFlags(obs?.flags ?? []);
    setStatus(null);
    startTransition(() => router.refresh());
  }

  return (
    <form className="nav__obs" onSubmit={submit}>
      <input
        className="btn btn--obs"
        aria-label={`Price observed in ${fmtMonth(nextMonth)}`}
        inputMode="numeric"
        placeholder={fmtMonth(nextMonth)}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        style={{ width: 118 }}
      />
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add price"}
      </button>
      {status && <small className="nav__status">{status}</small>}
      {flags && !status && (
        <small className="nav__status" role="status">
          Added. Screens: {flags.length ? flags.join(", ") : "no anomalies"}
        </small>
      )}
    </form>
  );
}

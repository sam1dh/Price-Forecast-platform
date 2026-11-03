/**
 * Thin typed client over the backend's OpenAPI schema.
 *
 * The SDK lives at src/lib/api.d.ts, generated with:
 *   npx openapi-typescript $API_BASE/api/schema/ -o src/lib/api.d.ts  (npm run types:api)
 *
 * NOTE: this file is *not* named api.ts — TS module resolution would make
 * "./api" resolve to the .ts and shadow the generated ./api.d.ts, making the
 * types unimportable.
 *
 * Base URL: in the browser and in client components it comes from
 * NEXT_PUBLIC_API_BASE. In Server Components we prefer API_BASE_INTERNAL so
 * Docker compose can hit the backend service directly on the compose network.
 */
import createClient from "openapi-fetch";
import type { paths, components } from "./api";

export type HealthSummary = components["schemas"]["HealthSummary"];
export type ForecastRunResp = components["schemas"]["ForecastRunResponse"];
export type ForecastPoint = components["schemas"]["_ForecastPoint"];
export type HistoryPoint = components["schemas"]["_HistoryPoint"];
export type HistoryResp = components["schemas"]["HistoryResponse"];
export type ModelCompare = components["schemas"]["ModelCompareResponse"];
export type ComparisonRow = components["schemas"]["_ComparisonRow"];

function baseUrl(internal: boolean): string {
  const pub = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
  return internal ? process.env.API_BASE_INTERNAL || pub : pub;
}

/** The base URL to name in user-facing "backend not reachable" messages. */
export function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
}

export const apiClient = createClient<paths>({
  baseUrl: baseUrl(typeof window !== "undefined" ? false : true),
});

/** Server Components only: 5-minute revalidation via the fetch data cache. */
const options = typeof window === "undefined"
  ? { fetch: ((input: string | Request | URL, init?: RequestInit) =>
      fetch(input, { ...(init ?? {}), next: { revalidate: 300 } })) as typeof fetch }
  : {};

/** None-on-failure wrappers, so pages never crash if the backend is down. */
export function getServerTime():
  | { iso: string; tzo: number; ms: number }
  | null {
  if (typeof window !== "undefined") return null;
  try {
    const d = new Date();
    return { iso: d.toISOString(), tzo: -d.getTimezoneOffset(), ms: d.getMilliseconds() };
  } catch {
    return null;
  }
}
export async function getHealthSummary(): Promise<HealthSummary | null> {
  try {
    const r = await apiClient.GET("/api/v1/health/summary/", options);
    return r.data ?? null;
  } catch {
    return null;
  }
}

export async function getForecastLatest(): Promise<ForecastRunResp | null> {
  try {
    const r = await apiClient.GET("/api/v1/forecast/latest/", options);
    return r.data ?? null;
  } catch {
    return null;
  }
}

export async function getHistory(): Promise<HistoryResp | null> {
  try {
    const r = await apiClient.GET("/api/v1/history/", options);
    return r.data ?? null;
  } catch {
    return null;
  }
}

export async function getModelCompare(): Promise<ModelCompare | null> {
  try {
    const r = await apiClient.GET("/api/v1/models/compare/", options);
    return r.data ?? null;
  } catch {
    return null;
  }
}

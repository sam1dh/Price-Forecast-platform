/**
 * Rebuilds the design's chart SVG geometry in TypeScript.
 * Reproduces design/dashboard-band.html exactly for the current dataset:
 * 48 x-positions (36 observed + 12 forecast), y-domain chosen as 6 "2,000"
 * gridlines that fit the data with 2,000 steps, band polygons starting at the
 * last observed point, 20 faint simulated paths from a seeded PRNG.
 */
import { addMonths } from "./format";

export interface ObsPoint {
  month: string;
  price: number;
  is_interpolated: boolean;
}
export interface FcPoint {
  month: string;
  forecast: number;
  lower_80: number;
  upper_80: number;
  lower_95: number;
  upper_95: number;
}
export interface ChartData {
  obs: ObsPoint[];
  forecast: FcPoint[];
  drift: number;
  sigma: number;
}

export interface SvgSpec {
  gridlines: { y: number; label: string }[];
  yearLabels: { x: number; label: string }[];
  recon: { x: number; width: number; label?: string } | null;
  reconLine: string;
  obsLine: string;
  bands: { b95: string; b80: string };
  median: string;
  sims: string[];
  lastPoint: { x: number; y: number };
  today: { x: number; label: string };
  endLabels: { y: number; value: string; kind: "upper" | "median" | "lower" }[];
  forecastMonths: string[];
  lastObservedMonth: string;
}

// Layout constants lifted from the design file (viewBox 0 0 1120 400).
const L = 44, R = 1044, T = 20, B = 350;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianPair(rand: () => number): [number, number] {
  const u1 = Math.max(rand(), 1e-9), u2 = rand();
  const r = Math.sqrt(-2 * Math.log(u1));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
}

/** Smallest of 1/2/2.5/5 × 10^k that is >= minStep. */
function niceStep(minStep: number): number {
  const e = Math.floor(Math.log10(minStep));
  const base = Math.pow(10, e);
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * base >= minStep) return m * base;
  }
  return 10 * base;
}

export function buildChart(d: ChartData): SvgSpec {
  const n = d.obs.length + d.forecast.length;       // 48 points on the x axis
  const step = (R - L) / (n - 1);                   // ≈ 21.277 px per month
  const x = (i: number) => L + i * step;

  const obsCount = d.obs.length;
  const lastObs = d.obs[d.obs.length - 1] ?? { month: "", price: 0, is_interpolated: false };
  const endFc = d.forecast[d.forecast.length - 1];

  // y scale: fit observed + median + 95 % band, then snap to "nice" steps so
  // edge values may poke slightly past the outermost gridline (as in the design).
  const prices = d.obs.map((p) => p.price);
  const vals = [...prices, endFc.lower_95, endFc.upper_95];
  const minVal = Math.min(...vals), maxVal = Math.max(...vals);
  const yStep = niceStep((maxVal - minVal) / 5);
  const yMin = Math.floor(minVal / yStep) * yStep;
  const yMax = yMin + 5 * yStep;
  const y = (v: number) => Math.max(8, Math.min(352, B - ((v - yMin) / (yMax - yMin)) * (B - T)));

  const fx = (i: number) => x(obsCount + i);        // forecast point i (i = 0 is the shared origin)

  // gridlines with "10k" style labels
  const gridlines = Array.from({ length: 6 }, (_, k) => {
    const v = yMin + k * yStep;
    return { y: y(v), label: v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}` };
  });

  // year labels at January positions (design packs them at month=1);
  // covers the whole x axis: observed window first, then forecast months
  const allMonths = [...d.obs.map((p) => p.month), ...d.forecast.map((p) => p.month)];
  const yearLabels = allMonths
    .map((m, i) => { const d2 = new Date(m + "T00:00:00"); return { i, m: d2 }; })
    .filter(({ m }) => m.getUTCMonth() === 0)
    .map(({ i, m }) => ({ x: x(i), label: `${m.getUTCFullYear()}` }));

  // reconstructed shading + first solid index
  let lastInterp = -1;
  d.obs.forEach((p, i) => { if (p.is_interpolated) lastInterp = i; });
  const recon =
    lastInterp >= 0
      ? { x: x(0), width: (lastInterp + 0.5) * step, label: "Reconstructed" }
      : null;
  const firstSolid = lastInterp >= 0 ? lastInterp + 1 : 0;

  const pt = (xx: number, yy: number) => `${xx.toFixed(1)},${yy.toFixed(1)}`;

  const reconLine = d.obs.slice(0, firstSolid + 1).map((p, i) => pt(x(i), y(p.price))).join(" ");
  const obsLine = d.obs.slice(firstSolid).map((p, k) => pt(x(firstSolid + k), y(p.price))).join(" ");

  // bands + median start at the last observed point (shared origin)
  const origin = { x: x(obsCount - 1), y: y(lastObs.price) };
  const band = (lo: (p: FcPoint) => number, hi: (p: FcPoint) => number) => {
    const up = d.forecast.map((p, i) => pt(fx(i + 1), y(hi(p))));
    const dn = d.forecast.slice().reverse().map((p, i) => pt(fx(d.forecast.length - i), y(lo(p))));
    return [pt(origin.x, origin.y), ...up, ...dn, pt(origin.x, origin.y)].join(" ");
  };

  const median = [pt(origin.x, origin.y), ...d.forecast.map((p, i) => pt(fx(i + 1), y(p.forecast)))].join(" ");

  // 20 faint paths from a seeded PRNG (deterministic across renders)
  const rand = mulberry32(20250901);
  const sims: string[] = [];
  for (let s = 0; s < 20; s++) {
    let v = lastObs.price;
    const pts = [pt(origin.x, y(v))];
    for (let h = 0; h < 12; h++) {
      const [z1] = gaussianPair(rand);
      v = v + d.drift + d.sigma * z1;
      pts.push(pt(fx(h + 1), y(v)));
    }
    sims.push(pts.join(" "));
  }

  const endAt = (v: number) => y(v) + 4; // right-edge labels sit 4px below the anchor, as in the design

  return {
    gridlines,
    yearLabels,
    recon,
    reconLine,
    obsLine,
    bands: { b95: band((p) => p.lower_95, (p) => p.upper_95), b80: band((p) => p.lower_80, (p) => p.upper_80) },
    median,
    sims,
    lastPoint: origin,
    today: { x: x(obsCount - 1), label: lastObs.month },
    endLabels: [
      { y: endAt(endFc.upper_95), value: "upper", kind: "upper" },
      { y: endAt(endFc.forecast), value: "median", kind: "median" },
      { y: endAt(endFc.lower_95), value: "lower", kind: "lower" },
    ],
    forecastMonths: d.forecast.map((p) => p.month),
    lastObservedMonth: lastObs.month,
  };
}

/** The two months the scenario form offers: the next months after data_as_of. */
export function scenarioMonths(dataAsOf: string | null | undefined): [string, string] | null {
  if (!dataAsOf) return null;
  return [addMonths(dataAsOf, 1), addMonths(dataAsOf, 2)];
}

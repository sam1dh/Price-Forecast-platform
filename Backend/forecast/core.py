"""Pure modelling code, ported from the notebook. No Django imports here so it can be unit-tested alone."""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.tsa.holtwinters import ExponentialSmoothing

warnings.filterwarnings("ignore")


# ---------- cleaning (notebook §4.3 – 4.5) ----------
def detect_copied_blocks(prices: pd.Series, window: int = 6) -> pd.Series:
    """Mask the LATER occurrence of any 6-month run that exactly repeats an earlier run."""
    v = prices.to_numpy()
    seen: dict[tuple, list[int]] = {}
    pairs = set()
    for i in range(len(v) - window + 1):
        key = tuple(v[i:i + window])
        for j in seen.get(key, []):
            if i - j >= window:
                pairs.add((j, i))
        seen.setdefault(key, []).append(i)
    mask = np.zeros(len(v), dtype=bool)
    for _, i in pairs:
        mask[i:i + window] = True
    return pd.Series(mask, index=prices.index)


def log_interpolate(prices: pd.Series, mask: pd.Series) -> pd.Series:
    gap = prices.astype(float).mask(mask)
    return np.exp(np.log(gap).interpolate(method="time", limit_area="inside"))


def clean_series(raw: pd.Series) -> tuple[pd.Series, pd.Series]:
    raw = raw.astype(float).asfreq("MS")
    mask = detect_copied_blocks(raw)
    return log_interpolate(raw, mask), mask


# ---------- anomaly screens for one new observation (notebook §4.1, 4.2, 9.2) ----------
def screen_new_value(history: pd.Series, new_value: float, prev_forecast: dict | None) -> list[str]:
    flags = []
    last = float(history.iloc[-1])
    if last and abs(new_value / last - 1) > 0.20:
        flags.append("mom_jump_gt_20pct")
    if new_value == last:
        flags.append("repeat_of_previous")
    if prev_forecast:
        if not (prev_forecast["lower_95"] <= new_value <= prev_forecast["upper_95"]):
            flags.append("outside_95_interval")
        elif not (prev_forecast["lower_80"] <= new_value <= prev_forecast["upper_80"]):
            flags.append("outside_80_interval")
    return flags


# ---------- model (notebook §7.5c registry, §8.3 intervals) ----------
def fit_holt(history: pd.Series):
    return ExponentialSmoothing(
        history.astype(float).asfreq("MS"), trend="add", damped_trend=False,
        seasonal=None, initialization_method="estimated",
    ).fit(optimized=True)


def forecast_with_intervals(history: pd.Series, steps: int, levels=(0.80, 0.95)) -> pd.DataFrame:
    fitted = fit_holt(history)
    mean = np.asarray(fitted.forecast(steps), dtype=float)
    sims = np.asarray(fitted.simulate(steps, repetitions=2000, error="add", random_state=42))
    idx = pd.date_range(history.index[-1] + pd.offsets.MonthBegin(1), periods=steps, freq="MS")
    out = pd.DataFrame({"forecast": mean}, index=idx)
    for lv in levels:
        q = (1 - lv) / 2
        out[f"lower_{int(lv*100)}"] = np.quantile(sims, q, axis=1)
        out[f"upper_{int(lv*100)}"] = np.quantile(sims, 1 - q, axis=1)
    params = {k: float(v) for k, v in fitted.params.items() if k in ("smoothing_level", "smoothing_trend", "initial_level", "initial_trend")}
    return out, params


def naive_rmse_12(history: pd.Series, origins: list[str]) -> dict:
    """Quick horizon-matched back-test for the health report (notebook §7.8)."""
    rows = {}
    for o in origins:
        h = history.loc[:o]
        tgt = history.loc[pd.Timestamp(o) + pd.offsets.MonthBegin(1):].iloc[:12]
        if len(tgt) < 12:
            continue
        f, _ = forecast_with_intervals(h, 12)
        rows[o] = {
            "holt_rmse": float(np.sqrt(np.mean((tgt.values - f["forecast"].values) ** 2))),
            "naive_rmse": float(np.sqrt(np.mean((tgt.values - h.iloc[-1]) ** 2))),
        }
    return rows

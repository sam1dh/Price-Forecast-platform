"""Orchestration: DB <-> core model. Every forecast shown to a user is persisted for audit."""
from __future__ import annotations

import hashlib
from datetime import date

import pandas as pd
from django.conf import settings
from django.db import transaction

from . import core
from .models import ForecastPoint, ForecastRun, ModelVersion, PriceObservation


def history_series(clean: bool = True) -> pd.Series:
    qs = PriceObservation.objects.values_list("month", "price_clean" if clean else "price_raw")
    s = pd.Series({pd.Timestamp(m): p for m, p in qs}).sort_index()
    return s.asfreq("MS")


def interpolated_mask() -> pd.Series:
    qs = PriceObservation.objects.values_list("month", "is_interpolated")
    return pd.Series({pd.Timestamp(m): f for m, f in qs}).sort_index()


def active_model() -> ModelVersion:
    mv = ModelVersion.objects.filter(is_active=True).first()
    if mv is None:
        raise RuntimeError("No active model. Run `python manage.py seed` first.")
    return mv


@transaction.atomic
def seed_from_csv(path=None) -> dict:
    """Load the CSV, clean it exactly as the notebook does, fit v1, make the first forecast."""
    path = path or settings.SEED_CSV
    raw = pd.read_csv(path, parse_dates=["date"]).set_index("date")["avg_monthly_price"].astype(float)
    clean, mask = core.clean_series(raw)
    PriceObservation.objects.all().delete()
    PriceObservation.objects.bulk_create([
        PriceObservation(month=ts.date(), price_raw=float(raw[ts]), price_clean=float(clean[ts]),
                         is_interpolated=bool(mask[ts]), source="seed")
        for ts in clean.index
    ])
    mv = retrain(trigger="seed")
    run = run_forecast(trigger="seed")
    return {"observations": len(clean), "interpolated": int(mask.sum()), "model_version": mv.version, "run_id": run.id}


def _version_string(train_end: date, model_name: str) -> str:
    slug = model_name.lower().replace(" ", "-")
    n = ModelVersion.objects.filter(version__startswith=f"{slug}-{train_end:%Y.%m}").count() + 1
    return f"{slug}-{train_end:%Y.%m}.{n}"


@transaction.atomic
def retrain(trigger: str = "retrain", tolerance: float = 0.10) -> ModelVersion:
    """Champion-challenger: fit on full clean history; promote only if back-test RMSE is within tolerance."""
    hist = history_series()
    _, params = core.forecast_with_intervals(hist, settings.FORECAST_HORIZON)
    origins = [o for o in ["2022-09-01", "2023-03-01", "2023-09-01", "2024-09-01"] if pd.Timestamp(o) < hist.index[-1]]
    backtest = core.naive_rmse_12(hist, origins)
    mean_rmse = sum(r["holt_rmse"] for r in backtest.values()) / max(len(backtest), 1)
    challenger = ModelVersion(
        version=_version_string(hist.index[-1].date(), settings.FORECAST_MODEL),
        model_name=settings.FORECAST_MODEL, params=params,
        train_start=hist.index[0].date(), train_end=hist.index[-1].date(), n_obs=len(hist),
        metrics={"rolling_origin": backtest, "mean_12step_rmse": mean_rmse,
                 "data_hash": hashlib.sha256(hist.to_numpy().tobytes()).hexdigest()[:16]},
    )
    champion = ModelVersion.objects.filter(is_active=True).first()
    promote = champion is None or mean_rmse <= champion.metrics.get("mean_12step_rmse", float("inf")) * (1 + tolerance)
    challenger.metrics["promoted"] = promote
    challenger.metrics["reason"] = "first model" if champion is None else ("within tolerance of champion" if promote else "worse than champion by more than tolerance")
    challenger.save()
    if promote:
        ModelVersion.objects.exclude(pk=challenger.pk).update(is_active=False)
        challenger.is_active = True
        challenger.save(update_fields=["is_active"])
    return challenger


@transaction.atomic
def run_forecast(trigger: str, horizon: int | None = None, scenario: list[dict] | None = None, persist: bool = True):
    """Forecast from current history (+ optional scenario months). Returns a ForecastRun (unsaved if persist=False)."""
    horizon = horizon or settings.FORECAST_HORIZON
    hist = history_series()
    if scenario:
        expected = hist.index[-1] + pd.offsets.MonthBegin(1)
        for item in scenario:
            m = pd.Timestamp(item["month"])
            if m != expected:
                raise ValueError(f"Scenario months must be contiguous and start at {expected:%Y-%m-01}; got {m:%Y-%m-01}")
            hist.loc[m] = float(item["price"])
            expected = m + pd.offsets.MonthBegin(1)
        hist = hist.asfreq("MS")
    df, _ = core.forecast_with_intervals(hist, horizon)
    run = ForecastRun(model_version=active_model(), origin_month=hist.index[-1].date(), horizon=horizon,
                      trigger=trigger, scenario=scenario)
    points = [ForecastPoint(run=run, month=ts.date(), forecast=r.forecast, lower_80=r.lower_80, upper_80=r.upper_80,
                            lower_95=r.lower_95, upper_95=r.upper_95) for ts, r in df.iterrows()]
    if persist:
        run.save()
        for p in points:
            p.run = run
        ForecastPoint.objects.bulk_create(points)
    else:
        run._unsaved_points = points
    return run


def latest_run() -> ForecastRun | None:
    return ForecastRun.objects.filter(scenario__isnull=True).select_related("model_version").first()


@transaction.atomic
def add_observation(month: date, price: float) -> tuple[PriceObservation, ForecastRun, dict | None]:
    hist = history_series()
    expected = (hist.index[-1] + pd.offsets.MonthBegin(1)).date()
    if month != expected:
        raise ValueError(f"Next expected month is {expected:%Y-%m-01}")
    prev = None
    lr = latest_run()
    if lr:
        pt = lr.points.filter(month=month).first()
        if pt:
            prev = {"forecast": pt.forecast, "lower_80": pt.lower_80, "upper_80": pt.upper_80,
                    "lower_95": pt.lower_95, "upper_95": pt.upper_95,
                    "error": price - pt.forecast, "abs_pct_error": abs(price - pt.forecast) / price * 100}
    flags = core.screen_new_value(hist, price, prev)
    obs = PriceObservation.objects.create(month=month, price_raw=price, price_clean=price, source="api", flags=flags)
    run = run_forecast(trigger="observation")
    return obs, run, prev

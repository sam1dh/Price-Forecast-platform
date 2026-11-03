from datetime import date

from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, inline_serializer

from . import services
from .models import ForecastRun, ModelVersion, PriceObservation


def _meta(mv=None):
    mv = mv or ModelVersion.objects.filter(is_active=True).first()
    last = PriceObservation.objects.order_by("-month").first()
    return {"model_version": mv.version if mv else None, "generated_at": timezone.now().isoformat(),
            "data_as_of": last.month.isoformat() if last else None}


def _run_payload(run: ForecastRun, points=None):
    pts = points if points is not None else list(run.points.all())
    last = PriceObservation.objects.filter(month=run.origin_month).first()
    rows = [{"month": p.month.isoformat(), "forecast": round(p.forecast, 2), "lower_80": round(p.lower_80, 2),
             "upper_80": round(p.upper_80, 2), "lower_95": round(p.lower_95, 2), "upper_95": round(p.upper_95, 2)} for p in pts]
    ref = last.price_clean if last else None
    summary = {}
    if rows and ref:
        summary = {"avg_forecast": round(sum(r["forecast"] for r in rows) / len(rows), 2),
                   "end_forecast": rows[-1]["forecast"],
                   "pct_change_vs_last": round((rows[-1]["forecast"] / ref - 1) * 100, 2),
                   "monthly_drift": round((rows[-1]["forecast"] - rows[0]["forecast"]) / max(len(rows) - 1, 1), 2),
                   "interval_95_width_h1": round(rows[0]["upper_95"] - rows[0]["lower_95"], 2),
                   "interval_95_width_h12": round(rows[-1]["upper_95"] - rows[-1]["lower_95"], 2)}
    return {"run_id": run.id, "origin_month": run.origin_month.isoformat(), "last_observed_price": ref,
            "horizon": run.horizon, "trigger": run.trigger, "points": rows, "summary": summary, "meta": _meta(run.model_version)}


# --- OpenAPI response schemas (drf-spectacular cannot infer payload shape from @api_view) ---

class _Meta(serializers.Serializer):
    model_version = serializers.CharField(allow_null=True)
    generated_at = serializers.CharField()
    data_as_of = serializers.CharField(allow_null=True)


class _HistoryPoint(serializers.Serializer):
    month = serializers.DateField()
    price = serializers.FloatField()
    price_raw = serializers.FloatField()
    is_interpolated = serializers.BooleanField()
    flags = serializers.ListField(child=serializers.CharField())


class _ForecastPoint(serializers.Serializer):
    month = serializers.DateField()
    forecast = serializers.FloatField()
    lower_80 = serializers.FloatField()
    upper_80 = serializers.FloatField()
    lower_95 = serializers.FloatField()
    upper_95 = serializers.FloatField()


_RUN_SUMMARY = inline_serializer("RunSummary", {
    "avg_forecast": serializers.FloatField(allow_null=True),
    "end_forecast": serializers.FloatField(allow_null=True),
    "pct_change_vs_last": serializers.FloatField(allow_null=True),
    "monthly_drift": serializers.FloatField(allow_null=True),
    "interval_95_width_h1": serializers.FloatField(allow_null=True),
    "interval_95_width_h12": serializers.FloatField(allow_null=True),
})

_RUN_FIELDS = {
    "run_id": serializers.IntegerField(),
    "origin_month": serializers.DateField(),
    "last_observed_price": serializers.FloatField(allow_null=True),
    "horizon": serializers.IntegerField(),
    "trigger": serializers.CharField(),
    "points": _ForecastPoint(many=True),
    "summary": _RUN_SUMMARY,
    "meta": _Meta(),
}

_RUN_RESPONSE = inline_serializer("ForecastRunResponse", _RUN_FIELDS)


@extend_schema(
    operation_id="health",
    responses=inline_serializer("Health", {"status": serializers.CharField()}),
)
@api_view(["GET"])
def health(request):
    return Response({"status": "ok"})


@extend_schema(operation_id="health_summary", responses=inline_serializer("HealthSummary", {
    "data_as_of": serializers.DateField(),
    "last_observed_price": serializers.FloatField(allow_null=True),
    "model_version": serializers.CharField(allow_null=True),
    "n_obs": serializers.IntegerField(),
    "n_interpolated": serializers.IntegerField(),
    "horizon": serializers.IntegerField(allow_null=True),
    "end_month": serializers.DateField(allow_null=True),
    "end_forecast": serializers.FloatField(allow_null=True),
    "pct_change_vs_last": serializers.FloatField(allow_null=True),
    "band_95_h1": inline_serializer("Band", {
        "lower": serializers.FloatField(), "upper": serializers.FloatField(),
    }, allow_null=True),
    "band_95_h12": inline_serializer("Band12", {
        "lower": serializers.FloatField(), "upper": serializers.FloatField(),
    }, allow_null=True),
    "monthly_drift": serializers.FloatField(allow_null=True),
    "mean_12step_rmse": serializers.FloatField(allow_null=True),
    "backtest_error_pct": serializers.FloatField(allow_null=True),
    "generated_at": serializers.DateTimeField(),
}))
@api_view(["GET"])
def health_summary(request):
    """Everything the dashboard hero strip needs, in one call."""
    mv = ModelVersion.objects.filter(is_active=True).first()
    run = services.latest_run()
    last = PriceObservation.objects.order_by("-month").first()
    pts = list(run.points.all()) if run else []
    h1 = pts[0] if pts else None
    h12 = pts[-1] if pts else None
    mean_rmse = (mv.metrics or {}).get("mean_12step_rmse")
    backtest_pct = None
    if mean_rmse and last:
        # RMSE relative to the typical price level of the last 12 observed months.
        recent = list(PriceObservation.objects.order_by("-month").values_list("price_clean", flat=True)[:12])
        if recent:
            backtest_pct = round(mean_rmse / (sum(recent) / len(recent)) * 100, 1)
    drift = None
    if len(pts) >= 2:
        drift = round((h12.forecast - h1.forecast) / max(len(pts) - 1, 1), 2)
    return Response({
        "data_as_of": last.month.isoformat() if last else None,
        "last_observed_price": round(last.price_clean, 2) if last else None,
        "model_version": mv.version if mv else None,
        "n_obs": PriceObservation.objects.count(),
        "n_interpolated": PriceObservation.objects.filter(is_interpolated=True).count(),
        "horizon": run.horizon if run else None,
        "end_month": h12.month.isoformat() if h12 else None,
        "end_forecast": round(h12.forecast, 2) if h12 else None,
        "pct_change_vs_last": round((h12.forecast / last.price_clean - 1) * 100, 2) if h12 and last else None,
        "band_95_h1": ({"lower": round(h1.lower_95, 2), "upper": round(h1.upper_95, 2)} if h1 else None),
        "band_95_h12": ({"lower": round(h12.lower_95, 2), "upper": round(h12.upper_95, 2)} if h12 else None),
        "monthly_drift": drift,
        "mean_12step_rmse": round(mean_rmse, 2) if mean_rmse else None,
        "backtest_error_pct": backtest_pct,
        "generated_at": timezone.now().isoformat(),
    })


# Fixed comparison rows from the research notebook (rolling-origin back-test) —
# modelling artefacts, not runtime-computed values. Only the active model's row
# is read from its stored metrics so a retrain keeps the race honest.
MODEL_COMPARISON_ROWS = [
    ("Holt linear trend", "Holt linear trend", True),
    ("SARIMA", "SARIMA", False),
    ("Holt damped", "Holt damped", False),
    ("Holt-Winters additive", "Holt-Winters", False),
    ("Naive", "Naive", False),
    ("Seasonal naive", "Seasonal naive", False),
]
MODEL_COMPARISON_RMSES = {
    "Holt linear trend": 1175, "SARIMA": 1193, "Holt damped": 1198,
    "Holt-Winters additive": 1202, "Naive": 1221, "Seasonal naive": 1819,
}


class _ComparisonRow(serializers.Serializer):
    name = serializers.CharField()
    display_name = serializers.CharField()
    rmse = serializers.FloatField()
    selected = serializers.BooleanField()


@extend_schema(operation_id="model_compare", responses=inline_serializer("ModelCompareResponse", {
    "metric": serializers.CharField(),
    "active": inline_serializer("ActiveModel", {
        "version": serializers.CharField(allow_null=True),
        "mean_12step_rmse": serializers.FloatField(allow_null=True),
        "rolling_origin": serializers.JSONField(allow_null=True),
    }),
    "rows": _ComparisonRow(many=True),
    "lead_vs_next_pct": serializers.FloatField(allow_null=True),
}))
@api_view(["GET"])
def model_compare(request):
    mv = ModelVersion.objects.filter(is_active=True).first()
    stored = (mv.metrics or {}).get("mean_12step_rmse") if mv else None
    rows = []
    for api_name, display_name, selected in MODEL_COMPARISON_ROWS:
        rows.append({
            "name": api_name,
            "display_name": display_name,
            "rmse": round(stored) if selected and stored is not None else MODEL_COMPARISON_RMSES[api_name],
            "selected": selected,
        })
    lead = None
    stored_rows = [r["rmse"] for r in rows if not r["selected"]]
    if stored is not None and stored_rows:
        nxt = min(stored_rows)
        lead = round((nxt - rows[0]["rmse"]) / nxt * 100, 1)
    rolling = (mv.metrics or {}).get("rolling_origin", {}) if mv else {}
    return Response({
        "metric": "mean 12-step RMSE over 4 origins",
        "active": {
            "version": mv.version if mv else None,
            "mean_12step_rmse": round(stored, 2) if stored else None,
            "rolling_origin": {o: {"holt_rmse": round(d["holt_rmse"], 2), "naive_rmse": round(d["naive_rmse"], 2)}
                                for o, d in rolling.items()},
        },
        "rows": rows,
        "lead_vs_next_pct": lead,
    })


@extend_schema(
    operation_id="ready",
    responses=inline_serializer("Ready", {"status": serializers.CharField()}),
)
@api_view(["GET"])
def ready(request):
    mv = ModelVersion.objects.filter(is_active=True).exists()
    return Response({"status": "ready" if mv else "no active model"}, status=200 if mv else 503)


@extend_schema(
    operation_id="history",
    responses=inline_serializer("HistoryResponse", {
        "points": _HistoryPoint(many=True),
        "summary": inline_serializer("HistorySummary", {
            "n": serializers.IntegerField(),
            "start": serializers.DateField(),
            "end": serializers.DateField(),
            "n_interpolated": serializers.IntegerField(),
            "min": serializers.FloatField(),
            "max": serializers.FloatField(),
            "last_price": serializers.FloatField(),
        }),
        "meta": _Meta(),
    }),
)
@api_view(["GET"])
def history(request):
    qs = PriceObservation.objects.all()
    pts = [{"month": o.month.isoformat(), "price": round(o.price_clean, 2), "price_raw": o.price_raw,
            "is_interpolated": o.is_interpolated, "flags": o.flags} for o in qs]
    s = [p["price"] for p in pts]
    return Response({"points": pts, "summary": {"n": len(pts), "start": pts[0]["month"], "end": pts[-1]["month"],
                     "n_interpolated": sum(p["is_interpolated"] for p in pts), "min": min(s), "max": max(s),
                     "last_price": s[-1]}, "meta": _meta()})


@extend_schema(operation_id="forecast_latest", responses=_RUN_RESPONSE)
@api_view(["GET"])
def forecast_latest(request):
    run = services.latest_run()
    if not run:
        return Response({"error": {"code": "no_forecast", "message": "Seed the database first."}}, status=404)
    return Response(_run_payload(run))


@extend_schema(operation_id="forecast_runs", responses=[
    inline_serializer("ForecastRunItem", {
        "run_id": serializers.IntegerField(),
        "origin_month": serializers.DateField(),
        "horizon": serializers.IntegerField(),
        "trigger": serializers.CharField(),
        "has_scenario": serializers.BooleanField(),
        "model_version": serializers.CharField(),
        "created_at": serializers.DateTimeField(),
    })
])
@api_view(["GET"])
def forecast_runs(request):
    runs = ForecastRun.objects.select_related("model_version")[:20]
    return Response([{"run_id": r.id, "origin_month": r.origin_month.isoformat(), "horizon": r.horizon,
                      "trigger": r.trigger, "has_scenario": r.scenario is not None,
                      "model_version": r.model_version.version, "created_at": r.created_at.isoformat()} for r in runs])


class ScenarioItem(serializers.Serializer):
    month = serializers.DateField()
    price = serializers.FloatField(min_value=0.01)


class PredictRequest(serializers.Serializer):
    horizon = serializers.IntegerField(min_value=1, max_value=24, default=12)
    scenario = ScenarioItem(many=True, required=False)
    persist = serializers.BooleanField(default=False)


class _PredictResponse(serializers.Serializer):
    run_id = serializers.IntegerField()
    origin_month = serializers.DateField()
    last_observed_price = serializers.FloatField(allow_null=True)
    horizon = serializers.IntegerField()
    trigger = serializers.CharField()
    points = _ForecastPoint(many=True)
    summary = _RUN_SUMMARY
    meta = _Meta()
    scenario_applied = ScenarioItem(many=True, allow_null=True)
    baseline = inline_serializer("Baseline", {"points": _ForecastPoint(many=True)})


@extend_schema(
    request=PredictRequest,
    responses=_PredictResponse,
)
@api_view(["POST"])
def predict(request):
    ser = PredictRequest(data=request.data)
    ser.is_valid(raise_exception=True)
    d = ser.validated_data
    scenario = [{"month": s["month"].isoformat(), "price": s["price"]} for s in d.get("scenario", [])] or None
    try:
        run = services.run_forecast(trigger="predict", horizon=d["horizon"], scenario=scenario, persist=d["persist"])
        base = services.run_forecast(trigger="predict", horizon=d["horizon"], scenario=None, persist=False) if scenario else None
    except ValueError as e:
        return Response({"error": {"code": "scenario_gap", "message": str(e)}}, status=422)
    payload = _run_payload(run, getattr(run, "_unsaved_points", None))
    payload["scenario_applied"] = scenario
    if base is not None:
        payload["baseline"] = {"points": _run_payload(base, base._unsaved_points)["points"]}
    return Response(payload)


class ObservationRequest(serializers.Serializer):
    month = serializers.DateField()
    price = serializers.FloatField(min_value=0.01)


@extend_schema(
    operation_id="observations",
    request=ObservationRequest,
    responses={
        200: _HistoryPoint(many=True),
        201: inline_serializer("ObservationCreated", {
            "observation": _HistoryPoint(),
            "forecast_run_id": serializers.IntegerField(),
            # previous forecast for this month, if one existed
            "previous_forecast_for_month": inline_serializer("PreviousForecast", {
                "forecast": serializers.FloatField(),
                "lower_80": serializers.FloatField(),
                "upper_80": serializers.FloatField(),
                "lower_95": serializers.FloatField(),
                "upper_95": serializers.FloatField(),
                "error": serializers.FloatField(),
                "abs_pct_error": serializers.FloatField(),
            }, allow_null=True),
        }),
    },
)
@api_view(["GET", "POST"])
def observations(request):
    if request.method == "GET":
        flagged = PriceObservation.objects.exclude(flags=[])
        return Response([{"month": o.month.isoformat(), "price": o.price_clean, "flags": o.flags} for o in flagged])
    ser = ObservationRequest(data=request.data)
    ser.is_valid(raise_exception=True)
    m: date = ser.validated_data["month"].replace(day=1)
    if PriceObservation.objects.filter(month=m).exists():
        return Response({"error": {"code": "duplicate", "message": f"{m:%Y-%m-01} already exists"}}, status=409)
    try:
        obs, run, prev = services.add_observation(m, ser.validated_data["price"])
    except ValueError as e:
        return Response({"error": {"code": "gap", "message": str(e)}}, status=422)
    return Response({"observation": {"month": obs.month.isoformat(), "price": obs.price_clean, "flags": obs.flags},
                     "forecast_run_id": run.id, "previous_forecast_for_month": prev}, status=201)


@extend_schema(operation_id="model_versions", responses=[
    inline_serializer("ModelVersionItem", {
        "version": serializers.CharField(),
        "model": serializers.CharField(),
        "is_active": serializers.BooleanField(),
        "n_obs": serializers.IntegerField(),
        "train_end": serializers.DateField(),
        "mean_12step_rmse": serializers.FloatField(allow_null=True),
        "promoted": serializers.BooleanField(allow_null=True),
        "reason": serializers.CharField(allow_null=True),
        "created_at": serializers.DateTimeField(),
    })
])
@api_view(["GET"])
def model_versions(request):
    return Response([{"version": m.version, "model": m.model_name, "is_active": m.is_active, "n_obs": m.n_obs,
                      "train_end": m.train_end.isoformat(), "mean_12step_rmse": m.metrics.get("mean_12step_rmse"),
                      "promoted": m.metrics.get("promoted"), "reason": m.metrics.get("reason"),
                      "created_at": m.created_at.isoformat()} for m in ModelVersion.objects.all()])


@extend_schema(
    request=None,
    responses=inline_serializer("RetrainResponse", {
        "challenger_version": serializers.CharField(),
        "promoted": serializers.BooleanField(),
        "reason": serializers.CharField(),
        "mean_12step_rmse": serializers.FloatField(),
        "params": serializers.JSONField(),
    }),
)
@api_view(["POST"])
def retrain(request):
    mv = services.retrain(trigger="manual")
    return Response({"challenger_version": mv.version, "promoted": mv.metrics["promoted"], "reason": mv.metrics["reason"],
                     "mean_12step_rmse": mv.metrics["mean_12step_rmse"], "params": mv.params})

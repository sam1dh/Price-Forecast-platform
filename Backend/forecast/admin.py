from django.contrib import admin
from .models import ForecastPoint, ForecastRun, ModelVersion, PriceObservation

@admin.register(PriceObservation)
class ObsAdmin(admin.ModelAdmin):
    list_display = ("month", "price_raw", "price_clean", "is_interpolated", "source", "flags")
    list_filter = ("is_interpolated", "source")

@admin.register(ModelVersion)
class MVAdmin(admin.ModelAdmin):
    list_display = ("version", "model_name", "is_active", "n_obs", "train_end", "created_at")

class PointInline(admin.TabularInline):
    model = ForecastPoint
    extra = 0

@admin.register(ForecastRun)
class RunAdmin(admin.ModelAdmin):
    list_display = ("id", "origin_month", "horizon", "trigger", "model_version", "created_at")
    inlines = [PointInline]

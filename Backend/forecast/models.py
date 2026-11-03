from django.db import models


class PriceObservation(models.Model):
    month = models.DateField(unique=True, db_index=True)
    price_raw = models.FloatField()
    price_clean = models.FloatField()
    is_interpolated = models.BooleanField(default=False)
    source = models.CharField(max_length=16, default="seed")   # seed | api
    flags = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["month"]

    def __str__(self):
        return f"{self.month:%b %Y}: {self.price_clean:,.0f}"


class ModelVersion(models.Model):
    version = models.CharField(max_length=64, unique=True)
    model_name = models.CharField(max_length=64)
    params = models.JSONField(default=dict)
    train_start = models.DateField()
    train_end = models.DateField()
    n_obs = models.IntegerField()
    metrics = models.JSONField(default=dict)
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.version + (" (active)" if self.is_active else "")


class ForecastRun(models.Model):
    model_version = models.ForeignKey(ModelVersion, on_delete=models.PROTECT, related_name="runs")
    origin_month = models.DateField()
    horizon = models.IntegerField()
    trigger = models.CharField(max_length=16)                 # seed | observation | predict | retrain
    scenario = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class ForecastPoint(models.Model):
    run = models.ForeignKey(ForecastRun, on_delete=models.CASCADE, related_name="points")
    month = models.DateField()
    forecast = models.FloatField()
    lower_80 = models.FloatField()
    upper_80 = models.FloatField()
    lower_95 = models.FloatField()
    upper_95 = models.FloatField()

    class Meta:
        ordering = ["month"]

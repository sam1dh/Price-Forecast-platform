import pandas as pd
from django.test import TestCase
from rest_framework.test import APIClient
from forecast import core, services

class CoreTests(TestCase):
    def test_copied_block_and_interpolation(self):
        raw = pd.read_csv("data/price_data.csv", parse_dates=["date"]).set_index("date")["avg_monthly_price"]
        clean, mask = core.clean_series(raw)
        self.assertEqual(int(mask.sum()), 30)
        self.assertAlmostEqual(clean["2021-06-01"], 11005.68, places=1)
        self.assertAlmostEqual(clean["2023-11-01"], 15960.18, places=1)

class ApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        services.seed_from_csv()
    def setUp(self):
        self.c = APIClient()
    def test_latest_matches_golden(self):
        r = self.c.get("/api/v1/forecast/latest/").json()
        self.assertEqual(len(r["points"]), 12)
        self.assertAlmostEqual(r["points"][0]["forecast"], 15790.19, delta=1.0)
        self.assertAlmostEqual(r["points"][-1]["forecast"], 16232.32, delta=1.0)
    def test_scenario_shifts_forecast(self):
        r = self.c.post("/api/v1/predict/", {"horizon": 12, "scenario": [{"month": "2025-10-01", "price": 17000}]}, format="json").json()
        self.assertEqual(r["points"][0]["month"], "2025-11-01")
        self.assertGreater(r["points"][-1]["forecast"], r["baseline"]["points"][-1]["forecast"])
    def test_scenario_gap_rejected(self):
        r = self.c.post("/api/v1/predict/", {"scenario": [{"month": "2025-12-01", "price": 17000}]}, format="json")
        self.assertEqual(r.status_code, 422)
    def test_observation_flags_and_reforecast(self):
        r = self.c.post("/api/v1/observations/", {"month": "2025-10-01", "price": 19500}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertIn("mom_jump_gt_20pct", r.json()["observation"]["flags"])
        self.assertIn("outside_95_interval", r.json()["observation"]["flags"])
        self.assertEqual(self.c.get("/api/v1/forecast/latest/").json()["origin_month"], "2025-10-01")

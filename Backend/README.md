# Price forecast service — Django + DRF

Production-shaped Django service that serves the Holt-linear monthly price forecast from the case study.
Cleaning (copied-block detection, log interpolation), model fitting and simulation-based intervals are
ported from `Monthly_Price_Forecasting_corrected.ipynb` and reproduce its numbers (tests assert this).

## Run locally
```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py seed          # loads data/price_data.csv, cleans, fits v1, stores first forecast
python manage.py test          # 5 tests incl. golden forecast check
python manage.py runserver     # http://127.0.0.1:8000  (dashboard)   /api/v1/...  (API)   /admin/
```

## Endpoints (`/api/v1/`)
| Method | Path | What it does |
|---|---|---|
| GET | `health/`, `ready/` | liveness / readiness (active model loaded) |
| GET | `history/` | 249 months, `is_interpolated` flag on the 30 reconstructed months |
| GET | `forecast/latest/` | most recent 12-month forecast with 80/95% intervals |
| GET | `forecast/runs/` | audit log of every forecast run |
| POST | `predict/` | real-time forecast; optional `scenario` months; returns baseline too |
| GET/POST | `observations/` | flagged months / append next month's price → anomaly screens → re-forecast |
| GET | `models/versions/` | model registry with back-test metrics and promotion reason |
| POST | `models/retrain/` | champion-challenger retrain (promote if RMSE within 10%) |

## Production checklist (what changes from this demo)
- `DJANGO_DEBUG=0`, real `DJANGO_SECRET_KEY`, `ALLOWED_HOSTS` set to your domain, CORS restricted to the Next.js origin.
- PostgreSQL via `DATABASE_URL` (dj-database-url), `gunicorn config.wsgi --workers 3` behind Nginx, static files via WhiteNoise or a CDN.
- Monthly `manage.py retrain` from cron / Celery beat; the command already implements champion-challenger.
- Docker: `python:3.11-slim`, `pip install -r requirements.txt`, `CMD gunicorn config.wsgi -b 0.0.0.0:8000`.

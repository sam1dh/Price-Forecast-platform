# Build the end-to-end price-forecast web app

Read this whole file, then `backend/README.md`, then `design/dashboard-band.html`, before writing code.

## What exists

- `backend/` — a working Django 5 + DRF service. `python manage.py migrate && python manage.py seed && python manage.py test` must pass before and after your changes (5 tests, including a golden-forecast check). It serves JSON at `/api/v1/…` (list in README) and a static copy of the design at `/`.
- `design/dashboard-band.html` — the approved visual design, self-contained HTML/CSS/SVG with hard-coded numbers. It is the pixel reference. Do not restyle it; reproduce it.
- `notebooks/` — the modelling source of truth. Do not change it.

## Goal

A `frontend/` Next.js app that renders the design from live backend data, plus the wiring to run both together. When done, `docker compose up` at the repo root serves the dashboard at http://localhost:3000 and the API at http://localhost:8000, and every number on the page comes from the API.

## Task 1 — Backend: API contract

1. Add `drf-spectacular`; expose `/api/schema/` (OpenAPI 3) and `/api/docs/` (Swagger UI).
2. Add `GET /api/v1/models/compare/` returning the stored rolling-origin metrics for the active model **and** these fixed comparison rows (they come from the research notebook and do not change at runtime):
   Holt linear trend 1175 (selected), SARIMA 1193, Holt damped 1198, Holt-Winters additive 1202, Naive 1221, Seasonal naive 1819 — all "mean 12-step RMSE over 4 origins".
3. Add `GET /api/v1/health/summary/` returning: last observed month and price, active model version, end-of-horizon forecast, pct change vs last, 95% band at horizon 12, n_interpolated. This is the hero strip in one call.
4. Replace `CORS_ALLOW_ALL_ORIGINS = True` with `CORS_ALLOWED_ORIGINS` read from env `FRONTEND_ORIGIN` (default `http://localhost:3000`).
5. Keep `/` serving `design/dashboard-band.html` (copy it to `backend/static/dashboard.html`) so the backend alone still demos.
6. Add a backend `Dockerfile` CMD using gunicorn (already present) and a `.env.example`.

Run `python manage.py test` — all green.

## Task 2 — Frontend: Next.js 16 app in `frontend/`

Create with `npx create-next-app@latest frontend --typescript --app --src-dir --eslint --no-tailwind` (plain CSS; the design is plain CSS). Pin `next` to the exact version installed.

Generate types from the backend: `npx openapi-typescript http://localhost:8000/api/schema/ -o src/lib/api.d.ts`, and a thin typed client in `src/lib/api.ts` using `openapi-fetch`. Base URL from `NEXT_PUBLIC_API_BASE` (server-side fetches may use `API_BASE_INTERNAL` for the Docker network).

Port `design/dashboard-band.html` into components, keeping its CSS variables and class names in `src/app/globals.css`:

| Component | Data source | Notes |
|---|---|---|
| `Nav` | — | static |
| `HeroStrip` | `GET /health/summary/` | the 16,232 / +3.1% / 95% range / three stats |
| `ForecastChart` | `GET /history/` (last 36 months) + `GET /forecast/latest/` | **Server Component**. Rebuild the SVG from data: compute x/y scales in TypeScript, draw observed line, dashed overlay + shaded column for `is_interpolated` months, 80/95 band polygons, median line, "today" rule, right-edge labels. Generate the 20 faint simulated paths with a seeded PRNG (drift = summary.monthly_drift, σ = (upper_95 − lower_95 at h1) / (2·1.96)). |
| `ForecastTable` | `GET /forecast/latest/` | 12 rows |
| `ModelRace` | `GET /models/compare/` | bars scaled to the max RMSE |
| `DataQuality` | `GET /observations/` (flagged) | map flag codes to the plain-English sentences used in the design |
| `ScenarioForm` | `POST /predict/` | **Client Component**. Two inputs (next two months after `data_as_of`), Run button, shows scenario end value, baseline end value, difference. Handle 422 `scenario_gap` by showing its message inline. |
| `AddObservation` | `POST /observations/` | small form in the nav; on 201 call `router.refresh()`; show returned flags |

Rules:
- Server Components fetch with `fetch(url, { next: { revalidate: 300 } })`; after a POST that changes data, `router.refresh()`.
- All numbers formatted with `Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })`; months with `Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' })`.
- Keep `font-variant-numeric: tabular-nums`. Respect `prefers-reduced-motion` for the median-line draw animation.
- Loading and error states: a skeleton for the chart; an inline message "Backend not reachable at {API_BASE}" if fetch fails — never a blank page.
- Responsive breakpoints exactly as in the design's media queries.
- No component libraries, no chart libraries; the SVG is hand-built as in the design.

## Task 3 — Run together

- Root `docker-compose.yml`: `backend` (build `./backend`, port 8000, volume for `data/`, env from `backend/.env`), `frontend` (build `./frontend`, port 3000, `NEXT_PUBLIC_API_BASE=http://localhost:8000`, `API_BASE_INTERNAL=http://backend:8000`), `depends_on` with the backend healthcheck on `/api/v1/ready/`.
- `frontend/Dockerfile`: multi-stage, `output: 'standalone'` in `next.config.ts`.
- Root `README.md`: one screenshot, "Run it" (`docker compose up`), architecture diagram as a code block, link to the notebook and report, the model-selection paragraph (Holt linear, mean 12-step RMSE 1,175, 1.5% ahead of SARIMA), known limitations (30 interpolated months, single series).
- Root `.gitignore` covering node_modules, .next, __pycache__, data/app.db, data/artifacts, .env.

## Task 4 — Verify (do this, do not just claim it)

1. `cd backend && python manage.py test` → OK.
2. `docker compose up --build` → both containers healthy.
3. Open http://localhost:3000 and check: hero shows 16,232 and +3.1%; chart has 36 observed points, 14 shaded, 12 forecast; table last row 16,232 / 12,373–20,094; scenario 17,000 + 17,200 returns the API's number (expect ≈ 17,748, not the 17,418 placeholder in the design); entering a scenario starting at Dec 2025 shows the gap message.
4. Take a 1440-px screenshot of the running page and save to `docs/screenshots/dashboard.png`; add it to the README.
5. `npm run build` passes with no type errors; `npm run lint` clean.

Commit in small steps with messages that say why. Do not modify `notebooks/` or `design/`.

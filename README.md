# headless-playwright

Small REST service: Playwright Chromium in Docker, fetch HTML for research / scraping.

Same ops model as `headless-obscura` and `headless-camoufox` — the Nuxt blog talks HTTP only.

## Endpoints

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/health` | — | `{ ok, browser }` |
| `POST` | `/fetch` | `{ url, timeoutMs? }` | `{ ok, title, html, url, latencyMs }` |
| `POST` | `/pdf` | `{ url, timeoutMs?, cookie?, waitForSelector?, pdf? }` | raw `application/pdf` |
| `GET` | `/` | — | service blurb |

Shared PDF contract with `headless-oxider`: wait for `[data-cv-print-ready="true"]` by default; CV defaults `pdf: { format: "A4", scale: 0.79, printBackground: true, margin: { top/right/bottom/left: "0" } }`.

## Run

```bash
cp .env.example .env
./dc.sh build          # local image → harianto/headless-playwright:latest
docker compose up -d
curl -s http://127.0.0.1:9380/health
curl -s -X POST http://127.0.0.1:9380/fetch \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'
```

Multi-arch Hub push: `./dc.sh push` (amd64 + arm64).

Default host port: **9380** (Obscura 9222, Camoufox 9377).

## Blog / CV plugin

Point the Playwright fetcher base URL at this service (Tailscale MagicsDNS or `host.docker.internal`) under `/system/browsers`.

Local apps that are not reachable from Chromium may pass a **headless-tunnel** URL (`PUBLIC_BASE_URL/t/<id>/…`) as the `url` in `POST /pdf` — no changes required in this service.

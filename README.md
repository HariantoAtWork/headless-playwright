# headless-playwright

Small REST service: Playwright Chromium in Docker, fetch HTML for research / scraping.

Same ops model as `headless-obscura` and `headless-camoufox` — the Nuxt blog talks HTTP only.

## Endpoints

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/health` | — | `{ ok, browser }` |
| `POST` | `/fetch` | `{ url, timeoutMs? }` | `{ ok, title, html, url, latencyMs }` |
| `GET` | `/` | — | service blurb |

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

## Blog plugin

Point `PLAYWRIGHT_BASE_URL=http://127.0.0.1:9380` (or your tunnel / `host.docker.internal`) and enable the Playwright fetcher under `/system/browsers`.

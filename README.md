# headless-playwright

Small REST service: Playwright Chromium in Docker for fetch, PDF, and multi-step interaction.

Docker Hub: [`harianto/headless-playwright`](https://hub.docker.com/r/harianto/headless-playwright) · host port **9380**.

Same HTTP style as `headless-oxider` — callers talk REST only. Page loads stay inside Chromium.

## Use

### 1. Start (Hub image)

```bash
docker pull harianto/headless-playwright:1.0.0
cp .env.example .env
# docker-compose.yml already points at the Hub image
docker compose up -d
curl -s http://127.0.0.1:9380/health
```

### 2. Or build locally

```bash
cp .env.example .env
./dc.sh build          # → harianto/headless-playwright:latest
docker compose up -d
```

### 3. Call it

**Fetch HTML**

```bash
curl -s -X POST http://127.0.0.1:9380/fetch \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}' | jq '{title, url, latencyMs}'
```

**PDF** (raw bytes; default wait selector `[data-cv-print-ready="true"]`)

```bash
curl -s -X POST http://127.0.0.1:9380/pdf \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","waitForSelector":"h1"}' \
  -o page.pdf
```

**Interact** (one browser context; cookies persist across steps)

```bash
curl -s -X POST http://127.0.0.1:9380/interact \
  -H 'Content-Type: application/json' \
  -d '{
    "actions": [
      { "type": "goto", "url": "https://example.com" },
      { "type": "waitForSelector", "selector": "h1" },
      { "type": "screenshot", "label": "home", "fullPage": true }
    ]
  }' | jq '{title, url, screenshots: (.screenshots|length)}'
```

Action `type` values: `goto`, `fill`, `click`, `clickText`, `select`, `press`, `wait`, `waitForSelector`, `waitForURL`, `screenshot`.

Showcase script (writes PNGs under `screenshots/`): `bun run showcase` / `node scripts/showcase.mjs`.

## Endpoints

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/health` | — | `{ ok, browser }` |
| `POST` | `/fetch` | `{ url, timeoutMs? }` | `{ ok, title, html, url, latencyMs }` |
| `POST` | `/pdf` | `{ url, timeoutMs?, cookie?, waitForSelector?, pdf? }` | raw `application/pdf` |
| `POST` | `/interact` | `{ actions: [...], timeoutMs? }` | `{ ok, title, html, url, screenshots, screenshot }` |
| `GET` | `/` | — | service blurb |

Shared PDF contract with `headless-oxider`: wait for `[data-cv-print-ready="true"]` by default; CV defaults `pdf: { format: "A4", scale: 0.79, printBackground: true, margin: { top/right/bottom/left: "0" } }`.

## Blog / CV plugin

Point the Playwright fetcher base URL at this service (Tailscale MagicsDNS or `host.docker.internal`) under `/system/browsers`.

Local apps that Chromium cannot reach may pass a **headless-tunnel** URL (`PUBLIC_BASE_URL/t/<id>/…`) as the `url` in `POST /pdf` — no changes required in this service.

## Publish

Multi-arch Hub push (local): `./dc.sh push`.

**GitHub → Docker Hub (SemVer):** `git tag v1.0.1 && git push origin v1.0.1`. Guide: [docs/semver-releases.md](docs/semver-releases.md).

Related ports: Obscura **9222**, Camoufox **9377**, Oxider **9381**, Tunnel **9382**.

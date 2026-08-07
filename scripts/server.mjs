#!/usr/bin/env node
/**
 * Headless Playwright fetch service — PhantomJS-as-a-service style.
 *
 * GET  /health  → { ok, browser }
 * POST /fetch   → { url, timeoutMs? } → { title, html, url }
 * GET  /        → short service blurb
 */

import http from 'node:http'
import { chromium } from 'playwright'

const PORT = Number(process.env.PLAYWRIGHT_PORT || process.env.PORT || 9380)
const HOST = process.env.PLAYWRIGHT_HOST || '0.0.0.0'
const DEFAULT_TIMEOUT_MS = 45_000
const MAX_TIMEOUT_MS = 120_000

/** @type {import('playwright').Browser | null} */
let browser = null
let launching = null

async function getBrowser() {
  if (browser?.isConnected()) return browser
  if (launching) return launching
  launching = chromium
    .launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    })
    .then((b) => {
      browser = b
      browser.on('disconnected', () => {
        browser = null
      })
      launching = null
      return b
    })
    .catch((error) => {
      launching = null
      throw error
    })
  return launching
}

async function fetchPage(url, timeoutMs) {
  const b = await getBrowser()
  const context = await b.newContext({
    userAgent:
      'Mozilla/5.0 (compatible; headless-playwright/1.0; +https://github.com/harianto)',
  })
  const page = await context.newPage()
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    })
    const title = await page.title()
    const html = await page.content()
    const finalUrl = page.url()
    if (!html?.trim()) {
      throw new Error('Playwright returned empty HTML')
    }
    return { title: title || finalUrl, html, url: finalUrl }
  } finally {
    await context.close().catch(() => {})
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function readJson(req, limit = 64_000) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function clampTimeout(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(Math.floor(n), 1_000), MAX_TIMEOUT_MS)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  try {
    if (req.method === 'GET' && path === '/') {
      sendJson(res, 200, {
        service: 'headless-playwright',
        version: '1.0.0',
        endpoints: {
          health: 'GET /health',
          fetch: 'POST /fetch { url, timeoutMs? }',
        },
      })
      return
    }

    if (req.method === 'GET' && path === '/health') {
      try {
        const b = await getBrowser()
        sendJson(res, 200, {
          ok: true,
          browser: b.isConnected() ? 'chromium' : 'disconnected',
        })
      } catch (error) {
        sendJson(res, 503, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }

    if (req.method === 'POST' && path === '/fetch') {
      const body = await readJson(req)
      const target = String(body.url || '').trim()
      if (!/^https?:\/\//i.test(target)) {
        sendJson(res, 400, {
          ok: false,
          error: 'Body must include url starting with http(s)://',
        })
        return
      }
      const timeoutMs = clampTimeout(body.timeoutMs)
      const started = Date.now()
      const result = await fetchPage(target, timeoutMs)
      sendJson(res, 200, {
        ok: true,
        title: result.title,
        html: result.html,
        url: result.url,
        latencyMs: Date.now() - started,
      })
      return
    }

    sendJson(res, 404, { ok: false, error: 'Not found' })
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

async function shutdown() {
  console.info('[headless-playwright] shutting down')
  server.close()
  if (browser) {
    await browser.close().catch(() => {})
    browser = null
  }
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())

server.listen(PORT, HOST, () => {
  console.info(
    `[headless-playwright] listening on http://${HOST}:${PORT} (GET /health, POST /fetch)`,
  )
})

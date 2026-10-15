#!/usr/bin/env node
/**
 * Headless Playwright interaction service — High-fidelity automation.
 *
 * GET  /health  → { ok, browser }
 * POST /fetch   → { url, timeoutMs? } → { title, html, url }
 * POST /pdf     → { url, timeoutMs?, cookie?, waitForSelector?, pdf? } → application/pdf
 * POST /interact → { actions: … } → { title, html, url, screenshot, … }
 */

import http from 'node:http'
import { chromium } from 'playwright'

const PORT = Number(process.env.PLAYWRIGHT_PORT || process.env.PORT || 9380)
const HOST = process.env.PLAYWRIGHT_HOST || '0.0.0.0'
const DEFAULT_TIMEOUT_MS = 45_000
const MAX_TIMEOUT_MS = 120_000
const DEFAULT_WAIT_SELECTOR = '[data-cv-print-ready="true"]'

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
    userAgent: 'Mozilla/5.0 (compatible; headless-playwright/1.0; +https://github.com/harianto)',
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

/**
 * Shared PDF contract with headless-oxider.
 * @param {object} options
 * @param {string} options.url
 * @param {number} options.timeoutMs
 * @param {string} [options.cookie]
 * @param {string} [options.waitForSelector]
 * @param {object} [options.pdf]
 */
async function renderPdf(options) {
  const {
    url,
    timeoutMs,
    cookie,
    waitForSelector = DEFAULT_WAIT_SELECTOR,
    pdf: pdfOpts = {},
  } = options

  const b = await getBrowser()
  const context = await b.newContext({
    userAgent: 'Mozilla/5.0 (compatible; headless-playwright/1.0; +https://github.com/harianto)',
  })
  const page = await context.newPage()

  try {
    if (cookie && String(cookie).trim()) {
      await page.setExtraHTTPHeaders({ cookie: String(cookie).trim() })
    }

    await page.goto(url, {
      waitUntil: 'load',
      timeout: timeoutMs,
    })

    const selector = String(waitForSelector || DEFAULT_WAIT_SELECTOR).trim()
    if (selector) {
      await page.waitForSelector(selector, { timeout: Math.min(timeoutMs, 30_000) })
    }

    // Let webfonts settle after the ready marker.
    await new Promise((resolve) => setTimeout(resolve, 250))

    const margin = pdfOpts.margin && typeof pdfOpts.margin === 'object'
      ? pdfOpts.margin
      : { top: '0', right: '0', bottom: '0', left: '0' }

    const buffer = await page.pdf({
      format: pdfOpts.format || 'A4',
      scale: typeof pdfOpts.scale === 'number' ? pdfOpts.scale : 0.79,
      printBackground: pdfOpts.printBackground !== false,
      // Default false (CDP/Playwright). Prefer CSS page size ignores scale.
      preferCSSPageSize: pdfOpts.preferCSSPageSize === true,
      margin: {
        top: String(margin.top ?? '0'),
        right: String(margin.right ?? '0'),
        bottom: String(margin.bottom ?? '0'),
        left: String(margin.left ?? '0'),
      },
    })

    return Buffer.from(buffer)
  } finally {
    await context.close().catch(() => {})
  }
}

async function runInteractions(actions, timeoutMs) {
  const b = await getBrowser()
  const context = await b.newContext({
    userAgent: 'Mozilla/5.0 (compatible; headless-playwright/1.0; +https://github.com/harianto)',
    viewport: { width: 1280, height: 900 },
  })
  const page = await context.newPage()
  const screenshots = []

  try {
    for (const step of actions) {
      const { type, selector, value, url, fullPage, timeout, label } = step
      const stepTimeout = timeout || timeoutMs || DEFAULT_TIMEOUT_MS

      switch (type) {
        case 'goto':
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: stepTimeout })
          break
        case 'fill':
          await page.fill(selector, value, { timeout: stepTimeout })
          break
        case 'click':
          await page.click(selector, { timeout: stepTimeout })
          break
        case 'clickText': {
          const el = await page.getByText(value, { exact: false }).first()
          await el.click({ timeout: stepTimeout })
          break
        }
        case 'select':
          await page.selectOption(selector, value, { timeout: stepTimeout })
          break
        case 'press':
          await page.keyboard.press(value, { timeout: stepTimeout })
          break
        case 'wait':
          await page.waitForTimeout(value || 1000)
          break
        case 'waitForSelector':
          await page.waitForSelector(selector, { timeout: stepTimeout })
          break
        case 'waitForURL':
          await page.waitForURL(value, { timeout: stepTimeout })
          break
        case 'screenshot': {
          const buffer = await page.screenshot({
            fullPage: !!fullPage,
            type: 'png',
            timeout: stepTimeout,
          })
          screenshots.push({
            label: label || `step-${screenshots.length + 1}`,
            data: buffer.toString('base64'),
          })
          break
        }
        default:
          throw new Error(`Unknown action type: ${type}`)
      }
    }

    const title = await page.title()
    const html = await page.content()
    const finalUrl = page.url()

    return {
      title: title || finalUrl,
      html,
      url: finalUrl,
      screenshots,
      screenshot: screenshots.at(-1)?.data ?? null,
    }
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

function sendPdf(res, buffer) {
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': buffer.length,
  })
  res.end(buffer)
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

function requireHttpUrl(value) {
  const target = String(value || '').trim()
  if (!target.toLowerCase().startsWith('http://') && !target.toLowerCase().startsWith('https://')) {
    return null
  }
  return target
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  try {
    if (req.method === 'GET' && path === '/') {
      sendJson(res, 200, {
        service: 'headless-playwright-pro',
        version: '2.1.0',
        endpoints: {
          health: 'GET /health',
          fetch: 'POST /fetch { url, timeoutMs? }',
          pdf: 'POST /pdf { url, timeoutMs?, cookie?, waitForSelector?, pdf? }',
          interact: 'POST /interact { actions: Array<{type, selector?, value?, url?, fullPage?, label?, timeout?}> }',
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
      const target = requireHttpUrl(body.url)
      if (!target) {
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

    if (req.method === 'POST' && path === '/pdf') {
      const body = await readJson(req)
      const target = requireHttpUrl(body.url)
      if (!target) {
        sendJson(res, 400, {
          ok: false,
          error: 'Body must include url starting with http(s)://',
        })
        return
      }
      const timeoutMs = clampTimeout(body.timeoutMs)
      const pdf = await renderPdf({
        url: target,
        timeoutMs,
        cookie: body.cookie,
        waitForSelector: body.waitForSelector,
        pdf: body.pdf,
      })
      sendPdf(res, pdf)
      return
    }

    if (req.method === 'POST' && path === '/interact') {
      const body = await readJson(req)
      const actions = body.actions
      if (!Array.isArray(actions)) {
        sendJson(res, 400, { ok: false, error: 'Actions must be an array' })
        return
      }
      const timeoutMs = clampTimeout(body.timeoutMs)
      const started = Date.now()
      const result = await runInteractions(actions, timeoutMs)
      sendJson(res, 200, {
        ok: true,
        title: result.title,
        html: result.html,
        url: result.url,
        screenshot: result.screenshot,
        screenshots: result.screenshots,
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
    `[headless-playwright] listening on http://${HOST}:${PORT} (GET /health, POST /fetch, POST /pdf, POST /interact)`,
  )
})

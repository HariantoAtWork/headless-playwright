#!/usr/bin/env node
/**
 * Showcase script — logs in to auth.uti.email and captures screenshots of all key pages.
 * All actions run in ONE browser context so the session (cookies) persists throughout.
 * Screenshots are saved to ./screenshots/
 *
 * Usage:  node scripts/showcase.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:9380'
const APP_URL   = 'http://auth.uti.email'
const USERNAME  = process.env.APP_USER     || 'admin'
const PASSWORD  = process.env.APP_PASSWORD || 'Opti0n@l'
const OUT_DIR   = join(process.cwd(), 'screenshots')

mkdirSync(OUT_DIR, { recursive: true })

async function interact(actions) {
  const res = await fetch(`${BASE_URL}/interact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actions, timeoutMs: 30000 }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(`interact failed: ${json.error}`)
  return json
}

function save(screenshots) {
  for (const { label, data } of screenshots) {
    const file = join(OUT_DIR, `${label}.png`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    console.log(`  saved → ${file}`)
  }
}

console.log('🚀 Starting showcase for', APP_URL)
console.log()

/**
 * Everything in one context — login once, then navigate to every page.
 * The browser context (and its session cookies) lives for the full run.
 */
const run = await interact([
  // ── Login page ──────────────────────────────────────────────────────────
  { type: 'goto', url: `${APP_URL}/login` },
  { type: 'waitForSelector', selector: 'form' },
  { type: 'screenshot', label: '01-login', fullPage: true },

  // Fill credentials — username field is a text input, password is type=password
  { type: 'fill', selector: 'input[type="text"], input[name="username"], input[id*="user"]', value: USERNAME },
  { type: 'fill', selector: 'input[type="password"]', value: PASSWORD },
  { type: 'screenshot', label: '02-login-filled', fullPage: true },

  // Submit and wait for navigation away from /login
  { type: 'click', selector: 'button[type="submit"]' },
  { type: 'waitForURL', value: `${APP_URL}/**` },
  { type: 'wait', value: 600 },
  { type: 'screenshot', label: '03-after-login', fullPage: true },

  // ── App pages via nav clicks (session cookie keeps us authenticated) ────

  // Home — domain list overview
  { type: 'goto', url: `${APP_URL}/` },
  { type: 'wait', value: 800 },
  { type: 'screenshot', label: '04-home', fullPage: true },

  // Certificates — click nav link by text
  { type: 'clickText', value: 'Certificates' },
  { type: 'wait', value: 800 },
  { type: 'screenshot', label: '05-certificates', fullPage: true },

  // Back to Home, click second domain by clicking its name in the sidebar
  { type: 'goto', url: `${APP_URL}/` },
  { type: 'waitForSelector', selector: 'aside a, ul li a' },
  { type: 'clickText', value: 'harianto.link' },
  { type: 'wait', value: 800 },
  { type: 'screenshot', label: '06-domain-harianto-link', fullPage: true },
])

save(run.screenshots)
console.log()
console.log('Final URL:', run.url)
console.log('✅ Done. Screenshots in', OUT_DIR)

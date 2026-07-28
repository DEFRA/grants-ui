#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Headless CLI driver for the Journey Runner.
 *
 * The Journey Runner engine (src/server/dev-tools/journey-runner/runner-engine.js)
 * is DOM-bound and normally driven from the browser console via `runJourney()`.
 * This script drives it headlessly instead: it launches chromium (reusing the
 * acceptance suite's Playwright install), signs in through the DefraID stub, then
 * calls `runJourney()` on the page and forwards the engine's `[journey-runner]`
 * console output to the terminal, exiting non-zero if the journey gets stuck.
 *
 * The engine script is auto-injected on every local page by page.njk, and it
 * resumes across navigations via sessionStorage, so this driver only has to kick
 * the run off once and then watch the console for a terminal outcome.
 *
 * Usage:
 *   node journey-cli.js <slug> [--crn <crn>] [--stop <n|section>] [--headed]
 *                              [--base-url <url>] [--timeout <ms>]
 *
 * Invoked by `gt journey <slug>` (tools/grants-tui/journey.js).
 */

import { chromium } from '@playwright/test'

const DEFAULT_CRN = '1102838829'
const DEFAULT_BASE_URL = 'http://localhost:3000'
const DEFAULT_TIMEOUT_MS = 120000
const LOG_PREFIX = '[journey-runner]'

// Substrings the engine logs when it reaches a clean stopping point…
// Keep in sync with the `[journey-runner]` log wording in
// src/server/dev-tools/journey-runner/runner-engine.js — a message reword there
// silently breaks terminal-outcome detection here.
const SUCCESS_MARKERS = ['stopping here', 'journey complete', 'complete - stopping at']
// …and when it fails / stalls.
const FAILURE_MARKERS = [
  'Stuck on',
  'Failed on',
  'Page has errors',
  'Unknown step type',
  'No steps found for section',
  'No journey steps found'
]

function parseArgs(argv) {
  const opts = {
    slug: null,
    crn: DEFAULT_CRN,
    stop: undefined,
    start: 'start',
    headed: false,
    clear: false,
    baseUrl: DEFAULT_BASE_URL,
    timeout: DEFAULT_TIMEOUT_MS
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--headed') {
      opts.headed = true
    } else if (arg === '--clear') {
      opts.clear = true
    } else if (arg === '--crn') {
      opts.crn = argv[++i]
    } else if (arg === '--stop') {
      opts.stop = argv[++i]
    } else if (arg === '--start') {
      opts.start = argv[++i]
    } else if (arg === '--base-url') {
      opts.baseUrl = argv[++i]
    } else if (arg === '--timeout') {
      opts.timeout = parseInt(argv[++i], 10)
    } else if (!arg.startsWith('-') && !opts.slug) {
      opts.slug = arg
    }
  }
  return opts
}

/**
 * Coerce the `--stop` value into the shape `runJourney` expects: a number when
 * numeric (stop before that 1-indexed step), otherwise the section string, or
 * undefined to run to the end.
 * @param {string | undefined} stop
 * @returns {number | string | undefined}
 */
function normaliseStop(stop) {
  if (stop === undefined) {
    return undefined
  }
  const asNumber = Number(stop)
  return Number.isInteger(asNumber) && asNumber > 0 ? asNumber : stop
}

/**
 * Sign in through the DefraID stub if its login form is on the page. No-op for
 * journeys that don't require auth (the CRN input simply won't be present).
 * @param {import('@playwright/test').Page} page
 * @param {string} crn
 * @returns {Promise<void>}
 */
async function loginIfNeeded(page, crn) {
  const crnInput = page.locator("//input[@id='crn']")
  if (!(await crnInput.isVisible().catch(() => false))) {
    return
  }

  console.log(`${LOG_PREFIX} Signing in via DefraID stub as CRN ${crn}`)
  await crnInput.fill(crn)
  await page.locator("//input[@id='password']").fill(process.env.DEFRA_ID_USER_PASSWORD ?? 'x')
  await page.locator("//button[@type='submit']").click()
  // The stub processes the sign-in once its login form detaches (mirrors the
  // acceptance suite) — more reliable than networkidle, which GA keeps busy.
  await crnInput.waitFor({ state: 'hidden' }).catch(() => {})

  // Multi-business CRNs land on an SBI chooser after submit — pick the first if
  // it appears; single-business CRNs skip straight through.
  const sbiRadio = page.locator("input[type='radio']").first()
  if (await sbiRadio.isVisible().catch(() => false)) {
    const continueButton = page.locator("//button[@type='submit']")
    if (await continueButton.isVisible().catch(() => false)) {
      await sbiRadio.click()
      await continueButton.click()
      await page.waitForLoadState('load').catch(() => {})
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!opts.slug) {
    console.error(
      'Usage: node journey-cli.js <slug> [--crn <crn>] [--stop <n|section>] [--start <page>] [--headed] [--clear] [--base-url <url>]'
    )
    process.exit(2)
  }

  // Headed runs use the system-installed Google Chrome (channel: 'chrome') so
  // you watch the journey in a real Chrome window; headless uses the bundled
  // Chromium. `channel` and `executablePath` are mutually exclusive.
  const launchOpts = {
    headless: !opts.headed,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  }
  if (opts.headed) {
    launchOpts.channel = 'chrome'
  } else {
    launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  }
  const browser = await chromium.launch(launchOpts)
  const context = await browser.newContext({
    baseURL: opts.baseUrl,
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 }
  })
  // Pre-accept the cookie choice so the GOV.UK cookie banner never renders — its
  // <form> otherwise sits above the page form and the engine submits it by
  // mistake (getting stuck on the start page). 'false' = reject analytics, which
  // also keeps Google Analytics from adding network noise.
  await context.addCookies([{ name: 'cookie_consent', value: 'false', url: opts.baseUrl }])
  const page = await context.newPage()
  page.setDefaultTimeout(opts.timeout)
  page.setDefaultNavigationTimeout(opts.timeout)

  // Resolve once the engine logs a terminal outcome; forward all engine logs.
  let settle
  const outcome = new Promise((resolve) => {
    settle = resolve
  })
  page.on('console', (msg) => {
    const text = msg.text()
    if (!text.startsWith(LOG_PREFIX)) {
      return
    }
    console.log(text)
    if (SUCCESS_MARKERS.some((m) => text.includes(m))) {
      settle('success')
    } else if (FAILURE_MARKERS.some((m) => text.includes(m))) {
      settle('failure')
    }
  })

  let result = 'timeout'
  try {
    // 'networkidle' is unreliable here — GA and the cross-origin DefraID login
    // redirect keep the network busy, so wait only for the DOM.
    await page.goto(`${opts.baseUrl}/${opts.slug}/${opts.start}`, { waitUntil: 'domcontentloaded' })
    await loginIfNeeded(page, opts.crn)

    // Optionally flush saved application state so the run starts from step 1 —
    // otherwise the app resumes the furthest-reached page and --stop overshoots.
    if (opts.clear) {
      console.log(`${LOG_PREFIX} Clearing application state`)
      await page.goto(`${opts.baseUrl}/${opts.slug}/clear-application-state`, { waitUntil: 'domcontentloaded' })
      await page.goto(`${opts.baseUrl}/${opts.slug}/${opts.start}`, { waitUntil: 'domcontentloaded' })
    }

    // Wait for the auto-injected engine to define its API before triggering it.
    console.log(`${LOG_PREFIX} Waiting for engine on ${page.url()}`)
    await page.waitForFunction(() => typeof globalThis.runJourney === 'function')

    const stopArg = normaliseStop(opts.stop)
    // The first step submits and navigates, which can tear down the evaluate
    // context — that's expected, not an error.
    await page.evaluate((arg) => globalThis.runJourney(arg), stopArg ?? null).catch(() => {})

    const timer = new Promise((resolve) => setTimeout(() => resolve('timeout'), opts.timeout))
    result = await Promise.race([outcome, timer])
  } catch (err) {
    console.error(`${LOG_PREFIX} Driver error: ${err.message}`)
    result = 'failure'
  }

  if (result !== 'success') {
    // Surface whatever the final page shows so a stall is diagnosable.
    const heading = await page
      .locator('h1')
      .first()
      .textContent()
      .catch(() => null)
    const errorSummary = await page
      .locator('.govuk-error-summary')
      .textContent()
      .catch(() => null)
    console.error(
      `${LOG_PREFIX} Journey did not complete (${result}) at ${page.url()}` +
        (heading ? `\n  Page heading: "${heading.trim()}"` : '') +
        (errorSummary ? `\n  Errors: ${errorSummary.trim()}` : '')
    )
  }

  // On a headed run, leave the browser open on the page for inspection — exit
  // only when the user closes the window (or presses Ctrl+C), not on a timer.
  if (opts.headed) {
    console.log(`${LOG_PREFIX} Browser left open — close the window (or press Ctrl+C) to exit.`)
    await new Promise((resolve) => {
      browser.on('disconnected', resolve)
      page.on('close', resolve)
    })
  }

  await context.close().catch(() => {})
  await browser.close().catch(() => {})
  process.exit(result === 'success' ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

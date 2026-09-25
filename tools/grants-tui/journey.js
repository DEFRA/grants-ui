/* eslint-disable no-console, curly */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, readSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  ACCEPTANCE_DIR,
  BOLD,
  CYAN,
  DIM,
  JOURNEY_CLI_SCRIPT,
  JOURNEYS_DIR,
  RED,
  RESET_COLOR,
  YELLOW
} from './constants.js'
import { defaultCrn, wontCompleteReason } from '../../src/server/dev-tools/journey-runner/journey-meta.js'

const SLUG_PATTERN = /^[a-z0-9-]+$/

/**
 * Print why a known-blocked journey won't complete and wait for Enter. No-op for a
 * dry run or non-TTY stdin. Reads fd 0 synchronously because stdin has already
 * left raw mode on the plain `gt journey <slug>` path.
 * @param {string} slug
 * @param {boolean} dryRun
 */
function acknowledgeIfWontComplete(slug, dryRun) {
  const reason = wontCompleteReason(slug)
  if (!reason || dryRun || !process.stdin.isTTY) return
  console.log(`\n  ${YELLOW}⚠  '${slug}' will NOT complete.${RESET_COLOR}`)
  for (const line of reason) console.log(`     ${line}`)
  process.stdout.write(`\n  Press ${BOLD}Enter${RESET_COLOR} to run anyway ${DIM}(Ctrl+C to cancel)${RESET_COLOR}… `)
  try {
    readSync(0, Buffer.alloc(8), 0, 8, null)
  } catch {
    // stdin not readable (piped/CI) — proceed without blocking
  }
  console.log('')
}

/**
 * Slugs that have a journey definition file.
 * @returns {string[]}
 */
export function listJourneys() {
  try {
    return readdirSync(JOURNEYS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort()
  } catch {
    return []
  }
}

/**
 * Parse a journey's step file; [] if missing or unparseable.
 * @param {string} slug
 * @returns {{name?: string, slug: string, type?: string, overrideKey?: string}[]}
 */
function loadJourney(slug) {
  try {
    const steps = JSON.parse(readFileSync(resolve(JOURNEYS_DIR, `${slug}.json`), 'utf8'))
    return Array.isArray(steps) ? steps : []
  } catch {
    return []
  }
}

/**
 * First step's page slug — not every grant starts at `/start` (farm-payments
 * begins at /confirm-farm-details). Null if unreadable.
 * @param {string} slug
 * @returns {string | null}
 */
export function firstStepSlug(slug) {
  return loadJourney(slug)[0]?.slug ?? null
}

/**
 * Ordered steps for the "stop at page" picker; 1-based position is what `--stop` expects.
 * @param {string} slug
 * @returns {{name: string, slug: string, type?: string, overrideKey?: string}[]}
 */
export function journeySteps(slug) {
  return loadJourney(slug).map((s) => ({
    name: s.name ?? s.slug,
    slug: s.slug,
    type: s.type,
    overrideKey: s.overrideKey
  }))
}

/**
 * Run a journey headlessly by shelling into the acceptance Playwright driver
 * (`acceptance/journey-cli.js`). Streams the driver's output and returns its
 * exit code (0 = journey completed).
 * @param {string} slug  grant URL slug with a matching journeys/<slug>.json
 * @param {{crn?: string, stop?: string, parcel?: string, commonLand?: string, mockNoActions?: boolean, mockWindowClosed?: boolean, headed?: boolean, clear?: boolean, acknowledged?: boolean, baseUrl?: string, skipInstall?: boolean}} [opts]
 * @param {boolean} [dryRun]  print the command without running it
 * @returns {number}  child exit code
 */
export function cmdJourney(slug, opts = {}, dryRun = false) {
  if (!slug || !SLUG_PATTERN.test(slug) || !existsSync(resolve(JOURNEYS_DIR, `${slug}.json`))) {
    const available = listJourneys()
    console.error(`\n  ${RED}✖${RESET_COLOR}  Unknown journey: '${slug ?? ''}'.`)
    if (available.length) {
      console.error(`  ${DIM}Available:${RESET_COLOR} ${available.join(', ')}\n`)
    } else {
      console.error(`  ${DIM}No journey definitions found in ${JOURNEYS_DIR}${RESET_COLOR}\n`)
    }
    return 1
  }

  // Warn (and block for acknowledgement) if this journey is known not to finish.
  // Skipped when the caller (the interactive menu) already got acknowledgement.
  if (!opts.acknowledged) acknowledgeIfWontComplete(slug, dryRun)

  // chromium is installed on demand (idempotent — mirrors acceptance/run-local.sh).
  if (!opts.skipInstall) {
    console.log(`\n  ${DIM}▶${RESET_COLOR}  npx playwright install chromium  ${DIM}(acceptance/)${RESET_COLOR}\n`)
    if (!dryRun) {
      const install = spawnSync('npx', ['playwright', 'install', 'chromium'], {
        cwd: ACCEPTANCE_DIR,
        stdio: 'inherit',
        encoding: 'utf8'
      })
      if (install.status !== 0) {
        console.error(`\n  ${RED}✖${RESET_COLOR}  Could not install chromium — is the acceptance package installed?\n`)
        return install.status ?? 1
      }
    }
  }

  // The runner enters at the journey's first step, not always a `/start` page
  // (e.g. farm-payments begins at /confirm-farm-details).
  const startPage = firstStepSlug(slug)

  // Use the journey's known-good CRN unless the caller picked one — the global
  // default only works for allowAll grants (e.g. woodland needs its own CRN).
  const crn = opts.crn || defaultCrn(slug)

  const driverArgs = [JOURNEY_CLI_SCRIPT, slug]
  if (startPage && startPage !== 'start') driverArgs.push('--start', startPage)
  driverArgs.push('--crn', crn)
  if (opts.stop) driverArgs.push('--stop', opts.stop)
  if (opts.parcel) driverArgs.push('--parcel', opts.parcel)
  if (opts.commonLand) driverArgs.push('--common-land', opts.commonLand)
  if (opts.mockNoActions) driverArgs.push('--mock-no-actions')
  if (opts.mockWindowClosed) driverArgs.push('--mock-window-closed')
  if (opts.headed) driverArgs.push('--headed')
  if (opts.clear) driverArgs.push('--clear')
  if (opts.baseUrl) driverArgs.push('--base-url', opts.baseUrl)

  console.log(
    `  ${DIM}▶${RESET_COLOR}  node acceptance/journey-cli.js ${driverArgs.slice(1).join(' ')}  ` +
      `${DIM}(journey: ${CYAN}${slug}${RESET_COLOR}${DIM})${RESET_COLOR}\n`
  )
  if (dryRun) return 0

  // Default the stub password to the same value acceptance/run-local.sh uses.
  const env = { ...process.env, DEFRA_ID_USER_PASSWORD: process.env.DEFRA_ID_USER_PASSWORD ?? 'x' }
  const result = spawnSync(process.execPath, driverArgs, {
    cwd: ACCEPTANCE_DIR,
    stdio: 'inherit',
    encoding: 'utf8',
    env
  })
  return result.status ?? 1
}

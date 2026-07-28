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

const SLUG_PATTERN = /^[a-z0-9-]+$/

// Generic CRN for the many grants whose allowlist is `allowAll: true`.
export const DEFAULT_CRN = '1102838829'

/**
 * CRNs known to work for a journey, most-suitable first. Only journeys that need
 * a *specific* CRN are listed; anything absent uses DEFAULT_CRN (its allowlist is
 * `allowAll`). Sourced from localstack/config-broker/local-allowlists/*.yaml.
 * @type {Record<string, {crn: string, note: string}[]>}
 */
const JOURNEY_CRNS = {
  woodland: [
    { crn: '1100943757', note: 'woodland allowlist (SBI 113593357)' },
    { crn: '1100943838', note: 'woodland allowlist (SBI 107173507)' }
  ],
  'farm-payments': [{ crn: '1102838829', note: 'farm-payments allowlist + seeded land parcels' }]
  // methane is `allowAll` once seeded (see SELF_SEED_GRANTS), so it uses DEFAULT_CRN.
}

/**
 * CRN options for a journey (most-suitable first). Journeys not in JOURNEY_CRNS
 * are `allowAll`, so any CRN works and DEFAULT_CRN is offered.
 * @param {string} slug
 * @returns {{crn: string, note: string}[]}
 */
export function journeyCrnOptions(slug) {
  if (slug in JOURNEY_CRNS) return JOURNEY_CRNS[slug]
  return [{ crn: DEFAULT_CRN, note: 'allowlisted for all CRNs' }]
}

/**
 * The default CRN to sign in with for a journey when none is given explicitly.
 * @param {string} slug
 * @returns {string}
 */
export function defaultCrn(slug) {
  return journeyCrnOptions(slug)[0]?.crn ?? DEFAULT_CRN
}

/**
 * Journeys that are known not to complete on a standard local stack, with the
 * reason (one array entry per printed line). Shown as a blocking warning the user
 * must acknowledge before the run.
 * @type {Record<string, string[]>}
 */
const WONT_COMPLETE = {
  'farm-payments': [
    'It stops at "select-actions-for-land-parcel": the offered actions (CMOR1, UPL1–UPL3) are',
    'moorland-only, and the local land-grants seed has no majority-moorland parcel, so every',
    'parcel is rejected with "This parcel is not majority on the moorland".',
    'This is backend seed data, not a journey bug.'
  ],
  methane: [
    'Every CRN is turned away at /auth/journey-unauthorised. methane is a frontend-code-only grant',
    'not known to grants-ui-backend, whose allowlist only governs config-broker grants — so it has',
    'no way to authorise methane (seeding config__allowlist_entries is ignored). This needs an',
    'architecture change (skip the backend allowlist for local grants, or onboard methane), not a seed.'
  ]
}

/**
 * The reason a journey is known not to complete, as printable lines — or null if
 * it should run normally. Lets the interactive menu show its own acknowledgement.
 * @param {string} slug
 * @returns {string[] | null}
 */
export function wontCompleteReason(slug) {
  return WONT_COMPLETE[slug] ?? null
}

/**
 * If the chosen journey is known not to complete, print why and block until the
 * user presses Enter (or Ctrl+C). No-op for a dry run or a non-interactive stdin.
 * Uses a synchronous fd-0 read so it works from the plain `gt journey <slug>`
 * path, where stdin has already left raw mode.
 * @param {string} slug
 * @param {boolean} dryRun
 * @returns {void}
 */
function acknowledgeIfWontComplete(slug, dryRun) {
  const reason = WONT_COMPLETE[slug]
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
 * List the journey slugs that have a definition file, for validation and
 * for the "unknown journey" hint.
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
 * Read and parse a journey's step definition file. Returns [] if the file is
 * missing or unparseable — the single source of truth for the readers below.
 * @param {string} slug  grant URL slug
 * @returns {{name?: string, slug: string}[]}
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
 * The slug of a journey's first step — the page the runner must enter on. Not
 * every grant starts at `/start` (farm-payments begins at /confirm-farm-details).
 * @param {string} slug  grant URL slug
 * @returns {string | null}  first step's page slug, or null if unreadable
 */
export function firstStepSlug(slug) {
  return loadJourney(slug)[0]?.slug ?? null
}

/**
 * The ordered steps of a journey, for building a "stop at page" picker. Each
 * entry's 1-based position is the number `runJourney`/`--stop` expects.
 * @param {string} slug
 * @returns {{name: string, slug: string}[]}
 */
export function journeySteps(slug) {
  return loadJourney(slug).map((s) => ({ name: s.name ?? s.slug, slug: s.slug }))
}

/**
 * Run a journey headlessly by shelling into the acceptance Playwright driver
 * (`acceptance/journey-cli.js`). Streams the driver's output and returns its
 * exit code (0 = journey completed).
 * @param {string} slug  grant URL slug with a matching journeys/<slug>.json
 * @param {{crn?: string, stop?: string, headed?: boolean, clear?: boolean, acknowledged?: boolean, baseUrl?: string, skipInstall?: boolean}} [opts]
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

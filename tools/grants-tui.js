#!/usr/bin/env node
/* eslint-disable */

/**
 * Grants TUI — Interactive Docker Compose launcher
 *
 * Usage (interactive — no args):
 *   gt
 *   node tools/grants-tui.js   (direct)
 *
 * Usage (non-interactive):
 *   gt up [--land-grants] [--gas] [--ha] [--scale <n>] [--dry-run]
 *   gt up --local-<service-key>  # use locally-built image for a defradigital service
 *   gt down [--dry-run]          # uses saved state automatically
 *   gt debug                     # restart grants-ui in debug mode (detached, port 9229)
 *   gt restart [--dry-run]       # restart running containers (with --no-deps)
 *   gt test [unit|contracts|acceptance]  # run tests (default: unit)
 *   gt sonar [--skip-tests]      # local SonarQube scan (server left up for the dashboard)
 *   gt sonar --changed           # scope scan to src files changed vs main (approx. CI PR view)
 *   gt sonar --down              # force-stop a leftover SonarQube server
 *   gt snyk                      # Snyk dependency vulnerability scan (run `snyk auth` once — free account)
 *   gt check                     # pre-PR full check: all tests + snyk + PR-scoped sonar (CI gates)
 *   gt reset [--dry-run]         # full teardown incl. volumes
 *   gt --help                    # show help
 *   gt --version                 # show version number
 *
 * Tip: run `npm link` once to use `gt` directly. If `gt` collides with another
 * tool on your machine, the `gtx` alias runs the exact same command.
 *
 * Interactive mode keys:
 *   ↑ ↓       navigate
 *   space     toggle addon selection
 *   a         select / deselect all items in current list
 *   g         set the mocked GAS status (only when GAS runs on mockserver)
 *   enter     confirm selection
 *   esc       go back / quit
 *
 * Adding a new addon service:
 *   Append an entry to the ADDONS array below — that's it.
 *
 * Adding a new defradigital local-image service:
 *   Append an entry to the LOCAL_SERVICES array below.
 *
 * Pre-up script:
 *   Set PRE_UP_SCRIPT (below) to the path of a shell script to run before every `up`.
 *   Set to null or '' to disable. On Windows, the script is run via bash (Git Bash / WSL).
 *
 * State is persisted in .grants-ui-cli-state.json (git-ignored) so the next
 * `up` pre-selects the same addons and local image overrides as last time.
 */

import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { resolve } from 'node:path'

import {
  ADDONS,
  ALT_SCREEN_ENTER,
  ALT_SCREEN_EXIT,
  APPLY_FORM_DEFS_SCRIPT,
  BOLD,
  CHECK,
  CYAN,
  DEBUG_SERVICE,
  DIM,
  GREEN,
  HIDE_CURSOR,
  LOCAL_SERVICES,
  LOG_RETENTION_MS,
  PRE_UP_SCRIPT,
  PURPLE,
  RED,
  RESET_COLOR,
  RESTART_HIDDEN_SERVICE,
  ROOT,
  SHOW_CURSOR,
  SNYK,
  SNYK_EXIT,
  SONAR,
  SONAR_EXIT,
  STATE_FILE,
  TEST_TARGETS,
  VERSION,
  YELLOW
} from './grants-tui/constants.js'
import {
  pauseStdin,
  promptScale,
  promptTextWithOptions,
  radioMenu,
  releaseStdin,
  resumeStdin,
  toggleMenu
} from './grants-tui/tui.js'
import { GAS_DIVIDER, gasStatusSegment, getGasStatus, setGasStatus } from './grants-tui/gas.js'
import { cmdTest, testLogPath } from './grants-tui/tests.js'
import { cmdSonar } from './grants-tui/sonar.js'
import { cmdJourney, journeyCrnOptions, journeySteps, listJourneys, wontCompleteReason } from './grants-tui/journey.js'
import { discoverOverrides } from './apply-local-form-defs.mjs'

// Sweep of stale tool logs from tmpdir. macOS auto-clears windows tmpdir
// after ~3 days
function sweepOldLogs() {
  const dir = os.tmpdir()
  const now = Date.now()
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch (err) {
    console.error(`  ${DIM}log sweep skipped: ${/** @type {Error} */ (err).message}${RESET_COLOR}`)
    return
  }
  for (const name of entries) {
    if (!name.startsWith('grants-tui-') || !name.endsWith('.log')) continue
    const full = resolve(dir, name)
    const stat = fs.statSync(full, { throwIfNoEntry: false })
    if (stat && now - stat.mtimeMs > LOG_RETENTION_MS) fs.rmSync(full, { force: true })
  }
}

// Temp files created this session — cleaned up on exit
const _tempFiles = []
process.on('exit', () => {
  for (const f of _tempFiles) {
    try {
      fs.unlinkSync(f)
    } catch {
      /* ignore */
    }
  }
})

// ---------------------------------------------------------------------------
// Local image helpers
// ---------------------------------------------------------------------------

/**
 * Discover every selectable form-definition override, from both the in-repo
 * `local-form-definitions` folder and any sibling `grants-config-*` repo
 * checkouts placed next to grants-ui. Each entry carries a stable `id`
 * (`<grant>::<sourceKey>`) used as the selection key, its `grant`, and a
 * human-readable `source`. Discovery failures degrade to an empty list so the
 * menu never crashes.
 * @returns {import('./apply-local-form-defs.mjs').OverrideEntry[]}
 */
function listOverrideSources() {
  try {
    return discoverOverrides().overrides
  } catch {
    return []
  }
}

/** True when at least one form-definition override (folder or sibling repo) is available */
function hasLocalFormDefs() {
  return listOverrideSources().length > 0
}

/**
 * Resolve the persisted set of selected override ids, migrating the legacy
 * boolean `localFormDefs` flag (all folder overrides on/off) to the per-grant
 * `localFormDefSelections` array on first read.
 * @param {{ localFormDefSelections?: string[], localFormDefs?: boolean } | null} state
 * @returns {string[]}
 */
function getSelectedFormDefIds(state) {
  if (!state) {
    return []
  }
  if (Array.isArray(state.localFormDefSelections)) {
    return state.localFormDefSelections
  }
  // Legacy migration: the old single toggle enabled every folder override.
  if (state.localFormDefs) {
    return listOverrideSources()
      .filter((o) => o.source === 'local-form-definitions')
      .map((o) => o.id)
  }
  return []
}

/** Returns the set of `<name>:local` image refs that exist in the local Docker daemon */
function getLocalImages() {
  const result = spawnSync('docker', ['images', '--format', '{{.Repository}}:{{.Tag}}'], { encoding: 'utf8' })
  if (result.status !== 0) return new Set()
  return new Set((result.stdout ?? '').trim().split('\n').filter(Boolean))
}

/**
 * Write a temporary docker-compose override file that replaces the image for
 * each selected service with its `<name>:local` variant.
 * Returns the path to the temp file, or null if nothing to override.
 */
function writeTempOverride(localServiceKeys) {
  if (!localServiceKeys.length) return null
  const hostPlatform = `linux/${os.arch() === 'x64' ? 'amd64' : os.arch()}`
  const services = {}
  for (const key of localServiceKeys) {
    const svc = LOCAL_SERVICES.find((s) => s.key === key)
    if (!svc) continue
    const localImage = svc.key + ':local'
    services[svc.composeService] = { image: localImage, pull_policy: 'never', platform: hostPlatform }
  }
  if (!Object.keys(services).length) return null
  const content =
    'services:\n' +
    Object.entries(services)
      .map(
        ([name, cfg]) =>
          `  ${name}:\n    image: ${cfg.image}\n    pull_policy: ${cfg.pull_policy}\n    platform: ${cfg.platform}`
      )
      .join('\n') +
    '\n'
  const tmpPath = resolve(os.tmpdir(), `grants-ui-cli-local-override-${process.pid}.yml`)
  fs.writeFileSync(tmpPath, content, 'utf8')
  _tempFiles.push(tmpPath)
  return tmpPath
}

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

function saveState(addons, scale, localServices = [], localFormDefSelections = []) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ addons, scale, localServices, localFormDefSelections }, null, 2))
  } catch {
    // non-fatal
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    }
  } catch {
    // non-fatal
  }
  return null
}

function clearState() {
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE)
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Docker helpers
// ---------------------------------------------------------------------------

function composeFiles(selectedAddonKeys) {
  const files = ['compose.infra.yml', 'compose.grants-ui.yml']
  for (const addon of ADDONS) {
    if (selectedAddonKeys.includes(addon.key)) files.push(addon.composeFile)
  }
  return files
}

function composeFileArgs(selectedAddonKeys, localServiceKeys = []) {
  const files = composeFiles(selectedAddonKeys)
  const args = files.flatMap((f) => ['-f', f])
  if (localServiceKeys.length) {
    const tmp = writeTempOverride(localServiceKeys)
    if (tmp) args.push('-f', tmp)
  }
  return args
}

function runCompose(args, dryRun = false) {
  const fullArgs = ['compose', ...args]
  const displayArgs = fullArgs.map((a) => {
    if (typeof a !== 'string') return a
    if (a.includes('grants-ui-cli-local-override-')) return '<local-override>'
    if (a.includes('grants-ui-cli-debug-override-')) return '<debug-override>'
    return a
  })
  console.log(`\n  ${DIM}▶${RESET_COLOR}  docker ${displayArgs.join(' ')}\n`)
  if (dryRun) return 0
  const result = spawnSync('docker', fullArgs, { cwd: ROOT, stdio: 'inherit', encoding: 'utf8' })
  return result.status ?? 1
}

/** True when running inside the interactive TUI loop */
let _interactive = false

/** Elapsed seconds of the most recent successful `up`, used by the interactive status line */
let _lastUpElapsedSeconds = null

function buildStatusLine(runningFiles) {
  if (!runningFiles || !runningFiles.length) {
    return `${DIM}No containers running${RESET_COLOR}`
  }
  const isDebugging = runningFiles.some((f) => f.includes('grants-ui-cli-debug-override-'))
  // The core stack always spans compose.infra + compose.grants-ui (and the legacy
  // single `compose`); collapse them into one "Core" chip so the status line reads
  // "Core" instead of listing each core compose file separately.
  const CORE_BASES = new Set(['compose', 'compose.infra', 'compose.grants-ui'])
  let hasCore = false
  const addonLabels = []
  runningFiles
    .filter((f) => !f.includes('grants-ui-cli-local-override-') && !f.includes('grants-ui-cli-debug-override-'))
    .forEach((f) => {
      const base = f
        .split('/')
        .pop()
        .replace(/\.yml$/, '')
      if (CORE_BASES.has(base)) {
        hasCore = true
        return
      }
      const addon = ADDONS.find((a) => a.composeFile === base + '.yml')
      addonLabels.push(addon ? addon.label : base)
    })
  const labels = hasCore ? ['Core', ...addonLabels] : addonLabels
  if (!labels.length) {
    return `${DIM}No containers running${RESET_COLOR}`
  }
  const state = loadState()
  const localKeys = state && state.localServices && state.localServices.length ? state.localServices : []
  const formDefCount = getSelectedFormDefIds(state).length
  // Local overrides sit behind the same subtle divider used before the GAS badge,
  // read as a plain `Local: …` chip (no parentheses, no `images:` prefix): the
  // overridden image keys and the form-def override count, listed bare.
  const localBits = []
  if (localKeys.length) localBits.push(localKeys.join(', '))
  if (formDefCount) localBits.push(`${formDefCount} form-def overrides`)
  const localSuffix = localBits.length ? `  ${GAS_DIVIDER}  ${PURPLE}Local: ${localBits.join(', ')}${RESET_COLOR}` : ''
  const runningWord = isDebugging ? `${RED}Debugging${RESET_COLOR}` : 'Running'
  const tick = isDebugging ? '🐛' : `${GREEN}✔${RESET_COLOR}`
  return `${tick}  ${runningWord}: ${BOLD}${labels.join(', ')}${RESET_COLOR}${localSuffix}`
}

function getRunningComposeFiles() {
  const ps = spawnSync(
    'docker',
    ['ps', '--filter', 'label=com.docker.compose.project=grants-ui', '--format', '{{.ID}}'],
    { encoding: 'utf8' }
  )
  const ids = (ps.stdout ?? '').trim().split('\n').filter(Boolean)
  if (!ids.length) return null

  const inspect = spawnSync(
    'docker',
    ['inspect', ids[0], '--format', '{{ index .Config.Labels "com.docker.compose.project.config_files" }}'],
    { encoding: 'utf8' }
  )
  if (inspect.status !== 0 || !inspect.stdout.trim()) return null
  return inspect.stdout
    .trim()
    .split(',')
    .map((f) => f.trim())
}

/**
 * Base URL for the running app: the HA addon fronts it with an HTTPS nginx proxy
 * on 4000, every other stack serves plain HTTP on 3000. Used to default
 * `gt journey`'s target so it works without a manual --base-url.
 * @returns {string}
 */
function journeyBaseUrl() {
  const runningFiles = getRunningComposeFiles()
  return runningFiles?.some((f) => f.endsWith('compose.ha.yml')) ? 'https://localhost:4000' : 'http://localhost:3000'
}

/** Returns the list of running compose service names for the grants-ui project */
function getRunningServices() {
  const ps = spawnSync(
    'docker',
    [
      'ps',
      '--filter',
      'label=com.docker.compose.project=grants-ui',
      '--format',
      '{{.Label "com.docker.compose.service"}}'
    ],
    { encoding: 'utf8' }
  )
  if (ps.status !== 0) return []
  return (ps.stdout ?? '').trim().split('\n').filter(Boolean)
}

/** Returns all compose service names (running or stopped) for the grants-ui project */
function getAllServices() {
  const ps = spawnSync(
    'docker',
    [
      'ps',
      '-a',
      '--filter',
      'label=com.docker.compose.project=grants-ui',
      '--format',
      '{{.Label "com.docker.compose.service"}}'
    ],
    { encoding: 'utf8' }
  )
  if (ps.status !== 0) return []
  return [...new Set((ps.stdout ?? '').trim().split('\n').filter(Boolean))]
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function runPreUpScript(dryRun) {
  if (!PRE_UP_SCRIPT) return 0
  console.log(`  ${DIM}▶${RESET_COLOR}  Running pre-up script: ${DIM}${PRE_UP_SCRIPT}${RESET_COLOR}\n`)
  if (dryRun) return 0
  // On Windows, run via bash if available; otherwise skip with a warning
  const isWin = process.platform === 'win32'
  let result
  if (isWin) {
    result = spawnSync('bash', [PRE_UP_SCRIPT], { cwd: ROOT, stdio: 'inherit', encoding: 'utf8' })
    if (result.error) {
      console.warn(`  ${YELLOW}⚠${RESET_COLOR}  Could not run pre-up script on Windows (bash not found) — skipping.\n`)
      return 0
    }
  } else {
    result = spawnSync(PRE_UP_SCRIPT, [], { cwd: ROOT, stdio: 'inherit', encoding: 'utf8' })
    if (result.error) {
      console.error(`  ${RED}✖${RESET_COLOR}  Pre-up script failed to start: ${result.error.message}\n`)
      return 1
    }
  }
  if (result.status !== 0) {
    console.error(`  ${RED}✖${RESET_COLOR}  Pre-up script exited with code ${result.status}\n`)
  }
  return result.status ?? 0
}

/**
 * Run the local form-definition override applier (`enable`/`disable`) against the
 * running stack. Returns the child process exit code (0 = success).
 *
 * When `selection` is an array, only those override ids are acted on (passed to
 * the applier via `GRANTS_UI_FORMDEF_SELECTION`) — this is how the per-grant
 * menu enables/removes just the overrides that changed. When `selection` is null
 * the applier acts on every discovered override: for `disable` that also runs the
 * marker sweep, purging any leftover/orphaned override from a persisted volume.
 * @param {'enable'|'disable'} mode
 * @param {boolean} [dryRun]
 * @param {string[] | null} [selection]
 * @returns {number}
 */
function runApplyFormDefs(mode, dryRun = false, selection = null) {
  console.log(
    `\n  ${DIM}▶${RESET_COLOR}  ${mode === 'enable' ? 'Applying' : 'Removing'} local form-definition overrides…\n`
  )
  if (dryRun) return 0
  const env = { ...process.env }
  if (selection) {
    env.GRANTS_UI_FORMDEF_SELECTION = selection.join(',')
  }
  const result = spawnSync(process.execPath, [APPLY_FORM_DEFS_SCRIPT, mode], {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
    env
  })
  return result.status ?? 1
}

/**
 * Whether Snyk has a usable credential: a SNYK_TOKEN env var, or a saved token in
 * the CLI's configstore. Checks for an actual token key rather than mere file
 * existence — `snyk config clear` leaves an empty `snyk.json` behind, which would
 * otherwise read as "logged in" and swallow the sign-up guidance.
 * @returns {boolean}
 */
function snykLoggedIn() {
  if (process.env.SNYK_TOKEN) return true
  try {
    const cfg = JSON.parse(fs.readFileSync(resolve(os.homedir(), '.config', 'configstore', 'snyk.json'), 'utf8'))
    return Boolean(cfg.api || cfg.INTERNAL_OAUTH_TOKEN_STORAGE)
  } catch {
    return false
  }
}

/**
 * Run `snyk test` — the same dependency vulnerability scan CI runs, honouring the
 * repo's `.snyk` ignore policy. Needs a Snyk login: a FREE personal account is
 * enough (run `snyk auth` once — it stores a local token), no org/paid token
 * required. Streams output and tees it to a log so the interactive menu's
 * screen-clear on return doesn't lose it.
 * @param {boolean} [dryRun]
 * @returns {number} 0 = clean, 1 = vulnerabilities found, 2 = error
 */
function cmdSnyk(dryRun = false) {
  console.log(`\n  ${DIM}▶${RESET_COLOR}  snyk test  ${DIM}(dependency vulnerability scan)${RESET_COLOR}\n`)
  if (dryRun) return 0

  if (!fs.existsSync(SNYK.bin)) {
    console.error(`\n  ${RED}✖${RESET_COLOR}  snyk not installed — run 'npm ci' first.\n`)
    return SNYK_EXIT.ERROR
  }
  if (!snykLoggedIn()) {
    console.log(
      `  ${YELLOW}⚠${RESET_COLOR}  Not logged in to Snyk — the scan will fail until you authenticate.\n` +
        `     No org/paid token needed: create a FREE account at ${CYAN}https://snyk.io${RESET_COLOR}, then run ${CYAN}snyk auth${RESET_COLOR} once\n` +
        `     (opens a browser, stores a local token). Alternatively ${CYAN}export SNYK_TOKEN=<api-token>${RESET_COLOR}.\n`
    )
  }

  let status
  if (process.platform === 'win32') {
    const r = spawnSync(SNYK.bin, ['test'], { cwd: ROOT, stdio: 'inherit', encoding: 'utf8' })
    status = r.status ?? SNYK_EXIT.ERROR
  } else {
    // pipefail keeps snyk's exit code (1 = vulns, 2 = error) rather than tee's 0.
    const r = spawnSync('bash', ['-c', `set -o pipefail; "${SNYK.bin}" test 2>&1 | tee "${SNYK.logFile}"`], {
      cwd: ROOT,
      stdio: 'inherit',
      encoding: 'utf8'
    })
    status = r.status ?? SNYK_EXIT.ERROR
    console.log(`\n  ${DIM}output: ${SNYK.logFile}${RESET_COLOR}`)
  }

  // Exit 1 = vulnerabilities found (a real scan result). Any other non-zero is a
  // tool/config error — most often stale local auth: the CLI's OAuth token
  // refresh 400s (SNYK-0003) before it can resolve the org or scan. Point at re-auth.
  if (status !== SNYK_EXIT.OK && status !== SNYK_EXIT.VULNS) {
    console.log(
      `\n  ${YELLOW}⚠${RESET_COLOR}  Snyk errored before scanning. If it mentions auth/org or SNYK-0003, you're not` +
        ` logged in (or a saved login has gone stale). Run 'snyk auth' — a FREE personal account works, no org token` +
        ` needed (or export SNYK_TOKEN).\n`
    )
  }
  return status
}

/**
 * Pre-PR full check: run every test suite, then Snyk, then a PR-scoped SonarQube
 * scan — the same gates CI enforces. Runs every step even when an earlier one
 * fails, so a single pass surfaces all problems, then prints a summary.
 * @param {boolean} [dryRun]
 * @returns {Promise<number>} 0 only when every step passes
 */
async function cmdCheck(dryRun = false) {
  /** @type {{name: string, ok: boolean, log: string}[]} */
  const results = []
  for (const t of TEST_TARGETS) {
    results.push({ name: `test:${t.key}`, ok: cmdTest(t.key, dryRun) === 0, log: testLogPath(t.key) })
  }
  results.push({ name: 'snyk', ok: cmdSnyk(dryRun) === SNYK_EXIT.OK, log: SNYK.logFile })
  results.push({ name: 'sonar', ok: (await cmdSonar({ dryRun, changed: true })) === SONAR_EXIT.OK, log: SONAR.logFile })

  const failed = results.filter((r) => !r.ok)
  const allOk = failed.length === 0
  const pad = Math.max(...results.map((r) => r.name.length))

  // Plain-text summary to a log — the interactive TUI clears the screen on return,
  // so console output alone is lost. Failed steps point at their own output log.
  const summary =
    `pre-pr check — ${allOk ? 'all passed' : `${failed.length} failed`}\n` +
    results.map((r) => `  ${r.ok ? '✔' : '✖'} ${r.name.padEnd(pad)}${r.ok ? '' : `   → ${r.log}`}`).join('\n') +
    '\n'
  try {
    fs.writeFileSync(CHECK.logFile, summary)
  } catch (err) {
    console.error(`  ${DIM}could not write check summary: ${/** @type {Error} */ (err).message}${RESET_COLOR}`)
  }

  console.log(`\n  ${BOLD}pre-pr check summary${RESET_COLOR}`)
  for (const r of results) {
    const tail = r.ok ? '' : `  ${DIM}→ ${r.log}${RESET_COLOR}`
    console.log(`    ${r.ok ? `${GREEN}✔${RESET_COLOR}` : `${RED}✖${RESET_COLOR}`}  ${r.name}${tail}`)
  }
  console.log(
    allOk
      ? `\n  ${GREEN}✔  All checks passed${RESET_COLOR}  ${DIM}(${CHECK.logFile})${RESET_COLOR}\n`
      : `\n  ${RED}✖  ${failed.length} failed${RESET_COLOR}  ${DIM}(${CHECK.logFile})${RESET_COLOR}\n`
  )
  return allOk ? 0 : 1
}

function cmdUp(selectedAddons, scale, dryRun, localServices = []) {
  const fileArgs = composeFileArgs(selectedAddons, localServices)
  const extraArgs = ['-d', '--wait']
  if (scale && selectedAddons.includes('ha')) {
    extraArgs.push('--scale', `grants-ui=${scale}`, '--scale', `grants-ui-backend=${scale}`)
  }
  const addonLabels = selectedAddons.map((k) => {
    const a = ADDONS.find((x) => x.key === k)
    return a ? a.label : k
  })
  const addonSummary = addonLabels.length ? ` + ${addonLabels.join(', ')}` : ''
  console.log(
    `  ${BOLD}Starting:${RESET_COLOR} core${addonSummary}${scale ? `  ${DIM}(scale=${scale})${RESET_COLOR}` : ''}\n`
  )
  const preStatus = runPreUpScript(dryRun)
  if (preStatus !== 0) {
    if (!_interactive) process.exit(preStatus)
    return preStatus
  }
  const startTime = Date.now()
  _lastUpElapsedSeconds = null
  const status = runCompose([...fileArgs, 'up', ...extraArgs], dryRun)
  if (status === 0 && !dryRun) {
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1)
    _lastUpElapsedSeconds = elapsedSeconds
    const selectedFormDefIds = getSelectedFormDefIds(loadState())
    saveState(selectedAddons, scale, localServices, selectedFormDefIds)
    console.log(
      `  ${GREEN}✔${RESET_COLOR}  Containers started — run ${CYAN}gt down${RESET_COLOR} to stop. ${DIM}Started in ${elapsedSeconds}s${RESET_COLOR}\n`
    )
    // The stack is healthy (up --wait), so the repo definitions are ingested.
    // Reconcile the persisted Mongo volume to match the selection: a plain `down`
    // keeps the volume, so a stale bumped doc from a previous session would
    // otherwise keep being served. First a full disable (marker sweep) clears any
    // leftover override, then the current selection is published on top. When
    // nothing is selected the sweep alone reverts every grant to its repo version.
    if (selectedFormDefIds.length) {
      runApplyFormDefs('disable', dryRun)
      runApplyFormDefs('enable', dryRun, selectedFormDefIds)
    } else if (hasLocalFormDefs()) {
      runApplyFormDefs('disable', dryRun)
    }
  }
  if (status !== 0 && !_interactive) process.exit(status)
  return status
}

function cmdDown(dryRun) {
  const state = loadState()
  let fileArgs

  if (state) {
    const addonLabels = state.addons.map((k) => {
      const a = ADDONS.find((x) => x.key === k)
      return a ? a.label : k
    })
    const addonSummary = addonLabels.length ? ` + ${addonLabels.join(', ')}` : ''
    console.log(`\n  ${DIM}Saved state:${RESET_COLOR} core${addonSummary}\n`)
    fileArgs = composeFileArgs(state.addons, state.localServices ?? [])
  } else {
    console.log(`\n  ${YELLOW}⚠${RESET_COLOR}  No saved state — stopping core services only.\n`)
    fileArgs = composeFileArgs([])
  }

  const status = runCompose([...fileArgs, 'down', '--remove-orphans', '--rmi', 'local'], dryRun)
  if (status === 0 && !dryRun) {
    // Keep state so next `up` can pre-select the same addons
    console.log(`  ${GREEN}✔${RESET_COLOR}  Containers stopped.\n`)
  }
  if (status !== 0 && !_interactive) process.exit(status)
  return status
}

function cmdDebug() {
  const composeFilesFromLabels = getRunningComposeFiles()
  let addonKeys

  if (composeFilesFromLabels) {
    // Derive addon keys from running compose files
    addonKeys = ADDONS.filter((a) => composeFilesFromLabels.some((f) => f.endsWith(a.composeFile))).map((a) => a.key)
  } else {
    const state = loadState()
    if (state) {
      console.log(`\n  ${YELLOW}⚠${RESET_COLOR}  No running container found — using saved state for debug session.\n`)
      addonKeys = state.addons
    } else {
      console.error(
        `\n  ${RED}✖${RESET_COLOR}  ${DEBUG_SERVICE} is not running and no saved state found. Start containers first.\n`
      )
      if (!_interactive) process.exit(1)
      return 1
    }
  }

  // Write a temp override that replaces the grants-ui command with dev:debug
  const debugOverridePath = resolve(os.tmpdir(), `grants-ui-cli-debug-override-${process.pid}.yml`)
  fs.writeFileSync(debugOverridePath, `services:\n  ${DEBUG_SERVICE}:\n    command: npm run dev:debug\n`, 'utf8')
  _tempFiles.push(debugOverridePath)

  const fileArgs = composeFileArgs(addonKeys)

  console.log(`\n  ${DIM}Restarting ${DEBUG_SERVICE} in debug mode (port 9229)…${RESET_COLOR}\n`)
  // Stop the service first so the override takes effect cleanly
  spawnSync('docker', ['compose', ...fileArgs, 'stop', DEBUG_SERVICE], { cwd: ROOT, stdio: 'inherit' })

  // Start detached with the debug command override — returns immediately
  const result = spawnSync(
    'docker',
    ['compose', ...fileArgs, '-f', debugOverridePath, 'up', '-d', '--no-deps', DEBUG_SERVICE],
    { cwd: ROOT, stdio: 'inherit' }
  )

  if (result.status === 0) {
    console.log(
      `\n  ${CYAN}🐛${RESET_COLOR}  ${DEBUG_SERVICE} running in debug mode on port 9229.\n` +
        `  ${DIM}Use 'down' to stop, or attach your debugger to localhost:9229.${RESET_COLOR}\n`
    )
  }

  if (!_interactive) process.exit(result.status ?? 0)
  return result.status ?? 0
}

function cmdReset(dryRun) {
  console.log(`\n  ${YELLOW}⚠${RESET_COLOR}  RESET: This will remove all containers, volumes, and local images.\n`)

  const composeFiles = ['compose.grants-ui.yml', 'compose.land-grants.yml']

  for (const file of composeFiles) {
    console.log(
      `  ${DIM}▶${RESET_COLOR}  docker compose -f ${file} -f compose.infra.yml down --volumes --remove-orphans --rmi local\n`
    )

    if (!dryRun) {
      spawnSync(
        'docker',
        ['compose', '-f', file, '-f', 'compose.infra.yml', 'down', '--volumes', '--remove-orphans', '--rmi', 'local'],
        {
          cwd: ROOT,
          stdio: 'inherit'
        }
      )
    }
  }

  const volList = spawnSync('docker', ['volume', 'ls', '--format', '{{.Name}}'], { encoding: 'utf8' })
  const anonVols = (volList.stdout ?? '')
    .trim()
    .split('\n')
    .filter((v) => /^[a-f0-9]{64}$/.test(v))

  if (anonVols.length) {
    console.log(`\n  ${DIM}Removing ${anonVols.length} anonymous volume(s)…${RESET_COLOR}\n`)
    if (!dryRun) {
      spawnSync('docker', ['volume', 'rm', ...anonVols], { cwd: ROOT, stdio: 'inherit' })
    } else {
      console.log(`  ${DIM}▶${RESET_COLOR}  docker volume rm ${anonVols.join(' ')}\n`)
    }
  }

  // Remove specific defradigital images (mirrors docker:reset npm script)
  const resetImages = [
    'defradigital/fg-gas-backend',
    'defradigital/grants-ui-dal-stub',
    'defradigital/land-grants-api',
    'defradigital/land-grants-postgres-seeded'
  ]
  console.log(`\n  ${DIM}Removing defradigital images…${RESET_COLOR}\n`)
  if (!dryRun) {
    spawnSync('docker', ['rmi', '-f', ...resetImages], { cwd: ROOT, stdio: 'inherit' })
  } else {
    console.log(`  ${DIM}▶${RESET_COLOR}  docker rmi -f ${resetImages.join(' ')}\n`)
  }

  // Remove named postgres volume (mirrors docker:reset npm script)
  const postgresVolume = 'grants-ui_postgres_data'
  console.log(`  ${DIM}Removing volume ${postgresVolume}…${RESET_COLOR}\n`)
  if (!dryRun) {
    spawnSync('docker', ['volume', 'rm', '-f', postgresVolume], { cwd: ROOT, stdio: 'inherit' })
  } else {
    console.log(`  ${DIM}▶${RESET_COLOR}  docker volume rm -f ${postgresVolume}\n`)
  }

  console.log(`  ${DIM}Removing local SonarQube stack…${RESET_COLOR}\n`)
  if (!dryRun) {
    spawnSync('docker', ['compose', '-f', SONAR.composeFile, 'down', '--volumes'], { cwd: ROOT, stdio: 'inherit' })
    try {
      fs.unlinkSync(SONAR.stateFile)
    } catch {
      /* not bootstrapped — nothing to clean */
    }
  } else {
    console.log(`  ${DIM}▶${RESET_COLOR}  docker compose -f ${SONAR.composeFile} down --volumes\n`)
  }

  if (!dryRun) {
    clearState()
    console.log(`  ${GREEN}✔${RESET_COLOR}  Reset complete.\n`)
  }
  return 0
}

function cmdRestart(services, dryRun) {
  if (!services || !services.length) {
    console.log(`\n  ${YELLOW}⚠${RESET_COLOR}  No running containers to restart.\n`)
    if (!_interactive) process.exit(0)
    return 0
  }

  // Derive compose file args from the running stack (fall back to saved state)
  const composeFilesFromLabels = getRunningComposeFiles()
  let addonKeys = []
  if (composeFilesFromLabels) {
    addonKeys = ADDONS.filter((a) => composeFilesFromLabels.some((f) => f.endsWith(a.composeFile))).map((a) => a.key)
  } else {
    const state = loadState()
    if (state) addonKeys = state.addons
  }
  // Include any saved local image overrides so the recreate picks up :local images
  const localImages = getLocalImages()
  const savedState = loadState()
  const localServiceKeys = savedState
    ? (savedState.localServices ?? []).filter((k) => localImages.has(k + ':local'))
    : []
  const fileArgs = composeFileArgs(addonKeys, localServiceKeys)

  console.log(`\n  ${DIM}Restarting ${services.length} container(s): ${services.join(', ')}…${RESET_COLOR}\n`)
  // Recreate (not plain restart) so freshly built local images and the override mapping take effect
  const status = runCompose([...fileArgs, 'up', '-d', '--no-deps', '--force-recreate', ...services], dryRun)
  if (status === 0 && !dryRun) {
    console.log(`  ${GREEN}✔${RESET_COLOR}  Restarted: ${services.join(', ')}.\n`)
  }
  if (status !== 0 && !_interactive) process.exit(status)
  return status
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`
${BOLD}${CYAN}Grants TUI${RESET_COLOR}  ${DIM}v${VERSION}${RESET_COLOR}

${BOLD}Usage:${RESET_COLOR}
  gt                                  interactive mode
  gt <command> [options]

  Tip: run ${CYAN}npm link${RESET_COLOR} once to use ${CYAN}gt${RESET_COLOR} directly.
  If ${CYAN}gt${RESET_COLOR} collides with another tool, the ${CYAN}gtx${RESET_COLOR} alias runs the same command.
  Alternative: ${DIM}node tools/grants-tui.js${RESET_COLOR}

${BOLD}Commands:${RESET_COLOR}
  up      Start containers
  down    Stop containers (uses saved state — no need to re-select)
  debug   Restart grants-ui in debug mode (detached, port 9229)
  restart Restart running containers (selectable; uses --no-deps)
  test    Run tests: ${TEST_TARGETS.map((t) => t.key).join(' | ')} (default: ${TEST_TARGETS[0].key})
  journey Run a Journey Runner journey headlessly (${listJourneys().join(' | ')})
  sonar   Run SonarQube analysis against a local server (--changed scopes to PR files; --down stops it)
  snyk    Run Snyk dependency vulnerability scan (same as CI; needs a Snyk login — see below)
  check   Pre-PR full check: all test suites + snyk + PR-scoped sonar (runs every step, summarises)
  reset   Full teardown: containers + volumes + local images

${BOLD}Addon flags (for 'up'):${RESET_COLOR}
${ADDONS.map((a) => `  --${a.key.padEnd(16)} ${a.description}`).join('\n')}

${BOLD}Other flags:${RESET_COLOR}
  --scale <n>    Scale grants-ui and grants-ui-backend (use with --ha)
  --dry-run      Print commands without running them
  --help         Show this help
  --version      Show version number

${BOLD}Journey flags (for 'journey'):${RESET_COLOR}
  --crn <crn>      DefraID CRN to sign in as (default: the journey's allowlisted CRN, e.g. woodland → 1100943757)
  --stop <n|sect>  Stop before step <n> (1-indexed) or run only section <sect>
  --parcel <ref>   Land parcel the map step selects, e.g. SD6843-7039 (overrides the step's own value)
  --mock-no-actions  Make land parcels report no eligible actions (shows the map page's error)
  --headed         Watch it run in your installed Google Chrome (headless uses bundled Chromium)
  --clear          Flush saved application state first (so --stop starts at step 1)
  --base-url <url> App base URL (auto: https://localhost:4000 on --ha, else http://localhost:3000)
  --skip-install   Skip 'playwright install chromium'
  ${DIM}Full journey/section reference: docs/DEV-TOOLS.md ("Run from the CLI")${RESET_COLOR}

${BOLD}Snyk auth (for 'snyk'):${RESET_COLOR}
  One-time login — no org/paid token needed, a FREE personal Snyk account works:
    1. create a free account at https://snyk.io
    2. snyk auth                     # opens a browser, links that account, stores a local token
  Or set a token instead (what CI uses):
    export SNYK_TOKEN=<api-token>    # from https://app.snyk.io/account
  If a previous login stopped working (SNYK-0003 / 400), it's a stale token:
    snyk config clear && snyk auth   # reset then log in again

${BOLD}Examples:${RESET_COLOR}
  gt                                 # interactive
  gt up                              # core only
  gt up --land-grants --gas
  gt up --ha --scale 3
  gt down                            # stops whatever was started
  gt debug
  gt restart
  gt test                            # unit tests (default)
  gt test acceptance                 # docker-based acceptance journeys
  gt journey woodland                # walk the woodland journey headlessly
  gt journey example-grant-with-auth --stop 8 --headed   # watch it, stop before step 8
  gt journey grasslands --parcel SD6843-7039             # drive the map step to a specific parcel
  gt journey grasslands --mock-no-actions --headed       # see the "no actions available" error on the map page
  gt sonar                           # local SonarQube scan of src/
  gt sonar --changed                 # scope scan to src files changed vs main (approx. CI PR view)
  gt sonar --down                    # stop the local SonarQube server
  gt snyk                            # Snyk dependency vulnerability scan
  gt check                           # pre-PR full check: all tests + snyk + PR-scoped sonar
  gt reset
`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2)

  sweepOldLogs()

  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(`Grants TUI v${VERSION}`)
    process.exit(0)
  }

  const dryRun = argv.includes('--dry-run')

  // Validate args before doing anything else — catch unrecognised flags/commands early
  {
    const knownCmds = ['up', 'down', 'debug', 'restart', 'reset', 'test', 'sonar', 'snyk', 'check', 'journey']
    // Test targets are valid positionals only after the `test` command
    const testTargetKeys = argv.includes('test') ? TEST_TARGETS.map((t) => t.key) : []
    // The journey slug is a free positional straight after the `journey` command.
    const journeyIdx = argv.indexOf('journey')
    const knownFlags = [
      '--dry-run',
      '--help',
      '-h',
      '--version',
      '-v',
      '--scale',
      '--land-grants',
      '--gas',
      '--ha',
      '--down',
      '--skip-tests',
      '--changed',
      '--crn',
      '--stop',
      '--parcel',
      '--mock-no-actions',
      '--headed',
      '--clear',
      '--base-url',
      '--skip-install',
      ...LOCAL_SERVICES.map((s) => `--local-${s.key}`)
    ]
    // Flags that consume the following positional as their value — so it isn't
    // mistaken for an unknown command.
    const valueFlagIdxs = ['--scale', '--crn', '--stop', '--parcel', '--base-url']
      .map((f) => argv.indexOf(f))
      .filter((i) => i !== -1)
      .map((i) => i + 1)
    const unknownCmd = argv.find(
      (a, i) =>
        !a.startsWith('-') &&
        !knownCmds.includes(a) &&
        !testTargetKeys.includes(a) &&
        !valueFlagIdxs.includes(i) &&
        // the journey slug positional (immediately after `journey`) is allowed
        !(journeyIdx !== -1 && i === journeyIdx + 1)
    )
    const unknownFlag = argv.filter((a) => a.startsWith('-')).find((a) => !knownFlags.includes(a))
    if (unknownCmd) {
      console.error(`\n  ${RED}✖${RESET_COLOR}  Unknown command: '${unknownCmd}'. Run with --help for usage.\n`)
      process.exit(1)
    }
    if (unknownFlag) {
      console.error(`\n  ${RED}✖${RESET_COLOR}  Unknown option: '${unknownFlag}'. Run with --help for usage.\n`)
      process.exit(1)
    }
  }

  const testInvoked = argv.includes('test')

  const testTargets = testInvoked
    ? (() => {
        const picked = TEST_TARGETS.filter((t) => argv.includes(t.key)).map((t) => t.key)
        return picked.length ? picked : [TEST_TARGETS[0].key]
      })()
    : []
  const testNeedsDocker = testTargets.some((k) => TEST_TARGETS.find((t) => t.key === k)?.needsDocker)
  const snykInvoked = argv.includes('snyk')
  // `journey` drives a browser against localhost:3000, which may be a plain
  // `npm run dev` rather than the Docker stack — don't force a Docker check.
  const journeyInvoked = argv.includes('journey')

  // Preflight: ensure Docker is available and running (skipped for --dry-run so
  // offline/CI usage works, and for test/snyk/journey runs that don't drive containers)
  if (!dryRun && !(testInvoked && !testNeedsDocker) && !snykInvoked && !journeyInvoked) {
    const dockerCheck = spawnSync('docker', ['info'], { encoding: 'utf8', stdio: 'pipe' })
    if (dockerCheck.status !== 0 || dockerCheck.error) {
      console.error(
        `\n  ${RED}✖${RESET_COLOR}  Docker is not running or not installed. Please start Docker Desktop first.\n`
      )
      process.exit(1)
    }
  }

  // Non-interactive commands
  if (argv.includes('down')) {
    releaseStdin()
    cmdDown(dryRun)
    return
  }
  if (argv.includes('debug')) {
    releaseStdin()
    cmdDebug()
    return
  }
  if (argv.includes('restart')) {
    releaseStdin()
    cmdRestart(getRunningServices(), dryRun)
    return
  }
  if (argv.includes('reset')) {
    releaseStdin()
    cmdReset(dryRun)
    return
  }
  if (testInvoked) {
    releaseStdin()
    let status = 0
    for (const key of testTargets) {
      status = cmdTest(key, dryRun)
      if (status !== 0) break
    }
    process.exit(status)
  }
  if (argv.includes('sonar')) {
    releaseStdin()
    const code = await cmdSonar({
      dryRun,
      down: argv.includes('--down'),
      skipTests: argv.includes('--skip-tests'),
      changed: argv.includes('--changed')
    })
    process.exit(code)
  }
  if (snykInvoked) {
    releaseStdin()
    process.exit(cmdSnyk(dryRun))
  }
  if (argv.includes('check')) {
    releaseStdin()
    process.exit(await cmdCheck(dryRun))
  }
  if (argv.includes('journey')) {
    releaseStdin()
    const journeyIdx = argv.indexOf('journey')
    const slug = argv[journeyIdx + 1] && !argv[journeyIdx + 1].startsWith('-') ? argv[journeyIdx + 1] : ''
    const valueOf = (flag) => {
      const i = argv.indexOf(flag)
      return i !== -1 ? argv[i + 1] : undefined
    }
    // Default the base URL to match the running stack: the HA addon fronts the
    // app with an HTTPS nginx proxy on 4000, everything else serves plain HTTP on
    // 3000. An explicit --base-url always wins.
    const baseUrl = valueOf('--base-url') ?? journeyBaseUrl()
    const opts = {
      crn: valueOf('--crn'),
      stop: valueOf('--stop'),
      parcel: valueOf('--parcel'),
      mockNoActions: argv.includes('--mock-no-actions'),
      baseUrl,
      headed: argv.includes('--headed'),
      clear: argv.includes('--clear'),
      skipInstall: argv.includes('--skip-install')
    }
    process.exit(cmdJourney(slug, opts, dryRun))
  }
  if (argv.includes('up')) {
    const flaggedAddons = ADDONS.filter((a) => argv.includes(`--${a.key}`)).map((a) => a.key)
    const scaleIdx = argv.indexOf('--scale')
    let scale = null
    if (scaleIdx !== -1) {
      scale = parseInt(argv[scaleIdx + 1], 10)
      if (!Number.isInteger(scale) || scale < 1) {
        console.error(`\n  ${RED}✖${RESET_COLOR}  --scale needs a positive integer (e.g. --scale 2).\n`)
        process.exit(1)
      }
    }
    const localServices = LOCAL_SERVICES.filter((s) => argv.includes(`--local-${s.key}`)).map((s) => s.key)
    releaseStdin()
    cmdUp(flaggedAddons, scale, dryRun, localServices)
    return
  }

  // ── Interactive mode ──────────────────────────────────────────────────────
  if (!process.stdin.isTTY) {
    console.error('No command given and stdin is not a TTY. Run with --help for usage.')
    process.exit(1)
  }

  // SIGINT handler: restore terminal state if Ctrl+C hits outside raw mode
  process.on('SIGINT', () => {
    process.stdout.write(ALT_SCREEN_EXIT + SHOW_CURSOR)
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(false)
      } catch {
        /* ignore */
      }
    }
    process.exit(130)
  })

  // Enter alternate screen buffer so the TUI leaves no residue in scroll-back
  process.stdout.write(ALT_SCREEN_ENTER + HIDE_CURSOR)
  _interactive = true

  // Interactive loop — keeps returning to main menu until user quits
  // Run status on first entry so the user sees what's running immediately
  const initialRunning = getRunningComposeFiles()
  let statusLine = buildStatusLine(initialRunning)

  while (true) {
    const savedState = loadState()
    const runningComposeFiles = getRunningComposeFiles()
    const containersRunning = !!runningComposeFiles

    const localCount = (savedState && savedState.localServices && savedState.localServices.length) || 0
    const formDefSelectionCount = getSelectedFormDefIds(savedState).length
    const localFormDefsOn = formDefSelectionCount > 0
    const localActiveParts = []
    if (localCount) localActiveParts.push(`${localCount} local image${localCount > 1 ? 's' : ''}`)
    if (formDefSelectionCount) {
      localActiveParts.push(`${formDefSelectionCount} form-def override${formDefSelectionCount > 1 ? 's' : ''}`)
    }
    const localDesc = localActiveParts.length
      ? `${PURPLE}${localActiveParts.join(' + ')}${RESET_COLOR}`
      : 'Override services & form definitions locally'
    const menuItems = [
      {
        key: 'up',
        label: 'up ⇢',
        description: containersRunning ? 'Already running — use restart, or reset first' : 'Start containers',
        disabled: containersRunning
      },
      { key: 'down', label: 'down', description: 'Stop containers (uses saved state)', disabled: !containersRunning },
      { key: 'debug', label: 'debug', description: 'Attach debugger to grants-ui', disabled: !containersRunning },
      {
        key: 'restart',
        label: 'restart ⇢',
        description: 'Restart selected running containers (--no-deps)',
        disabled: !containersRunning
      },
      { key: 'local', label: 'local ⇢', description: localDesc },
      // Only while form-def overrides are active, surface a direct action right
      // below `local` to re-publish the YAML overrides into Mongo, so devs can
      // iterate on the definition and refresh without toggling the override
      // off and on again. Rendered in the same purple as the override status.
      ...(localFormDefsOn
        ? [
            {
              key: 'refresh-overrides',
              // Thin space before the glyph nudges it into alignment with the
              // other menu labels. Colour is applied in radioMenu's draw loop so
              // it can be faded at rest and full purple when highlighted.
              label: '\u2009↳ refresh overrides',
              description: containersRunning
                ? 'Re-apply local form-def overrides'
                : 'Start containers first to refresh overrides',
              disabled: !containersRunning
            }
          ]
        : []),
      { key: 'test', label: 'test ⇢', description: 'Run unit / contract / acceptance tests' },
      {
        key: 'journey',
        label: 'journey ⇢',
        description: 'Walk a Journey Runner journey headlessly',
        disabled: !containersRunning
      },
      {
        key: 'sonar',
        label: 'sonar',
        description: 'Scan src/ on a local SonarQube server (left up for the dashboard)'
      },
      { key: 'snyk', label: 'snyk', description: 'Snyk dependency vulnerability scan (same as CI)' },
      { key: 'check', label: 'pre-pr check', description: 'Run all tests, Snyk and a PR-scoped Sonar scan (CI gates)' },
      { key: 'reset', label: 'reset ⇢', description: 'Full teardown — removes volumes & images' }
    ]

    // GAS status is served by mockserver only when the GAS addon (compose.gas.yml)
    // isn't running. In that mode surface the current mocked status on the status
    // line (yellow, fenced off by a divider) and let `g` edit it.
    const gasMockActive = containersRunning && !runningComposeFiles.some((f) => f.endsWith('compose.gas.yml'))
    const gasStatus = gasMockActive ? await getGasStatus() : null
    const gasReachable = gasStatus !== null
    // Commands that return via `continue` leave `statusLine` empty; fall back to
    // the default running status line so coming back from a submenu (journey,
    // local, …) still shows the "Core" chip rather than just the GAS badge.
    const baseStatusLine = statusLine || buildStatusLine(runningComposeFiles)
    const menuStatusLine = gasReachable
      ? `${baseStatusLine}  ${GAS_DIVIDER}  ${gasStatusSegment(gasStatus)}`
      : baseStatusLine
    const menuHint = gasReachable ? '↑ ↓  navigate    enter → select    g → set GAS status    esc → quit' : ''

    const command = await radioMenu(menuItems, 'What do you want to do?', {
      statusLine: menuStatusLine,
      hint: menuHint,
      gasEditable: gasReachable
    })
    statusLine = ''

    if (command === '__gas__') {
      // Common statuses offered as selectable presets, with a free-form field as
      // the last option for anything else. Land the cursor on the preset matching
      // the current status (leaving the field blank); if it's not a preset,
      // pre-fill the field with it "selected" so it's obvious you overtype it.
      const GAS_STATUS_OPTIONS = ['RECEIVED', 'STATUS_AWAITING_CLAIM']
      const current = gasStatus === 'RECEIVED (default)' ? 'RECEIVED' : (gasStatus ?? '')
      const matched = GAS_STATUS_OPTIONS.includes(current) ? current : null
      const nextStatus = await promptTextWithOptions('Set mocked GAS application status', {
        options: GAS_STATUS_OPTIONS,
        selectedOption: matched,
        initial: matched ? '' : current,
        hint: '↑ ↓  move    type to edit    enter → save    esc → cancel'
      })
      const trimmed = nextStatus?.trim()
      if (trimmed) {
        const ok = await setGasStatus(trimmed)
        // No "GAS status set to …" confirmation — the yellow GAS badge in the
        // status line already reflects the new value on the next render, so just
        // fall back to the default running status line (and only surface a line
        // when the update failed).
        statusLine = ok
          ? buildStatusLine(runningComposeFiles)
          : `${RED}✖${RESET_COLOR}  Failed to set GAS status — is mockserver running?`
      }
      continue
    }

    if (command === '__quit__') {
      process.stdout.write(ALT_SCREEN_EXIT + SHOW_CURSOR)
      process.stdin.destroy()
      process.exit(0)
    }

    if (command === 'restart') {
      // Let the user pick which containers to restart (none selected by default; non-running are disabled)
      // `mongo-ready` is a one-shot readiness helper, never a restartable container — always hide it
      const runningServices = getRunningServices().filter((s) => s !== RESTART_HIDDEN_SERVICE)
      if (!runningServices.length) {
        statusLine = `${DIM}No running containers to restart${RESET_COLOR}`
        continue
      }
      const runningSet = new Set(runningServices)
      const allServices = getAllServices().filter((s) => s !== RESTART_HIDDEN_SERVICE)
      const serviceNames = allServices.length ? allServices : runningServices
      const serviceItems = serviceNames.map((s) => ({
        key: s,
        label: s,
        description: runningSet.has(s) ? '' : `${DIM}not running${RESET_COLOR}`,
        disabled: !runningSet.has(s),
        selected: false
      }))
      const restartToggled = await toggleMenu(serviceItems, 'Select containers to restart  (restarts with --no-deps)')
      if (restartToggled === null) {
        // ESC — back to main menu
        continue
      }
      const selectedServices = restartToggled.filter((i) => i.selected).map((i) => i.key)
      if (!selectedServices.length) {
        statusLine = `${DIM}No containers selected — restart cancelled${RESET_COLOR}`
        continue
      }

      pauseStdin()
      const restartStatus = cmdRestart(selectedServices, dryRun)
      resumeStdin()

      const postRestartFiles = getRunningComposeFiles()
      statusLine =
        restartStatus !== 0
          ? `${RED}✖${RESET_COLOR}  Docker exited with code ${restartStatus} — check output above`
          : buildStatusLine(postRestartFiles)
      continue
    }

    if (command === 'up') {
      // Show addon toggle menu
      const addonItems = ADDONS.map((a) => ({
        ...a,
        selected: savedState ? savedState.addons.includes(a.key) : false
      }))

      const toggled = await toggleMenu(addonItems, 'Select addons  (core services always included)')

      if (toggled === null) {
        // ESC pressed — go back to main menu
        continue
      }

      const selectedAddons = toggled.filter((a) => a.selected).map((a) => a.key)

      let scale = null
      if (selectedAddons.includes('ha')) {
        const chosen = await promptScale()
        if (chosen === null) continue // ESC from scale menu — back to main
        scale = chosen
      }

      // Use saved local service selections (set via the 'local' menu item)
      const localImages = getLocalImages()
      const selectedLocalServices = savedState
        ? (savedState.localServices ?? []).filter((k) => localImages.has(k + ':local'))
        : []

      // Pause stdin (keep it open) and exit alt screen before running docker
      pauseStdin()
      const upStatus = cmdUp(selectedAddons, scale, dryRun, selectedLocalServices)
      resumeStdin()

      const postUpFiles = getRunningComposeFiles()
      if (upStatus !== 0) {
        statusLine = `${RED}✖${RESET_COLOR}  Docker exited with code ${upStatus} — check docker logs`
      } else {
        const startedSuffix = _lastUpElapsedSeconds ? `  ${DIM}Started in ${_lastUpElapsedSeconds}s${RESET_COLOR}` : ''
        statusLine = `${buildStatusLine(postUpFiles)}${startedSuffix}`
      }
      continue
    }

    if (command === 'local') {
      // Dedicated local image + form-definition override selection — only visited
      // when the user wants to change what runs locally.
      const localImages = getLocalImages()
      const previousLocalServices = (savedState && savedState.localServices) ?? []
      const previousFormDefIds = getSelectedFormDefIds(savedState)
      const localServiceItems = LOCAL_SERVICES.map((s) => ({
        ...s,
        label: s.key,
        description: localImages.has(s.key + ':local') ? 'local image available' : 'not available locally',
        disabled: !localImages.has(s.key + ':local'),
        selected: savedState
          ? (savedState.localServices ?? []).includes(s.key) && localImages.has(s.key + ':local')
          : false
      }))

      // One toggle per discoverable form-definition override (folder + sibling
      // `grants-config-*` repos). The `formdef|` key prefix distinguishes these
      // rows from the local-image service rows when reading the toggle result.
      const FORMDEF_KEY_PREFIX = 'formdef|'
      const overrideSources = listOverrideSources()
      const formDefItems = overrideSources.map((o) => ({
        key: `${FORMDEF_KEY_PREFIX}${o.id}`,
        label: `form-def: ${o.grant}`,
        description: `${o.source} → ${o.bumpedVersion}`,
        disabled: false,
        selected: previousFormDefIds.includes(o.id)
      }))

      const localTitle = containersRunning
        ? 'Local overrides  (changes apply now)'
        : "Local overrides  (applied on next 'up')"
      const localToggled = await toggleMenu([...formDefItems, ...localServiceItems], localTitle)
      if (localToggled === null) {
        // ESC — back to main menu
        continue
      }
      const newLocalServices = localToggled
        .filter((i) => i.selected && !i.disabled && !i.key.startsWith(FORMDEF_KEY_PREFIX))
        .map((i) => i.key)
      const newFormDefIds = localToggled
        .filter((i) => i.selected && !i.disabled && i.key.startsWith(FORMDEF_KEY_PREFIX))
        .map((i) => i.key.slice(FORMDEF_KEY_PREFIX.length))
      // Persist local selections into saved state (create state if none exists)
      const currentState = loadState() || { addons: [], scale: null, localServices: [], localFormDefSelections: [] }
      saveState(currentState.addons, currentState.scale, newLocalServices, newFormDefIds)

      // When containers are already running, apply changes immediately: restart
      // any service whose local-image setting changed (--no-deps) and reconcile
      // the form-definition overrides — remove the ones just deselected and
      // (re)publish the ones now selected.
      if (containersRunning) {
        const changedKeys = LOCAL_SERVICES.map((s) => s.key).filter(
          (k) => previousLocalServices.includes(k) !== newLocalServices.includes(k)
        )
        const runningSet = new Set(getRunningServices())
        const servicesToRestart = changedKeys
          .map((k) => LOCAL_SERVICES.find((s) => s.key === k)?.composeService)
          .filter((name) => name && runningSet.has(name))

        const addedFormDefIds = newFormDefIds.filter((id) => !previousFormDefIds.includes(id))
        const removedFormDefIds = previousFormDefIds.filter((id) => !newFormDefIds.includes(id))
        const formDefsChanged = addedFormDefIds.length > 0 || removedFormDefIds.length > 0
        const messages = []
        let hadError = false

        if (servicesToRestart.length) {
          pauseStdin()
          const restartStatus = cmdRestart(servicesToRestart, dryRun)
          resumeStdin()
          if (restartStatus !== 0) {
            hadError = true
            statusLine = `${RED}✖${RESET_COLOR}  Docker exited with code ${restartStatus} — check output above`
          } else {
            messages.push(`Restarted: ${servicesToRestart.join(', ')}`)
          }
        }

        if (!hadError && formDefsChanged) {
          pauseStdin()
          let applyStatus = 0
          if (newFormDefIds.length === 0) {
            // Everything turned off — a full disable (marker sweep) reverts every
            // grant to its repo version and clears any leftover override.
            applyStatus = runApplyFormDefs('disable', dryRun)
          } else {
            if (applyStatus === 0 && removedFormDefIds.length) {
              applyStatus = runApplyFormDefs('disable', dryRun, removedFormDefIds)
            }
            if (applyStatus === 0 && addedFormDefIds.length) {
              applyStatus = runApplyFormDefs('enable', dryRun, addedFormDefIds)
            }
          }
          resumeStdin()
          if (applyStatus !== 0) {
            hadError = true
            statusLine = `${RED}✖${RESET_COLOR}  Form-definition override change failed — check output above`
          } else {
            messages.push(`Form-def overrides: ${newFormDefIds.length} active`)
          }
        }

        if (hadError) {
          continue
        }
        if (messages.length) {
          statusLine = `${PURPLE}✔  ${messages.join('  ·  ')}${RESET_COLOR}`
          continue
        }
      }

      const n = newLocalServices.length
      const summaryParts = []
      if (n) summaryParts.push(`${n} service${n > 1 ? 's' : ''} using local image${n > 1 ? 's' : ''}`)
      if (newFormDefIds.length) {
        summaryParts.push(`${newFormDefIds.length} form-def override${newFormDefIds.length > 1 ? 's' : ''}`)
      }
      statusLine = summaryParts.length
        ? `${PURPLE}✔  ${summaryParts.join('  ·  ')}${RESET_COLOR}`
        : `${DIM}Local overrides updated${RESET_COLOR}`
      continue
    }

    if (command === 'refresh-overrides') {
      // Re-publish the selected YAML overrides into Mongo so freshly-edited
      // definitions (in the local folder or a sibling repo) are served without
      // toggling the override off and on.
      const refreshIds = getSelectedFormDefIds(loadState())
      pauseStdin()
      const applyStatus = refreshIds.length ? runApplyFormDefs('enable', dryRun, refreshIds) : 0
      resumeStdin()
      statusLine =
        applyStatus !== 0
          ? `${RED}✖${RESET_COLOR}  Form-def overrides refresh failed — check output above`
          : `${PURPLE}✔  Form-def overrides refreshed${RESET_COLOR}`
      continue
    }

    if (command === 'test') {
      const testItems = TEST_TARGETS.map((t) => ({
        key: t.key,
        label: t.label,
        description: t.note ? `${t.description}  ${DIM}(${t.note})${RESET_COLOR}` : t.description,
        selected: false
      }))
      const toggled = await toggleMenu(testItems, 'Select test suites to run')
      if (toggled === null) {
        continue
      }
      const selected = toggled.filter((i) => i.selected).map((i) => i.key)
      if (!selected.length) {
        statusLine = `${DIM}No suites selected — test run cancelled${RESET_COLOR}`
        continue
      }

      pauseStdin()
      const passed = []
      let failure = null
      for (const key of selected) {
        const code = cmdTest(key, dryRun)
        if (code !== 0) {
          failure = { key, code }
          break
        }
        passed.push(key)
      }
      resumeStdin()

      if (failure) {
        const skipped = selected.length - passed.length - 1
        const skippedNote = skipped > 0 ? ` — skipped ${skipped} remaining` : ''
        statusLine = `${RED}✖${RESET_COLOR}  ${failure.key} failed (exit ${failure.code})${skippedNote} — output: ${testLogPath(failure.key)}`
      } else {
        const outputs = !dryRun && passed.length ? ` — output: ${passed.map((k) => testLogPath(k)).join(', ')}` : ''
        statusLine = `${PURPLE}✔  Passed: ${passed.join(', ')}${RESET_COLOR}${outputs}`
      }
      continue
    }

    if (command === 'journey') {
      const journeys = listJourneys()
      if (!journeys.length) {
        statusLine = `${DIM}No journey definitions found${RESET_COLOR}`
        continue
      }
      // `esc` on the first prompt (the journey list) cancels back to the main menu;
      // on every later prompt it steps back one level, so its hint says "back".
      const CANCEL_HINT = '↑ ↓  navigate    enter → select    esc → cancel'
      const BACK_HINT = '↑ ↓  navigate    enter → select    esc → back'

      // The journey setup is a sequence of prompts walked as a little state machine
      // so `esc` goes back one prompt rather than abandoning the whole flow. `dir`
      // tracks whether we're moving forwards (a selection) or backwards (an esc);
      // prompts whose question doesn't apply (single-CRN journeys, non-map journeys,
      // headless runs) are skipped in whichever direction we're travelling, so
      // back-navigation always lands on the previous *visible* prompt. Only `esc` on
      // step 0 — or an explicit "Cancel" — returns to the main menu.
      let chosen = ''
      let crn
      let mode
      let clearChoice
      let mockNoActions = false
      let stop
      let cancelledStatus = null
      let step = 0
      let dir = 1
      const LAST_STEP = 6

      while (step >= 0 && step <= LAST_STEP) {
        if (step === 0) {
          // Select a journey. Annotate each with the CRN it needs (or a warning).
          const journeyItems = journeys.map((slug) => {
            const crns = journeyCrnOptions(slug)
            const description = wontCompleteReason(slug)
              ? `${YELLOW}⚠ may not complete${RESET_COLOR}`
              : `${DIM}CRN ${crns[0]?.crn ?? '—'}${RESET_COLOR}`
            return { key: slug, label: slug, description }
          })
          const picked = await radioMenu(journeyItems, 'Select a journey to run', { hint: CANCEL_HINT })
          if (picked === '__quit__') {
            step = -1 // esc on the first prompt → back to the main menu
            break
          }
          chosen = picked
          dir = 1
          step = 1
        } else if (step === 1) {
          // Pick the CRN to sign in as. Journeys with more than one known-good CRN
          // prompt; a single option is used automatically (methane has none — the
          // won't-complete acknowledgement below covers it).
          const crnOptions = journeyCrnOptions(chosen)
          if (crnOptions.length <= 1) {
            crn = crnOptions[0]?.crn
            step += dir
            continue
          }
          const crnItems = crnOptions.map((o) => ({ key: o.crn, label: o.crn, description: o.note }))
          const pickedCrn = await radioMenu(crnItems, `Select a CRN for '${chosen}'`, { hint: BACK_HINT })
          if (pickedCrn === '__quit__') {
            dir = -1
            step -= 1
            continue
          }
          crn = pickedCrn
          dir = 1
          step = 2
        } else if (step === 2) {
          // Pick how to run it — headless (bundled Chromium) or headed (your Chrome).
          const modeItems = [
            { key: 'headless', label: 'headless', description: 'Run in the background (bundled Chromium)' },
            { key: 'headed', label: 'headed', description: 'Watch it in your installed Google Chrome' }
          ]
          const picked = await radioMenu(modeItems, `Run '${chosen}' — headed or headless?`, { hint: BACK_HINT })
          if (picked === '__quit__') {
            dir = -1
            step -= 1
            continue
          }
          mode = picked
          dir = 1
          step = 3
        } else if (step === 3) {
          // Choose whether to flush saved application state first — the same reset
          // the "Clear application state" footer link performs — so the run starts
          // from step 1 rather than resuming the furthest-reached page.
          const clearItems = [
            { key: 'keep', label: 'keep state', description: 'Resume from where this application left off' },
            {
              key: 'clear',
              label: 'clear state',
              description: 'Reset to step 1 (like the footer "Clear application state" link)'
            }
          ]
          const picked = await radioMenu(clearItems, `Clear application state for '${chosen}' before running?`, {
            hint: BACK_HINT
          })
          if (picked === '__quit__') {
            dir = -1
            step -= 1
            continue
          }
          clearChoice = picked
          dir = 1
          step = 4
        } else if (step === 4) {
          // For journeys known not to complete (e.g. farm-payments), make the user
          // acknowledge why before running — a selectable confirm, not just a keypress.
          const wontComplete = wontCompleteReason(chosen)
          if (!wontComplete) {
            step += dir
            continue
          }
          const ackItems = [
            {
              key: 'cancel',
              label: 'Cancel',
              description: 'Back to the menu'
            },
            {
              key: 'run',
              label: 'Run anyway',
              description: wontComplete.join(' ')
            }
          ]
          const ack = await radioMenu(
            ackItems,
            `${YELLOW}⚠  '${chosen}' will NOT complete — run anyway?${RESET_COLOR}`,
            {
              hint: BACK_HINT
            }
          )
          if (ack === '__quit__') {
            dir = -1
            step -= 1
            continue
          }
          if (ack !== 'run') {
            cancelledStatus = `${DIM}Journey '${chosen}' cancelled${RESET_COLOR}`
            step = -1
            break
          }
          dir = 1
          step = 5
        } else if (step === 5) {
          // Offer the land-parcel mock before the stop-page question, so a run can be
          // pointed at the "no eligible actions" path. The local seed gives every
          // parcel at least one action, so this is the only way to reach that page.
          // Only offered for journeys that actually have a map step.
          if (!journeySteps(chosen).some((s) => s.type === 'mapParcel')) {
            mockNoActions = false
            step += dir
            continue
          }
          const mockItems = [
            { key: 'off', label: 'API Data', description: 'Use whatever actions the land-grants API returns' },
            {
              key: 'no-actions',
              label: 'Mock no eligible actions',
              description: 'Land parcels report no actions — shows the error on the map page'
            }
          ]
          const pickedMock = await radioMenu(mockItems, `Land parcel actions for '${chosen}'?`, { hint: BACK_HINT })
          if (pickedMock === '__quit__') {
            dir = -1
            step -= 1
            continue
          }
          mockNoActions = pickedMock === 'no-actions'
          dir = 1
          step = 6
        } else if (step === 6) {
          // Headed only: let the user stop the browser on a chosen page. Lists every
          // page in the journey; picking one passes it as --stop so the run halts
          // there (on the page, before filling it) for inspection.
          if (mode !== 'headed') {
            stop = undefined
            step += dir
            continue
          }
          const steps = journeySteps(chosen)
          const stopItems = [
            { key: '__end__', label: 'Run to the end', description: 'Complete the whole journey' },
            ...steps.map((s, i) => ({
              key: String(i + 1),
              label: `${i + 1}. ${s.slug}`,
              description: s.name === s.slug ? '' : s.name
            }))
          ]
          const pickedStop = await radioMenu(stopItems, `Stop '${chosen}' on which page?`, { hint: BACK_HINT })
          if (pickedStop === '__quit__') {
            dir = -1
            step -= 1
            continue
          }
          stop = pickedStop !== '__end__' ? pickedStop : undefined
          dir = 1
          step = 7 // all prompts answered → run
        }
      }

      // esc on the first prompt (or an explicit Cancel) → back to the main menu.
      if (step < 0) {
        statusLine = cancelledStatus ?? ''
        continue
      }

      pauseStdin()
      const code = cmdJourney(
        chosen,
        {
          crn,
          stop,
          mockNoActions,
          baseUrl: journeyBaseUrl(),
          headed: mode === 'headed',
          clear: clearChoice === 'clear',
          acknowledged: true
        },
        dryRun
      )
      resumeStdin()

      statusLine =
        code === 0
          ? `${PURPLE}✔  Journey '${chosen}' completed${RESET_COLOR}`
          : `${RED}✖${RESET_COLOR}  Journey '${chosen}' did not complete (exit ${code}) — check output above`
      continue
    }

    if (command === 'sonar') {
      pauseStdin()
      const code = await cmdSonar({ dryRun })
      resumeStdin()

      const sonarLink = `${DIM}results: ${SONAR.hostUrl}${RESET_COLOR}`
      if (dryRun) {
        statusLine = `${DIM}Sonar dry-run complete${RESET_COLOR}`
      } else if (code === SONAR_EXIT.OK) {
        statusLine = `${PURPLE}✔  Quality gate passed${RESET_COLOR} — ${sonarLink}`
      } else if (code === SONAR_EXIT.GATE_FAILED) {
        statusLine = `${RED}✖  Quality gate FAILED${RESET_COLOR} — ${sonarLink}`
      } else {
        statusLine = `${RED}✖${RESET_COLOR}  Sonar run error — output: ${SONAR.logFile}`
      }
      continue
    }

    if (command === 'check') {
      pauseStdin()
      const code = await cmdCheck(dryRun)
      resumeStdin()
      statusLine = dryRun
        ? `${DIM}pre-pr check dry-run complete${RESET_COLOR}`
        : code === 0
          ? `${PURPLE}✔  pre-pr check passed${RESET_COLOR} — ${DIM}${CHECK.logFile}${RESET_COLOR}`
          : `${RED}✖  pre-pr check failed${RESET_COLOR} — summary: ${CHECK.logFile}`
      continue
    }

    if (command === 'snyk') {
      pauseStdin()
      const code = cmdSnyk(dryRun)
      resumeStdin()

      if (dryRun) {
        statusLine = `${DIM}Snyk dry-run complete${RESET_COLOR}`
      } else if (code === SNYK_EXIT.OK) {
        statusLine = `${PURPLE}✔  Snyk: no vulnerabilities found${RESET_COLOR}`
      } else if (code === SNYK_EXIT.VULNS) {
        statusLine = `${RED}✖  Snyk: vulnerabilities found${RESET_COLOR} — output: ${SNYK.logFile}`
      } else {
        statusLine = `${RED}✖${RESET_COLOR}  Snyk run error — not logged in? run 'snyk auth' (free account works) — output: ${SNYK.logFile}`
      }
      continue
    }

    // down / debug / reset — these hand off to docker (blocking) then return
    // Cache running files once per iteration to avoid redundant docker calls
    if (command === 'reset') {
      const confirmItems = [
        { key: 'yes', label: 'Yes', description: 'Remove all containers, volumes and local images' },
        { key: 'no', label: 'No', description: 'Cancel and return to main menu' }
      ]
      const confirmed = await radioMenu(confirmItems, `${YELLOW}⚠  Confirm reset?${RESET_COLOR}`, {
        hint: '↑ ↓  navigate    enter → select    esc → cancel'
      })
      if (confirmed !== 'yes') {
        statusLine = confirmed === '__quit__' ? '' : `${DIM}Reset cancelled${RESET_COLOR}`
        continue
      }
    }

    pauseStdin()
    let runStatus = 0
    if (command === 'down') runStatus = cmdDown(dryRun) ?? 0
    else if (command === 'debug') runStatus = cmdDebug() ?? 0
    else if (command === 'reset') runStatus = cmdReset(dryRun) ?? 0
    resumeStdin()

    const postRunFiles = getRunningComposeFiles()
    statusLine =
      runStatus !== 0
        ? `${RED}✖${RESET_COLOR}  Docker exited with code ${runStatus} — check output above`
        : buildStatusLine(postRunFiles)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

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
  FORM_DEFS_TOGGLE_KEY,
  GREEN,
  HIDE_CURSOR,
  LOCAL_FORM_DEFS_DIR,
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
  HEADER,
  padVisible,
  pauseStdin,
  promptScale,
  radioMenu,
  releaseStdin,
  renderScreen,
  resumeStdin,
  toggleMenu,
  visibleLen
} from './grants-tui/tui.js'
import { cmdTest, testLogPath } from './grants-tui/tests.js'
import { cmdSonar } from './grants-tui/sonar.js'

// Sweep of stale tool logs from tmpdir. macOS auto-clears windows tmpdir
// after ~3 days
function sweepOldLogs() {
  const dir = os.tmpdir()
  const now = Date.now()
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch (err) {
    console.error(`  ${DIM}log sweep skipped: ${err.message}${RESET_COLOR}`)
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

/** Recursively collect override definition files (*.yaml/*.yml) under the local-form-definitions folder */
function listLocalFormDefFiles(dir = LOCAL_FORM_DEFS_DIR) {
  const files = []
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listLocalFormDefFiles(full))
    } else if (/\.ya?ml$/i.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

/** True when at least one form-definition override file is present */
function hasLocalFormDefs() {
  return listLocalFormDefFiles().length > 0
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
  const services = {}
  for (const key of localServiceKeys) {
    const svc = LOCAL_SERVICES.find((s) => s.key === key)
    if (!svc) continue
    const localImage = svc.key + ':local'
    services[svc.composeService] = { image: localImage, pull_policy: 'never' }
  }
  if (!Object.keys(services).length) return null
  const content =
    'services:\n' +
    Object.entries(services)
      .map(([name, cfg]) => `  ${name}:\n    image: ${cfg.image}\n    pull_policy: ${cfg.pull_policy}`)
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

function saveState(addons, scale, localServices = [], localFormDefs = false) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ addons, scale, localServices, localFormDefs }, null, 2))
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
  const files = ['compose.yml']
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
  const labels = runningFiles
    .filter((f) => !f.includes('grants-ui-cli-local-override-') && !f.includes('grants-ui-cli-debug-override-'))
    .map((f) => {
      const base = f
        .split('/')
        .pop()
        .replace(/\.yml$/, '')
      if (base === 'compose') return 'core'
      const addon = ADDONS.find((a) => a.composeFile === base + '.yml')
      return addon ? addon.label : base
    })
  if (!labels.length) {
    return `${DIM}No containers running${RESET_COLOR}`
  }
  const state = loadState()
  const localKeys = state && state.localServices && state.localServices.length ? state.localServices : []
  const formDefsOn = !!(state && state.localFormDefs)
  const localBits = []
  if (localKeys.length) localBits.push(`images: ${localKeys.join(', ')}`)
  if (formDefsOn) localBits.push('form-def overrides')
  const localSuffix = localBits.length ? `  ${PURPLE}(local: ${localBits.join('; ')})${RESET_COLOR}` : ''
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
 * @param {'enable'|'disable'} mode
 * @param {boolean} [dryRun]
 * @returns {number}
 */
function runApplyFormDefs(mode, dryRun = false) {
  console.log(
    `\n  ${DIM}▶${RESET_COLOR}  ${mode === 'enable' ? 'Applying' : 'Removing'} local form-definition overrides…\n`
  )
  if (dryRun) return 0
  const result = spawnSync(process.execPath, [APPLY_FORM_DEFS_SCRIPT, mode], {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8'
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
    console.error(`  ${DIM}could not write check summary: ${err.message}${RESET_COLOR}`)
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
    const formDefsEnabled = loadState()?.localFormDefs ?? false
    saveState(selectedAddons, scale, localServices, formDefsEnabled)
    console.log(
      `  ${GREEN}✔${RESET_COLOR}  Containers started — run ${CYAN}gt down${RESET_COLOR} to stop. ${DIM}Started in ${elapsedSeconds}s${RESET_COLOR}\n`
    )
    // The stack is healthy (up --wait), so the repo definitions are ingested.
    // Reconcile the persisted Mongo volume to match the toggle: when enabled,
    // publish the overrides on top; when disabled, purge any override that
    // survived in the volume from a previous enabled session (a plain `down`
    // keeps the volume, so a stale bumped doc would otherwise keep being served
    // after disabling the toggle while the stack was stopped).
    if (formDefsEnabled) {
      runApplyFormDefs('enable', dryRun)
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
  const status1 = runCompose(['down', '--volumes', '--remove-orphans', '--rmi', 'local'], dryRun)
  if (status1 !== 0 && !_interactive) process.exit(status1)
  if (status1 !== 0) return status1

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
    const knownCmds = ['up', 'down', 'debug', 'restart', 'reset', 'test', 'sonar', 'snyk', 'check']
    // Test targets are valid positionals only after the `test` command
    const testTargetKeys = argv.includes('test') ? TEST_TARGETS.map((t) => t.key) : []
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
      ...LOCAL_SERVICES.map((s) => `--local-${s.key}`)
    ]
    const scaleValIdx = argv.indexOf('--scale')
    const unknownCmd = argv.find(
      (a, i) =>
        !a.startsWith('-') &&
        !knownCmds.includes(a) &&
        !testTargetKeys.includes(a) &&
        !(scaleValIdx !== -1 && i === scaleValIdx + 1)
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

  // Preflight: ensure Docker is available and running (skipped for --dry-run so
  // offline/CI usage works, and for test/snyk runs that don't drive containers)
  if (!dryRun && !(testInvoked && !testNeedsDocker) && !snykInvoked) {
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
  if (argv.includes('up')) {
    const flaggedAddons = ADDONS.filter((a) => argv.includes(`--${a.key}`)).map((a) => a.key)
    const scaleIdx = argv.indexOf('--scale')
    const scale = scaleIdx !== -1 ? parseInt(argv[scaleIdx + 1], 10) : null
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
    const containersRunning = !!getRunningComposeFiles()

    const localCount = (savedState && savedState.localServices && savedState.localServices.length) || 0
    const localFormDefsOn = !!(savedState && savedState.localFormDefs)
    const localActiveParts = []
    if (localCount) localActiveParts.push(`${localCount} local image${localCount > 1 ? 's' : ''}`)
    if (localFormDefsOn) localActiveParts.push('form-def overrides')
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
        key: 'sonar',
        label: 'sonar',
        description: 'Scan src/ on a local SonarQube server (left up for the dashboard)'
      },
      { key: 'snyk', label: 'snyk', description: 'Snyk dependency vulnerability scan (same as CI)' },
      { key: 'check', label: 'pre-pr check', description: 'Run all tests, Snyk and a PR-scoped Sonar scan (CI gates)' },
      { key: 'reset', label: 'reset ⇢', description: 'Full teardown — removes volumes & images' }
    ]

    const command = await radioMenu(menuItems, 'What do you want to do?', { statusLine })
    statusLine = ''

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
      // Dedicated local image override selection — only visited when user wants to change
      const localImages = getLocalImages()
      const previousLocalServices = (savedState && savedState.localServices) ?? []
      const previousLocalFormDefs = !!(savedState && savedState.localFormDefs)
      const localServiceItems = LOCAL_SERVICES.map((s) => ({
        ...s,
        label: s.key,
        description: localImages.has(s.key + ':local') ? 'local image available' : 'not available locally',
        disabled: !localImages.has(s.key + ':local'),
        selected: savedState
          ? (savedState.localServices ?? []).includes(s.key) && localImages.has(s.key + ':local')
          : false
      }))

      // Single all-grants toggle for local form-definition overrides.
      const formDefsAvailable = hasLocalFormDefs()
      const formDefsItem = {
        key: FORM_DEFS_TOGGLE_KEY,
        label: 'Local form-definition overrides (all grants)',
        description: formDefsAvailable ? 'override files present' : 'no override files found',
        disabled: !formDefsAvailable,
        selected: !!(savedState && savedState.localFormDefs) && formDefsAvailable
      }

      const localTitle = containersRunning
        ? 'Local overrides  (changes apply now)'
        : "Local overrides  (applied on next 'up')"
      const localToggled = await toggleMenu([formDefsItem, ...localServiceItems], localTitle)
      if (localToggled === null) {
        // ESC — back to main menu
        continue
      }
      const newLocalServices = localToggled
        .filter((i) => i.selected && !i.disabled && i.key !== FORM_DEFS_TOGGLE_KEY)
        .map((i) => i.key)
      const newLocalFormDefs = !!localToggled.find((i) => i.key === FORM_DEFS_TOGGLE_KEY && i.selected && !i.disabled)
      // Persist local selections into saved state (create state if none exists)
      const currentState = loadState() || { addons: [], scale: null, localServices: [], localFormDefs: false }
      saveState(currentState.addons, currentState.scale, newLocalServices, newLocalFormDefs)

      // When containers are already running, apply changes immediately: restart
      // any service whose local-image setting changed (--no-deps) and (un)publish
      // the form-definition overrides if that toggle changed.
      if (containersRunning) {
        const changedKeys = LOCAL_SERVICES.map((s) => s.key).filter(
          (k) => previousLocalServices.includes(k) !== newLocalServices.includes(k)
        )
        const runningSet = new Set(getRunningServices())
        const servicesToRestart = changedKeys
          .map((k) => LOCAL_SERVICES.find((s) => s.key === k)?.composeService)
          .filter((name) => name && runningSet.has(name))

        const formDefsChanged = previousLocalFormDefs !== newLocalFormDefs
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
          const applyStatus = runApplyFormDefs(newLocalFormDefs ? 'enable' : 'disable', dryRun)
          resumeStdin()
          if (applyStatus !== 0) {
            hadError = true
            statusLine = `${RED}✖${RESET_COLOR}  Form-definition overrides ${newLocalFormDefs ? 'enable' : 'disable'} failed — check output above`
          } else {
            messages.push(newLocalFormDefs ? 'Form-def overrides enabled' : 'Form-def overrides disabled')
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
      if (newLocalFormDefs) summaryParts.push('form-def overrides enabled')
      statusLine = summaryParts.length
        ? `${PURPLE}✔  ${summaryParts.join('  ·  ')}${RESET_COLOR}`
        : `${DIM}Local overrides updated${RESET_COLOR}`
      continue
    }

    if (command === 'refresh-overrides') {
      // Re-publish the local YAML overrides into Mongo so freshly-edited
      // definitions are served without toggling the override off and on.
      pauseStdin()
      const applyStatus = runApplyFormDefs('enable', dryRun)
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

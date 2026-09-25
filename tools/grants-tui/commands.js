/* eslint-disable no-console, curly */

import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { resolve } from 'node:path'

import {
  ADDONS,
  BOLD,
  CHECK,
  CYAN,
  DEBUG_SERVICE,
  DIM,
  GREEN,
  LOCAL_SERVICES,
  PRE_UP_SCRIPT,
  RED,
  RESET_COLOR,
  ROOT,
  SNYK,
  SNYK_EXIT,
  SONAR,
  SONAR_EXIT,
  TEST_TARGETS,
  YELLOW
} from './constants.js'
import { composeFileArgs, getLocalImages, getRunningComposeFiles, runCompose } from './docker.js'
import { hasLocalFormDefs, getSelectedFormDefIds, runApplyFormDefs } from './form-defs.js'
import { cmdSonar } from './sonar.js'
import { getTailscaleShareIds, loadState, saveState, clearState } from './cli-state.js'
import { cmdTest, testLogPath } from './tests.js'
import { registerTempFile } from './temp-files.js'
import { disableTailscaleServe, enableTailscaleServe } from './tailscale-serve.js'
import { revokeAllTailscaleSharesSync } from './tailscale-share.js'
import { cmdTailscale, tailscaleEnabled } from './tailscale.js'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Map addon keys to their display labels, falling back to the raw key.
 * @param {string[]} keys
 * @returns {string[]}
 */
function addonLabelsFor(keys) {
  return keys.map((k) => {
    const a = ADDONS.find((x) => x.key === k)
    return a ? a.label : k
  })
}

/**
 * Resolve which addons are active, preferring the running stack's own compose
 * files (authoritative) and falling back to saved state when nothing is
 * running. `source` tells the caller which one it got, so callers that need
 * to say "using saved state" can do so only when that's actually what happened.
 * @returns {{ source: 'running' | 'state' | 'none', addonKeys: string[] }}
 */
function resolveAddonKeys() {
  const composeFilesFromLabels = getRunningComposeFiles()
  if (composeFilesFromLabels) {
    const addonKeys = ADDONS.filter((a) => composeFilesFromLabels.some((f) => f.endsWith(a.composeFile))).map(
      (a) => a.key
    )
    return { source: 'running', addonKeys }
  }
  const state = loadState()
  return state ? { source: 'state', addonKeys: state.addons } : { source: 'none', addonKeys: [] }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {boolean} dryRun */
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
export function cmdSnyk(dryRun = false) {
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
export async function cmdCheck(dryRun = false) {
  /** @type {{name: string, ok: boolean, log: string}[]} */
  const results = []
  for (const t of TEST_TARGETS) {
    results.push({ name: `test:${t.key}`, ok: cmdTest(t.key, dryRun) === 0, log: testLogPath(t.key) })
  }
  results.push(
    { name: 'snyk', ok: cmdSnyk(dryRun) === SNYK_EXIT.OK, log: SNYK.logFile },
    { name: 'sonar', ok: (await cmdSonar({ dryRun, changed: true })) === SONAR_EXIT.OK, log: SONAR.logFile }
  )

  const failed = results.filter((r) => !r.ok)
  const allOk = failed.length === 0
  const pad = Math.max(...results.map((r) => r.name.length))

  // Plain-text summary to a log — the interactive TUI clears the screen on return,
  // so console output alone is lost. Failed steps point at their own output log.
  const statusWord = allOk ? 'all passed' : `${failed.length} failed`
  const summaryLines = results.map((r) => {
    const tail = r.ok ? '' : `   → ${r.log}`
    return `  ${r.ok ? '✔' : '✖'} ${r.name.padEnd(pad)}${tail}`
  })
  const summary = `pre-pr check — ${statusWord}\n` + summaryLines.join('\n') + '\n'
  try {
    fs.writeFileSync(CHECK.logFile, summary)
  } catch (err) {
    console.error(`  ${DIM}could not write check summary: ${/** @type {Error} */ (err).message}${RESET_COLOR}`)
  }

  console.log(`\n  ${BOLD}pre-pr check summary${RESET_COLOR}`)
  for (const r of results) {
    const tail = r.ok ? '' : `  ${DIM}→ ${r.log}${RESET_COLOR}`
    const tick = r.ok ? `${GREEN}✔${RESET_COLOR}` : `${RED}✖${RESET_COLOR}`
    console.log(`    ${tick}  ${r.name}${tail}`)
  }
  console.log(
    allOk
      ? `\n  ${GREEN}✔  All checks passed${RESET_COLOR}  ${DIM}(${CHECK.logFile})${RESET_COLOR}\n`
      : `\n  ${RED}✖  ${failed.length} failed${RESET_COLOR}  ${DIM}(${CHECK.logFile})${RESET_COLOR}\n`
  )
  return allOk ? 0 : 1
}

/**
 * @param {string[]} selectedAddons
 * @param {number | null} scale
 * @param {boolean} dryRun
 * @param {string[]} [localServices]
 * @returns {{ status: number, elapsedSeconds: string | null }}
 */
export function cmdUp(selectedAddons, scale, dryRun, localServices = []) {
  if (selectedAddons.includes('tailscale') && selectedAddons.includes('ha')) {
    console.error('Tailscale mode cannot be combined with the HA proxy.')
    return { status: 1, elapsedSeconds: null }
  }
  const runningFiles = getRunningComposeFiles()
  if (tailscaleEnabled(runningFiles) && !selectedAddons.includes('tailscale')) {
    const switchStatus = cmdTailscale(false, dryRun)
    if (switchStatus !== 0) {
      return { status: switchStatus, elapsedSeconds: null }
    }
  }
  let createdPorts = []
  if (selectedAddons.includes('tailscale')) {
    try {
      createdPorts = enableTailscaleServe(dryRun)
    } catch (error) {
      console.error(error.message)
      return { status: 1, elapsedSeconds: null }
    }
  }
  const fileArgs = composeFileArgs(selectedAddons, localServices)
  const extraArgs = ['-d', '--wait']
  if (scale && selectedAddons.includes('ha')) {
    extraArgs.push('--scale', `grants-ui=${scale}`, '--scale', `grants-ui-backend=${scale}`)
  }
  const addonLabels = addonLabelsFor(selectedAddons)
  const addonSummary = addonLabels.length ? ` + ${addonLabels.join(', ')}` : ''
  const scaleSuffix = scale ? `  ${DIM}(scale=${scale})${RESET_COLOR}` : ''
  console.log(`  ${BOLD}Starting:${RESET_COLOR} core${addonSummary}${scaleSuffix}\n`)
  const preStatus = runPreUpScript(dryRun)
  if (preStatus !== 0) {
    disableTailscaleServe(dryRun, createdPorts)
    return { status: preStatus, elapsedSeconds: null }
  }
  const startTime = Date.now()
  let elapsedSeconds = null
  const status = runCompose([...fileArgs, 'up', ...extraArgs], dryRun)
  // Keep Serve available after a partial Docker startup so retrying up can
  // recover; removing it could strand an already-recreated UI at its new URL.
  if (status === 0 && !dryRun) {
    elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1)
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
      const disableStatus = runApplyFormDefs('disable', dryRun)
      const applyStatus = disableStatus || runApplyFormDefs('enable', dryRun, selectedFormDefIds)
      if (applyStatus !== 0) {
        return { status: applyStatus, elapsedSeconds }
      }
    } else if (hasLocalFormDefs()) {
      const applyStatus = runApplyFormDefs('disable', dryRun)
      if (applyStatus !== 0) {
        return { status: applyStatus, elapsedSeconds }
      }
    }
  }
  return { status, elapsedSeconds }
}

/**
 * @param {boolean} dryRun
 * @returns {number}
 */
export function cmdDown(dryRun) {
  const state = loadState()
  const tailscaleOn = tailscaleEnabled(getRunningComposeFiles()) || state?.addons?.includes('tailscale')
  let fileArgs

  if (state) {
    const addonLabels = addonLabelsFor(state.addons)
    const addonSummary = addonLabels.length ? ` + ${addonLabels.join(', ')}` : ''
    console.log(`\n  ${DIM}Saved state:${RESET_COLOR} core${addonSummary}\n`)
    // The Tailscale overlay only changes environment values for services. It is
    // not needed for `down`, and including it makes Compose interpolate
    // TAILSCALE_HOSTNAME in this new gt process before it can stop anything.
    fileArgs = composeFileArgs(
      state.addons.filter((addon) => addon !== 'tailscale'),
      state.localServices ?? []
    )
  } else {
    console.log(`\n  ${YELLOW}⚠${RESET_COLOR}  No saved state — stopping core services only.\n`)
    fileArgs = composeFileArgs([])
  }

  if (getTailscaleShareIds(state).length && revokeAllTailscaleSharesSync(dryRun) !== 0) {
    console.error('Containers remain running because one or more Tailscale shares could not be revoked.')
    return 1
  }
  let status = runCompose([...fileArgs, 'down', '--remove-orphans', '--rmi', 'local'], dryRun)
  if (status === 0 && tailscaleOn) status = disableTailscaleServe(dryRun)
  if (status === 0 && !dryRun) {
    // Keep state so next `up` can pre-select the same addons
    console.log(`  ${GREEN}✔${RESET_COLOR}  Containers stopped.\n`)
  }
  return status
}

/**
 * @param {boolean} [dryRun]
 * @returns {number}
 */
export function cmdDebug(dryRun = false) {
  if (dryRun) {
    console.log(`Restart ${DEBUG_SERVICE} in debug mode (port 9229)`)
    return 0
  }
  const { source, addonKeys } = resolveAddonKeys()

  if (source === 'state') {
    console.log(`\n  ${YELLOW}⚠${RESET_COLOR}  No running container found — using saved state for debug session.\n`)
  } else if (source === 'none') {
    console.error(
      `\n  ${RED}✖${RESET_COLOR}  ${DEBUG_SERVICE} is not running and no saved state found. Start containers first.\n`
    )
    return 1
  }

  // Write a temp override that replaces the grants-ui command with dev:debug
  const debugOverridePath = resolve(os.tmpdir(), `grants-ui-cli-debug-override-${process.pid}.yml`)
  fs.writeFileSync(debugOverridePath, `services:\n  ${DEBUG_SERVICE}:\n    command: npm run dev:debug\n`, 'utf8')
  registerTempFile(debugOverridePath)

  const fileArgs = composeFileArgs(addonKeys)

  console.log(`\n  ${DIM}Restarting ${DEBUG_SERVICE} in debug mode (port 9229)…${RESET_COLOR}\n`)
  // Stop the service first so the override takes effect cleanly
  const stopped = spawnSync('docker', ['compose', ...fileArgs, 'stop', DEBUG_SERVICE], { cwd: ROOT, stdio: 'inherit' })
  if (stopped.status !== 0) {
    return stopped.status ?? 1
  }

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

  return result.status ?? 1
}

/**
 * Run a `docker` subcommand for real, or just print the equivalent command
 * line under --dry-run — the shared shape behind most of cmdReset's steps.
 * @param {boolean} dryRun
 * @param {string[]} args
 * @param {string} previewCmd The `docker ...` command line to print in dry-run mode
 */
function runDockerOrPreview(dryRun, args, previewCmd) {
  if (dryRun) {
    console.log(`  ${DIM}▶${RESET_COLOR}  ${previewCmd}\n`)
    return 0
  }
  const result = spawnSync('docker', args, { cwd: ROOT, stdio: 'inherit' })
  return result.status ?? 1
}

/**
 * @param {boolean} dryRun
 * @returns {number}
 */
export function cmdReset(dryRun) {
  const state = loadState()
  const tailscaleOn = tailscaleEnabled(getRunningComposeFiles()) || state?.addons?.includes('tailscale')
  console.log(`\n  ${YELLOW}⚠${RESET_COLOR}  RESET: This will remove all containers, volumes, and local images.\n`)

  if (getTailscaleShareIds(state).length && revokeAllTailscaleSharesSync(dryRun) !== 0) {
    console.error('Reset stopped because one or more Tailscale shares could not be revoked.')
    return 1
  }

  // The Land Grants overlay only extends services from the core stack. Running
  // it with compose.infra alone makes Compose reject the project because
  // `grants-ui` has no image or build context. That was the source of the
  // repeatable exit 1 in the interactive reset command.
  const composeStacks = [
    ['compose.infra.yml', 'compose.grants-ui.yml'],
    ['compose.infra.yml', 'compose.grants-ui.yml', 'compose.land-grants.yml']
  ]
  let status = 0
  const recordStatus = (commandStatus) => {
    if (status === 0 && commandStatus !== 0) status = commandStatus
  }

  for (const files of composeStacks) {
    const fileArgs = files.flatMap((file) => ['-f', file])
    console.log(
      `  ${DIM}▶${RESET_COLOR}  docker compose ${fileArgs.join(' ')} down --volumes --remove-orphans --rmi local\n`
    )

    if (!dryRun) {
      const result = spawnSync(
        'docker',
        ['compose', ...fileArgs, 'down', '--volumes', '--remove-orphans', '--rmi', 'local'],
        {
          cwd: ROOT,
          stdio: 'inherit'
        }
      )
      recordStatus(result.status ?? 1)
    }
  }

  const volList = dryRun
    ? { status: 0, stdout: '' }
    : spawnSync('docker', ['volume', 'ls', '--format', '{{.Name}}'], { encoding: 'utf8' })
  recordStatus(volList.status ?? 1)
  const anonVols = (volList.stdout ?? '')
    .trim()
    .split('\n')
    .filter((v) => /^[a-f0-9]{64}$/.test(v))

  if (anonVols.length) {
    console.log(`\n  ${DIM}Removing ${anonVols.length} anonymous volume(s)…${RESET_COLOR}\n`)
    recordStatus(runDockerOrPreview(dryRun, ['volume', 'rm', ...anonVols], `docker volume rm ${anonVols.join(' ')}`))
  }

  // Remove specific defradigital images (mirrors docker:reset npm script)
  const resetImages = LOCAL_SERVICES.filter((s) => s.removeOnReset).map((s) => s.image)
  const imageList = dryRun
    ? { status: 0, stdout: resetImages.join('\n') }
    : spawnSync('docker', ['images', '--format', '{{.Repository}}'], { encoding: 'utf8' })
  recordStatus(imageList.status ?? 1)
  const availableImages = new Set((imageList.stdout ?? '').trim().split('\n').filter(Boolean))
  const imagesToRemove = resetImages.filter((image) => availableImages.has(image))
  if (imagesToRemove.length) {
    console.log(`\n  ${DIM}Removing defradigital images…${RESET_COLOR}\n`)
    recordStatus(
      runDockerOrPreview(dryRun, ['rmi', '-f', ...imagesToRemove], `docker rmi -f ${imagesToRemove.join(' ')}`)
    )
  }

  // A missing image or volume means that part of reset has already completed;
  // do not turn that harmless state into a failed reset.
  const postgresVolume = 'grants-ui_postgres_data'
  const postgresVolumeCheck = dryRun
    ? { status: 0 }
    : spawnSync('docker', ['volume', 'inspect', postgresVolume], { encoding: 'utf8' })
  if (postgresVolumeCheck.status === 0) {
    console.log(`  ${DIM}Removing volume ${postgresVolume}…${RESET_COLOR}\n`)
    recordStatus(
      runDockerOrPreview(dryRun, ['volume', 'rm', '-f', postgresVolume], `docker volume rm -f ${postgresVolume}`)
    )
  }

  console.log(`  ${DIM}Removing local SonarQube stack…${RESET_COLOR}\n`)
  recordStatus(
    runDockerOrPreview(
      dryRun,
      ['compose', '-f', SONAR.composeFile, 'down', '--volumes'],
      `docker compose -f ${SONAR.composeFile} down --volumes`
    )
  )
  if (!dryRun) {
    try {
      fs.unlinkSync(SONAR.stateFile)
    } catch {
      /* not bootstrapped — nothing to clean */
    }
  }

  // These are independent cleanup steps: make the best possible reset even
  // when an earlier Docker command failed.
  if (tailscaleOn) recordStatus(disableTailscaleServe(dryRun))
  if (!dryRun) {
    clearState()
    if (status === 0) console.log(`  ${GREEN}✔${RESET_COLOR}  Reset complete.\n`)
  }
  return status
}

/**
 * @param {string[]} services
 * @param {boolean} dryRun
 * @returns {number}
 */
export function cmdRestart(services, dryRun) {
  if (!services?.length) {
    console.log(`\n  ${YELLOW}⚠${RESET_COLOR}  No running containers to restart.\n`)
    return 0
  }

  const { addonKeys } = resolveAddonKeys()
  const localImages = getLocalImages()
  const savedState = loadState()
  const localServiceKeys = savedState
    ? (savedState.localServices ?? []).filter((/** @type {string} */ k) => localImages.has(k + ':local'))
    : []
  const fileArgs = composeFileArgs(addonKeys, localServiceKeys)

  console.log(`\n  ${DIM}Restarting ${services.length} container(s): ${services.join(', ')}…${RESET_COLOR}\n`)

  const status = runCompose([...fileArgs, 'up', '-d', '--no-deps', '--force-recreate', ...services], dryRun)
  if (status === 0 && !dryRun) {
    console.log(`  ${GREEN}✔${RESET_COLOR}  Restarted: ${services.join(', ')}.\n`)
  }
  return status
}

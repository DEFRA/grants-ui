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
 *   gt state <grant-code> --sbi <sbi>    # inspect persisted application state
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
 *   Append an entry to the ADDONS array in ./grants-tui/constants.js — that's it.
 *
 * Adding a new defradigital local-image service:
 *   Append an entry to the LOCAL_SERVICES array in ./grants-tui/constants.js.
 *
 * Pre-up script:
 *   Set PRE_UP_SCRIPT (in ./grants-tui/constants.js) to the path of a shell script to
 *   run before every `up`. Set to null or '' to disable. On Windows, the script is run
 *   via bash (Git Bash / WSL).
 *
 * State is persisted in .grants-ui-cli-state.json (git-ignored) so the next
 * `up` pre-selects the same addons and local image overrides as last time.
 *
 * File layout: this file is the CLI entrypoint (arg parsing, non-interactive
 * command dispatch which hands off to the interactive TUI loop)
 */

import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { resolve } from 'node:path'

import {
  ADDONS,
  DIM,
  LOCAL_SERVICES,
  LOG_RETENTION_MS,
  RED,
  RESET_COLOR,
  TEST_TARGETS,
  VERSION
} from './grants-tui/constants.js'
import { validateArgs } from './grants-tui/cli-args.js'
import { cmdCheck, cmdDebug, cmdDown, cmdReset, cmdRestart, cmdSnyk, cmdUp } from './grants-tui/commands.js'
import { getRunningServices, journeyBaseUrl } from './grants-tui/docker.js'
import { printHelp } from './grants-tui/help.js'
import { cmdJourney } from './grants-tui/journey.js'
import { cmdSonar } from './grants-tui/sonar.js'
import { cmdState } from './grants-tui/state.js'
import { cmdTest } from './grants-tui/tests.js'
import { releaseStdin } from './grants-tui/tui.js'
import { runInteractiveLoop } from './grants-tui/tui-loop.js'

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
  validateArgs(argv)

  const testInvoked = argv.includes('test')

  const testTargets = testInvoked
    ? (() => {
        const picked = TEST_TARGETS.filter((t) => argv.includes(t.key)).map((t) => t.key)
        return picked.length ? picked : [TEST_TARGETS[0].key]
      })()
    : []
  const testNeedsDocker = testTargets.some((k) => TEST_TARGETS.find((t) => t.key === k)?.needsDocker)
  const snykInvoked = argv.includes('snyk')
  const stateInvoked = argv.includes('state')
  // `journey` drives a browser against localhost:3000, which may be a plain
  // `npm run dev` rather than the Docker stack — don't force a Docker check.
  const journeyInvoked = argv.includes('journey')

  // Preflight: ensure Docker is available and running (skipped for --dry-run so
  // offline/CI usage works, and for test/snyk/journey/state runs that don't drive containers)
  if (!dryRun && !(testInvoked && !testNeedsDocker) && !snykInvoked && !journeyInvoked && !stateInvoked) {
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
  if (argv.includes('state')) {
    releaseStdin()
    const stateIdx = argv.indexOf('state')
    const grantCode = argv[stateIdx + 1] && !argv[stateIdx + 1].startsWith('-') ? argv[stateIdx + 1] : ''
    const valueOf = (flag) => {
      const i = argv.indexOf(flag)
      return i !== -1 ? argv[i + 1] : undefined
    }
    process.exit(
      cmdState({
        grantCode,
        sbi: valueOf('--sbi') ?? '',
        grantVersion: valueOf('--grant-version'),
        json: argv.includes('--json')
      })
    )
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
  await runInteractiveLoop(dryRun)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

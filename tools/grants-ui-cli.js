#!/usr/bin/env node
/* eslint-disable */

/**
 * GAE CLI — Interactive Docker Compose launcher
 *
 * Usage (interactive — no args):
 *   npx gae
 *   node tools/grants-ui-cli.js   (direct)
 *
 * Usage (non-interactive):
 *   npx gae up [--land-grants] [--gas] [--ha] [--scale <n>] [--dry-run]
 *   npx gae up --local-<service-key>  # use locally-built image for a defradigital service
 *   npx gae down [--dry-run]          # uses saved state automatically
 *   npx gae debug                     # restart grants-ui in debug mode (detached, port 9229)
 *   npx gae restart [--dry-run]       # restart running containers (with --no-deps)
 *   npx gae reset [--dry-run]         # full teardown incl. volumes
 *   npx gae --help                    # show help
 *   npx gae --version                 # show version number
 *
 * Tip: run `npm link` once to use `gae` directly (without `npx`).
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

import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as readline from 'readline'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
const VERSION = '1.1.0'

// ---------------------------------------------------------------------------
// Cross-platform: detect ANSI support
// Windows CI / non-TTY pipes don't support ANSI; fall back to plain text.
// ---------------------------------------------------------------------------
const ANSI = process.stdout.isTTY && process.env.TERM !== 'dumb' && !process.env.NO_COLOR

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const STATE_FILE = resolve(ROOT, '.grants-ui-cli-state.json')

// Service name used by the debug command
const DEBUG_SERVICE = 'grants-ui'

// Compose service never shown in the restart sub-menu (one-shot readiness helper)
const RESTART_HIDDEN_SERVICE = 'mongo-ready'

// ---------------------------------------------------------------------------
// Pre-up script — runs before `docker compose up` every time.
// Set to null or '' to disable.
// ---------------------------------------------------------------------------
const PRE_UP_SCRIPT = resolve(ROOT, 'tools/setup-local-config.sh')

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
// defradigital services that can be overridden with a locally-built image.
// The local image name is always `<serviceName>:local`.
// Add new entries here when new defradigital services are introduced.
// ---------------------------------------------------------------------------
const LOCAL_SERVICES = [
  { key: 'grants-ui-backend', composeService: 'grants-ui-backend', image: 'defradigital/grants-ui-backend' },
  { key: 'grants-config-broker', composeService: 'grants-config-broker', image: 'defradigital/grants-config-broker' },
  { key: 'grants-ui-dal-stub', composeService: 'grants-ui-dal-stub', image: 'defradigital/grants-ui-dal-stub' },
  { key: 'fg-gas-backend', composeService: 'fg-gas-backend', image: 'defradigital/fg-gas-backend' },
  { key: 'land-grants-api', composeService: 'land-grants-api', image: 'defradigital/land-grants-api' },
  {
    key: 'land-grants-postgres-seeded',
    composeService: 'land-grants-postgres-seeded',
    image: 'defradigital/land-grants-postgres-seeded'
  },
  { key: 'fcp-defra-id-stub', composeService: 'fcp-defra-id-stub', image: 'defradigital/fcp-defra-id-stub' }
]

// ---------------------------------------------------------------------------
// Addon definitions — add new services here
// ---------------------------------------------------------------------------
const ADDONS = [
  {
    key: 'land-grants',
    label: 'Land Grants',
    description: 'Land grants backend + postgres',
    composeFile: 'compose.land-grants.yml'
  },
  {
    key: 'gas',
    label: 'GAS',
    description: 'Grants Application Service (fg-gas-backend + localstack)',
    composeFile: 'compose.gas.yml'
  },
  {
    key: 'ha',
    label: 'High Availability',
    description: 'Nginx proxy + scaled grants-ui / grants-ui-backend',
    composeFile: 'compose.ha.yml'
  }
]

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

// Named colour/style helpers — degrade gracefully when ANSI is unsupported
const CYAN = ANSI ? '\x1b[36m' : ''
const BOLD = ANSI ? '\x1b[1m' : ''
const DIM = ANSI ? '\x1b[2m' : ''
const RESET_COLOR = ANSI ? '\x1b[0m' : ''
const GREEN = ANSI ? '\x1b[32m' : ''
const YELLOW = ANSI ? '\x1b[33m' : ''
const RED = ANSI ? '\x1b[31m' : ''
const PURPLE = ANSI ? '\x1b[35m' : ''

// Cursor / screen control — no-ops when ANSI unsupported
const HIDE_CURSOR = ANSI ? '\x1b[?25l' : ''
const SHOW_CURSOR = ANSI ? '\x1b[?25h' : ''
const CLEAR_SCREEN = ANSI ? '\x1b[2J\x1b[H' : ''
// Alternate screen buffer — enter on interactive start, exit on quit so the
// TUI leaves no residue in the terminal scroll-back history (same as vim/less/ncu)
const ALT_SCREEN_ENTER = ANSI ? '\x1b[?1049h' : ''
const ALT_SCREEN_EXIT = ANSI ? '\x1b[?1049l' : ''

// ---------------------------------------------------------------------------
// Local image helpers
// ---------------------------------------------------------------------------

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

function saveState(addons, scale, localServices = []) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ addons, scale, localServices }, null, 2))
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
  const localSuffix = localKeys.length ? `  ${PURPLE}(local: ${localKeys.join(', ')})${RESET_COLOR}` : ''
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
    saveState(selectedAddons, scale, localServices)
    console.log(
      `  ${GREEN}✔${RESET_COLOR}  Containers started — run ${CYAN}npx gae down${RESET_COLOR} to stop. ${DIM}Started in ${elapsedSeconds}s${RESET_COLOR}\n`
    )
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
  const fileArgs = composeFileArgs(addonKeys)

  console.log(`\n  ${DIM}Restarting ${services.length} container(s): ${services.join(', ')}…${RESET_COLOR}\n`)
  const status = runCompose([...fileArgs, 'restart', '--no-deps', ...services], dryRun)
  if (status === 0 && !dryRun) {
    console.log(`  ${GREEN}✔${RESET_COLOR}  Restarted: ${services.join(', ')}.\n`)
  }
  if (status !== 0 && !_interactive) process.exit(status)
  return status
}

// Use ASCII fallbacks on Windows where some fonts lack these glyphs
const IS_WINDOWS = process.platform === 'win32'
const TICK = IS_WINDOWS ? '[x]' : '◉'
const CIRCLE = IS_WINDOWS ? '[ ]' : '○'
const ARROW = IS_WINDOWS ? '>' : '❯'

const KEYS = {
  UP: '\u001b[A',
  DOWN: '\u001b[B',
  SPACE: ' ',
  ENTER: '\r',
  ENTER2: '\n',
  CTRL_C: '\u0003',
  ESC: '\u001b',
  A: 'a'
}

function visibleLen(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length
}

function padVisible(str, width) {
  const pad = width - visibleLen(str)
  return pad > 0 ? str + ' '.repeat(pad) : str
}

// ---------------------------------------------------------------------------
// Shared screen renderer
// ---------------------------------------------------------------------------

const HEADER = [
  '',
  `  ${BOLD}${CYAN}🚜  GAE CLI${RESET_COLOR}  ${DIM}v${VERSION}${RESET_COLOR}`,
  `  ${DIM}${'─'.repeat(40)}${RESET_COLOR}`,
  ''
]

function renderScreen(bodyLines) {
  const lines = [...HEADER, ...bodyLines, '']
  process.stdout.write(HIDE_CURSOR + CLEAR_SCREEN + lines.join('\n'))
}

// ---------------------------------------------------------------------------
// Radio menu (command selection)
// ---------------------------------------------------------------------------

async function radioMenu(items, title, { hint = '', statusLine = '' } = {}) {
  return new Promise((resolve) => {
    // Start cursor on first non-disabled item
    let cursor = items.findIndex((i) => !i.disabled)
    if (cursor === -1) cursor = 0

    const LABEL_WIDTH = Math.max(...items.map((i) => visibleLen(i.label))) + 2
    const hintText = hint || '↑ ↓  navigate    enter → select    esc → quit'

    function draw() {
      const body = [`  ${BOLD}${title}${RESET_COLOR}`, `  ${DIM}${hintText}${RESET_COLOR}`, '']
      items.forEach((item, i) => {
        const active = i === cursor
        const disabled = !!item.disabled
        const arrow = active ? `${CYAN}${ARROW}${RESET_COLOR}` : ' '
        let rawLabel, desc
        if (disabled) {
          rawLabel = `${DIM}${item.label}${RESET_COLOR}`
          desc = `${DIM}${item.description}${RESET_COLOR}`
        } else {
          rawLabel = active ? `${CYAN}${BOLD}${item.label}${RESET_COLOR}` : item.label
          desc = `${DIM}${item.description}${RESET_COLOR}`
        }
        const label = padVisible(rawLabel, LABEL_WIDTH)
        body.push(`  ${arrow}  ${label}  ${desc}`)
      })
      if (statusLine) {
        body.push('')
        body.push(`  ${statusLine}`)
      }
      renderScreen(body)
    }

    draw()
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    function onKey(_, key) {
      if (!key) return
      const seq = key.sequence ?? ''
      if (seq === KEYS.CTRL_C || (seq === KEYS.ESC && key.name === 'escape')) {
        cleanup()
        resolve('__quit__')
      } else if (seq === KEYS.UP) {
        let next = (cursor - 1 + items.length) % items.length
        while (items[next].disabled && next !== cursor) next = (next - 1 + items.length) % items.length
        cursor = next
        draw()
      } else if (seq === KEYS.DOWN) {
        let next = (cursor + 1) % items.length
        while (items[next].disabled && next !== cursor) next = (next + 1) % items.length
        cursor = next
        draw()
      } else if (seq === KEYS.ENTER || seq === KEYS.ENTER2) {
        if (items[cursor].disabled) return
        cleanup()
        resolve(items[cursor].key)
      }
    }

    function cleanup() {
      process.stdin.removeListener('keypress', onKey)
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
      process.stdout.write(SHOW_CURSOR)
    }

    process.stdin.on('keypress', onKey)
  })
}

// ---------------------------------------------------------------------------
// Toggle menu (addon selection)
// ---------------------------------------------------------------------------

async function toggleMenu(items, title) {
  return new Promise((resolve) => {
    // Start cursor on first non-disabled item
    let cursor = items.findIndex((i) => !i.disabled)
    if (cursor === -1) cursor = 0

    const LABEL_WIDTH = Math.max(...items.map((i) => visibleLen(i.label))) + 2

    function draw() {
      const body = [
        `  ${BOLD}${title}${RESET_COLOR}`,
        `  ${DIM}↑ ↓  navigate    space → toggle    a → select all    enter → confirm    esc → back${RESET_COLOR}`,
        ''
      ]
      items.forEach((item, i) => {
        const active = i === cursor
        const disabled = !!item.disabled
        const selected = item.selected
        const arrow = active ? `${CYAN}${ARROW}${RESET_COLOR}` : ' '
        let marker, rawLabel, desc
        if (disabled) {
          marker = `${DIM}${CIRCLE}${RESET_COLOR}`
          rawLabel = `${DIM}${item.label}${RESET_COLOR}`
          desc = `${DIM}${item.description}${RESET_COLOR}`
        } else {
          marker = selected ? `${GREEN}${TICK}${RESET_COLOR}` : `${DIM}${CIRCLE}${RESET_COLOR}`
          rawLabel = selected ? `${GREEN}${item.label}${RESET_COLOR}` : item.label
          desc = `${DIM}${item.description}${RESET_COLOR}`
        }
        const label = padVisible(rawLabel, LABEL_WIDTH)
        body.push(`  ${arrow}  ${marker}  ${label}  ${desc}`)
      })
      renderScreen(body)
    }

    draw()
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    function onKey(_, key) {
      if (!key) return
      const seq = key.sequence ?? ''
      if (seq === KEYS.CTRL_C || (seq === KEYS.ESC && key.name === 'escape')) {
        cleanup()
        resolve(null)
      } else if (seq === KEYS.UP) {
        let next = (cursor - 1 + items.length) % items.length
        while (items[next].disabled && next !== cursor) next = (next - 1 + items.length) % items.length
        cursor = next
        draw()
      } else if (seq === KEYS.DOWN) {
        let next = (cursor + 1) % items.length
        while (items[next].disabled && next !== cursor) next = (next + 1) % items.length
        cursor = next
        draw()
      } else if (seq === KEYS.SPACE) {
        if (!items[cursor].disabled) items[cursor].selected = !items[cursor].selected
        draw()
      } else if (seq === KEYS.A) {
        const allSelected = items.filter((i) => !i.disabled).every((i) => i.selected)
        items.forEach((i) => {
          if (!i.disabled) i.selected = !allSelected
        })
        draw()
      } else if (seq === KEYS.ENTER || seq === KEYS.ENTER2) {
        cleanup()
        resolve(items)
      }
    }

    function cleanup() {
      process.stdin.removeListener('keypress', onKey)
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
      process.stdout.write(SHOW_CURSOR)
    }

    process.stdin.on('keypress', onKey)
  })
}

// ---------------------------------------------------------------------------
// Scale prompt
// ---------------------------------------------------------------------------

async function promptScale() {
  const scaleItems = [
    { key: '2', label: '2 replicas', description: 'default' },
    { key: '3', label: '3 replicas', description: '' },
    { key: '4', label: '4 replicas', description: '' },
    { key: '6', label: '6 replicas', description: '' }
  ]
  const chosen = await radioMenu(scaleItems, 'Scale factor for grants-ui / grants-ui-backend', {
    hint: '↑ ↓  navigate    enter → select    esc → back'
  })
  if (!chosen || chosen === '__quit__') return null
  return parseInt(chosen, 10)
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`
${BOLD}${CYAN}GAE CLI${RESET_COLOR}  ${DIM}v${VERSION}${RESET_COLOR}

${BOLD}Usage:${RESET_COLOR}
  npx gae                             interactive mode
  npx gae <command> [options]

  Tip: run ${CYAN}npm link${RESET_COLOR} once to use ${CYAN}gae${RESET_COLOR} directly (without npx).
  Alternative: ${DIM}node tools/grants-ui-cli.js${RESET_COLOR}

${BOLD}Commands:${RESET_COLOR}
  up      Start containers
  down    Stop containers (uses saved state — no need to re-select)
  debug   Restart grants-ui in debug mode (detached, port 9229)
  restart Restart running containers (selectable; uses --no-deps)
  reset   Full teardown: containers + volumes + local images

${BOLD}Addon flags (for 'up'):${RESET_COLOR}
${ADDONS.map((a) => `  --${a.key.padEnd(16)} ${a.description}`).join('\n')}

${BOLD}Other flags:${RESET_COLOR}
  --scale <n>    Scale grants-ui and grants-ui-backend (use with --ha)
  --dry-run      Print commands without running them
  --help         Show this help
  --version      Show version number

${BOLD}Examples:${RESET_COLOR}
  npx gae                             # interactive
  npx gae up                         # core only
  npx gae up --land-grants --gas
  npx gae up --ha --scale 3
  npx gae down                       # stops whatever was started
  npx gae debug
  npx gae restart
  npx gae reset
`)
}

// ---------------------------------------------------------------------------
// Stdin teardown helper — must be called before any blocking command
// ---------------------------------------------------------------------------

// Full teardown — used when handing off to a non-returning command (non-interactive paths)
function releaseStdin() {
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
  } catch {
    // ignore
  }
  process.stdout.write(SHOW_CURSOR)
  process.stdin.destroy()
}

// Soft pause — disables raw mode and shows cursor while docker runs.
// Stays in the alternate screen buffer so docker output is discarded on exit.
function pauseStdin() {
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
  } catch {
    // ignore
  }
  process.stdout.write(CLEAR_SCREEN + SHOW_CURSOR)
}

// Re-enable raw mode and hide cursor after a blocking docker command returns
function resumeStdin() {
  process.stdout.write(HIDE_CURSOR)
  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) process.stdin.setRawMode(true)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2)

  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(`GAE CLI v${VERSION}`)
    process.exit(0)
  }

  const dryRun = argv.includes('--dry-run')

  // Validate args before doing anything else — catch unrecognised flags/commands early
  {
    const knownCmds = ['up', 'down', 'debug', 'restart', 'reset']
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
      ...LOCAL_SERVICES.map((s) => `--local-${s.key}`)
    ]
    const scaleValIdx = argv.indexOf('--scale')
    const unknownCmd = argv.find(
      (a, i) => !a.startsWith('-') && !knownCmds.includes(a) && !(scaleValIdx !== -1 && i === scaleValIdx + 1)
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

  // Preflight: ensure Docker is available and running (skipped for --dry-run so offline/CI usage works)
  if (!dryRun) {
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
    const localDesc = localCount
      ? `${PURPLE}${localCount} service${localCount > 1 ? 's' : ''} using local image${localCount > 1 ? 's' : ''}${RESET_COLOR}`
      : 'Override services with locally-built images'
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
      const localServiceItems = LOCAL_SERVICES.map((s) => ({
        ...s,
        label: s.key,
        description: localImages.has(s.key + ':local') ? 'local image available' : 'not available locally',
        disabled: !localImages.has(s.key + ':local'),
        selected: savedState
          ? (savedState.localServices ?? []).includes(s.key) && localImages.has(s.key + ':local')
          : false
      }))

      const localTitle = containersRunning
        ? 'Local image overrides  (changes restart the service now)'
        : "Local image overrides  (applied on next 'up')"
      const localToggled = await toggleMenu(localServiceItems, localTitle)
      if (localToggled === null) {
        // ESC — back to main menu
        continue
      }
      const newLocalServices = localToggled.filter((i) => i.selected && !i.disabled).map((i) => i.key)
      // Persist local service selection into saved state (create state if none exists)
      const currentState = loadState() || { addons: [], scale: null, localServices: [] }
      saveState(currentState.addons, currentState.scale, newLocalServices)

      // When containers are already running, restart any service whose local setting
      // changed (set or unset) so the change takes effect immediately (--no-deps).
      if (containersRunning) {
        const changedKeys = LOCAL_SERVICES.map((s) => s.key).filter(
          (k) => previousLocalServices.includes(k) !== newLocalServices.includes(k)
        )
        const runningSet = new Set(getRunningServices())
        const servicesToRestart = changedKeys
          .map((k) => LOCAL_SERVICES.find((s) => s.key === k)?.composeService)
          .filter((name) => name && runningSet.has(name))

        if (servicesToRestart.length) {
          pauseStdin()
          const restartStatus = cmdRestart(servicesToRestart, dryRun)
          resumeStdin()

          statusLine =
            restartStatus !== 0
              ? `${RED}✖${RESET_COLOR}  Docker exited with code ${restartStatus} — check output above`
              : `${PURPLE}✔  Restarted: ${servicesToRestart.join(', ')}${RESET_COLOR}`
          continue
        }
      }

      const n = newLocalServices.length
      statusLine = n
        ? `${PURPLE}✔  ${n} service${n > 1 ? 's' : ''} set to use local image${n > 1 ? 's' : ''}${RESET_COLOR}`
        : `${DIM}Local image overrides cleared${RESET_COLOR}`
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

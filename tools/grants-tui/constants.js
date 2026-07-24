import * as os from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
export const VERSION = '1.5.0'

// ---------------------------------------------------------------------------
// Cross-platform: detect ANSI support
// Windows CI / non-TTY pipes don't support ANSI; fall back to plain text.
// ---------------------------------------------------------------------------
export const ANSI = process.stdout.isTTY && process.env.TERM !== 'dumb' && !process.env.NO_COLOR

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(__dirname, '..', '..')
export const STATE_FILE = resolve(ROOT, '.grants-ui-cli-state.json')

// Folder holding developer-private form-definition overrides, mirroring the
// config repo layout `<grant>/<service>/<file>`. A single toggle enables/disables
// all overrides found here.
export const LOCAL_FORM_DEFS_DIR = resolve(ROOT, 'localstack/config-broker/local-form-definitions')
// Applier that (un)publishes the overrides against the running backend Mongo.
export const APPLY_FORM_DEFS_SCRIPT = resolve(ROOT, 'tools/apply-local-form-defs.mjs')
// Menu key used for the single all-grants form-definition override toggle.
export const FORM_DEFS_TOGGLE_KEY = '__local-form-defs__'

// Service name used by the debug command
export const DEBUG_SERVICE = 'grants-ui'

// Compose service never shown in the restart sub-menu (one-shot readiness helper)
export const RESTART_HIDDEN_SERVICE = 'mongo-ready'

export const TEST_TARGETS = [
  {
    key: 'unit',
    label: 'unit',
    script: 'test',
    description: 'Full unit suite with coverage (vitest run --coverage)',
    needsDocker: false
  },
  {
    key: 'contracts',
    label: 'contracts',
    script: 'test:contracts',
    description: 'Contract tests (vitest run --config vitest.contracts.config.js)',
    needsDocker: false
  },
  {
    key: 'acceptance',
    label: 'acceptance',
    script: 'test:acceptance',
    description: 'Docker-based grants-ui acceptance journeys (./tools/run-acceptance-tests.sh)',
    needsDocker: true,
    note: 'grants-ui suite only; spins up & tears down its own stack',
    env: { ACCEPTANCE_SUITES: 'grants-ui-acceptance-tests' }
  }
]

// The local SonarQube server is a throwaway Docker container with no TLS, so its
// URLs use plain http. Assembled from a scheme constant to keep the (correct,
// local-only) address out of a clear-text-protocol string literal.
const SCHEME = 'http'

export const SONAR = {
  composeFile: 'compose.sonar.yml',
  serverService: 'sonarqube',
  scannerService: 'sonar-scanner',
  hostUrl: `${SCHEME}://localhost:9000`,
  internalUrl: `${SCHEME}://sonarqube:9000`,
  projectKey: 'grants-ui-local',
  stateFile: resolve(ROOT, '.grants-ui-cli-sonar.json'), // git-ignored; holds minted token
  logFile: resolve(os.tmpdir(), 'grants-tui-sonar.log'),
  readyTimeoutMs: 150000
}

export const SONAR_EXIT = { OK: 0, GATE_FAILED: 1, ERROR: 2 }

// Snyk `test` exit codes: 0 = no vulns, 1 = vulns found, 2 = error, 3 = unsupported.
export const SNYK = {
  logFile: resolve(os.tmpdir(), 'grants-tui-snyk.log'),
  bin: resolve(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'snyk.cmd' : 'snyk')
}
export const SNYK_EXIT = { OK: 0, VULNS: 1, ERROR: 2 }

// `gt check` writes its pass/fail summary here — the interactive TUI clears the
// alternate screen on return, so console output alone is lost from scroll-back.
export const CHECK = { logFile: resolve(os.tmpdir(), 'grants-tui-check.log') }

export const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000 // sweep grants-tui-*.log older than this

// ---------------------------------------------------------------------------
// Pre-up script — runs before `docker compose up` every time.
// Set to null or '' to disable.
// ---------------------------------------------------------------------------
export const PRE_UP_SCRIPT = resolve(ROOT, 'tools/setup-local-config.sh')

// ---------------------------------------------------------------------------
// defradigital services that can be overridden with a locally-built image.
// The local image name is always `<serviceName>:local`.
// Add new entries here when new defradigital services are introduced.
// ---------------------------------------------------------------------------
export const LOCAL_SERVICES = [
  { key: 'grants-ui-backend', composeService: 'grants-ui-backend', image: 'defradigital/grants-ui-backend' },
  { key: 'grants-config-broker', composeService: 'grants-config-broker', image: 'defradigital/grants-config-broker' },
  { key: 'grants-ui-dal-stub', composeService: 'grants-ui-dal-stub', image: 'defradigital/grants-ui-dal-stub' },
  { key: 'fg-gas-backend', composeService: 'fg-gas-backend', image: 'defradigital/fg-gas-backend' },
  { key: 'land-grants-api', composeService: 'land-grants-backend', image: 'defradigital/land-grants-api' },
  {
    key: 'land-grants-postgres-seeded',
    composeService: 'land-grants-backend-postgres',
    image: 'defradigital/land-grants-postgres-seeded'
  },
  { key: 'fcp-defra-id-stub', composeService: 'fcp-defra-id-stub', image: 'defradigital/fcp-defra-id-stub' }
]

// ---------------------------------------------------------------------------
// Addon definitions — add new services here
// ---------------------------------------------------------------------------
export const ADDONS = [
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
export const CYAN = ANSI ? '\x1b[36m' : ''
export const BOLD = ANSI ? '\x1b[1m' : ''
export const DIM = ANSI ? '\x1b[2m' : ''
export const RESET_COLOR = ANSI ? '\x1b[0m' : ''
export const GREEN = ANSI ? '\x1b[32m' : ''
export const YELLOW = ANSI ? '\x1b[33m' : ''
export const RED = ANSI ? '\x1b[31m' : ''
export const PURPLE = ANSI ? '\x1b[35m' : ''
// Dimmed purple for the resting state of purple sub-items, so the highlighted
// (full-purple) state is easier to distinguish at a glance.
export const FADED_PURPLE = ANSI ? '\x1b[2;35m' : ''

// Cursor / screen control — no-ops when ANSI unsupported
export const HIDE_CURSOR = ANSI ? '\x1b[?25l' : ''
export const SHOW_CURSOR = ANSI ? '\x1b[?25h' : ''
export const CLEAR_SCREEN = ANSI ? '\x1b[2J\x1b[H' : ''
// Alternate screen buffer — enter on interactive start, exit on quit so the
// TUI leaves no residue in the terminal scroll-back history (same as vim/less/ncu)
export const ALT_SCREEN_ENTER = ANSI ? '\x1b[?1049h' : ''
export const ALT_SCREEN_EXIT = ANSI ? '\x1b[?1049l' : ''

// Use ASCII fallbacks on Windows where some fonts lack these glyphs
export const IS_WINDOWS = process.platform === 'win32'
export const TICK = IS_WINDOWS ? '[x]' : '◉'
export const CIRCLE = IS_WINDOWS ? '[ ]' : '○'
export const ARROW = IS_WINDOWS ? '>' : '❯'

export const KEYS = {
  UP: '\u001b[A',
  DOWN: '\u001b[B',
  SPACE: ' ',
  ENTER: '\r',
  ENTER2: '\n',
  CTRL_C: '\u0003',
  ESC: '\u001b',
  A: 'a'
}

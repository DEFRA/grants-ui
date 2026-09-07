/* eslint-disable no-console */

import { ADDONS, BOLD, CYAN, DIM, RESET_COLOR, TEST_TARGETS, VERSION } from './constants.js'
import { listJourneys } from './journey.js'

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function printHelp() {
  const addonFlagLines = ADDONS.map((a) => `  --${a.key.padEnd(16)} ${a.description}`).join('\n')
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
  state   Inspect persisted application state in the local backend database
  sonar   Run SonarQube analysis against a local server (--changed scopes to PR files; --down stops it)
  snyk    Run Snyk dependency vulnerability scan (same as CI; needs a Snyk login — see below)
  check   Pre-PR full check: all test suites + snyk + PR-scoped sonar (runs every step, summarises)
  reset   Full teardown: containers + volumes + local images

${BOLD}Addon flags (for 'up'):${RESET_COLOR}
${addonFlagLines}

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

${BOLD}State flags (for 'state'):${RESET_COLOR}
  --sbi <sbi>          SBI that owns the grant application (required)
  --grant-version <v>  Inspect an exact grant version (default: show all matching versions)
  --json               Print raw JSON instead of the terminal-friendly view

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
  gt state example-grant-with-auth --sbi 106238911        # inspect saved application state
  gt sonar                           # local SonarQube scan of src/
  gt sonar --changed                 # scope scan to src files changed vs main (approx. CI PR view)
  gt sonar --down                    # stop the local SonarQube server
  gt snyk                            # Snyk dependency vulnerability scan
  gt check                           # pre-PR full check: all tests + snyk + PR-scoped sonar
  gt reset
`)
}

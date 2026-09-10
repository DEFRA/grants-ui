/* eslint-disable no-console, curly */

import {
  ADDONS,
  ALT_SCREEN_ENTER,
  ALT_SCREEN_EXIT,
  CHECK,
  DIM,
  HIDE_CURSOR,
  LOCAL_SERVICES,
  PURPLE,
  RED,
  RESET_COLOR,
  RESTART_HIDDEN_SERVICE,
  SHOW_CURSOR,
  SNYK,
  SNYK_EXIT,
  SONAR,
  SONAR_EXIT,
  TEST_TARGETS,
  YELLOW
} from './constants.js'
import {
  actionStatus,
  cancelActiveAction,
  getActionRuns,
  getLastRun,
  runInteractiveAction,
  setActionMenu
} from './actions.js'
import { viewOutput } from './output.js'
import {
  buildStatusLine,
  getAllServices,
  getLocalImages,
  getRunningComposeFiles,
  getRunningServices,
  journeyBaseUrl
} from './docker.js'
import { getSelectedFormDefIds, listOverrideSources } from './form-defs.js'
import { GAS_DIVIDER, gasStatusSegment, getGasStatus, setGasStatus } from './gas.js'
import { journeyCrnOptions, journeySteps, listJourneys, wontCompleteReason } from './journey.js'
import { loadState, saveState } from './cli-state.js'
import { promptScale, promptTextWithOptions, radioMenu, setRuntimeStatusLine, toggleMenu } from './tui.js'

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

/**
 * @param {{ localServices?: string[], localFormDefSelections?: string[], localFormDefs?: boolean } | null} savedState
 * @param {boolean} containersRunning
 * @returns {object[]}
 */
export function buildMainMenuItems(savedState, containersRunning) {
  const localCount = savedState?.localServices?.length || 0
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

  return [
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
            label: ' ↳ refresh overrides',
            description: containersRunning
              ? 'Re-apply local form-def overrides'
              : 'Start containers first to refresh overrides',
            disabled: !containersRunning
          }
        ]
      : []),
    { key: 'checks', label: 'checks ⇢', description: 'Tests, lint, security scans and pre-PR checks' },
    { key: 'tools', label: 'tools ⇢', description: 'Audit logs, queue messages and cleanup' },
    {
      key: 'journey',
      label: 'journey ⇢',
      description: 'Walk a Journey Runner journey headlessly',
      disabled: !containersRunning
    },
    { key: 'reset', label: 'reset ⇢', description: 'Full teardown — removes volumes & images' }
  ]
}

/**
 * GAS status is served by mockserver only when the GAS addon (compose.gas.yml)
 * isn't running. In that mode return the current mocked status so it can be
 * shown on the status line and edited via `g`; otherwise null.
 * @param {boolean} containersRunning
 * @param {string[] | null} runningComposeFiles
 * @returns {Promise<string | null>}
 */
async function resolveGasStatus(containersRunning, runningComposeFiles) {
  const gasMockActive = containersRunning && !runningComposeFiles?.some((f) => f.endsWith('compose.gas.yml'))
  return gasMockActive ? await getGasStatus() : null
}

async function refreshRuntimeStatus(runningComposeFiles = getRunningComposeFiles()) {
  const gasStatus = await resolveGasStatus(!!runningComposeFiles, runningComposeFiles)
  const runtimeLine = buildStatusLine(runningComposeFiles)
  setRuntimeStatusLine(
    gasStatus === null ? runtimeLine : `${runtimeLine}  ${GAS_DIVIDER}  ${gasStatusSegment(gasStatus)}`
  )
  return gasStatus
}

// ---------------------------------------------------------------------------
// Command handlers — one per main-menu item, each returns the next status line
// ---------------------------------------------------------------------------

/**
 * @param {string | null} gasStatus
 * @returns {Promise<string>}
 */
async function handleGasCommand(gasStatus) {
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
  if (!trimmed) return ''
  const ok = await setGasStatus(trimmed)
  // The runtime footer reflects the saved GAS status on the next render.
  return ok ? '' : `${RED}✖${RESET_COLOR}  Failed to set GAS status — is mockserver running?`
}

/** @param {boolean} dryRun */
async function handleRestartCommand(dryRun) {
  // Let the user pick which containers to restart (none selected by default; non-running are disabled)
  // `mongo-ready` is a one-shot readiness helper, never a restartable container — always hide it
  const runningServices = getRunningServices().filter((s) => s !== RESTART_HIDDEN_SERVICE)
  if (!runningServices.length) {
    return `${DIM}No running containers to restart${RESET_COLOR}`
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
  if (restartToggled === null) return ''
  const selectedServices = restartToggled.filter((i) => i.selected).map((i) => i.key)
  if (!selectedServices.length) {
    return `${DIM}No containers selected — restart cancelled${RESET_COLOR}`
  }

  const restartStatus = await runInteractiveAction('restart', [selectedServices, dryRun, true], 'Restarting containers')

  const postRestartFiles = getRunningComposeFiles()
  return restartStatus !== 0
    ? `${RED}✖${RESET_COLOR}  Docker exited with code ${restartStatus} — check output above`
    : buildStatusLine(postRestartFiles)
}

/**
 * @param {boolean} dryRun
 * @param {{ addons: string[], localServices?: string[] } | null} savedState
 */
async function handleUpCommand(dryRun, savedState) {
  // Show addon toggle menu
  const savedAddonKeys = new Set(savedState ? savedState.addons : [])
  const addonItems = ADDONS.map((a) => ({ ...a, selected: savedAddonKeys.has(a.key) }))

  const toggled = await toggleMenu(addonItems, 'Select addons  (core services always included)')
  if (toggled === null) return ''

  const selectedAddons = toggled.filter((a) => a.selected).map((a) => a.key)

  let scale = null
  if (selectedAddons.includes('ha')) {
    const chosen = await promptScale()
    if (chosen === null) return '' // ESC from scale menu — back to main
    scale = chosen
  }

  // Use saved local service selections (set via the 'local' menu item)
  const localImages = getLocalImages()
  const selectedLocalServices = savedState
    ? (savedState.localServices ?? []).filter((/** @type {string} */ k) => localImages.has(k + ':local'))
    : []

  const started = Date.now()
  const upStatus = await runInteractiveAction(
    'up',
    [selectedAddons, scale, dryRun, selectedLocalServices, true],
    'Starting containers'
  )
  const elapsedSeconds = ((Date.now() - started) / 1000).toFixed(1)

  const postUpFiles = getRunningComposeFiles()
  if (upStatus !== 0) {
    return `${RED}✖${RESET_COLOR}  Docker exited with code ${upStatus} — check docker logs`
  }
  const startedSuffix = elapsedSeconds ? `  ${DIM}Started in ${elapsedSeconds}s${RESET_COLOR}` : ''
  return `${buildStatusLine(postUpFiles)}${startedSuffix}`
}

/**
 * Restart any service whose local-image setting changed (--no-deps).
 * @param {boolean} dryRun
 * @param {string[]} servicesToRestart
 * @returns {Promise<string | null>} an error status line, or null on success
 */
async function restartChangedLocalServices(dryRun, servicesToRestart) {
  if (!servicesToRestart.length) return null
  const restartStatus = await runInteractiveAction(
    'restart',
    [servicesToRestart, dryRun, true],
    'Restarting local services'
  )
  return restartStatus !== 0
    ? `${RED}✖${RESET_COLOR}  Docker exited with code ${restartStatus} — check output above`
    : null
}

/**
 * Reconcile the form-definition overrides — remove the ones just deselected
 * and (re)publish the ones now selected.
 * @param {boolean} dryRun
 * @param {string[]} addedFormDefIds
 * @param {string[]} removedFormDefIds
 * @param {string[]} newFormDefIds
 * @returns {Promise<boolean>} true on success
 */
async function reconcileFormDefOverrides(dryRun, addedFormDefIds, removedFormDefIds, newFormDefIds) {
  let applyStatus = 0
  if (newFormDefIds.length === 0) {
    // Everything turned off — a full disable (marker sweep) reverts every
    // grant to its repo version and clears any leftover override.
    applyStatus = await runInteractiveAction('form-defs', ['disable', dryRun], 'Removing form-def overrides')
  } else {
    if (removedFormDefIds.length)
      applyStatus = await runInteractiveAction(
        'form-defs',
        ['disable', dryRun, removedFormDefIds],
        'Removing form-def overrides'
      )
    if (applyStatus === 0 && addedFormDefIds.length)
      applyStatus = await runInteractiveAction(
        'form-defs',
        ['enable', dryRun, addedFormDefIds],
        'Applying form-def overrides'
      )
  }
  return applyStatus === 0
}

/**
 * When containers are already running, apply local-override changes
 * immediately. Returns null when nothing actually changed, so the caller
 * falls back to the generic "here's what's selected" summary.
 * @param {boolean} dryRun
 * @param {string[]} servicesToRestart
 * @param {boolean} formDefsChanged
 * @param {string[]} addedFormDefIds
 * @param {string[]} removedFormDefIds
 * @param {string[]} newFormDefIds
 * @returns {Promise<string | null>}
 */
async function applyRunningLocalOverrideChanges(
  dryRun,
  servicesToRestart,
  formDefsChanged,
  addedFormDefIds,
  removedFormDefIds,
  newFormDefIds
) {
  const messages = []

  if (servicesToRestart.length) {
    const restartError = await restartChangedLocalServices(dryRun, servicesToRestart)
    if (restartError) return restartError
    messages.push(`Restarted: ${servicesToRestart.join(', ')}`)
  }

  if (formDefsChanged) {
    const ok = await reconcileFormDefOverrides(dryRun, addedFormDefIds, removedFormDefIds, newFormDefIds)
    if (!ok) return `${RED}✖${RESET_COLOR}  Form-definition override change failed — check output above`
    messages.push(`Form-def overrides: ${newFormDefIds.length} active`)
  }

  return messages.length ? `${PURPLE}✔  ${messages.join('  ·  ')}${RESET_COLOR}` : null
}

/**
 * Dedicated local image + form-definition override selection — only visited
 * when the user wants to change what runs locally.
 * @param {boolean} dryRun
 * @param {{ localServices?: string[], localFormDefSelections?: string[], localFormDefs?: boolean } | null} savedState
 * @param {boolean} containersRunning
 * @returns {Promise<string>}
 */
async function handleLocalCommand(dryRun, savedState, containersRunning) {
  const localImages = getLocalImages()
  const previousLocalServices = savedState?.localServices ?? []
  const previousLocalServiceSet = new Set(previousLocalServices)
  const previousFormDefIds = getSelectedFormDefIds(savedState)
  const previousFormDefIdSet = new Set(previousFormDefIds)
  const localServiceItems = LOCAL_SERVICES.map((s) => ({
    ...s,
    label: s.key,
    description: localImages.has(s.key + ':local') ? 'local image available' : 'not available locally',
    disabled: !localImages.has(s.key + ':local'),
    selected: previousLocalServiceSet.has(s.key) && localImages.has(s.key + ':local')
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
    selected: previousFormDefIdSet.has(o.id)
  }))

  const localTitle = containersRunning
    ? 'Local overrides  (changes apply now)'
    : "Local overrides  (applied on next 'up')"
  const localToggled = await toggleMenu([...formDefItems, ...localServiceItems], localTitle)
  if (localToggled === null) return ''

  const newLocalServices = localToggled
    .filter((i) => i.selected && !i.disabled && !i.key.startsWith(FORMDEF_KEY_PREFIX))
    .map((i) => i.key)
  const newFormDefIds = localToggled
    .filter((i) => i.selected && !i.disabled && i.key.startsWith(FORMDEF_KEY_PREFIX))
    .map((i) => i.key.slice(FORMDEF_KEY_PREFIX.length))
  // Persist local selections into saved state (create state if none exists)
  const currentState = loadState() || { addons: [], scale: null, localServices: [], localFormDefSelections: [] }
  saveState(currentState.addons, currentState.scale, newLocalServices, newFormDefIds)

  if (containersRunning) {
    const newLocalServiceSet = new Set(newLocalServices)
    const changedKeys = LOCAL_SERVICES.map((s) => s.key).filter(
      (k) => previousLocalServiceSet.has(k) !== newLocalServiceSet.has(k)
    )
    const runningSet = new Set(getRunningServices())
    const servicesToRestart = /** @type {string[]} */ (
      changedKeys
        .map((k) => LOCAL_SERVICES.find((s) => s.key === k)?.composeService)
        .filter((name) => name && runningSet.has(name))
    )

    const newFormDefIdSet = new Set(newFormDefIds)
    const addedFormDefIds = newFormDefIds.filter((id) => !previousFormDefIdSet.has(id))
    const removedFormDefIds = previousFormDefIds.filter((id) => !newFormDefIdSet.has(id))
    const formDefsChanged = addedFormDefIds.length > 0 || removedFormDefIds.length > 0

    const runningResult = await applyRunningLocalOverrideChanges(
      dryRun,
      servicesToRestart,
      formDefsChanged,
      addedFormDefIds,
      removedFormDefIds,
      newFormDefIds
    )
    if (runningResult !== null) return runningResult
  }

  const n = newLocalServices.length
  const summaryParts = []
  if (n) summaryParts.push(`${n} service${n > 1 ? 's' : ''} using local image${n > 1 ? 's' : ''}`)
  if (newFormDefIds.length) {
    summaryParts.push(`${newFormDefIds.length} form-def override${newFormDefIds.length > 1 ? 's' : ''}`)
  }
  return summaryParts.length
    ? `${PURPLE}✔  ${summaryParts.join('  ·  ')}${RESET_COLOR}`
    : `${DIM}Local overrides updated${RESET_COLOR}`
}

/** @param {boolean} dryRun */
async function handleRefreshOverridesCommand(dryRun) {
  // Re-publish the selected YAML overrides into Mongo so freshly-edited
  // definitions (in the local folder or a sibling repo) are served without
  // toggling the override off and on.
  const refreshIds = getSelectedFormDefIds(loadState())
  const applyStatus = refreshIds.length
    ? await runInteractiveAction('form-defs', ['enable', dryRun, refreshIds], 'Refreshing form-def overrides')
    : 0
  return applyStatus !== 0
    ? `${RED}✖${RESET_COLOR}  Form-def overrides refresh failed — check output above`
    : `${PURPLE}✔  Form-def overrides refreshed${RESET_COLOR}`
}

/** @param {boolean} dryRun */
export async function handleChecksCommand(dryRun) {
  const items = [
    { key: 'format', label: 'format', description: 'Format code and docs with Prettier (updates files)' },
    { key: 'lint', label: 'lint', description: 'Run JavaScript, SCSS and type checks' },
    ...TEST_TARGETS.map((target) => ({
      key: `test:${target.key}`,
      label: target.key === 'contracts' ? 'contract tests' : `${target.label} tests`,
      description: target.note ? `${target.description} (${target.note})` : target.description
    })),
    { key: 'all-tests', label: 'all tests', description: 'Run unit, contract and acceptance tests' },
    { key: 'sonar', label: 'sonar', description: 'Scan src/ with local SonarQube (dashboard left running)' },
    { key: 'snyk', label: 'snyk', description: 'Scan dependencies for vulnerabilities (same as CI)' },
    { key: 'check', label: 'pre-pr check', description: 'All tests, Snyk and a PR-scoped Sonar scan (CI gates)' }
  ]
  return handleActionSubmenu(items, 'Checks', (selected) => runSelectedCheck(selected, dryRun))
}

/** @param {boolean} dryRun */
export async function handleToolsCommand(dryRun) {
  const items = [
    { key: 'audit:logs', label: 'audit logs', description: 'Show audit entries from grants-ui container logs' },
    { key: 'audit:queue', label: 'audit queue', description: 'Show the 10 most recent local audit messages' },
    { key: 'audit:clear', label: 'clear audit', description: 'Purge the local audit queue and restart grants-ui' }
  ]
  const labels = {
    'audit:logs': 'Reading audit logs',
    'audit:queue': 'Reading audit queue',
    'audit:clear': 'Clearing audit queue and restarting grants-ui'
  }
  return handleActionSubmenu(items, 'Tools', async (selected) => {
    if (Object.hasOwn(labels, selected)) {
      const previousRun = getLastRun()
      await runInteractiveAction(selected, [dryRun], labels[selected])
      const completed = getLastRun()
      if (['audit:logs', 'audit:queue'].includes(selected) && completed !== previousRun && completed?.logPath) {
        await viewOutput(completed)
      }
    }
    return ''
  })
}

async function handleActionSubmenu(items, title, runSelected) {
  let statusLine = ''
  while (true) {
    await refreshRuntimeStatus()
    const lastRun = getLastRun()
    setActionMenu(items, title)
    const selected = await radioMenu(items, title, {
      hint: `↑ ↓ navigate    enter → run${lastRun?.logPath ? '    l → output' : ''}    esc → back`,
      statusLine,
      outputAvailable: !!lastRun?.logPath
    })
    if (selected === '__quit__') return statusLine
    if (selected === '__output__') {
      await viewOutput(lastRun)
      continue
    }
    statusLine = await runSelected(selected)
    const completed = getLastRun()
    if (completed !== lastRun) {
      statusLine = completed.logPath
        ? actionStatus(completed)
        : `${RED}✖${RESET_COLOR}  Could not run action: ${completed.error}`
    }
  }
}

async function runSelectedCheck(selected, dryRun) {
  const target = TEST_TARGETS.find((item) => `test:${item.key}` === selected)
  if (target) {
    await runInteractiveAction('test', [target.key, dryRun], `Running ${target.key} tests`)
    return ''
  }
  if (selected === 'all-tests') {
    await runInteractiveAction('all-tests', [dryRun], 'Running all tests')
    return ''
  }
  if (selected === 'lint' || selected === 'format') {
    const label = selected === 'format' ? 'Formatting code and docs' : 'Running lint checks'
    await runInteractiveAction(selected, [dryRun], label)
    return ''
  }
  const handlers = { sonar: handleSonarCommand, snyk: handleSnykCommand, check: handleCheckCommand }
  return handlers[selected] ? handlers[selected](dryRun) : ''
}

// ---------------------------------------------------------------------------
// Journey wizard — a little back/forward step machine, one function per step.
// Each step returns 'back' (esc — go back a step), 'skip' (doesn't apply to
// this journey — advance in whichever direction we're already travelling, so
// backward navigation jumps over it too), 'next' (answered, move forward), or
// 'cancel' (terminal — abandon the wizard, with an optional status message).
// ---------------------------------------------------------------------------

const CANCEL_HINT = '↑ ↓  navigate    enter → select    esc → cancel'
const BACK_HINT = '↑ ↓  navigate    enter → select    esc → back'

/**
 * @typedef {{ chosen: string, crn: string | undefined, mode: string | undefined,
 *   clearChoice: string | undefined, mockNoActions: boolean, stop: string | undefined }} JourneyWizardCtx
 */

/**
 * @param {JourneyWizardCtx} ctx
 * @param {string[]} journeys
 */
async function journeyStepSelectJourney(ctx, journeys) {
  // Select a journey. Annotate each with the CRN it needs (or a warning).
  const journeyItems = journeys.map((slug) => {
    const crns = journeyCrnOptions(slug)
    const description = wontCompleteReason(slug)
      ? `${YELLOW}⚠ may not complete${RESET_COLOR}`
      : `${DIM}CRN ${crns[0]?.crn ?? '—'}${RESET_COLOR}`
    return { key: slug, label: slug, description }
  })
  const picked = await radioMenu(journeyItems, 'Select a journey to run', { hint: CANCEL_HINT })
  // esc on the first prompt → back to the main menu (no message, unlike step 4's decline)
  if (picked === '__quit__') return { type: 'cancel', message: null }
  ctx.chosen = picked
  return { type: 'next' }
}

/** @param {JourneyWizardCtx} ctx */
async function journeyStepCrn(ctx) {
  // Pick the CRN to sign in as. Journeys with more than one known-good CRN
  // prompt; a single option is used automatically (methane has none — the
  // won't-complete acknowledgement below covers it).
  const crnOptions = journeyCrnOptions(ctx.chosen)
  if (crnOptions.length <= 1) {
    ctx.crn = crnOptions[0]?.crn
    return { type: 'skip' }
  }
  const crnItems = crnOptions.map((o) => ({ key: o.crn, label: o.crn, description: o.note }))
  const picked = await radioMenu(crnItems, `Select a CRN for '${ctx.chosen}'`, { hint: BACK_HINT })
  if (picked === '__quit__') return { type: 'back' }
  ctx.crn = picked
  return { type: 'next' }
}

/** @param {JourneyWizardCtx} ctx */
async function journeyStepMode(ctx) {
  // Pick how to run it — headless (bundled Chromium) or headed (your Chrome).
  const modeItems = [
    { key: 'headless', label: 'headless', description: 'Run in the background (bundled Chromium)' },
    { key: 'headed', label: 'headed', description: 'Watch it in your installed Google Chrome' }
  ]
  const picked = await radioMenu(modeItems, `Run '${ctx.chosen}' — headed or headless?`, { hint: BACK_HINT })
  if (picked === '__quit__') return { type: 'back' }
  ctx.mode = picked
  return { type: 'next' }
}

/** @param {JourneyWizardCtx} ctx */
async function journeyStepClear(ctx) {
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
  const picked = await radioMenu(clearItems, `Clear application state for '${ctx.chosen}' before running?`, {
    hint: BACK_HINT
  })
  if (picked === '__quit__') return { type: 'back' }
  ctx.clearChoice = picked
  return { type: 'next' }
}

/** @param {JourneyWizardCtx} ctx */
async function journeyStepAck(ctx) {
  // For journeys known not to complete (e.g. farm-payments), make the user
  // acknowledge why before running — a selectable confirm, not just a keypress.
  const wontComplete = wontCompleteReason(ctx.chosen)
  if (!wontComplete) return { type: 'skip' }
  const ackItems = [
    { key: 'cancel', label: 'Cancel', description: 'Back to the menu' },
    { key: 'run', label: 'Run anyway', description: wontComplete.join(' ') }
  ]
  const ack = await radioMenu(ackItems, `${YELLOW}⚠  '${ctx.chosen}' will NOT complete — run anyway?${RESET_COLOR}`, {
    hint: BACK_HINT
  })
  if (ack === '__quit__') return { type: 'back' }
  if (ack !== 'run') return { type: 'cancel', message: `${DIM}Journey '${ctx.chosen}' cancelled${RESET_COLOR}` }
  return { type: 'next' }
}

/** @param {JourneyWizardCtx} ctx */
async function journeyStepMock(ctx) {
  // Offer the land-parcel mock before the stop-page question, so a run can be
  // pointed at the "no eligible actions" path. The local seed gives every
  // parcel at least one action, so this is the only way to reach that page.
  // Only offered for journeys that actually have a map step.
  if (!journeySteps(ctx.chosen).some((s) => s.type === 'mapParcel')) {
    ctx.mockNoActions = false
    return { type: 'skip' }
  }
  const mockItems = [
    { key: 'off', label: 'API Data', description: 'Use whatever actions the land-grants API returns' },
    {
      key: 'no-actions',
      label: 'Mock no eligible actions',
      description: 'Land parcels report no actions — shows the error on the map page'
    }
  ]
  const pickedMock = await radioMenu(mockItems, `Land parcel actions for '${ctx.chosen}'?`, { hint: BACK_HINT })
  if (pickedMock === '__quit__') return { type: 'back' }
  ctx.mockNoActions = pickedMock === 'no-actions'
  return { type: 'next' }
}

/** @param {JourneyWizardCtx} ctx */
async function journeyStepStop(ctx) {
  // Headed only: let the user stop the browser on a chosen page. Lists every
  // page in the journey; picking one passes it as --stop so the run halts
  // there (on the page, before filling it) for inspection.
  if (ctx.mode !== 'headed') {
    ctx.stop = undefined
    return { type: 'skip' }
  }
  const steps = journeySteps(ctx.chosen)
  const stopItems = [
    { key: '__end__', label: 'Run to the end', description: 'Complete the whole journey' },
    ...steps.map((s, i) => ({
      key: String(i + 1),
      label: `${i + 1}. ${s.slug}`,
      description: s.name === s.slug ? '' : s.name
    }))
  ]
  const pickedStop = await radioMenu(stopItems, `Stop '${ctx.chosen}' on which page?`, { hint: BACK_HINT })
  if (pickedStop === '__quit__') return { type: 'back' }
  ctx.stop = pickedStop !== '__end__' ? pickedStop : undefined
  return { type: 'next' }
}

const JOURNEY_WIZARD_STEPS = [
  journeyStepSelectJourney,
  journeyStepCrn,
  journeyStepMode,
  journeyStepClear,
  journeyStepAck,
  journeyStepMock,
  journeyStepStop
]

/**
 * Walk the journey setup as a sequence of prompts, so `esc` goes back one
 * prompt rather than abandoning the whole flow. `dir` tracks whether we're
 * moving forwards (a selection) or backwards (an esc); a step that doesn't
 * apply is skipped in whichever direction we're travelling, so back-navigation
 * always lands on the previous *visible* prompt.
 * @param {string[]} journeys
 * @returns {Promise<{ cancelled: true, statusLine: string } | { cancelled: false, ctx: JourneyWizardCtx }>}
 */
async function runJourneyWizard(journeys) {
  /** @type {JourneyWizardCtx} */
  const ctx = {
    chosen: '',
    crn: undefined,
    mode: undefined,
    clearChoice: undefined,
    mockNoActions: false,
    stop: undefined
  }
  let step = 0
  let dir = 1
  let cancelledStatus = null

  while (step >= 0 && step < JOURNEY_WIZARD_STEPS.length) {
    const outcome = await JOURNEY_WIZARD_STEPS[step](ctx, journeys)
    if (outcome.type === 'back') {
      dir = -1
      step -= 1
      continue
    }
    if (outcome.type === 'skip') {
      step += dir
      continue
    }
    if (outcome.type === 'cancel') {
      cancelledStatus = outcome.message
      step = -1
      break
    }
    dir = 1
    step += 1
  }

  if (step < 0) return { cancelled: true, statusLine: cancelledStatus ?? '' }
  return { cancelled: false, ctx }
}

/** @param {boolean} dryRun */
async function handleJourneyCommand(dryRun) {
  const journeys = listJourneys()
  if (!journeys.length) {
    return `${DIM}No journey definitions found${RESET_COLOR}`
  }

  const wizardResult = await runJourneyWizard(journeys)
  if (wizardResult.cancelled) return wizardResult.statusLine
  const { ctx } = wizardResult

  const code = await runInteractiveAction(
    'journey',
    [
      ctx.chosen,
      {
        crn: ctx.crn,
        stop: ctx.stop,
        mockNoActions: ctx.mockNoActions,
        baseUrl: journeyBaseUrl(),
        headed: ctx.mode === 'headed',
        clear: ctx.clearChoice === 'clear',
        acknowledged: true
      },
      dryRun
    ],
    ctx.stop ? `Running journey ${ctx.chosen} — close browser when finished` : `Running journey ${ctx.chosen}`
  )

  return code === 0
    ? `${PURPLE}✔  Journey '${ctx.chosen}' completed${RESET_COLOR}`
    : `${RED}✖${RESET_COLOR}  Journey '${ctx.chosen}' did not complete (exit ${code}) — check output above`
}

/** @param {boolean} dryRun */
async function handleSonarCommand(dryRun) {
  const code = await runInteractiveAction('sonar', [{ dryRun }], 'Running Sonar scan')

  const sonarLink = `${DIM}results: ${SONAR.hostUrl}${RESET_COLOR}`
  if (dryRun) return `${DIM}Sonar dry-run complete${RESET_COLOR}`
  if (code === SONAR_EXIT.OK) return `${PURPLE}✔  Quality gate passed${RESET_COLOR} — ${sonarLink}`
  if (code === SONAR_EXIT.GATE_FAILED) return `${RED}✖  Quality gate FAILED${RESET_COLOR} — ${sonarLink}`
  return `${RED}✖${RESET_COLOR}  Sonar run error — output: ${SONAR.logFile}`
}

/** @param {boolean} dryRun */
async function handleCheckCommand(dryRun) {
  const code = await runInteractiveAction('check', [dryRun], 'Running pre-pr checks')
  if (dryRun) return `${DIM}pre-pr check dry-run complete${RESET_COLOR}`
  return code === 0
    ? `${PURPLE}✔  pre-pr check passed${RESET_COLOR} — ${DIM}${CHECK.logFile}${RESET_COLOR}`
    : `${RED}✖  pre-pr check failed${RESET_COLOR} — summary: ${CHECK.logFile}`
}

/** @param {boolean} dryRun */
async function handleSnykCommand(dryRun) {
  const code = await runInteractiveAction('snyk', [dryRun], 'Running Snyk scan')

  if (dryRun) return `${DIM}Snyk dry-run complete${RESET_COLOR}`
  if (code === SNYK_EXIT.OK) return `${PURPLE}✔  Snyk: no vulnerabilities found${RESET_COLOR}`
  if (code === SNYK_EXIT.VULNS) return `${RED}✖  Snyk: vulnerabilities found${RESET_COLOR} — output: ${SNYK.logFile}`
  return `${RED}✖${RESET_COLOR}  Snyk run error — not logged in? run 'snyk auth' (free account works) — output: ${SNYK.logFile}`
}

/**
 * down / debug / reset — these hand off to docker (blocking) then report status.
 * @param {'down' | 'debug' | 'reset'} command
 * @param {boolean} dryRun
 */
async function handleDockerLifecycleCommand(command, dryRun) {
  if (command === 'reset') {
    const confirmItems = [
      { key: 'yes', label: 'Yes', description: 'Remove all containers, volumes and local images' },
      { key: 'no', label: 'No', description: 'Cancel and return to main menu' }
    ]
    const confirmed = await radioMenu(confirmItems, `${YELLOW}⚠  Confirm reset?${RESET_COLOR}`, {
      hint: '↑ ↓  navigate    enter → select    esc → cancel'
    })
    if (confirmed !== 'yes') {
      return confirmed === '__quit__' ? '' : `${DIM}Reset cancelled${RESET_COLOR}`
    }
  }

  const labels = { down: 'Stopping containers', debug: 'Starting debugger', reset: 'Resetting Docker stack' }
  const args = command === 'debug' ? [true, dryRun] : [dryRun, true]
  const runStatus = await runInteractiveAction(command, args, labels[command])

  const postRunFiles = getRunningComposeFiles()
  return runStatus !== 0
    ? `${RED}✖${RESET_COLOR}  Docker exited with code ${runStatus} — check output above`
    : buildStatusLine(postRunFiles)
}

/**
 * @typedef {{ dryRun: boolean, savedState: object | null, containersRunning: boolean }} CommandContext
 */

/** @type {Record<string, (ctx: CommandContext) => Promise<string>>} */
const COMMAND_HANDLERS = {
  restart: (ctx) => handleRestartCommand(ctx.dryRun),
  up: (ctx) => handleUpCommand(ctx.dryRun, ctx.savedState),
  local: (ctx) => handleLocalCommand(ctx.dryRun, ctx.savedState, ctx.containersRunning),
  'refresh-overrides': (ctx) => handleRefreshOverridesCommand(ctx.dryRun),
  checks: (ctx) => handleChecksCommand(ctx.dryRun),
  tools: (ctx) => handleToolsCommand(ctx.dryRun),
  journey: (ctx) => handleJourneyCommand(ctx.dryRun),
  down: (ctx) => handleDockerLifecycleCommand('down', ctx.dryRun),
  debug: (ctx) => handleDockerLifecycleCommand('debug', ctx.dryRun),
  reset: (ctx) => handleDockerLifecycleCommand('reset', ctx.dryRun)
}

// ---------------------------------------------------------------------------
// Loop entrypoint
// ---------------------------------------------------------------------------

/** SIGINT handler: restore terminal state if Ctrl+C hits outside raw mode */
function registerSigintHandler() {
  process.on('SIGINT', () => {
    if (cancelActiveAction()) return
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
}

function quitTui() {
  process.stdout.write(ALT_SCREEN_EXIT + SHOW_CURSOR)
  process.stdin.destroy()
  process.exit(0)
}

/**
 * Run the interactive TUI: a menu-driven loop that keeps returning to the main
 * menu until the user quits. Requires a TTY on stdin.
 * @param {boolean} dryRun
 */
export async function runInteractiveLoop(dryRun) {
  if (!process.stdin.isTTY) {
    console.error('No command given and stdin is not a TTY. Run with --help for usage.')
    process.exit(1)
  }

  registerSigintHandler()

  // Enter alternate screen buffer so the TUI leaves no residue in scroll-back
  process.stdout.write(ALT_SCREEN_ENTER + HIDE_CURSOR)

  let statusLine = ''

  while (true) {
    const savedState = loadState()
    const runningComposeFiles = getRunningComposeFiles()
    const containersRunning = !!runningComposeFiles

    const menuItems = buildMainMenuItems(savedState, containersRunning)
    const lastRun = getLastRun()
    if (getActionRuns().length) {
      menuItems.push({ key: 'output', label: 'output ⇢', description: 'Browse output from this session (l → latest)' })
    }
    setActionMenu(menuItems)
    const gasStatus = await refreshRuntimeStatus(runningComposeFiles)
    const gasReachable = gasStatus !== null
    const menuHint = gasReachable ? '↑ ↓  navigate    enter → select    g → set GAS status    esc → quit' : ''

    const command = await radioMenu(menuItems, 'What do you want to do?', {
      statusLine,
      hint: menuHint,
      gasEditable: gasReachable,
      outputAvailable: !!lastRun?.logPath
    })

    if (command === '__output__') {
      await viewOutput(lastRun)
      continue
    }
    if (command === 'output') {
      const runs = getActionRuns()
      const picked = await radioMenu(
        runs.map((run, index) => ({
          key: String(index),
          label: run.label,
          description: `exit ${run.code}`
        })),
        'Action output — newest first',
        { hint: '↑ ↓ navigate    enter → view output    esc → back' }
      )
      if (picked !== '__quit__') await viewOutput(runs[Number(picked)])
      continue
    }
    statusLine = ''

    if (command === '__gas__') {
      statusLine = await handleGasCommand(gasStatus)
      continue
    }
    if (command === '__quit__') {
      quitTui()
    }

    const handler = COMMAND_HANDLERS[command]
    if (handler) {
      statusLine = await handler({ dryRun, savedState, containersRunning })
      const completed = getLastRun()
      if (completed !== lastRun) {
        statusLine = completed.logPath
          ? actionStatus(completed)
          : `${RED}✖${RESET_COLOR}  Could not run action: ${completed.error}`
      }
    }
  }
}

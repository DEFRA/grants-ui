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
import { cmdCheck, cmdDebug, cmdDown, cmdReset, cmdRestart, cmdSnyk, cmdUp } from './commands.js'
import {
  buildStatusLine,
  getAllServices,
  getLocalImages,
  getRunningComposeFiles,
  getRunningServices,
  journeyBaseUrl
} from './docker.js'
import { getSelectedFormDefIds, listOverrideSources, runApplyFormDefs } from './form-defs.js'
import { GAS_DIVIDER, gasStatusSegment, getGasStatus, setGasStatus } from './gas.js'
import { cmdJourney, journeyCrnOptions, journeySteps, listJourneys, wontCompleteReason } from './journey.js'
import { cmdSonar } from './sonar.js'
import { loadState, saveState } from './cli-state.js'
import { cmdTest, testLogPath } from './tests.js'
import { pauseStdin, promptScale, promptTextWithOptions, radioMenu, resumeStdin, toggleMenu } from './tui.js'

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

/**
 * @param {{ localServices?: string[], localFormDefSelections?: string[], localFormDefs?: boolean } | null} savedState
 * @param {boolean} containersRunning
 * @returns {object[]}
 */
function buildMainMenuItems(savedState, containersRunning) {
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

// ---------------------------------------------------------------------------
// Command handlers — one per main-menu item, each returns the next status line
// ---------------------------------------------------------------------------

/**
 * @param {string | null} gasStatus
 * @param {string[] | null} runningComposeFiles
 * @returns {Promise<string>}
 */
async function handleGasCommand(gasStatus, runningComposeFiles) {
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
  // No "GAS status set to …" confirmation — the yellow GAS badge in the status
  // line already reflects the new value on the next render, so just fall back
  // to the default running status line (and only surface a line on failure).
  return ok
    ? buildStatusLine(runningComposeFiles)
    : `${RED}✖${RESET_COLOR}  Failed to set GAS status — is mockserver running?`
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

  pauseStdin()
  const restartStatus = cmdRestart(selectedServices, dryRun, true)
  resumeStdin()

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

  // Pause stdin (keep it open) and exit alt screen before running docker
  pauseStdin()
  const { status: upStatus, elapsedSeconds } = cmdUp(selectedAddons, scale, dryRun, selectedLocalServices, true)
  resumeStdin()

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
  pauseStdin()
  const restartStatus = cmdRestart(servicesToRestart, dryRun, true)
  resumeStdin()
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
  pauseStdin()
  let applyStatus = 0
  if (newFormDefIds.length === 0) {
    // Everything turned off — a full disable (marker sweep) reverts every
    // grant to its repo version and clears any leftover override.
    applyStatus = runApplyFormDefs('disable', dryRun)
  } else {
    if (removedFormDefIds.length) applyStatus = runApplyFormDefs('disable', dryRun, removedFormDefIds)
    if (applyStatus === 0 && addedFormDefIds.length) applyStatus = runApplyFormDefs('enable', dryRun, addedFormDefIds)
  }
  resumeStdin()
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
  pauseStdin()
  const applyStatus = refreshIds.length ? runApplyFormDefs('enable', dryRun, refreshIds) : 0
  resumeStdin()
  return applyStatus !== 0
    ? `${RED}✖${RESET_COLOR}  Form-def overrides refresh failed — check output above`
    : `${PURPLE}✔  Form-def overrides refreshed${RESET_COLOR}`
}

/** @param {boolean} dryRun */
async function handleTestCommand(dryRun) {
  const testItems = TEST_TARGETS.map((t) => ({
    key: t.key,
    label: t.label,
    description: t.note ? `${t.description}  ${DIM}(${t.note})${RESET_COLOR}` : t.description,
    selected: false
  }))
  const toggled = await toggleMenu(testItems, 'Select test suites to run')
  if (toggled === null) return ''
  const selected = toggled.filter((i) => i.selected).map((i) => i.key)
  if (!selected.length) {
    return `${DIM}No suites selected — test run cancelled${RESET_COLOR}`
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
    return `${RED}✖${RESET_COLOR}  ${failure.key} failed (exit ${failure.code})${skippedNote} — output: ${testLogPath(failure.key)}`
  }
  const outputs = !dryRun && passed.length ? ` — output: ${passed.map((k) => testLogPath(k)).join(', ')}` : ''
  return `${PURPLE}✔  Passed: ${passed.join(', ')}${RESET_COLOR}${outputs}`
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

  pauseStdin()
  const code = cmdJourney(
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
  )
  resumeStdin()

  return code === 0
    ? `${PURPLE}✔  Journey '${ctx.chosen}' completed${RESET_COLOR}`
    : `${RED}✖${RESET_COLOR}  Journey '${ctx.chosen}' did not complete (exit ${code}) — check output above`
}

/** @param {boolean} dryRun */
async function handleSonarCommand(dryRun) {
  pauseStdin()
  const code = await cmdSonar({ dryRun })
  resumeStdin()

  const sonarLink = `${DIM}results: ${SONAR.hostUrl}${RESET_COLOR}`
  if (dryRun) return `${DIM}Sonar dry-run complete${RESET_COLOR}`
  if (code === SONAR_EXIT.OK) return `${PURPLE}✔  Quality gate passed${RESET_COLOR} — ${sonarLink}`
  if (code === SONAR_EXIT.GATE_FAILED) return `${RED}✖  Quality gate FAILED${RESET_COLOR} — ${sonarLink}`
  return `${RED}✖${RESET_COLOR}  Sonar run error — output: ${SONAR.logFile}`
}

/** @param {boolean} dryRun */
async function handleCheckCommand(dryRun) {
  pauseStdin()
  const code = await cmdCheck(dryRun)
  resumeStdin()
  if (dryRun) return `${DIM}pre-pr check dry-run complete${RESET_COLOR}`
  return code === 0
    ? `${PURPLE}✔  pre-pr check passed${RESET_COLOR} — ${DIM}${CHECK.logFile}${RESET_COLOR}`
    : `${RED}✖  pre-pr check failed${RESET_COLOR} — summary: ${CHECK.logFile}`
}

/** @param {boolean} dryRun */
async function handleSnykCommand(dryRun) {
  pauseStdin()
  const code = cmdSnyk(dryRun)
  resumeStdin()

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

  pauseStdin()
  let runStatus = 0
  if (command === 'down') runStatus = cmdDown(dryRun, true) ?? 0
  else if (command === 'debug') runStatus = cmdDebug(true) ?? 0
  else if (command === 'reset') runStatus = cmdReset(dryRun) ?? 0
  resumeStdin()

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
  test: (ctx) => handleTestCommand(ctx.dryRun),
  journey: (ctx) => handleJourneyCommand(ctx.dryRun),
  sonar: (ctx) => handleSonarCommand(ctx.dryRun),
  check: (ctx) => handleCheckCommand(ctx.dryRun),
  snyk: (ctx) => handleSnykCommand(ctx.dryRun),
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

  // Interactive loop — keeps returning to main menu until user quits
  // Run status on first entry so the user sees what's running immediately
  const initialRunning = getRunningComposeFiles()
  let statusLine = buildStatusLine(initialRunning)

  while (true) {
    const savedState = loadState()
    const runningComposeFiles = getRunningComposeFiles()
    const containersRunning = !!runningComposeFiles

    const menuItems = buildMainMenuItems(savedState, containersRunning)
    const gasStatus = await resolveGasStatus(containersRunning, runningComposeFiles)
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
      statusLine = await handleGasCommand(gasStatus, runningComposeFiles)
      continue
    }
    if (command === '__quit__') {
      quitTui()
    }

    const handler = COMMAND_HANDLERS[command]
    if (handler) {
      statusLine = await handler({ dryRun, savedState, containersRunning })
    }
  }
}

/* eslint-disable no-console, curly */

import { spawnSync } from 'node:child_process'

import { APPLY_FORM_DEFS_SCRIPT, DIM, RESET_COLOR, ROOT } from './constants.js'
import { discoverOverrides } from '../apply-local-form-defs.mjs'

// ---------------------------------------------------------------------------
// Local form-definition override helpers
// ---------------------------------------------------------------------------

/**
 * Discover every selectable form-definition override, from both the in-repo
 * `local-form-definitions` folder and any sibling `grants-config-*` repo
 * checkouts placed next to grants-ui. Each entry carries a stable `id`
 * (`<grant>::<sourceKey>`) used as the selection key, its `grant`, and a
 * human-readable `source`. Discovery failures degrade to an empty list so the
 * menu never crashes.
 * @returns {import('../apply-local-form-defs.mjs').OverrideEntry[]}
 */
export function listOverrideSources() {
  try {
    return discoverOverrides().overrides
  } catch {
    return []
  }
}

/** True when at least one form-definition override (folder or sibling repo) is available */
export function hasLocalFormDefs() {
  return listOverrideSources().length > 0
}

/**
 * Resolve the persisted set of selected override ids, migrating the legacy
 * boolean `localFormDefs` flag (all folder overrides on/off) to the per-grant
 * `localFormDefSelections` array on first read.
 * @param {{ localFormDefSelections?: string[], localFormDefs?: boolean } | null} state
 * @returns {string[]}
 */
export function getSelectedFormDefIds(state) {
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
export function runApplyFormDefs(mode, dryRun = false, selection = null) {
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

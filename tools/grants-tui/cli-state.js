/* eslint-disable curly */

import * as fs from 'node:fs'

import { STATE_FILE } from './constants.js'

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

export const STATE_VERSION = 1

/**
 * @typedef {object} InspectorSelection
 * @property {string} [grantCode]
 * @property {string} [sbi]
 * @property {string} [grantVersion]
 */

/**
 * @typedef {object} CliState
 * @property {number} [version]  
 * @property {string[]} addons
 * @property {number | null} scale
 * @property {string[]} localServices
 * @property {string[]} [localFormDefSelections]  Unset only while a legacy `localFormDefs` flag awaits migration
 * @property {string[]} [tailscaleShareIds]  
 * @property {InspectorSelection} [stateInspector]  
 * @property {boolean} [localFormDefs]  
 */

/** @returns {CliState} */
export function emptyState() {
  return { addons: [], scale: null, localServices: [], localFormDefSelections: [] }
}

/** @param {unknown} value */
const isStringArray = (value) => Array.isArray(value) && value.every((v) => typeof v === 'string')

/** @param {unknown} value */
const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Fill missing required keys and drop known keys with the wrong type
 * @param {Record<string, unknown>} raw
 * @returns {CliState}
 */
function normaliseState(raw) {
  /** @type {Record<string, unknown>} */
  const state = { ...raw }
  for (const key of ['addons', 'localServices']) {
    if (!isStringArray(state[key])) state[key] = []
  }
  if (typeof state.scale !== 'number') state.scale = null
  if ('tailscaleShareIds' in state && !Array.isArray(state.tailscaleShareIds)) delete state.tailscaleShareIds
  if ('stateInspector' in state && !isPlainObject(state.stateInspector)) delete state.stateInspector
  if ('localFormDefs' in state && typeof state.localFormDefs !== 'boolean') delete state.localFormDefs
  if (!isStringArray(state.localFormDefSelections)) {
    if (state.localFormDefs === true) delete state.localFormDefSelections
    else state.localFormDefSelections = []
  }
  return /** @type {CliState} */ (state)
}

/**
 * Merge a patch into the saved state and write it owner-only
 * @param {Partial<CliState>} patch
 */
function writeState(patch) {
  const state = { ...(loadState() ?? emptyState()), ...patch, version: STATE_VERSION }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 })
  fs.chmodSync(STATE_FILE, 0o600)
}

export function saveState(addons, scale, localServices = [], localFormDefSelections = []) {
  try {
    writeState({ addons, scale, localServices, localFormDefSelections })
  } catch {
    // non-fatal
  }
}

/**
 * IDs of Tailscale device invites created by gt. The invite URLs are deliberately
 * never persisted: anyone with one can accept the share.
 * @param {string[]} ids
 */
export function saveTailscaleShareIds(ids) {
  try {
    writeState({ tailscaleShareIds: [...new Set(ids)] })
  } catch {
    // Non-fatal: the Tailscale admin console remains the source of truth.
  }
}

/** @param {CliState | null | undefined} state */
export function getTailscaleShareIds(state = loadState()) {
  return Array.isArray(state?.tailscaleShareIds) ? state.tailscaleShareIds.filter((id) => typeof id === 'string') : []
}

/**
 * Store query preferences only, never fetched application state.
 * @param {InspectorSelection} selection
 */
export function saveInspectorSelection(selection) {
  try {
    writeState({ stateInspector: selection })
  } catch {
    // Preferences are optional; the inspector can still run.
  }
}

/**
 * The saved state, or null when nothing has been saved
 * @returns {CliState | null}
 */
export function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
      return isPlainObject(raw) ? normaliseState(raw) : null
    }
  } catch {
    // non-fatal
  }
  return null
}

export function clearState() {
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE)
  } catch {
    // non-fatal
  }
}

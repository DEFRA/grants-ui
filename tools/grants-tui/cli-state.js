/* eslint-disable curly */

import * as fs from 'node:fs'

import { STATE_FILE } from './constants.js'

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

export function saveState(addons, scale, localServices = [], localFormDefSelections = []) {
  try {
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ ...loadState(), addons, scale, localServices, localFormDefSelections }, null, 2)
    )
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
    const state = loadState() ?? { addons: [], scale: null, localServices: [], localFormDefSelections: [] }
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, tailscaleShareIds: [...new Set(ids)] }, null, 2), {
      mode: 0o600
    })
  } catch {
    // Non-fatal: the Tailscale admin console remains the source of truth.
  }
}

/** @param {object | null | undefined} state */
export function getTailscaleShareIds(state = loadState()) {
  return Array.isArray(state?.tailscaleShareIds) ? state.tailscaleShareIds.filter((id) => typeof id === 'string') : []
}

/** Store query preferences only, never fetched application state. */
export function saveInspectorSelection(selection) {
  try {
    const state = loadState() ?? { addons: [], scale: null, localServices: [], localFormDefSelections: [] }
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, stateInspector: selection }, null, 2), { mode: 0o600 })
  } catch {
    // Preferences are optional; the inspector can still run.
  }
}

export function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
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

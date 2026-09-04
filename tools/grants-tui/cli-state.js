/* eslint-disable curly */

import * as fs from 'node:fs'

import { STATE_FILE } from './constants.js'

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

export function saveState(addons, scale, localServices = [], localFormDefSelections = []) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ addons, scale, localServices, localFormDefSelections }, null, 2))
  } catch {
    // non-fatal
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

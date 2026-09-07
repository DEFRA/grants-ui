/* eslint-disable */

// ---------------------------------------------------------------------------
// GAS mock status helpers
//
// When the GAS addon (compose.gas.yml) isn't running, grants-ui talks to the
// mockserver (compose.infra.yml, host port 1080) for the GAS application status
// endpoint. These helpers get/set the mocked status directly from `gt`, mirroring
// the `gas-status:get` / `gas-status:set` npm scripts but without curl + jq.
// ---------------------------------------------------------------------------

import { DIM, RESET_COLOR, YELLOW } from './constants.js'

const MOCKSERVER_URL = 'http://localhost:1080'
// Expectation id owned by the GAS application-status stub — must match the seeded
// expectation in mockserver/expectations.json so we update it in place.
const EXPECTATION_ID = 'gas-application-status-200'
const STATUS_PATH = '/grants/.*/applications/.*/status'
// Shown when mockserver is up but no matching expectation is registered.
const DEFAULT_STATUS = 'RECEIVED (default)'

/** Dim vertical bar used to fence the GAS segment off from the rest of the status line. */
export const GAS_DIVIDER = `${DIM}│${RESET_COLOR}`

/**
 * Yellow `GAS: <status>` badge for the interactive status line.
 * @param {string} statusText
 * @returns {string}
 */
export function gasStatusSegment(statusText) {
  return `${YELLOW}GAS: ${statusText}${RESET_COLOR}`
}

/**
 * Current mocked GAS application status, read from mockserver's active expectations.
 * Returns the status string (or a "(default)" marker when no expectation is set),
 * or `null` when mockserver is unreachable so callers can hide the segment.
 * @returns {Promise<string | null>}
 */
export async function getGasStatus() {
  try {
    const res = await fetch(`${MOCKSERVER_URL}/mockserver/retrieve?type=ACTIVE_EXPECTATIONS`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: STATUS_PATH }),
      signal: AbortSignal.timeout(1500)
    })
    if (!res.ok) return null
    const expectations = await res.json()
    const match = Array.isArray(expectations) ? expectations.find((e) => e.id === EXPECTATION_ID) : null
    return match?.httpResponse?.body?.status ?? DEFAULT_STATUS
  } catch {
    return null
  }
}

/**
 * Overwrite the mocked GAS application status expectation on mockserver.
 * @param {string} status
 * @returns {Promise<boolean>}  true when mockserver accepted the update
 */
export async function setGasStatus(status) {
  try {
    const res = await fetch(`${MOCKSERVER_URL}/mockserver/expectation`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: EXPECTATION_ID,
        priority: 0,
        httpRequest: { method: 'GET', path: STATUS_PATH },
        httpResponse: { statusCode: 200, body: { status } }
      }),
      signal: AbortSignal.timeout(3000)
    })
    return res.ok
  } catch {
    return false
  }
}

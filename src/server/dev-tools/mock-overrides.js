import { isDevToolsEnabled } from '~/src/server/dev-tools/dev-tools-enabled.js'

/**
 * Make the app pretend the selected land parcel has no eligible actions.
 */
export const NO_ACTIONS_MOCK_COOKIE = 'dev_mock_no_actions'

/**
 * Whether this request should treat every selected land parcel as having no
 * eligible actions.
 * @param {{ state?: Record<string, unknown> }} [request]
 * @returns {boolean}
 */
export function isNoActionsMockEnabled(request) {
  if (!isDevToolsEnabled()) {
    return false
  }
  return request?.state?.[NO_ACTIONS_MOCK_COOKIE] === '1'
}

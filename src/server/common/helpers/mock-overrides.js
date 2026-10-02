import { isDevToolsEnabled } from './dev-tools-enabled.js'

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

/**
 * Make the app pretend the application window is closed for this grant.
 */
export const WINDOW_CLOSED_MOCK_COOKIE = 'dev_mock_window_closed'

/**
 * Whether this request should be treated as if the grant's application
 * window were closed, regardless of the grant's actual metadata.
 * @param {{ state?: Record<string, unknown> }} [request]
 * @returns {boolean}
 */
export function isWindowClosedMockEnabled(request) {
  if (!isDevToolsEnabled()) {
    return false
  }
  return request?.state?.[WINDOW_CLOSED_MOCK_COOKIE] === '1'
}

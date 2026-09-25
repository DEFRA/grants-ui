import { isWindowClosedMockEnabled } from './mock-overrides.js'

/**
 * @typedef {object} ApplicationWindow
 * @property {string} [closesAt] - ISO 8601 datetime the window closes (exclusive)
 */

/**
 * Whether the grant's application window is open, from the form definition's
 * `metadata.applicationWindow.closesAt`. A grant with no `closesAt` is always open.
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isApplicationWindowOpen(request, now = new Date()) {
  if (isWindowClosedMockEnabled(request)) {
    return false
  }

  const def = /** @type {{ metadata?: { applicationWindow?: ApplicationWindow } } | undefined} */ (
    /** @type {{ model?: { def?: unknown } }} */ (request.app).model?.def
  )
  const closesAt = def?.metadata?.applicationWindow?.closesAt

  return !(closesAt && now >= new Date(closesAt))
}

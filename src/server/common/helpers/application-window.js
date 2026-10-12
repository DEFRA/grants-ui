import { log, LogCodes } from './logging/log.js'
import { isWindowClosedMockEnabled } from './mock-overrides.js'

/**
 * @typedef {object} ApplicationWindow
 * @property {string} [closesAt] - ISO 8601 datetime from which the window is closed (closed at and after this instant)
 */

/**
 * Whether the grant's application window is open, from the form definition's
 * `metadata.applicationWindow.closesAt`. A grant with no `closesAt` is always open.
 * An unparseable `closesAt` is logged and treated as closed.
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 * @param {Date} [now]
 * @param {{name?: string, metadata?: {applicationWindow?: ApplicationWindow}}} [definition]
 * @returns {boolean}
 */
export function isApplicationWindowOpen(request, now = new Date(), definition = undefined) {
  if (isWindowClosedMockEnabled(request)) {
    return false
  }

  const def =
    definition ??
    /** @type {{ name?: string, metadata?: { applicationWindow?: ApplicationWindow } } | undefined} */ (
      /** @type {{ model?: { def?: unknown } }} */ (request.app).model?.def
    )
  const closesAt = def?.metadata?.applicationWindow?.closesAt

  if (!closesAt) {
    return true
  }

  const closesAtDate = new Date(closesAt)

  if (Number.isNaN(closesAtDate.getTime())) {
    log(LogCodes.SYSTEM.INVALID_APPLICATION_WINDOW, { formName: def?.name, closesAt }, request)
    return false
  }

  return now < closesAtDate
}

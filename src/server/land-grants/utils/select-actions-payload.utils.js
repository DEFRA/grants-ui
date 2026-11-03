import { ACTION_QUANTITY_FIELD_PREFIX } from '~/src/shared/action-quantity-field.js'
import { normaliseQuantityInput } from '~/src/shared/action-quantity-validation.js'
import { SELECTED_ACTIONS_FIELD_NAME } from './selected-actions-field.js'

/**
 * The inline message for each action
 * @param {Array<{ text: string, code?: string }>} errors
 * @returns {Record<string, string>}
 */
export function getQuantityErrorsByCode(errors) {
  return Object.fromEntries(errors.filter((e) => e.code).map((e) => [/** @type {string} */ (e.code), e.text]))
}

/**
 * The inline message for the action checkboxes, when no action was selected
 * @param {Array<{ text: string, href?: string }>} errors
 * @returns {string | undefined}
 */
export function getSelectedActionsErrorText(errors) {
  return errors.find((e) => e.href === `#${SELECTED_ACTIONS_FIELD_NAME}`)?.text
}

/**
 * Trims every quantity field and gives a bare decimal its leading zero.
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown>}
 */
export function normaliseQuantityFields(payload) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) =>
      key.startsWith(ACTION_QUANTITY_FIELD_PREFIX) && typeof value === 'string'
        ? [key, normaliseQuantityInput(value)]
        : [key, value]
    )
  )
}

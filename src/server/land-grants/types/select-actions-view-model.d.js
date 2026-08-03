/**
 * @typedef {object} Action
 * @property {string} code - Action code
 * @property {string} description - Action description
 * @property {string} version - Action version
 * @property {number} [ratePerUnitGbp] - Payment rate per unit in GBP
 * @property {boolean} [sssiConsentRequired] - Action requires SSSI consent
 * @property {boolean} [heferRequired] - Action requires HEFER
 * @property {number} [ratePerAgreementPerYearGbp] - Additional payment per agreement per year
 * @property {object} [availableArea] - Available area for the action
 * @property {number} [availableArea.value] - Area value
 * @property {string} [availableArea.unit] - Area unit
 * @property {object} [staticAvailableArea] - The action's original, uncompeted available area (see mergeRecomputedAvailability)
 * @property {number} [staticAvailableArea.value] - Area value
 * @property {string} [staticAvailableArea.unit] - Area unit
 * @property {object} [metadata] - Additional action metadata
 * @property {string} [metadata.guidance_link] - URL to the action's guidance page
 * @property {'total'|'partial'|'limited'} [metadata.available_area_type] - Whether this action
 *   needs a user-typed quantity (see requiresQuantityInput in shared/action-quantity-type.js)
 */

/**
 * @typedef {object} ActionGroup
 * @property {string} name - Group name
 * @property {Array<string>} consents - Array of consents for the group
 * @property {Array<Action>} actions - Actions in the group
 */

/**
 * @typedef {object} CheckboxItem
 * @property {string} [id] - Explicit, stable checkbox id (flat select-actions page only - used
 *   for error-summary anchors, since all actions share one checkbox `name` and GOV.UK's
 *   positional auto-id isn't addressable by action code)
 * @property {string} value - Checkbox value
 * @property {string} [text] - Checkbox label (grouped page)
 * @property {string} [html] - Checkbox label content, description + hint together (flat page)
 * @property {boolean} checked - Whether checkbox is checked
 * @property {string[]} [consents] - Consent type keys this action requires, e.g. ['sssi', 'hefer']
 *   (flat page only)
 * @property {object} [hint] - Hint text configuration (grouped page)
 * @property {string} [hint.html] - HTML content for hint (grouped page)
 * @property {{ 'data-available-unit': string|undefined, 'data-total-available-area': number|undefined, 'data-available-area-type': string }} [attributes] -
 *   Rendered onto the checkbox <input> (flat page only). `data-total-available-area` is set
 *   once and never touched client-side, so it stays the original full amount.
 *   `data-available-area-type` mirrors metadata.available_area_type ('total' when unset) so the
 *   client can decide whether an action needs a typed quantity without re-deriving it.
 * @property {{ html: string }} [conditional] - Conditional reveal markup shown when checked/selected
 */

/**
 * @typedef {object} GroupViewModel
 * @property {string} name - Group name
 * @property {Array<CheckboxItem>} actions - Mapped action checkboxes
 */

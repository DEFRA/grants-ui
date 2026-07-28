/**
 * @typedef {object} Action
 * @property {string} code - Action code
 * @property {string} description - Action description
 * @property {string} version - Action version
 * @property {number} [ratePerUnitGbp] - Payment rate per unit in GBP
 * @property {boolean} [sssiConsentRequired] - Action requires SSSI consent
 * @property {boolean} [heferRequired] - Action requires HEFER
 * @property {number} [requiresMaxQuantity] - If set, the user must enter a quantity for this action, capped at this value
 * @property {number} [ratePerAgreementPerYearGbp] - Additional payment per agreement per year
 * @property {object} [availableArea] - Available area for the action
 * @property {number} [availableArea.value] - Area value
 * @property {string} [availableArea.unit] - Area unit
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
 * @property {{ 'data-available-unit': string|undefined, 'data-total-available-area': number|undefined }} [attributes] -
 *   Rendered onto the checkbox <input> (flat page only). `data-total-available-area` is set
 *   once and never touched client-side, so it stays the original full amount.
 * @property {{ html: string }} [conditional] - Conditional reveal markup shown when checked/selected
 */

/**
 * @typedef {object} GroupViewModel
 * @property {string} name - Group name
 * @property {Array<CheckboxItem>} actions - Mapped action checkboxes
 */

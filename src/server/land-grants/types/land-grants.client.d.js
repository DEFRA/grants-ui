/**
 * @typedef Action
 * @property {string} code
 * @property {number} quantity
 */

/**
 * @typedef LandActions
 * @property {string} sheetId
 * @property {string} parcelId
 * @property {Action[]} actions
 */

/**
 * An in-progress action selection sent to the parcels endpoint so it can recompute
 * availableArea against this planned combination merged with existing agreements.
 * @typedef {object} PlannedAction
 * @property {string} actionCode
 * @property {number} quantity
 * @property {'ha'|'sqm'} unit
 */

/**
 * @typedef ActionGroup
 * @property {string} name
 * @property {Size} totalAvailableArea
 * @property {ActionOption[]} actions
 * @property {string[]} consents - Array of consent type keys required for this group (e.g., ['sssi', 'hefer'])
 */

/**
 * @typedef {object} ActionGroupDefinition
 * @property {string} name - The group name
 * @property {string[]} actions - Array of action codes belonging to this group
 */

/**
 * @typedef {object} Size
 * @property {number} value
 * @property {string} unit - The unit of measurement (e.g., "ha")
 * @property {string} unitFullName - The full name for unit of measurement (e.g., "hectares")
 */

/**
 * @typedef {object} ActionMetadata
 * @property {string} [guidance_link] - URL to the action's guidance page
 * @property {'total'|'partial'|'limited'} [available_area_type] - How the user must enter a
 *   quantity relative to availableArea: 'total' (or unset) requires the full amount and shows
 *   no quantity input; 'partial'/'limited' show a quantity input capped at availableArea
 */

/**
 * @typedef {object} ActionOption
 * @property {string} code - The action code
 * @property {string} description - The action description
 * @property {string} version - The action version
 * @property {boolean} [sssiConsentRequired] - If action needs SSSI consent
 * @property {boolean} [heferRequired] - If action needs HEFER report
 * @property {Size} availableArea - The available area for the action
 * @property {number} ratePerUnitGbp - The rate per unit in GBP
 * @property {number} ratePerAgreementPerYearGbp - The rate per agreement per year in GBP
 * @property {ActionMetadata} [metadata] - Additional action metadata, e.g. guidance link
 */

/**
 * @typedef {object} Parcel
 * @property {string} parcelId - The parcel identifier
 * @property {string} sheetId - The sheet identifier
 * @property {Size | null} size - The size of the parcel
 * @property {ActionOption[] | null} actions - Array of actions available for the parcel
 */

/**
 * A Parcel with its area filled in from the land-grants sizes lookup.
 * The lookup yields a full Size, or `{}` when it has nothing for that parcel —
 * hence Partial rather than Size.
 * @typedef {Parcel & { area?: Partial<Size> }} HydratedParcel
 */

/**
 * @typedef {object} ParcelResponse
 * @property {Parcel[]} parcels - Array of parcel details
 * @property {string} message - Indicates if the retrieval was successful
 * @property {ActionGroupDefinition[]} [groups] - Action group definitions from backend
 */

/**
 * @typedef {object} ValidateApplicationRequest
 * @property {string} applicationId
 * @property {string} requester
 * @property {string} applicantCrn
 * @property {number} sbi - The SBI (Single Business Identifier) for the application
 * @property {LandActions[]} landActions
 */

/**
 * @typedef {object} ErrorItem
 * @property {string} code
 * @property {string} description
 * @property {string} sheetId
 * @property {string} parcelId
 * @property {boolean} passed
 */

/**
 * @typedef {object} ValidationRule
 * @property {string} name
 * @property {boolean} passed
 * @property {string} reason
 * @property {string} description
 */

/**
 * @typedef {object} ValidationAction
 * @property {string} actionCode
 * @property {string} sheetId
 * @property {string} parcelId
 * @property {boolean} hasPassed
 * @property {ValidationRule[]} rules
 */

/**
 * @typedef {object} ValidateApplicationResponse
 * @property {string} id
 * @property {string} message
 * @property {boolean} valid
 * @property {ErrorItem[]} [errorMessages]
 * @property {ValidationAction[]} [actions]
 */

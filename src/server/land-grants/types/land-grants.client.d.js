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
 * @typedef ActionGroup
 * @property {string} name
 * @property {Size} totalAvailableArea
 * @property {ActionOption[]} actions
 * @property {string[]} consents - Array of consent type keys required for this group (e.g., ['sssi', 'hefer'])
 */

/**
 * @typedef {object} Size
 * @property {number} value
 * @property {string} unit - The unit of measurement (e.g., "ha")
 * @property {string} unitFullName - The full name for unit of measurement (e.g., "hectares")
 */

/**
 * @typedef {object} ActionOption
 * @property {string} code - The action code
 * @property {string} description - The action description
 * @property {boolean} [sssiConsentRequired] - If action needs SSSI consent
 * @property {boolean} [heferRequired] - If action needs HEFER report
 * @property {Size} availableArea - The available area for the action
 * @property {number} ratePerUnitGbp - The rate per unit in GBP
 * @property {number} ratePerAgreementPerYearGbp - The rate per agreement per year in GBP
 */

/**
 * @typedef {object} Parcel
 * @property {string} parcelId - The parcel identifier
 * @property {string} sheetId - The sheet identifier
 * @property {Size | null} size - The size of the parcel
 * @property {ActionOption[] | null} actions - Array of actions available for the parcel
 */

/**
 * @typedef {object} ParcelResponse
 * @property {Parcel[]} parcels - Array of parcel details
 * @property {string} message - Indicates if the retrieval was successful
 */

/**
 * @typedef {object} ValidateApplicationRequest
 * @property {string} applicationId
 * @property {string} requester
 * @property {string} applicantCrn
 * @property {string} sbi - The SBI (Single Business Identifier) for the application
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

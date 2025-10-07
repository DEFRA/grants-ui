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
 */

/**
 * @typedef {object} Size
 * @property {number} value
 * @property {string} unit - The unit of measurement (e.g., "ha")
 */

/**
 * @typedef {object} ActionOption
 * @property {string} code - The action code
 * @property {string} description - The action description
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
 * @typedef {object} ValidateApplicationResponse
 * @property {string} id
 * @property {string} message
 * @property {boolean} valid
 * @property {ErrorItem[]} errorMessages
 */

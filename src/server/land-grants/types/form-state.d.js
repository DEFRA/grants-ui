/**
 * Written by `buildActionStateEntry()` in
 * `src/server/land-grants/view-state/land-parcel.view-state.js`, which coerces
 * the claimed area with `Number()` before persisting it.
 * @typedef {Object} ActionData
 * @property {number} value - The claimed area for this action
 * @property {string} unit - Unit of measurement (e.g., "ha")
 * @property {string} description - Action description with code
 * @property {string} version - Action version
 * @property {string[]} consents - Consent keys this action requires (e.g., "sssi", "hefer")
 */

/**
 * @typedef {Object.<string, ActionData>} ActionsObject
 * Actions indexed by action code (e.g., "CSAM1")
 */

/**
 * @typedef {Object} LandParcel
 * @property {Size | null} size - Total area of this parcel, as returned by the parcels API
 * @property {ActionsObject} [actionsObj] - Actions applied to this parcel
 */

/**
 * @typedef {Object.<string, LandParcel>} LandParcels
 * Land parcels indexed by parcel key (format: "sheetId-parcelId")
 */

/**
 * @typedef {Object} LandParcelMetadataItem
 * @property {string} parcelId - Parcel identifier (format: "sheetId-parcelId")
 * @property {number | null} areaHa - Area of the parcel in hectares
 */

/**
 * @typedef {Object} FormState
 * @property {string} sbi - Single Business Identifier
 * @property {string} crn - Customer Reference Number
 * @property {Applicant} applicant - Applicant details
 * @property {PaymentCalculation} payment - Payment details
 * @property {LandParcels} landParcels - Land parcels with actions
 * @property {LandParcelMetadataItem[]} [landParcelMetadata] - Area metadata for selected parcels (woodland journey)
 * @property {ValidateApplicationResponse} [validationResult] - Last rules-engine result, mapped to rulesCalculations
 */

/**
 * @import { PaymentCalculation } from '~/src/server/land-grants/types/payment.d.js'
 * @import { Applicant } from '~/src/server/land-grants/types/applicant.d.js'
 * @import { Size, ValidateApplicationResponse } from '~/src/server/land-grants/types/land-grants.client.d.js'
 */

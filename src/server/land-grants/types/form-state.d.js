/**
 * @typedef {Object} ActionData
 * @property {string} value - The value/quantity as a string
 * @property {string} unit - Unit of measurement (e.g., "ha")
 */

/**
 * @typedef {Object.<string, ActionData>} ActionsObject
 * Actions indexed by action code (e.g., "CSAM1")
 */

/**
 * @typedef {Object} LandParcel
 * @property {ActionsObject} actionsObj - Actions applied to this parcel
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
 */

/**
 * @import { PaymentCalculation } from '~/src/server/land-grants/types/payment.d.js'
 * @import { Applicant } from '~/src/server/land-grants/types/applicant.d.js'
 */

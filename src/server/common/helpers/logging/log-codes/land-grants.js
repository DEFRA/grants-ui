/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const LAND_GRANTS = {
  LAND_GRANT_APPLICATION_STARTED: {
    level: 'info',
    messageFunc: (messageOptions) => `Land grant application started for user=${messageOptions.userId}`
  },
  LAND_GRANT_APPLICATION_SUBMITTED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Land grant application submitted for user=${messageOptions.userId}, referenceNumber=${messageOptions.referenceNumber}`
  },
  LAND_GRANT_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Land grant processing error for user=${messageOptions.userId}: ${messageOptions.errorMessage}`
  },
  NO_LAND_PARCELS_FOUND: {
    level: 'warn',
    messageFunc: (messageOptions) => `No land parcels found for sbi=${messageOptions.sbi}`
  },
  NO_ACTIONS_FOUND: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `No actions found | parcelId: ${messageOptions.parcelId} | sheetId: ${messageOptions.sheetId}`
  },
  VALIDATE_APPLICATION_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Error validating application: ${messageOptions.errorMessage} | parcelId: ${messageOptions.parcelId} | sheetId: ${messageOptions.sheetId}`
  },
  FETCH_ACTIONS_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Error fetching actions: ${messageOptions.errorMessage} | sbi: ${messageOptions.sbi} | parcelId: ${messageOptions.parcelId} | sheetId: ${messageOptions.sheetId}`
  },
  FARM_DETAILS_MISSING_FIELDS: {
    level: 'warn',
    messageFunc: (messageOptions) =>
      `Missing farm contact details for sbi: ${messageOptions.sbi} | fields: ${messageOptions.missingFields.join(', ')}`
  },
  UNAUTHORISED_PARCEL: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Land parcel doesn't belong to sbi=${messageOptions.sbi} | selectedLandParcel: ${messageOptions.selectedLandParcel} | landParcelsForSbi=${JSON.stringify(messageOptions.landParcelsForSbi)}`
  },
  API_REQUEST: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Land Grants API request | endpoint: ${messageOptions.endpoint} | url: ${messageOptions.url}`
  }
}

/**
 * Creates an object with unit and quantity if they exist
 * @param {object} data - The data object
 * @param {string} quantityField - The field name for quantity (default: 'value')
 * @returns {object} Object with unit and quantity
 */
function createUnitQuantity(data, quantityField = 'value') {
  if (!data) {
    return {}
  }

  const result = {}

  if (data.unit != null) {
    result.unit = data.unit.trim()
  }

  const quantityValue = data[quantityField]
  if (quantityValue != null) {
    const quantity = Number.parseFloat(quantityValue)
    if (!Number.isNaN(quantity)) {
      result.quantity = quantity
    }
  }

  return result
}

/**
 * Helper to check if an object has any properties
 */
function hasProperties(obj) {
  return Object.keys(obj).length > 0
}

/**
 * Finds payment item data from API response
 * @param {object} paymentData - The payment object from API
 * @param {string} actionCode - The action code
 * @param {string} sheetId - The sheet ID
 * @param {string} parcelId - The parcel ID
 * @returns {object|null} The combined payment item data or null
 */
function findPaymentItem(paymentData, actionCode, sheetId, parcelId) {
  if (!paymentData) {
    return null
  }

  const parcelLevelItem = Object.values(paymentData.parcelItems ?? {}).find(
    (item) => item.code === actionCode && item.sheetId === sheetId && item.parcelId === parcelId
  )

  const agreementLevelItem = Object.values(paymentData.agreementLevelItems ?? {}).find(
    (item) => item.code === actionCode
  )

  if (!parcelLevelItem && !agreementLevelItem) {
    return null
  }

  const baseItem = parcelLevelItem || agreementLevelItem

  return {
    description: baseItem.description,
    durationYears: baseItem.durationYears,
    annualPaymentPence: baseItem.annualPaymentPence,
    ...(parcelLevelItem && { rateInPence: parcelLevelItem.rateInPence }),
    ...(agreementLevelItem && { agreementLevelPaymentPence: agreementLevelItem.annualPaymentPence })
  }
}

/**
 * Creates payment rates object from payment item
 * @param {object} paymentItem - The payment item data
 * @returns {object} Payment rates object
 */
function createPaymentRates(paymentItem) {
  if (!paymentItem) {
    return {}
  }

  const rates = {}

  if (paymentItem.rateInPence != null) {
    rates.ratePerUnitPence = paymentItem.rateInPence
  }

  if (paymentItem.agreementLevelPaymentPence != null) {
    rates.agreementLevelAmountPence = paymentItem.agreementLevelPaymentPence
  }

  return rates
}

/**
 * Processes a single action and creates an action object
 * @param {string} actionCode - The action code
 * @param {object} actionData - The action data
 * @param {string} sheetId - The sheet ID
 * @param {string} parcelId - The parcel ID
 * @param {object} paymentData - The payment data from API
 * @returns {Action} The action object
 */
function createAction(actionCode, actionData, sheetId, parcelId, paymentData) {
  const paymentItem = findPaymentItem(paymentData, actionCode, sheetId, parcelId)

  const action = { code: actionCode }

  if (paymentItem) {
    if (paymentItem.description) {
      action.description = paymentItem.description
    }

    if (paymentItem.durationYears != null) {
      action.durationYears = paymentItem.durationYears
    }
  }

  if (actionData) {
    action.eligible = createUnitQuantity(actionData, 'value')
    action.appliedFor = createUnitQuantity(actionData, 'value')
  }

  if (paymentItem) {
    const paymentRates = createPaymentRates(paymentItem)
    if (hasProperties(paymentRates)) {
      action.paymentRates = paymentRates
    }

    if (paymentItem.annualPaymentPence != null) {
      action.annualPaymentPence = paymentItem.annualPaymentPence
    }
  }

  return action
}

/**
 * Processes actions for a single parcel
 * @param {object} actionsObj - The actions object
 * @param {string} sheetId - The sheet ID
 * @param {string} parcelId - The parcel ID
 * @param {object} paymentData - The payment data from API
 * @returns {Action[]} Array of actions
 */
function processParcelActions(actionsObj, sheetId, parcelId, paymentData) {
  if (!actionsObj) {
    return []
  }

  const actions = []

  for (const [actionCode, actionData] of Object.entries(actionsObj)) {
    const action = createAction(actionCode, actionData, sheetId, parcelId, paymentData)
    actions.push(action)
  }

  return actions
}

/**
 * Processes a single parcel
 * @param {string} parcelKey - The parcel key (sheetId-parcelId)
 * @param {object} data - The parcel data
 * @param {object} paymentData - The payment data from API
 * @returns {Parcel} The parcel object
 */
function createParcel(parcelKey, data, paymentData) {
  const [sheetId, parcelId] = parcelKey.split('-') ?? []
  return {
    sheetId,
    parcelId,
    area: {
      unit: data.size?.unit,
      quantity: data.size?.value
    },
    actions: processParcelActions(data.actionsObj, sheetId, parcelId, paymentData)
  }
}

/**
 * Transforms FormContext object into a GAS Application answers object for Land Grants.
 * @param {object} state
 * @returns {Application}
 */
export function stateToLandGrantsGasAnswers(state) {
  const { landParcels = [], payment, applicant, applicationValidationRunId } = state
  const parcels = []

  for (const [parcelKey, data] of Object.entries(landParcels)) {
    const parcel = createParcel(parcelKey, data, payment)
    parcels.push(parcel)
  }

  return {
    hasCheckedLandIsUpToDate: true,
    scheme: 'SFI',
    year: 2025,
    applicant,
    applicationValidationRunId,
    totalAnnualPaymentPence: payment?.annualTotalPence,
    parcels
  }
}

/**
 * @import { Application, Parcel, Action } from '~/src/server/land-grants/types/gas-payload.d.js'
 */

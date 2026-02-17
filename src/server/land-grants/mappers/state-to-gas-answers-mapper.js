import { config } from '~/src/config/config.js'

/**
 * Creates an object with unit and quantity if they exist
 * @param {object} data - The data object
 * @param {string} quantityField - The field name for quantity (default: 'value')
 * @returns {UnitQuantity} Object with unit and quantity
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
 * Finds payment item data from API response for parcel-level items
 * @param {object} paymentData - The payment object from API
 * @param {string} actionCode - The action code
 * @param {string} sheetId - The sheet ID
 * @param {string} parcelId - The parcel ID
 * @returns {object|null} The payment item data or null
 */
function findParcelPaymentItem(paymentData, actionCode, sheetId, parcelId) {
  if (!paymentData?.parcelItems) {
    return null
  }

  return Object.values(paymentData.parcelItems).find(
    (item) => item.code === actionCode && item.sheetId === sheetId && item.parcelId === parcelId
  )
}

/**
 * Finds agreement-level payment item from API response
 * @param {object} paymentData - The payment object from API
 * @param {string} actionCode - The action code
 * @returns {object|undefined} The agreement-level payment item or undefined
 */
function findAgreementPaymentItem(paymentData, actionCode) {
  return Object.values(paymentData?.agreementLevelItems ?? {}).find((item) => item.code === actionCode)
}

/**
 * Creates an action object for the application.parcel[].actions array
 * @param {string} actionCode - The action code
 * @param {object} actionData - The action data
 * @param {object} paymentItem - The payment item data
 * @returns {ApplicationAction} The application action object
 */
function createApplicationParcelAction(actionCode, actionData, paymentItem) {
  return {
    code: actionCode,
    version: paymentItem?.version ?? 1,
    ...(paymentItem?.durationYears != null && { durationYears: paymentItem.durationYears }),
    ...(actionData && { appliedFor: createUnitQuantity(actionData, 'value') })
  }
}

/**
 * Creates an action object for the payments.parcel[].actions array
 * @param {string} actionCode - The action code
 * @param {object} actionData - The action data
 * @param {object} paymentItem - The payment item data
 * @returns {PaymentAction} The payment action object
 */
function createPaymentParcelAction(actionCode, actionData, paymentItem) {
  const unitQuantity = actionData ? createUnitQuantity(actionData, 'value') : undefined

  return {
    code: actionCode,
    ...(paymentItem?.description != null && { description: paymentItem.description }),
    ...(paymentItem?.durationYears != null && { durationYears: paymentItem.durationYears }),
    ...(paymentItem?.rateInPence != null && { paymentRates: paymentItem.rateInPence }),
    ...(paymentItem?.annualPaymentPence != null && { annualPaymentPence: paymentItem.annualPaymentPence }),
    ...(unitQuantity && { eligible: unitQuantity, appliedFor: unitQuantity })
  }
}

/**
 * Creates a parcel object for application.parcel array
 * @param {string} parcelKey - The parcel key (sheetId-parcelId)
 * @param {object} data - The parcel data
 * @param {object} paymentData - The payment data from API
 * @returns {ApplicationParcel} The application parcel object
 */
function createApplicationParcel(parcelKey, data, paymentData) {
  const [sheetId, parcelId] = parcelKey.split('-') ?? []
  /** @type {ApplicationParcel} */
  const parcel = {
    sheetId,
    parcelId,
    area: createUnitQuantity(data.size, 'value'),
    actions: []
  }

  if (data.actionsObj) {
    for (const [actionCode, actionData] of Object.entries(data.actionsObj)) {
      const paymentItem = findParcelPaymentItem(paymentData, actionCode, sheetId, parcelId)
      const action = createApplicationParcelAction(actionCode, actionData, paymentItem)
      parcel.actions.push(action)
    }
  }

  return parcel
}

/**
 * Creates a parcel object for payments.parcel array
 * @param {string} parcelKey - The parcel key (sheetId-parcelId)
 * @param {object} data - The parcel data
 * @param {object} paymentData - The payment data from API
 * @returns {PaymentParcel} The payment parcel object
 */
function createPaymentParcel(parcelKey, data, paymentData) {
  const [sheetId, parcelId] = parcelKey.split('-') ?? []
  /** @type {PaymentParcel} */
  const parcel = {
    sheetId,
    parcelId,
    area: createUnitQuantity(data.size, 'value'),
    actions: []
  }

  if (data.actionsObj) {
    for (const [actionCode, actionData] of Object.entries(data.actionsObj)) {
      const paymentItem = findParcelPaymentItem(paymentData, actionCode, sheetId, parcelId)
      const action = createPaymentParcelAction(actionCode, actionData, paymentItem)
      parcel.actions.push(action)
    }
  }

  return parcel
}

/**
 * Collects unique agreement-level action codes from payment data
 * @param {object} paymentData - The payment data from API
 * @returns {Set<string>} Set of agreement-level action codes
 */
function collectAgreementActionCodes(paymentData) {
  const agreementCodes = new Set()

  if (paymentData?.agreementLevelItems) {
    for (const item of Object.values(paymentData.agreementLevelItems)) {
      if (item.code) {
        agreementCodes.add(item.code)
      }
    }
  }

  return agreementCodes
}

/**
 * Creates agreement-level action objects for application.agreement array
 * This returns an empty array until we have agreement-level actions
 * @returns {ApplicationAgreement[]} Empty array of agreement action objects
 */
function createApplicationAgreementActions() {
  return []
}

/**
 * Creates agreement-level payment objects for payments.agreement array
 * @param {Set<string>} agreementCodes - Set of agreement action codes
 * @param {object} paymentData - The payment data from API
 * @returns {PaymentAgreement[]} Array of agreement payment objects
 */
function createPaymentAgreementActions(agreementCodes, paymentData) {
  /** @type {PaymentAgreement[]} */
  const result = []

  for (const actionCode of agreementCodes) {
    const paymentItem = findAgreementPaymentItem(paymentData, actionCode)

    if (paymentItem) {
      const paymentRates = paymentItem.rateInPence ?? paymentItem.annualPaymentPence

      result.push({
        code: actionCode,
        ...(paymentItem.description != null && { description: paymentItem.description }),
        ...(paymentItem.durationYears != null && { durationYears: paymentItem.durationYears }),
        ...(paymentRates != null && { paymentRates }),
        ...(paymentItem.annualPaymentPence != null && { annualPaymentPence: paymentItem.annualPaymentPence })
      })
    }
  }

  return result
}

/**
 * Extracts caveats from a validation result's actions.
 * @param {object} validationResult - The validation result from the rules engine
 * @returns {object[]} Array of caveat objects
 */
function mapCaveatsForValidationResult(validationResult) {
  const { actions = [] } = validationResult
  return actions.flatMap((action) => action.rules?.filter((r) => r.caveat).map((r) => r.caveat) ?? [])
}

/**
 * Builds the rulesCalculations object from a validation result.
 * @param {object} validationResult - The validation result from the rules engine
 * @returns {object} The rulesCalculations object
 */
function mapRulesCalculations(validationResult) {
  const { id, message, valid } = validationResult
  const enableSSSIFeature = config.get('landGrants.enableSSSIFeature')

  const rulesCalculations = {
    id,
    message,
    valid,
    date: new Date().toISOString()
  }

  if (enableSSSIFeature) {
    const caveats = mapCaveatsForValidationResult(validationResult)
    if (caveats.length > 0) {
      rulesCalculations.caveats = caveats
    }
  }

  return rulesCalculations
}

/**
 * Transforms FormContext object into a GAS Application answers object for Land Grants.
 * @param {object} state
 * @returns {Application}
 */
export function stateToLandGrantsGasAnswers(state) {
  const { landParcels = {}, payment, applicant, validationResult } = state
  const rulesCalculations = validationResult ? mapRulesCalculations(validationResult) : undefined

  const applicationParcels = []
  const paymentParcels = []

  for (const [parcelKey, data] of Object.entries(landParcels)) {
    applicationParcels.push(createApplicationParcel(parcelKey, data, payment))
    paymentParcels.push(createPaymentParcel(parcelKey, data, payment))
  }

  const agreementCodes = collectAgreementActionCodes(payment)
  const applicationAgreements = createApplicationAgreementActions()
  const paymentAgreements = createPaymentAgreementActions(agreementCodes, payment)

  return {
    rulesCalculations,
    scheme: 'SFI',
    applicant,
    totalAnnualPaymentPence: payment?.annualTotalPence,
    application: {
      parcel: applicationParcels,
      agreement: applicationAgreements
    },
    payments: {
      parcel: paymentParcels,
      agreement: paymentAgreements
    }
  }
}

/**
 * @import { Application, UnitQuantity, ApplicationAction, PaymentAction, ApplicationParcel, PaymentParcel, ApplicationAgreement, PaymentAgreement } from '~/src/server/land-grants/types/gas-payload.d.js'
 */

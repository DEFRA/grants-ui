import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { formatCurrency } from '~/src/config/nunjucks/filters/filters.js'
import { sbiStore } from '~/src/server/sbi/state.js'
import { actionGroups, calculateGrantPayment, stringifyParcel } from '../services/land-grants.service.js'

const createLinks = (data, foundGroup) => {
  const parcelParam = stringifyParcel({
    parcelId: data.parcelId,
    sheetId: data.sheetId
  })
  const parcel = `${data.sheetId} ${data.parcelId}`
  const links = []

  if (foundGroup?.actions.length > 1) {
    links.push(
      `<li class='govuk-summary-list__actions-list-item'><a class='govuk-link' href='select-actions-for-land-parcel?parcelId=${parcelParam}&action=${data.code}'>Change</a><span class="govuk-visually-hidden"> land action for parcel ${parcel}</span></li>`
    )
  }
  links.push(
    `<li class='govuk-summary-list__actions-list-item'><a class='govuk-link' href='confirm-remove-action?parcel=${parcelParam}&action=${data.code}'>Remove</a><span class="govuk-visually-hidden"> land action for parcel ${parcel}</span></li>`
  )

  return {
    html: `<ul class='govuk-summary-list__actions-list govuk-!-text-align-right'>${links.join('')}</ul>`
  }
}

export default class LandActionsCheckPageController extends QuestionPageController {
  viewName = 'land-actions-check'
  parcelItems = []
  additionalYearlyPayments = []

  /**
   * Extract land actions from state for payment calculation
   * @param {object} state - Application state
   * @returns {Array} - Array of land actions for payment calculation
   */
  extractLandActionsFromState(state) {
    return Object.entries(state.landParcels || {})
      .filter(([, parcelData]) => this.hasValidActions(parcelData))
      .map(([parcelKey, parcelData]) => this.mapParcelToLandAction(parcelKey, parcelData))
  }

  /**
   * Check if parcel data has valid actions
   * @param {object} parcelData - Parcel data
   * @returns {boolean} - Whether parcel has valid actions
   */
  hasValidActions(parcelData) {
    return parcelData?.actionsObj && Object.keys(parcelData.actionsObj).length > 0
  }

  /**
   * Map parcel data to land action format
   * @param {string} parcelKey - Parcel key (sheetId-parcelId)
   * @param {object} parcelData - Parcel data
   * @returns {object} - Land action object
   */
  mapParcelToLandAction(parcelKey, parcelData) {
    const [sheetId, parcelId] = parcelKey.split('-')
    const actions = Object.entries(parcelData.actionsObj).map(([code, actionData]) => ({
      code,
      quantity: parseFloat(actionData.value)
    }))

    return {
      sbi: sbiStore.get('sbi'),
      sheetId,
      parcelId,
      actions
    }
  }

  /**
   * Calculate payment information from current state
   * @param {object} state - Object containing land parcels data and actions
   * @returns {Promise<object>} - Promise with payment information object
   */
  async calculatePaymentInformationFromState(state) {
    const landActions = this.extractLandActionsFromState(state)
    return calculateGrantPayment({ landActions })
  }

  /**
   * Get formatted price from pence value
   * @param {number} value - Value in pence
   * @returns {string} - Formatted currency string
   */
  getPrice(value) {
    return formatCurrency(value / 100, 'en-GB', 'GBP', 2, 'currency')
  }

  /**
   * Build additional yearly payments view data
   * @param {object} paymentInfo - Payment information from API
   * @returns {Array} - Array of additional payment items
   */
  getAdditionalYearlyPayments(paymentInfo) {
    return Object.values(paymentInfo?.agreementLevelItems || {}).map((data) => ({
      items: [
        [
          {
            text: `One-off payment per agreement per year for ${data.description}`
          },
          {
            text: this.getPrice(data.annualPaymentPence)
          }
        ]
      ]
    }))
  }

  /**
   * Create parcel item row for display
   * @param {object} data - Payment item data
   * @returns {Array} - Table row data
   */
  createParcelItemRow(data) {
    const foundGroup = actionGroups.find((g) => g.actions.includes(data.code))
    const linksCell = createLinks(data, foundGroup)

    return [
      { text: data.description },
      { text: data.quantity },
      { text: this.getPrice(data.annualPaymentPence) },
      linksCell
    ]
  }

  buildLandParcelFooterActions = (selectedActions, sheetId, parcelId) => {
    const uniqueCodes = [
      ...new Set(
        Object.values(selectedActions)
          .filter((item) => `${item.sheetId} ${item.parcelId}` === `${sheetId} ${parcelId}`)
          .map((item) => item.code)
      )
    ]

    const hasActionFromGroup = actionGroups.map((group) => uniqueCodes.some((code) => group.actions.includes(code)))

    if (hasActionFromGroup.every(Boolean)) {
      return {}
    }

    return {
      text: 'Add another action',
      href: `select-actions-for-land-parcel?parcelId=${sheetId}-${parcelId}`,
      hiddenTextValue: `${sheetId} ${parcelId}`
    }
  }

  getParcelItems = (paymentInfo) => {
    const groupedByParcel = Object.values(paymentInfo?.parcelItems || {}).reduce((acc, data) => {
      const parcelKey = `${data.sheetId} ${data.parcelId}`

      if (!acc[parcelKey]) {
        acc[parcelKey] = {
          cardTitle: `Land parcel ${parcelKey}`,
          footerActions: this.buildLandParcelFooterActions(paymentInfo?.parcelItems, data.sheetId, data.parcelId),
          parcelId: parcelKey,
          items: []
        }
      }

      acc[parcelKey].items.push(this.createParcelItemRow(data))
      return acc
    }, {})

    return Object.values(groupedByParcel)
  }

  /**
   * Validate POST request payload
   * @param {object} payload - Request payload
   * @returns {object|null} - Validation error or null if valid
   */
  validatePostPayload(payload) {
    const { addMoreActions, action } = payload

    if (action === 'validate' && !addMoreActions) {
      return {
        errorMessage: 'Please select if you want to add more actions'
      }
    }

    return null
  }

  /**
   * Determine next path based on user selection
   * @param {string} addMoreActions - User selection
   * @param {FormContext} context - Form context
   * @returns {string} - Next path
   */
  getNextPathFromSelection(addMoreActions, context) {
    return addMoreActions === 'true' ? '/select-land-parcel' : this.getNextPath(context)
  }

  /**
   * Render error view for POST validation
   * @param {object} h - Response toolkit
   * @param {FormRequest} request - Request object
   * @param {FormContext} context - Form context
   * @param {string} errorMessage - Error message to display
   * @returns {object} - Error view response
   */
  renderPostErrorView(h, request, context, errorMessage) {
    const { state } = context

    return h.view(this.viewName, {
      ...this.getViewModel(request, context),
      ...state,
      parcelItems: this.parcelItems,
      additionalYearlyPayments: this.additionalYearlyPayments,
      totalYearlyPayment: this.getPrice(state.payment?.annualTotalPence || 0),
      errorMessage
    })
  }

  /**
   * Process payment calculation and update instance data
   * @param {object} state - Current state
   * @returns {Promise<object>} - Payment information
   */
  async processPaymentCalculation(state) {
    const paymentResult = await this.calculatePaymentInformationFromState(state)
    const { payment } = paymentResult

    this.parcelItems = this.getParcelItems(payment)
    this.additionalYearlyPayments = this.getAdditionalYearlyPayments(payment)

    return payment
  }

  /**
   * Build view model for GET request
   * @param {FormRequest} request - Request object
   * @param {FormContext} context - Form context
   * @param {object} payment - Payment information
   * @returns {object} - Complete view model
   */
  buildGetViewModel(request, context, payment) {
    const { collection } = this
    const { state } = context

    return {
      ...this.getViewModel(request, context),
      ...state,
      parcelItems: this.parcelItems,
      additionalYearlyPayments: this.additionalYearlyPayments,
      totalYearlyPayment: this.getPrice(payment?.annualTotalPence || 0),
      errors: collection.getErrors(collection.getErrors())
    }
  }

  /**
   * Handle GET requests to the page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const { viewName } = this
      const { state } = context

      // Update state with payment information
      const payment = await this.processPaymentCalculation(state)
      await this.setState(request, {
        ...state,
        payment,
        draftApplicationAnnualTotalPence: payment?.annualTotalPence
      })

      const viewModel = this.buildGetViewModel(request, context, payment)
      return h.view(viewName, viewModel)
    }
  }

  /**
   * Handle POST requests to the page
   */
  makePostRouteHandler() {
    return (request, context, h) => {
      const payload = request.payload ?? {}

      const validationError = this.validatePostPayload(payload)
      if (validationError) {
        return this.renderPostErrorView(h, request, context, validationError.errorMessage)
      }

      const { addMoreActions } = payload
      const nextPath = this.getNextPathFromSelection(addMoreActions, context)
      return this.proceed(request, h, nextPath)
    }
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */

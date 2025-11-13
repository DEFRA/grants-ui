import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { formatCurrency } from '~/src/config/nunjucks/filters/filters.js'
import { landActionWithCode } from '~/src/server/land-grants/utils/land-action-with-code.js'
import { sbiStore } from '~/src/server/sbi/state.js'
import { actionGroups, calculateGrantPayment } from '../services/land-grants.service.js'
import { stringifyParcel } from '../utils/format-parcel.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'

const createLinks = (data) => {
  const parcelParam = stringifyParcel({
    parcelId: data.parcelId,
    sheetId: data.sheetId
  })
  const parcel = `${data.sheetId} ${data.parcelId}`
  const links = []

  links.push(
    `<li class='govuk-summary-list__actions-list-item'><a class='govuk-link' href='select-actions-for-land-parcel?parcelId=${parcelParam}'>Change</a><span class="govuk-visually-hidden"> land action ${data.code} for parcel ${parcel}</span></li>
    <li class='govuk-summary-list__actions-list-item'><a class='govuk-link' href='remove-action?parcelId=${parcelParam}&action=${data.code}'>Remove</a><span class="govuk-visually-hidden"> land action ${data.code} for parcel ${parcel}</span></li>`
  )

  return {
    html: `<ul class='govuk-summary-list__actions-list'>${links.join('')}</ul>`
  }
}

export default class LandActionsCheckPageController extends QuestionPageController {
  viewName = 'land-actions-check'

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
      quantity: Number.parseFloat(actionData.value)
    }))

    return {
      sbi: sbiStore.get('sbi'),
      sheetId,
      parcelId,
      actions
    }
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
            text: `One-off payment per agreement per year for ${landActionWithCode(data.description, data.code)}`
          },
          {
            html: `<div class="govuk-!-width-one-half">${this.getPrice(data.annualPaymentPence)}</div>`,
            format: 'numeric',
            classes: 'govuk-!-padding-right-5'
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
    const linksCell = createLinks(data)

    return [
      { text: landActionWithCode(data.description, data.code) },
      { text: data.quantity, format: 'numeric' },
      { text: this.getPrice(data.annualPaymentPence), format: 'numeric' },
      linksCell
    ]
  }

  buildLandParcelHeaderActions = (sheetId, parcelId) => {
    return {
      text: 'Remove',
      href: `remove-parcel?parcelId=${sheetId}-${parcelId}`,
      hiddenTextValue: `all actions for Land Parcel ${sheetId} ${parcelId}`
    }
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
      hiddenTextValue: `to Land Parcel ${sheetId} ${parcelId}`
    }
  }

  getParcelItems = (paymentInfo) => {
    const groupedByParcel = Object.values(paymentInfo?.parcelItems || {}).reduce((acc, data) => {
      const parcelKey = `${data.sheetId} ${data.parcelId}`

      if (!acc[parcelKey]) {
        acc[parcelKey] = {
          cardTitle: `Land parcel ${parcelKey}`,
          headerActions: this.buildLandParcelHeaderActions(data.sheetId, data.parcelId),
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
        href: '#addMoreActions',
        text: 'Please select if you want to add more actions'
      }
    }

    return null
  }

  /**
   * Determine next path based on user selection
   * @param {string} addMoreActions - User selection
   * @returns {string} - Next path
   */
  getNextPathFromSelection(addMoreActions) {
    return addMoreActions === 'true' ? '/select-land-parcel' : '/submit-your-application'
  }

  /**
   * Render error view for POST validation
   * @param {object} h - Response toolkit
   * @param {AnyFormRequest} request - Request object
   * @param {FormContext} context - Form context
   * @param {{text: string; href?: string}[]} errorMessages - Error Summary
   * @param {Array} parcelItems - Parcel items to display
   * @param {Array} additionalYearlyPayments - Additional payments to display
   * @returns {object} - Error view response
   */
  renderErrorView(h, request, context, errorMessages, parcelItems = [], additionalYearlyPayments = []) {
    const { state } = context
    const annualTotalPence = state.payment ? state.payment['annualTotalPence'] : undefined

    return h.view(this.viewName, {
      ...this.getViewModel(request, context),
      ...state,
      parcelItems,
      additionalYearlyPayments,
      totalYearlyPayment: this.getPrice(annualTotalPence || 0),
      errorMessages
    })
  }

  /**
   * Process payment calculation
   * @param {object} state - Current state
   * @returns {Promise<object>} - Payment information with parcel and payment items
   */
  async processPaymentCalculation(state) {
    const paymentResult = await calculateGrantPayment(state)
    const { payment } = paymentResult

    const parcelItems = this.getParcelItems(payment)
    const additionalYearlyPayments = this.getAdditionalYearlyPayments(payment)

    return { payment, parcelItems, additionalYearlyPayments }
  }

  /**
   * Build view model for GET request
   * @param {AnyFormRequest} request - Request object
   * @param {FormContext} context - Form context
   * @param {object} payment - Payment information
   * @param {Array} parcelItems - Parcel items to display
   * @param {Array} additionalYearlyPayments - Additional payments to display
   * @returns {object} - Complete view model
   */
  buildGetViewModel(request, context, payment, parcelItems, additionalYearlyPayments) {
    const { state } = context

    return {
      ...this.getViewModel(request, context),
      ...state,
      parcelItems,
      additionalYearlyPayments,
      totalYearlyPayment: this.getPrice(payment?.annualTotalPence || 0)
    }
  }

  /**
   * Handle GET requests to the page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const { viewName } = this
      const { state } = context
      let payment = {}
      let parcelItems = []
      let additionalYearlyPayments = []

      // Fetch payment information and update current state
      try {
        const result = await this.processPaymentCalculation(state)
        payment = result.payment
        parcelItems = result.parcelItems
        additionalYearlyPayments = result.additionalYearlyPayments

        await this.setState(request, {
          ...state,
          payment,
          draftApplicationAnnualTotalPence: payment?.annualTotalPence
        })
      } catch (error) {
        const sbi = request.auth?.credentials?.sbi
        log(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          {
            endpoint: `Land grants API`,
            error: `error fetching payment data for sbi ${sbi} - ${error.message}`
          },
          request
        )
        return this.renderErrorView(h, request, context, [
          {
            text: 'Unable to get payment information, please try again later or contact the Rural Payments Agency.'
          }
        ])
      }

      const viewModel = this.buildGetViewModel(request, context, payment, parcelItems, additionalYearlyPayments)
      return h.view(viewName, viewModel)
    }
  }

  /**
   * Handle POST requests to the page
   */
  makePostRouteHandler() {
    /**
     * Handle POST requests to the confirm farm details page.
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<ResponseObject>}
     */
    const fn = async (request, context, h) => {
      const payload = request.payload ?? {}
      const { state } = context

      const validationError = this.validatePostPayload(payload)
      if (validationError) {
        // Need to re-fetch payment data for error rendering
        let parcelItems = []
        let additionalYearlyPayments = []
        try {
          const result = await this.processPaymentCalculation(state)
          parcelItems = result.parcelItems
          additionalYearlyPayments = result.additionalYearlyPayments
        } catch (error) {
          log(
            LogCodes.SYSTEM.EXTERNAL_API_ERROR,
            {
              endpoint: `Land grants API`,
              error: `error fetching payment data for validation error - ${error.message}`
            },
            request
          )
        }
        return this.renderErrorView(h, request, context, [validationError], parcelItems, additionalYearlyPayments)
      }

      const { addMoreActions } = payload
      const nextPath = this.getNextPathFromSelection(addMoreActions)
      return this.proceed(request, h, nextPath)
    }

    return fn
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */

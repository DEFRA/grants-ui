import nunjucks from 'nunjucks'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { formatPrice } from '~/src/server/land-grants/view-models/payment.view-model.js'
import { getRequiredConsents } from '~/src/server/land-grants/view-state/land-parcel.view-state.js'
import { paymentStrategies } from '~/src/server/payment/payment-strategies.js'

/**
 * Generic controller for pages that display a payment summary.
 *
 * Configured entirely via `config:` on the page in the form definition YAML:
 *
 *   controller: PaymentPageController
 *   config:
 *     paymentStrategy: multiAction          # key from payment-strategies.js (required)
 *     showPaymentActions: true              # show per-parcel action tables (default: true)
 *     showAddMoreActionsQuestion: true      # show the Yes/No "add another parcel" radio (default: true)
 *     paymentExplanation: |                 # HTML rendered above the payment total; Nunjucks syntax
 *       <p>You may be eligible for <strong>{{ totalPayment }}</strong>.</p>
 *     showSupportLink: true                 # show the "If you have a question" support link
 *     nextPath: /submit-your-application       # path when user is done (required)
 *     addMoreActionsPath: /select-land-parcel  # path when user wants to add more actions (required if showAddMoreActionsQuestion: true)
 *     consentPath: /you-must-have-consent      # path when consents are required (optional)
 *
 * To add a new journey, register its strategy in payment-strategies.js.
 *
 * @extends QuestionPageController
 */
export default class PaymentPageController extends QuestionPageController {
  viewName = 'payment-page'

  /**
   * @param {FormModel} model
   * @param {import('@defra/forms-model').Page} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    const config = model?.def?.metadata?.pageConfig?.[pageDef?.path] ?? {}

    const paymentStrategy = paymentStrategies[config.paymentStrategy]
    if (!paymentStrategy) {
      throw new Error(
        `PaymentPageController: unknown paymentStrategy "${config.paymentStrategy}". ` +
          `Available services: ${Object.keys(paymentStrategies).join(', ')}`
      )
    }

    this.strategy = paymentStrategy

    this.showPaymentActions = config.showPaymentActions ?? true
    this.showAddMoreActionsQuestion = config.showAddMoreActionsQuestion ?? true
    this.paymentExplanation = config.paymentExplanation ?? null
    this.showSupportLink = config.showSupportLink ?? null

    if (!config.nextPath) {
      throw new Error(`PaymentPageController: "nextPath" is required in config for page "${pageDef?.path}"`)
    }
    this.nextPath = config.nextPath

    if (this.showAddMoreActionsQuestion && !config.addMoreActionsPath) {
      throw new Error(
        `PaymentPageController: "addMoreActionsPath" is required in config when showAddMoreActionsQuestion is true for page "${pageDef?.path}"`
      )
    }
    this.addMoreActionsPath = config.addMoreActionsPath ?? null
    this.consentPath = config.consentPath ?? null
  }

  /**
   * Validate POST request payload
   * @param {object} payload
   * @returns {{href: string, text: string}|null}
   */
  validatePostPayload(payload) {
    const { addMoreActions, action } = payload

    if (this.showAddMoreActionsQuestion && action === 'validate' && !addMoreActions) {
      return {
        href: '#addMoreActions',
        text: 'Select if you want to add an action to another land parcel'
      }
    }

    return null
  }

  /**
   * Determine next path based on user selection
   * @param {string|undefined} addMoreActions
   * @param {object} context
   * @returns {{path: string, requiredConsents?: string[]}}
   */
  getNextPathFromSelection(addMoreActions, context) {
    const { state } = context

    if (addMoreActions !== 'true') {
      if (this.consentPath) {
        const requiredConsents = getRequiredConsents(state)
        if (requiredConsents.length > 0) {
          return { path: this.consentPath, requiredConsents }
        }
      }

      return { path: this.nextPath }
    }

    return { path: this.addMoreActionsPath }
  }

  /**
   * @param {object} request
   * @param {object} context
   * @param {number} totalPence
   * @param {Array} parcelItems
   * @param {Array} additionalYearlyPayments
   * @param {Array} [errors]
   */
  buildViewModel(request, context, totalPence, parcelItems, additionalYearlyPayments, errors) {
    const { state } = context
    const totalPayment = formatPrice(totalPence || 0)

    return {
      ...this.getViewModel(request, context),
      ...state,
      parcelItems,
      additionalYearlyPayments,
      totalPayment,
      showPaymentActions: this.showPaymentActions,
      showAddMoreActionsQuestion: this.showAddMoreActionsQuestion,
      paymentExplanation: this.paymentExplanation
        ? nunjucks.renderString(this.paymentExplanation, { totalPayment })
        : null,
      showSupportLink: this.showSupportLink,
      ...(errors && { errors })
    }
  }

  /**
   * Render error view for POST validation
   */
  renderErrorView(h, request, context, errorMessages, parcelItems = [], additionalYearlyPayments = []) {
    const { state } = context
    return h.view(
      this.viewName,
      this.buildViewModel(request, context, state.totalPence ?? 0, parcelItems, additionalYearlyPayments, errorMessages)
    )
  }

  makeGetRouteHandler() {
    return async (request, context, h) => {
      const { viewName } = this
      const { state } = context
      let totalPence = 0
      let payment = {}
      let parcelItems = []
      let additionalYearlyPayments = []

      try {
        const result = await this.strategy.fetch(state)
        totalPence = result.totalPence
        payment = result.payment
        parcelItems = result.parcelItems ?? []
        additionalYearlyPayments = result.additionalYearlyPayments ?? []

        await this.setState(request, { ...state, totalPence, payment })
      } catch (error) {
        const sbi = request.auth?.credentials?.sbi
        debug(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          {
            endpoint: `Land grants API`,
            errorMessage: `error fetching payment data for sbi ${sbi} - ${error.message}`
          },
          request
        )
        return this.renderErrorView(h, request, context, [
          { text: 'Unable to get payment information, please try again later or contact the Rural Payments Agency.' }
        ])
      }

      return h.view(viewName, this.buildViewModel(request, context, totalPence, parcelItems, additionalYearlyPayments))
    }
  }

  makePostRouteHandler() {
    return async (request, context, h) => {
      const payload = request.payload ?? {}
      const { state } = context

      const validationError = this.validatePostPayload(payload)
      if (validationError) {
        let parcelItems = []
        let additionalYearlyPayments = []
        try {
          const result = await this.strategy.fetch(state)
          parcelItems = result.parcelItems ?? []
          additionalYearlyPayments = result.additionalYearlyPayments ?? []
        } catch (error) {
          debug(
            LogCodes.SYSTEM.EXTERNAL_API_ERROR,
            {
              endpoint: `Land grants API`,
              errorMessage: `error fetching payment data for validation error - ${error.message}`
            },
            request
          )
        }
        return this.renderErrorView(h, request, context, [validationError], parcelItems, additionalYearlyPayments)
      }

      const { addMoreActions } = payload
      const { path: nextPath, requiredConsents = [] } = this.getNextPathFromSelection(addMoreActions, context)

      await this.setState(request, { ...state, requiredConsents })

      return this.proceed(request, h, nextPath)
    }
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 */

import nunjucks from 'nunjucks'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { paymentStrategies } from '~/src/server/payment/payment-strategies.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'

/**
 * @param {string | undefined} paymentStrategy
 * @returns {{ fetch: (state: object) => Promise<PaymentStrategyResult> }}
 */
function resolveStrategy(paymentStrategy) {
  const strategy = paymentStrategy ? paymentStrategies[paymentStrategy] : undefined
  if (!strategy) {
    const systemError = new SystemError({
      message: `Unknown paymentStrategy "${paymentStrategy}". Available strategies: ${Object.keys(paymentStrategies).join(', ')}`,
      source: 'PaymentPageController',
      reason: 'invalid_config'
    })
    throw systemError
  }
  return strategy
}

/**
 * @param {{ next?: string, addMoreActions?: string }} redirects
 * @param {boolean} showAddMoreActionsQuestion
 * @param {string} path
 * @returns {{ nextPath: string, addMoreActionsPath: string | undefined }}
 */
function resolveRedirects(redirects, showAddMoreActionsQuestion, path) {
  if (!redirects.next) {
    const systemError = new SystemError({
      message: `"redirects.next" is required in config for page "${path}"`,
      source: 'PaymentPageController',
      reason: 'invalid_config'
    })
    throw systemError
  }

  if (showAddMoreActionsQuestion && !redirects.addMoreActions) {
    const systemError = new SystemError({
      message: `"redirects.addMoreActions" is required in config when showAddMoreActionsQuestion is true for page "${path}"`,
      source: 'PaymentPageController',
      reason: 'invalid_config'
    })
    throw systemError
  }
  return {
    nextPath: redirects.next,
    addMoreActionsPath: redirects.addMoreActions ?? undefined
  }
}

/**
 * @param {{ paymentStrategy?: string, showPaymentActions?: boolean, showAddMoreActionsQuestion?: boolean, paymentExplanation?: string, showSupportLink?: boolean, redirects?: { next?: string, addMoreActions?: string } }} config
 * @param {string} path
 */
function resolveConfig(config, path) {
  const strategy = resolveStrategy(config.paymentStrategy)
  const showAddMoreActionsQuestion = config.showAddMoreActionsQuestion ?? false
  const { nextPath, addMoreActionsPath } = resolveRedirects(config.redirects ?? {}, showAddMoreActionsQuestion, path)

  return {
    strategy,
    showPaymentActions: config.showPaymentActions ?? false,
    showAddMoreActionsQuestion,
    paymentExplanation: config.paymentExplanation ?? null,
    showSupportLink: config.showSupportLink ?? null,
    nextPath,
    addMoreActionsPath
  }
}

/**
 * Generic controller for pages that display a payment summary.
 *
 * Configured entirely via `config:` on the page in the form definition YAML:
 *
 *   controller: PaymentPageController
 *   config:
 *     paymentStrategy: multiAction          # key from payment-strategies.js (required)
 *     showPaymentActions: true              # show per-parcel action tables (default: false)
 *     showAddMoreActionsQuestion: true      # show the Yes/No "add another parcel" radio (default: false)
 *     paymentExplanation: |                 # HTML rendered above the payment total; Nunjucks syntax
 *       <p>You may be eligible for <strong>{{ totalPayment }}</strong>.</p>
 *     showSupportLink: true                 # show the "If you have a question" support link
 *     redirects:
 *        next: /you-must-have-consent       # path when user is done (required)
 *        addMoreActions: /select-land-parcel  # path when user wants to add more actions (required if showAddMoreActionsQuestion: true)
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
    const {
      strategy,
      showPaymentActions,
      showAddMoreActionsQuestion,
      paymentExplanation,
      showSupportLink,
      nextPath,
      addMoreActionsPath
    } = resolveConfig(config, pageDef?.path)

    this.strategy = strategy
    this.showPaymentActions = showPaymentActions
    this.showAddMoreActionsQuestion = showAddMoreActionsQuestion
    this.paymentExplanation = paymentExplanation
    this.showSupportLink = showSupportLink
    this.nextPath = nextPath
    this.addMoreActionsPath = addMoreActionsPath
  }

  /**
   * Validate POST request payload
   * @param {Record<string, string>} payload
   * @returns {{ href: string, text: string } | null}
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
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {string} totalPayment
   * @param {ParcelCardViewModel[]} parcelItems
   * @param {AdditionalPaymentViewModel[]} additionalYearlyPayments
   * @param {{ text: string }[]} [errors]
   * @returns {object}
   */
  buildViewModel(
    request,
    context,
    totalPayment,
    parcelItems,
    additionalYearlyPayments,
    errors,
    hasPaymentError = false
  ) {
    const { state } = context

    return {
      ...this.getViewModel(request, context),
      ...state,
      parcelItems,
      additionalYearlyPayments,
      totalPayment,
      showPaymentActions: this.showPaymentActions,
      showAddMoreActionsQuestion: hasPaymentError ? false : this.showAddMoreActionsQuestion,
      paymentExplanation: this.paymentExplanation
        ? nunjucks.renderString(this.paymentExplanation, { totalPayment })
        : null,
      showSupportLink: this.showSupportLink,
      hasPaymentError,
      ...(errors && { errors })
    }
  }

  /**
   * @param {ResponseToolkit} h
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {{ text: string }[]} errorMessages
   * @param {ParcelCardViewModel[]} [parcelItems]
   * @param {AdditionalPaymentViewModel[]} [additionalYearlyPayments]
   * @param {boolean} [hasPaymentError]
   * @returns {ResponseObject}
   */
  renderErrorView(
    h,
    request,
    context,
    errorMessages,
    parcelItems = [],
    additionalYearlyPayments = [],
    hasPaymentError = false
  ) {
    const { state } = context
    return h.view(
      this.viewName,
      this.buildViewModel(
        request,
        context,
        /** @type {string} */ (state.totalPayment) ?? '£0.00',
        parcelItems,
        additionalYearlyPayments,
        errorMessages,
        hasPaymentError
      )
    )
  }

  makeGetRouteHandler() {
    /**
     * Handle GET requests to the payment page.
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {ResponseToolkit} h
     */
    return async (request, context, h) => {
      const { viewName } = this
      const { state } = context
      let totalPence, totalPayment, payment, parcelItems, additionalYearlyPayments

      try {
        const result = await this.strategy.fetch(state)
        totalPence = result.totalPence
        totalPayment = result.totalPayment
        payment = result.payment
        parcelItems = result.parcelItems ?? []
        additionalYearlyPayments = result.additionalYearlyPayments ?? []

        await this.setState(request, { ...state, totalPence, totalPayment, payment })
      } catch (error) {
        const sbi = request.auth?.credentials?.sbi
        debug(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          {
            endpoint: `Land grants API`,
            errorMessage: `error fetching payment data for sbi ${sbi} - ${/** @type {Error} */ (error).message}`
          },
          request
        )
        return this.renderErrorView(
          h,
          request,
          context,
          [{ text: 'Unable to get payment information, please try again later or contact the Rural Payments Agency.' }],
          [],
          [],
          true
        )
      }

      return h.view(
        viewName,
        this.buildViewModel(request, context, totalPayment, parcelItems, additionalYearlyPayments)
      )
    }
  }

  makePostRouteHandler() {
    /**
     * Handle POST requests to the payment page.
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {ResponseToolkit} h
     */
    return async (request, context, h) => {
      const payload = request.payload ?? {}
      const { state } = context

      const validationError = this.validatePostPayload(payload)
      if (validationError) {
        /** @type {ParcelCardViewModel[]} */
        let parcelItems = []
        /** @type {AdditionalPaymentViewModel[]} */
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
              errorMessage: `error fetching payment data for validation error - ${/** @type {Error} */ (error).message}`
            },
            request
          )
        }
        return this.renderErrorView(h, request, context, [validationError], parcelItems, additionalYearlyPayments)
      }

      const { addMoreActions } = payload
      const nextPath = addMoreActions === 'true' ? this.addMoreActionsPath : this.nextPath
      return this.proceed(request, h, nextPath)
    }
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 * @import { PaymentStrategyResult } from '../payment-strategies.d.js'
 * @import { ParcelCardViewModel, AdditionalPaymentViewModel } from '~/src/server/land-grants/view-models/payment.view-model.js'
 */

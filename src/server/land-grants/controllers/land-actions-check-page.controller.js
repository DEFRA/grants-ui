import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { calculateGrantPayment } from '../services/land-grants.service.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'
import {
  formatPrice,
  mapPaymentInfoToParcelItems,
  mapAdditionalYearlyPayments
} from '~/src/server/land-grants/view-models/payment.view-model.js'

export default class LandActionsCheckPageController extends QuestionPageController {
  viewName = 'land-actions-check'

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
        text: 'Select if you want to add an action to another land parcel'
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
      totalYearlyPayment: formatPrice(annualTotalPence || 0),
      errors: errorMessages
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

    const parcelItems = mapPaymentInfoToParcelItems(payment, state)
    const additionalYearlyPayments = mapAdditionalYearlyPayments(payment)

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
      totalYearlyPayment: formatPrice(payment?.annualTotalPence || 0)
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
            errorMessage: `error fetching payment data for sbi ${sbi} - ${error.message}`
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
              errorMessage: `error fetching payment data for validation error - ${error.message}`
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

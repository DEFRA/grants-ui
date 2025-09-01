import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { formatCurrency } from '~/src/config/nunjucks/filters/filters.js'

export default class LandActionsCheckPageController extends QuestionPageController {
  viewName = 'land-actions-check'
  parcelItems = []
  additionalYearlyPayments = []

  /**
   * This method is called when there is a POST request on the check selected land actions page.
   * It gets the land parcel id and redirects to the next step in the journey.
   */
  makePostRouteHandler() {
    /**
     * Handle POST requests to the page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<import('@hapi/boom').Boom<any> | import('@hapi/hapi').ResponseObject>}
     */
    const fn = (request, context, h) => {
      const { state } = context
      const payload = request.payload ?? {}
      const { addMoreActions, action } = payload

      if (action === 'validate' && !addMoreActions) {
        return h.view(this.viewName, {
          ...this.getViewModel(request, context),
          ...state,
          parcelItems: this.parcelItems,
          additionalYearlyPayments: this.additionalYearlyPayments,
          totalYearlyPayment: this.getPrice(state.payment.annualTotalPence),
          errorMessage: 'Please select if you want to add more actions'
        })
      }

      const nextPath = addMoreActions === 'true' ? '/select-land-parcel' : this.getNextPath(context)
      return this.proceed(request, h, nextPath)
    }

    return fn
  }

  /**
   * This method is called when there is a GET request to the check selected land actions page.
   * It gets the view model for the page and adds business details
   */
  makeGetRouteHandler() {
    /**
     * Handle GET requests to the page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     */
    const fn = (request, context, h) => {
      const { collection, viewName } = this
      const { state } = context

      // Build the selected action rows from the collection
      this.parcelItems = this.getParcelItems(state)
      this.additionalYearlyPayments = this.getAdditionalYearlyPayments(state)

      // Build the view model exactly as in the original code
      const viewModel = {
        ...this.getViewModel(request, context),
        ...state,
        parcelItems: this.parcelItems,
        additionalYearlyPayments: this.additionalYearlyPayments,
        totalYearlyPayment: this.getPrice(state.payment.annualTotalPence),
        errors: collection.getErrors(collection.getErrors())
      }

      return h.view(viewName, viewModel)
    }

    return fn
  }

  getPrice = (value) => {
    return formatCurrency(value / 100, 'en-GB', 'GBP', 2, 'currency')
  }

  getAdditionalYearlyPayments = (state) => {
    return Object.values(state.payment.agreementLevelItems).map((data) => {
      return {
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
      }
    })
  }

  getParcelItems = (state) => {
    return Object.values(state.payment.parcelItems).map((data) => {
      return {
        parcelId: `${data.sheetId} ${data.parcelId}`,
        items: [
          [
            {
              text: data.description
            },
            {
              text: `${data.quantity} ${data.unit}`
            },
            {
              text: this.getPrice(data.annualPaymentPence)
            },
            {
              html: "<a class='govuk-link' href='confirm-delete-parcel' style='display: none'>Remove</a>"
            }
          ]
        ]
      }
    })
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */

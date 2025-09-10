import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { formatCurrency } from '~/src/config/nunjucks/filters/filters.js'
import { sbiStore } from '~/src/server/sbi/state.js'
import { actionGroups, calculateGrantPayment } from '../services/land-grants.service.js'

export default class LandActionsCheckPageController extends QuestionPageController {
  viewName = 'land-actions-check'
  parcelItems = []
  additionalYearlyPayments = []

  /**
   * Calculates payment for an existing land parcels and actions state
   * @param {object} state - Object containing land parcels data and actions
   * @returns {Promise<Array>} - Promise with payment information object
   */
  async calculatePaymentInformationFromState(state) {
    const landActions = Object.entries(state.landParcels || {})
      .filter(([, parcelData]) => parcelData?.actionsObj && Object.keys(parcelData.actionsObj).length > 0)
      .map(([parcelKey, parcelData]) => {
        const [sheetId, parcelId] = parcelKey.split('-')
        const actions = Object.entries(parcelData.actionsObj).map(([code, actionData]) => ({
          code,
          quantity: parseFloat(actionData.value)
        }))

        return { sbi: sbiStore.get('sbi'), sheetId, parcelId, actions }
      })

    return calculateGrantPayment({ landActions })
  }

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
          totalYearlyPayment: this.getPrice(state.payment?.annualTotalPence || 0),
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
    const fn = async (request, context, h) => {
      const { collection, viewName } = this
      const { state } = context
      const paymentResult = await this.calculatePaymentInformationFromState(state)
      const { payment } = paymentResult

      // Build the selected action rows from the collection
      this.parcelItems = this.getParcelItems(payment)
      this.additionalYearlyPayments = this.getAdditionalYearlyPayments(payment)

      this.setState(request, {
        ...state,
        payment,
        draftApplicationAnnualTotalPence: payment?.annualTotalPence
      })

      // Build the view model exactly as in the original code
      const viewModel = {
        ...this.getViewModel(request, context),
        ...state,
        parcelItems: this.parcelItems,
        additionalYearlyPayments: this.additionalYearlyPayments,
        totalYearlyPayment: this.getPrice(payment?.annualTotalPence || 0),
        errors: collection.getErrors(collection.getErrors())
      }

      return h.view(viewName, viewModel)
    }

    return fn
  }

  getPrice = (value) => {
    return formatCurrency(value / 100, 'en-GB', 'GBP', 2, 'currency')
  }

  getAdditionalYearlyPayments = (paymentInfo) => {
    return Object.values(paymentInfo?.agreementLevelItems || {}).map((data) => {
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

      acc[parcelKey].items.push([
        {
          text: `${data.description}: ${data.code}`
        },
        {
          text: data.quantity
        },
        {
          text: this.getPrice(data.annualPaymentPence)
        },
        {
          html: "<a class='govuk-link' href='confirm-delete-parcel' style='display: none'>Remove</a>"
        }
      ])

      return acc
    }, {})

    return Object.values(groupedByParcel)
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */

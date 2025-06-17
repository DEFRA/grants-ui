import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { sbiStore } from '../../sbi/state.js'
import { calculateGrantPayment } from '../services/land-grants.service.js'

const SELECT_LAND_PARCEL_ACTIONS = {
  items: [
    {
      href: '/find-funding-for-land-or-farms/select-land-parcel',
      text: 'Change',
      visuallyHiddenText: 'Actions'
    }
  ]
}

export default class CheckAnswersPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.viewName = 'check-your-answers'
  }

  /**
   * Gets the rows for the summary list view.
   * @param {PageSummary} summaryList - The summary list definition
   * @param {FormContext} context - The form context containing state
   * @returns {Promise<Array>} - The rows for the summary list
   */
  async getViewRows(summaryList, context) {
    const {
      state: { landParcels }
    } = context
    const sbi = sbiStore.get('sbi') // TODO: Get sbi from defraID
    const rows = summaryList.rows || []

    const applicationPayment = await calculateGrantPayment({ landParcels })
    const { paymentTotal } = applicationPayment || {}

    const totalActions = Object.values(landParcels).reduce(
      (total, data) =>
        total + (data.actionsObj ? Object.keys(data.actionsObj).length : 0),
      0
    )

    rows.unshift(
      {
        key: { text: 'Single business identifier (SBI)' },
        value: { text: sbi }
      },
      {
        key: {
          text: 'Indicative annual payment (excluding management payment)'
        },
        value: { text: paymentTotal }
      }
    )
    rows.push(
      {
        key: {
          text: 'Total number of actions applied for'
        },
        value: { text: totalActions },
        actions: SELECT_LAND_PARCEL_ACTIONS
      },
      {
        key: { text: 'Parcel based actions' },
        actions: SELECT_LAND_PARCEL_ACTIONS
      }
    )

    for (const [parcelId, actionsData] of Object.entries(landParcels)) {
      const actionsObj = actionsData.actionsObj || {}
      if (Object.keys(actionsObj).length === 0) {
        continue
      }
      for (const [, action] of Object.entries(actionsObj)) {
        rows.push({
          classes: 'govuk-summary-list__parcels-row',
          key: { text: parcelId },
          value: {
            html: `${action.description}<br/>Applied area: ${action.value} ${action.unit}`
          }
        })
      }
    }

    return rows
  }

  /**
   * Gets the summary view model for the check answers page.
   * @param {FormRequest} request - The form request object
   * @param {FormContext} context - The form context
   * @returns {Promise<object>} - The summary view model
   */
  async getSummaryViewModel(request, context) {
    const newViewModel = super.getSummaryViewModel(request, context)
    const { checkAnswers = [] } = newViewModel

    if (!checkAnswers.length) {
      return newViewModel
    }

    const summaryList = checkAnswers[0].summaryList
    const rows = await this.getViewRows(summaryList, context)

    newViewModel.checkAnswers[0].summaryList.rows = rows
    return newViewModel
  }

  /**
   * This method is called when there is a GET request to the land grants actions page.
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
      const { viewName } = this
      const viewModel = await this.getSummaryViewModel(request, context)
      return h.view(viewName, viewModel)
    }

    return fn
  }

  /**
   * This method is called when there is a POST request to the check answers page.
   * It processes the request and redirects to the next path.
   * @returns {Function} - The route handler function
   */
  makePostRouteHandler() {
    const fn = (request, context, h) => {
      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }
}

/**
 * @import { type FormModel } from '~/src/server/plugins/engine/models/index.js'
 * @import { type PageSummary } from '@defra/forms-model'
 */

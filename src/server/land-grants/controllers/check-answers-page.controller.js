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

const createSbiRow = (sbi) => ({
  key: { text: 'Single business identifier (SBI)' },
  value: { text: sbi }
})

const createPaymentRow = (paymentTotal) => ({
  key: {
    text: 'Indicative annual payment (excluding management payment)'
  },
  value: { text: paymentTotal }
})

const createTotalActionsRow = (totalActions) => ({
  key: {
    text: 'Total number of actions applied for'
  },
  value: { text: totalActions },
  actions: SELECT_LAND_PARCEL_ACTIONS
})

const createParcelBasedActionsRow = () => ({
  key: { text: 'Parcel based actions' },
  actions: SELECT_LAND_PARCEL_ACTIONS
})

const createParcelActionRow = (parcelId, action) => ({
  key: { classes: 'govuk-!-font-weight-regular', text: parcelId },
  value: {
    html: `${action.description}<br/>Applied area: ${action.value} ${action.unit}`
  }
})

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
   * Validates that the required data exists in context
   * @param {FormContext} context - The form context
   * @throws {Error} If required data is missing
   */
  validateContext(context) {
    if (!context?.state?.landParcels) {
      throw new Error('Land parcels data is missing from context')
    }
  }

  /**
   * Calculates the total number of actions across all land parcels
   * @param {object} landParcels - The land parcels data
   * @returns {number} Total number of actions
   */
  calculateTotalActions(landParcels) {
    return Object.values(landParcels).reduce((total, parcelData) => {
      const actionsCount = parcelData?.actionsObj ? Object.keys(parcelData.actionsObj).length : 0
      return total + actionsCount
    }, 0)
  }

  /**
   * Creates parcel action rows for the summary list
   * @param {object} landParcels - The land parcels data
   * @returns {Array} Array of parcel action rows
   */
  createParcelActionRows(landParcels) {
    const rows = []

    for (const [parcelId, parcelData] of Object.entries(landParcels)) {
      const actionsObj = parcelData?.actionsObj || {}

      if (Object.keys(actionsObj).length === 0) {
        continue
      }

      for (const action of Object.values(actionsObj)) {
        rows.push(createParcelActionRow(parcelId, action))
      }
    }

    return rows
  }

  /**
   * Gets the business data needed for the summary
   * @returns {Promise<object>} Business data
   */
  getBusinessData() {
    const sbi = sbiStore.get('sbi') // TODO: Get sbi from defraID
    return { sbi }
  }

  /**
   * Calculates payment information for the land parcels
   * @param {object} landParcels - The land parcels data
   * @returns {Promise<object>} Payment calculation results
   */
  async calculatePaymentData(landParcels) {
    const applicationPayment = await calculateGrantPayment({ landParcels })
    return {
      paymentTotal: applicationPayment?.paymentTotal
    }
  }

  /**
   * Gets the rows for the summary list view.
   * @param {PageSummary} summaryList - The summary list definition
   * @param {FormContext} context - The form context containing state
   * @returns {Promise<Array>} - The rows for the summary list
   */
  async getViewRows(summaryList, context) {
    this.validateContext(context)

    const { landParcels } = context.state
    const baseRows = summaryList.rows || []

    const sbi = sbiStore.get('sbi') // TODO: Get sbi from defraID
    const { paymentTotal } = await calculateGrantPayment({ landParcels })
    const totalActions = this.calculateTotalActions(landParcels)
    const businessRow = createSbiRow(sbi)
    const paymentRow = createPaymentRow(paymentTotal)
    const totalActionsRow = createTotalActionsRow(totalActions)
    const parcelBasedRow = createParcelBasedActionsRow()
    const parcelActionRows = this.createParcelActionRows(landParcels)

    return [businessRow, paymentRow, ...baseRows, totalActionsRow, parcelBasedRow, ...parcelActionRows]
  }

  /**
   * Gets the summary view model for the check answers page.
   * @param {FormRequest} request - The form request object
   * @param {FormContext} context - The form context
   * @returns {Promise<object>} - The summary view model
   */
  async getSummaryViewModel(request, context) {
    const viewModel = await super.getSummaryViewModel(request, context)
    const { checkAnswers = [] } = viewModel

    if (!checkAnswers.length) {
      return viewModel
    }

    const summaryList = checkAnswers[0].summaryList
    const rows = await this.getViewRows(summaryList, context)

    return {
      ...viewModel,
      checkAnswers: [
        {
          ...checkAnswers[0],
          summaryList: {
            ...summaryList,
            rows
          }
        }
      ]
    }
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
    return async (request, context, h) => {
      try {
        const viewModel = await this.getSummaryViewModel(request, context)
        return h.view(this.viewName, viewModel)
      } catch (error) {
        request.logger.error({
          message: `Error in CheckAnswersPageController GET handler`,
          error
        })
        throw error
      }
    }
  }

  /**
   * This method is called when there is a POST request to the check answers page.
   * It processes the request and redirects to the next path.
   * @returns {Function} - The route handler function
   */
  makePostRouteHandler() {
    return (request, context, h) => {
      const nextPath = this.getNextPath(context)
      return this.proceed(request, h, nextPath)
    }
  }
}

/**
 * @import { type FormModel } from '~/src/server/plugins/engine/models/index.js'
 * @import { type PageSummary } from '@defra/forms-model'
 */

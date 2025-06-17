import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { config } from '~/src/config/config.js'
import { getFormsCacheService } from '../../common/helpers/forms-cache/forms-cache.js'
import { transformStateObjectToGasApplication } from '../../common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { submitGrantApplication } from '../../common/services/grant-application/grant-application.service.js'
import { sbiStore } from '../../sbi/state.js'
import { stateToLandGrantsGasAnswers } from '../mappers/state-to-gas-answers-mapper.js'
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
    this.grantCode = config.get('landGrants.grantCode')
  }

  /**
   * Gets the path to the status page (in this case /confirmation page) for the POST handler.
   * @returns {string} path to the status page
   */
  getStatusPath() {
    return '/find-funding-for-land-or-farms/confirmation'
  }

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

  async submitLandGrantApplication(context) {
    const {
      sbi = 'sbi',
      crn = 'crn',
      defraId = 'defraId',
      frn = 'frn'
    } = context.state
    const identifiers = {
      sbi,
      frn,
      crn,
      defraId,
      clientRef: context.referenceNumber?.toLowerCase()
    }
    const applicationData = transformStateObjectToGasApplication(
      identifiers,
      context.state,
      stateToLandGrantsGasAnswers
    )
    return submitGrantApplication(this.grantCode, applicationData)
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

  makePostRouteHandler() {
    const fn = async (request, context, h) => {
      const result = await this.submitLandGrantApplication(context)
      request.logger.info('Form submission completed', result)
      const cacheService = getFormsCacheService(request.server)
      await cacheService.setConfirmationState(request, { confirmed: true })

      return h.redirect(this.getStatusPath())
    }

    return fn
  }
}

/**
 * @import { type FormModel } from '~/src/server/plugins/engine/models/index.js'
 * @import { type PageSummary } from '@defra/forms-model'
 */

import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { fetchBusinessAndCustomerInformation } from '../../common/services/consolidated-view/consolidated-view.service.js'
import {
  createAddressRow,
  createBusinessNameRow,
  createContactDetailsRow,
  createCustomerNameRow,
  createSbiRow
} from '../../common/helpers/create-rows.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'

const logger = createLogger()

export default class ConfirmFarmDetailsController extends QuestionPageController {
  viewName = 'confirm-farm-details'

  // Constants
  static ERROR_MESSAGE = 'Unable to find farm information, please try again later or contact the Rural Payments Agency.'

  /**
   * Handle GET requests to the confirm farm details page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const baseViewModel = super.getViewModel(request, context)
      const { sbi } = request.auth.credentials

      try {
        const farmDetails = await this.buildFarmDetails(request)
        return h.view(this.viewName, { ...baseViewModel, farmDetails })
      } catch (error) {
        return this.handleError(sbi, error, baseViewModel, h)
      }
    }
  }

  /**
   * Build farm details view model
   * @param {AnyFormRequest} request
   * @returns {Promise<object>} Farm details object with rows array
   */
  async buildFarmDetails(request) {
    const data = await fetchBusinessAndCustomerInformation(request)

    const rows = [
      createCustomerNameRow(data.customer?.name),
      createBusinessNameRow(data.business?.name),
      createAddressRow(data.business?.address),
      createSbiRow(request.auth?.credentials?.sbi),
      createContactDetailsRow(data.business?.phone?.mobile, data.business?.email?.address)
    ].filter(Boolean)

    return { rows }
  }

  /**
   * Handle errors and return error view
   */
  handleError(sbi, error, baseViewModel, h) {
    log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
      endpoint: `fetch farm details for sbi ${sbi}`,
      error: error.message
    })

    return h.view(this.viewName, {
      ...baseViewModel,
      error: {
        titleText: 'There is a problem',
        errorList: [
          {
            text: ConfirmFarmDetailsController.ERROR_MESSAGE,
            href: ''
          }
        ]
      }
    })
  }

  makePostRouteHandler() {
    /**
     * Handle POST requests to the confirm farm details page.
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<ResponseObject>}
     */
    const fn = async (request, context, h) => {
      const { state } = context
      const { sbi } = request.auth.credentials

      if (sbi) {
        const applicant = await fetchBusinessAndCustomerInformation(request)
        await this.setState(request, {
          ...state,
          applicant
        })
      }

      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */

import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import {
  createAddressRow,
  createBusinessNameRow,
  createContactDetailsRow,
  createCustomerNameRow,
  createSbiRow
} from '~/src/server/common/helpers/create-rows.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { fetchBusinessAndCPH } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'

const logger = createLogger()

export default class ConfirmMethaneDetailsController extends QuestionPageController {
  viewName = 'confirm-methane-details'

  // Constants
  static ERROR_MESSAGE = 'Unable to find farm information, please try again later.'

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
    const { credentials: { sbi } = {} } = request.auth ?? {}
    const data = await fetchBusinessAndCPH(request)

    const rows = [
      createCustomerNameRow(data.customer?.name),
      createBusinessNameRow(data.business?.name),
      createSbiRow(sbi),
      createContactDetailsRow(data.business?.phone?.mobile, data.business?.email?.address),
      createAddressRow(data.business?.address),
      this.createTypeRow(data.business?.type),
      this.createCPHRow(data.countyParishHoldings),
      this.createVATRow(data.business?.vat)
    ].filter(Boolean)

    return { rows }
  }

  createVATRow(vat) {
    if (!vat) {
      return null
    }

    return {
      key: { text: 'VAT number' },
      value: { text: vat }
    }
  }

  createCPHRow(countyParishHoldings) {
    if (countyParishHoldings.length === 0) {
      return null
    }

    return {
      key: { text: 'County Parish Holdings' },
      value: {
        text: countyParishHoldings
      }
    }
  }

  /**
   * Handle errors and return error view
   */
  handleError(sbi, error, baseViewModel, h) {
    logger.error({ err: error, sbi }, 'Unexpected error when fetching farm information')

    return h.view(this.viewName, {
      ...baseViewModel,
      error: {
        titleText: 'There is a problem',
        errorList: [
          {
            text: ConfirmMethaneDetailsController.ERROR_MESSAGE,
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
        const applicant = await fetchBusinessAndCPH(request)
        await this.setState(request, {
          ...state,
          applicant
        })
      }

      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }

  createTypeRow(type) {
    if (!type) {
      return null
    }

    const { type: organisationType } = type

    return {
      key: { text: 'Type' },
      value: { text: organisationType }
    }
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */

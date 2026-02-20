import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { fetchBusinessAndCustomerInformation } from '../../common/services/consolidated-view/consolidated-view.service.js'
import { createBusinessRows, createContactRows, createPersonRows } from '../../common/helpers/create-rows.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

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
        const details = await this.buildDetailsForView(request)
        return h.view(this.viewName, { ...baseViewModel, details })
      } catch (error) {
        return this.handleError(sbi, error, baseViewModel, h, request)
      }
    }
  }

  /**
   * Get list of missing required farm data fields
   * @param {object} data
   * @returns {string[]} list of missing field paths
   */
  getMissingFarmDataFields(data) {
    const { customer = {}, business = {} } = data || {}
    const isMissing = (value) => value === undefined || value === null || value === ''

    const requiredFields = {
      'customer.name': ['title', 'first', 'last'],
      business: ['name', 'address'],
      'business.address': ['line1', 'city', 'postalCode']
    }

    const resolvers = {
      'customer.name': customer?.name,
      business,
      'business.address': business?.address
    }

    const missingFields = []
    for (const [key, fields] of Object.entries(requiredFields)) {
      for (const field of fields) {
        if (isMissing(resolvers[key]?.[field])) {
          missingFields.push(field)
        }
      }
    }

    return missingFields
  }

  /**
   * Build farm details view model
   * @param {AnyFormRequest} request
   * @returns {Promise<object>} Farm details object with rows array
   */
  async buildDetailsForView(request) {
    const data = await fetchBusinessAndCustomerInformation(request)
    const sbi = request.auth?.credentials?.sbi

    const missingFields = this.getMissingFarmDataFields(data)
    if (missingFields.length > 0) {
      log(LogCodes.LAND_GRANTS.FARM_DETAILS_MISSING_FIELDS, {
        sbi,
        missingFields
      })
    }

    const hasMissingFields = missingFields.length > 0

    return {
      hasMissingFields,
      ...this.buildDetailedFarmDetails(request, data)
    }
  }

  /**
   * Build detailed farm details with person, business, and contact sections
   * @param {AnyFormRequest} request
   * @param {object} data
   * @returns {object}
   */
  buildDetailedFarmDetails(request, data) {
    const sbi = request.auth?.credentials?.sbi
    const person = createPersonRows(data.customer?.name)
    const business = createBusinessRows(sbi, data.business)
    const contact = createContactRows(data.business)

    return {
      person,
      business,
      contact
    }
  }

  /**
   * Handle errors and return error view
   */
  handleError(sbi, error, baseViewModel, h, request) {
    log(
      LogCodes.SYSTEM.EXTERNAL_API_ERROR,
      {
        endpoint: `fetch farm details for sbi ${sbi}`,
        errorMessage: error.message
      },
      request
    )

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

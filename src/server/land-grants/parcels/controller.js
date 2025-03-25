import Boom from '@hapi/boom'
import { config } from '~/src/config/config.js'

import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { fetchBusinessDetails } from '../../common/helpers/consolidated-view/consolidated-view.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()

export default class LandParcelController extends QuestionPageController {
  viewName = 'parcel'

  makePostRouteHandler() {
    /**
     * Handle POST requests to the land parcel page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<import('@hapi/boom').Boom<any> | import('@hapi/hapi').ResponseObject>}
     */
    const fn = async (request, context, h) => {
      const { state } = context
      const payload = request.payload ?? {}
      const { landParcel } = payload

      await this.setState(request, {
        ...state,
        landParcel
      })
      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }

  /**
   * This method is called when there is a GET request to the select land parcel page.
   * It gets the view model for the page using the `getViewModel` method,
   * and then adds business details to the view model
   */
  makeGetRouteHandler() {
    /**
     * Handle GET requests to the land parcel page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     */
    const fn = async (request, context, h) => {
      const { landParcel = '', actions = [] } = context.state || {}

      // TODO: This is a hardcoded value for testing purposes, should come from Defra ID (CRN included in the JWT returned from Defra ID in the contactId property)
      const sbi = 117235001
      const crn = 1100598138
      const { collection, viewName } = this

      const { data } = await fetchBusinessDetails(sbi, crn).catch((error) => {
        logger.error(error, `Failed to fetch business details ${sbi}`)
        throw Boom.notFound(`No business information found for sbi ${sbi}`)
      })

      const business = data?.business
      const viewModel = {
        ...super.getViewModel(request, context),
        errors: collection.getErrors(collection.getErrors()),
        business,
        actions: actions?.toString(),
        landParcel,
        proxyUrl: config.get('landGrants.apiEndpoint')
      }

      return h.view(viewName, viewModel)
    }

    return fn
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */

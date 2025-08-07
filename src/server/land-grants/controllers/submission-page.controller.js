import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { config } from '~/src/config/config.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { transformStateObjectToGasApplication } from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { sbiStore } from '../../sbi/state.js'
import { stateToLandGrantsGasAnswers } from '../mappers/state-to-gas-answers-mapper.js'

export default class SubmissionPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.viewName = 'submit-your-application'
    this.grantCode = config.get('landGrants.grantCode')
  }

  /**
   * Gets the path to the status page (in this case /confirmation page) for the POST handler.
   * @returns {string} path to the status page
   */
  getStatusPath() {
    return '/find-funding-for-land-or-farms/confirmation'
  }

  /**
   * Submits the land grant application by transforming the state and calling the service.
   * @param {object} context - The form context containing state and reference number
   * @returns {Promise<object>} - The result of the grant application submission
   */
  async submitLandGrantApplication(context) {
    const sbi = String(sbiStore.get('sbi'))
    const { crn = 'crn', defraId = 'defraId', frn = 'frn' } = context.state
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
   * Creates the POST route handler for form submission.
   * @returns {Function} - The route handler function
   */
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

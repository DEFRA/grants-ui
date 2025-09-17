import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { config } from '~/src/config/config.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { transformStateObjectToGasApplication } from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { stateToLandGrantsGasAnswers } from '../mappers/state-to-gas-answers-mapper.js'
import { validateApplication } from '../services/land-grants.service.js'

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
   * Submits the land grant application by transforming the state and calling the service.
   * @param {string} sbi - The single business identifier (SBI) of the user
   * @param {object} context - The form context containing state and reference number
   * @returns {Promise<object>} - The result of the grant application submission
   */
  async submitLandGrantApplication(sbi, crn, context) {
    const { defraId = 'defraId', frn = 'frn', landParcels = {} } = context.state
    const identifiers = {
      sbi,
      frn,
      crn: crn || context.state.crn || 'crn',
      defraId,
      clientRef: context.referenceNumber?.toLowerCase()
    }
    // todo: add validation here
    const { id: applicationValidationRunId } = await validateApplication({
      applicationId: context.referenceNumber?.toLowerCase(),
      crn,
      sbi,
      landParcels
    })

    const applicationData = transformStateObjectToGasApplication(
      identifiers,
      { ...context.state, applicationValidationRunId },
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
      const { sbi, crn } = request.auth.credentials
      const result = await this.submitLandGrantApplication(sbi, crn, context)
      request.logger.info('Form submission completed', result)

      const cacheService = getFormsCacheService(request.server)
      await cacheService.setConfirmationState(request, { confirmed: true, referenceNumber: context.referenceNumber })

      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }
}

/**
 * @import { type FormModel } from '~/src/server/plugins/engine/models/index.js'
 * @import { type PageSummary } from '@defra/forms-model'
 */

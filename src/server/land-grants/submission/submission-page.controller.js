import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { config } from '~/src/config/config.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { transformStateObjectToGasApplication } from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application.service.js'
import { stateToLandGrantsGasAnswers } from './state-to-gas-answers-mapper.js'

export default class SubmissionPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.viewName = 'submission'
    this.grantCode = config.get('landGrants.grantCode')
  }

  /**
   * Gets the path to the status page (in this case /confirmation page) for the POST handler.
   * @returns {string} path to the status page
   */
  getStatusPath() {
    return '/find-funding-for-land-or-farms/confirmation'
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

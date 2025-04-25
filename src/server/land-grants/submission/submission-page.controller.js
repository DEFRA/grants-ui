import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { config } from '~/src/config/config.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application.service.js'
import { transformStateObjectToGasApplication } from '../../common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { stateToLandGrantsGasAnswers } from './state-to-gas-answers-mapper.js'

export default class SubmissionPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.viewName = 'submission'
    this.grantCode = config.get('gas.frpsGrantCode')
  }

  /**
   * Gets the path to the status page (in this case /confirmation page) for the POST handler.
   * @returns {string} path to the status page
   */
  getStatusPath() {
    return '/find-funding-for-land-or-farms/confirmation'
  }

  async submitLandGrantApplication(context) {
    const identifiers = {
      sbi: 'sbi',
      frn: 'frn',
      crn: 'crn',
      defraId: 'defraId'
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
      try {
        const result = await this.submitLandGrantApplication(context)
        request.logger.info('Form submission completed', result)

        return h.redirect(this.getStatusPath())
      } catch (error) {
        request.logger.error(
          error,
          'Failed to submit form to GAS: ' + error.message
        )
        throw error
      }
    }

    return fn
  }
}

/**
 * @import { type FormModel } from '~/src/server/plugins/engine/models/index.js'
 * @import { type PageSummary } from '@defra/forms-model'
 */

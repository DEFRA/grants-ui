import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'

import { transformStateObjectToGasApplication } from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { stateToPigsMightFlyGasAnswers } from '~/src/server/non-land-grants/pigs-might-fly/mappers/state-to-gas-pigs-mapper.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { getConfirmationPath } from '~/src/server/common/helpers/form-slug-helper.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

export default class FlyingPigsSubmissionPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.grantCode = model.def.metadata.submission.grantCode
    this.viewName = 'submission'
  }

  getStatusPath(request, context) {
    return getConfirmationPath(request, context, 'FlyingPigsSubmissionPageController')
  }

  async submitPigTypesApplication(context, request) {
    const { sbi = 'sbi', crn = 'crn', defraId = 'defraId', frn = 'frn' } = context.state
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
      stateToPigsMightFlyGasAnswers
    )

    return submitGrantApplication(this.grantCode, applicationData, request)
  }

  makePostRouteHandler() {
    const fn = async (request, context, h) => {
      const result = await this.submitPigTypesApplication(context, request)

      log(
        LogCodes.SUBMISSION.SUBMISSION_COMPLETED,
        {
          grantType: this.grantCode,
          referenceNumber: context.referenceNumber,
          numberOfFields: context.state ? Object.keys(context.state).length : 0,
          status: result?.status || 'success'
        },
        request
      )
      const cacheService = getFormsCacheService(request.server)
      await cacheService.setConfirmationState(request, {
        ...context.state,
        $$__referenceNumber: context.referenceNumber,
        confirmed: true
      })

      const redirectPath = this.getStatusPath(request, context)
      log(
        LogCodes.SUBMISSION.SUBMISSION_REDIRECT,
        { controller: 'FlyingPigsSubmissionPageController', redirectPath },
        request
      )

      return h.redirect(redirectPath)
    }

    return fn
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageSummary } from '@defra/forms-model'
 */

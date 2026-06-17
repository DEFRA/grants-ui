import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { getConfirmationPath } from '~/src/server/common/helpers/form-slug-helper.js'
import { withTaskContext } from '~/src/server/task-list/task-list.helper.js'

export default class MapSubmissionPageController extends withTaskContext(SummaryPageController) {
  makePostRouteHandler() {
    /**
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect'>} h
     * @returns {Promise<ResponseObject>}
     */
    return async (request, context, h) => {
      return h.redirect(getConfirmationPath(request, context, 'MapSubmissionPageController'))
    }
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/types'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */

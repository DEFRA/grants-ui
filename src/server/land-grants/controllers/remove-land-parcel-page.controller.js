import RemoveActionPageController from '~/src/server/land-grants/controllers/remove-action-page.controller.js'
import { formatParcelForDisplay } from '~/src/shared/format-parcel.js'

/**
 * "Remove this land parcel?" - a confirm button and a cancel link rather than
 * the yes/no radios of the action-removal page it extends.
 */
export default class RemoveLandParcelPageController extends RemoveActionPageController {
  viewName = 'remove-land-parcel'

  /**
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
   * @returns {Promise<ResponseObject>}
   */
  async handleGet(request, context, h) {
    const { parcelId } = /** @type {{ parcelId?: string }} */ (request.query ?? {})
    const landParcels = context.state?.landParcels

    if (!parcelId || !landParcels?.[parcelId]) {
      return this.proceed(request, h, this.redirects.list)
    }

    const viewModel = this.getViewModel(request, context)
    const backLink = this.buildBackLink()

    return h.view(this.viewName, {
      ...viewModel,
      backLink,
      parcelId,
      parcelReference: formatParcelForDisplay(parcelId),
      cancelPath: backLink.href
    })
  }

  /**
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
   * @returns {Promise<ResponseObject>}
   */
  async handlePost(request, context, h) {
    const { state } = context
    const { parcelId } = /** @type {{ parcelId?: string }} */ (request.query ?? {})

    if (!parcelId || !state.landParcels?.[parcelId]) {
      return this.proceed(request, h, this.redirects.list)
    }

    return this.processRemoval(request, state, h, parcelId, undefined)
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */

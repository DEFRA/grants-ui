import { log, debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { fetchParcels } from '../services/land-grants.service.js'
import QuestionPageWithParcelCheckController from '~/src/server/common/controllers/question-page-with-parcel-check.controller.js'
import { mapParcelsToViewModel } from '~/src/server/land-grants/view-models/parcel.view-model.js'
import { getParcelIdsFromPayload } from '../utils/parcel-request.utils.js'

export default class SelectLandParcelPageController extends QuestionPageWithParcelCheckController {
  viewName = 'select-land-parcel'

  /**
   * Whether this journey allows selecting multiple parcels.
   * Configured via `config` on the page in the form definition YAML:
   *   controller: SelectLandParcelPageController
   *   config:
   *     enableMultipleParcelSelect: true
   *
   * @param {FormModel} model
   * @param {import('@defra/forms-model').Page} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    const config = model.def.metadata?.pageConfig?.[pageDef.path] ?? {}
    this.enableMultipleParcelSelect = config.enableMultipleParcelSelect === true
  }

  resolveParcelIds(request, _context) {
    return getParcelIdsFromPayload(request)
  }

  /**
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
   * @returns {Promise<ResponseObject>}
   */
  async handlePost(request, context, h) {
    const { state } = context
    const payload = request.payload ?? {}
    const { selectedLandParcel, action } = payload
    const existingLandParcels = Object.keys(state.landParcels || {}).length > 0

    if (action === 'validate' && !selectedLandParcel) {
      let parcels = []
      try {
        const fetchedParcels = await fetchParcels(request)
        const { landParcels } = state || {}
        parcels = mapParcelsToViewModel(fetchedParcels, landParcels)
      } catch (error) {
        debug(
          { level: 'error', error, messageFunc: () => 'Error fetching parcels for validation error rendering' },
          {},
          request
        )
      }

      return h.view(this.viewName, {
        ...super.getViewModel(request, context),
        ...state,
        parcels,
        existingLandParcels,
        errors: 'Select a land parcel'
      })
    }

    return this.proceed(request, h, `${this.getNextPath(context)}?parcelId=${selectedLandParcel}`)
  }

  /**
   * This method is called when there is a GET request to the select land parcel page.
   * It gets the view model for the page using the `getViewModel` method,
   * and then adds business details to the view model
   *
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
   */
  async handleGet(request, context, h) {
    const { state } = context
    const { landParcels } = state || {}
    const sbi = request.auth?.credentials?.sbi

    const { viewName } = this
    const baseViewModel = super.getViewModel(request, context)
    const existingLandParcels = Object.keys(landParcels || {}).length > 0

    console.log({ enableMultipleParcelSelect: this.enableMultipleParcelSelect })
    try {
      const fetchedParcels = await fetchParcels(request)
      const parcels = mapParcelsToViewModel(fetchedParcels, landParcels)

      if (!parcels?.length) {
        log(LogCodes.LAND_GRANTS.NO_LAND_PARCELS_FOUND, { sbi })

        const errorMessage =
          'Unable to find parcel information, please try again later or contact the Rural Payments Agency.'

        return h.view(viewName, {
          ...baseViewModel,
          parcels: [],
          existingLandParcels,
          errors: [errorMessage]
        })
      }

      const viewModel = {
        ...baseViewModel,
        parcels,
        existingLandParcels
      }

      return h.view(viewName, viewModel)
    } catch (error) {
      debug({ level: 'error', error, messageFunc: () => `Unexpected error when fetching parcel data` }, {}, request)
      const errorMessage =
        'Unable to find parcel information, please try again later or contact the Rural Payments Agency.'

      return h.view(viewName, {
        ...baseViewModel,
        existingLandParcels,
        errors: [errorMessage]
      })
    }
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */

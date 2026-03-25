import { log, debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { fetchParcels } from '../../../services/land-grants.service.js'
import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'
import { mapParcelsToViewModel } from '~/src/server/land-grants/view-models/parcel.view-model.js'

export default class CommonSelectLandParcelController extends LandGrantsQuestionWithAuthCheckController {
  viewName = 'common-select-land-parcel'

  constructor(model, pageDef) {
    super(model, pageDef)
    const config = model.def.metadata?.pageConfig?.[pageDef.path] ?? {}
    this.selectionMode = config.enableMultipleParcelSelect ? 'multiple' : 'single'
    this.postSelectionInfoText = config.postSelectionInfoText || ''
  }

  resolveParcelIds(request) {
    const fromPayload = request.payload?.selectedLandParcel

    if (Array.isArray(fromPayload)) {
      return fromPayload
    }

    if (fromPayload) {
      return [fromPayload]
    }

    const queryValue = request.query?.selectedParcelIds
    if (queryValue) {
      return queryValue.split(',')
    }

    return null
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

    try {
      const fetchedParcels = await fetchParcels(request)

      const parcels = mapParcelsToViewModel(fetchedParcels, landParcels)
      const selectedParcelIds = Array.isArray(parcels) ? parcels : parcels ? [parcels] : []

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
        existingLandParcels,
        selectionMode: this.selectionMode,
        postSelectionInfoText: this.postSelectionInfoText,
        selectedParcelIds: selectedParcelIds || []
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

  async handlePost(request, context, h) {
    const { state } = context
    const payload = request.payload ?? {}
    const { selectedLandParcel: selected, action } = payload

    const selectedParcelIds = Array.isArray(selected) ? selected : selected ? [selected] : []
    const existingLandParcels = Object.keys(state.landParcels || {}).length > 0

    const isEmpty = !selected || (Array.isArray(selected) && selected.length === 0)

    if (action === 'validate' && isEmpty) {
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
        selectedParcelIds: selectedParcelIds || [],
        errors: this.selectionMode === 'multiple' ? 'Select at least one land parcel' : 'Select a land parcel'
      })
    }

    return this.proceed(request, h, `${this.getNextPath(context)}?selectedParcelIds=${selectedParcelIds.join(',')}`)
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */

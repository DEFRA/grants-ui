import { log, debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import LandGrantsQuestionWithAuthCheckController from '../../controllers/auth/land-grants-question-with-auth-check.controller.js'
import { fetchParcels } from '../../services/land-grants.service.js'
import { mapParcelsToViewModel } from '../../view-models/parcel.view-model.js'
import { getParcelIdFromQuery, getParcelIdsFromPayload } from '../../utils/parcel-request.utils.js'
import { stringifyParcel } from '../../utils/format-parcel.js'

export default class CommonSelectLandParcelPageController extends LandGrantsQuestionWithAuthCheckController {
  viewName = 'common-select-land-parcel'

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
    this.topSection = config.topSection || ''
    this.bottomSection = config.bottomSection || ''
    this.selectionHint = config.selectionHint || ''
    this.supportDetailsSummaryText = config.supportDetailsSummaryText || ''
    this.supportDetailsHtml = config.supportDetailsHtml || ''
  }

  resolveParcelIds(request) {
    if (request.method === 'post') {
      return getParcelIdsFromPayload(request)
    }

    return getParcelIdFromQuery(request)
  }

  getSelectedParcelIdsFromState(state) {
    return Array.isArray(state.landParcels) ? state.landParcels : []
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
    const sbi = request.auth?.credentials?.sbi

    const selectedParcelIds = this.getSelectedParcelIdsFromState(state)
    const { viewName } = this
    const baseViewModel = super.getViewModel(request, context)
    const hasExistingLandParcels = Object.keys(state.landParcels || {}).length > 0
    try {
      const fetchedParcels = await fetchParcels(request)
      const parcels = mapParcelsToViewModel(fetchedParcels)

      if (!parcels?.length) {
        log(LogCodes.LAND_GRANTS.NO_LAND_PARCELS_FOUND, { sbi })

        const errorMessage =
          'Unable to find parcel information, please try again later or contact the Rural Payments Agency.'

        return h.view(viewName, {
          ...baseViewModel,
          parcels: [],
          hasExistingLandParcels,
          errors: [errorMessage]
        })
      }

      const viewModel = {
        ...baseViewModel,
        parcels,
        hasExistingLandParcels,
        selectionMode: this.enableMultipleParcelSelect ? 'multiple' : 'single',
        topSection: this.topSection,
        bottomSection: this.bottomSection,
        selectedParcelIds,
        selectionHint: this.selectionHint,
        supportDetailsSummaryText: this.supportDetailsSummaryText,
        supportDetailsHtml: this.supportDetailsHtml
      }

      return h.view(viewName, viewModel)
    } catch (error) {
      debug({ level: 'error', error, messageFunc: () => `Unexpected error when fetching parcel data` }, {}, request)
      const errorMessage =
        'Unable to find parcel information, please try again later or contact the Rural Payments Agency.'

      return h.view(viewName, {
        ...baseViewModel,
        hasExistingLandParcels,
        errors: [errorMessage]
      })
    }
  }

  async handlePost(request, context, h) {
    const { state } = context

    const selectedParcelIds = getParcelIdsFromPayload(request)
    const isEmpty = selectedParcelIds.length === 0

    let fetchedParcels = []
    try {
      fetchedParcels = await fetchParcels(request)
    } catch (error) {
      debug(
        { level: 'error', error, messageFunc: () => 'Error fetching parcels for validation error rendering' },
        {},
        request
      )
    }

    if (isEmpty) {
      const parcels = mapParcelsToViewModel(fetchedParcels)

      return h.view(this.viewName, {
        ...super.getViewModel(request, context),
        parcels,
        selectedParcelIds,
        errors: this.enableMultipleParcelSelect ? 'Select at least one land parcel' : 'Select a land parcel',
        selectionHint: this.selectionHint
      })
    }

    const parcelMap = new Map(fetchedParcels.map((p) => [stringifyParcel(p), p]))

    const totalHectaresAppliedFor = selectedParcelIds.reduce((sum, id) => {
      const parcel = parcelMap.get(id)
      return sum + (parcel?.area?.value || 0)
    }, 0)

    await this.mergeState(request, state, {
      landParcels: selectedParcelIds,
      totalHectaresAppliedFor
    })

    return this.proceed(request, h, `${this.getNextPath(context)}`)
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */

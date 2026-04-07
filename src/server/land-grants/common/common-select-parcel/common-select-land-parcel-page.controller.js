import { log, debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import LandGrantsQuestionWithAuthCheckController from '../../controllers/auth/land-grants-question-with-auth-check.controller.js'
import { fetchParcels } from '../../services/land-grants.service.js'
import { mapParcelsToViewModel } from '../../view-models/parcel.view-model.js'
import { getParcelIdFromQuery, getParcelIdsFromPayload } from '../../utils/parcel-request.utils.js'
import { ComponentType } from '@defra/forms-model'

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
   * @param {PageQuestion} pageDef
   */
  constructor(model, pageDef) {
    const config = model.def.metadata?.pageConfig?.[pageDef.path] ?? {}

    const existing = pageDef.components?.find((c) => c.name === 'landParcels')
    // Inject Html (placeholder) and RadiosField components into the page def BEFORE super() so they are
    // included in the collection's formSchema/stateSchema from the start.
    // Using RadiosField because YesNoField does not support custom error messages.
    // Placeholder ensures RadiosField is not treated as sole component by DXT, avoiding H1 legend.
    /** @type {import('@defra/forms-model').PageQuestion} */
    const patchedPageDef = {
      ...pageDef,
      components: existing
        ? pageDef.components
        : [
            ...(pageDef.components ?? []),
            {
              type: ComponentType.CheckboxesField,
              name: 'landParcels',
              title: 'Select land parcels',
              list: 'landParcels',
              options: {
                required: true
              }
            }
          ]
    }
    super(model, patchedPageDef)

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

    if (isEmpty) {
      let parcels = []

      try {
        const fetchedParcels = await fetchParcels(request)
        parcels = mapParcelsToViewModel(fetchedParcels)
      } catch (error) {
        debug(
          { level: 'error', error, messageFunc: () => 'Error fetching parcels for validation error rendering' },
          {},
          request
        )
      }

      return h.view(this.viewName, {
        ...super.getViewModel(request, context),
        parcels,
        selectedParcelIds,
        errors: this.enableMultipleParcelSelect ? 'Select at least one land parcel' : 'Select a land parcel',
        selectionHint: this.selectionHint
      })
    }

    await this.mergeState(request, state, {
      landParcels: selectedParcelIds
    })

    return this.proceed(request, h, `${this.getNextPath(context)}?selectedParcelIds=${selectedParcelIds.join(',')}`)
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { PageQuestion } from '@defra/forms-model'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { ResponseToolkit } from '@hapi/hapi'
 */

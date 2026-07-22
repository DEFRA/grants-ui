import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { withTaskContext } from '~/src/server/task-list/task-list.helper.js'
import { getParcelIdsFromPayload } from '~/src/server/land-grants/utils/parcel-request.utils.js'

export default class MapSelectPageController extends withTaskContext(QuestionPageController) {
  viewName = 'map-select-parcel'

  /** @type {boolean} */
  multiSelect = false

  /** @type {boolean} */
  singleParcelSubmission = false

  /**
   * @param {FormModel} model
   * @param {PageDef} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)

    const metadata = /** @type {Record<string, unknown>} */ (model.def.metadata ?? {})
    const config = /** @type {Record<string, unknown>} */ (
      /** @type {Record<string, Record<string, unknown>>} */ (metadata.pageConfig)?.[pageDef.path] ?? {}
    )

    // Grant-level config: when only a single land parcel is allowed in state, multiple selection is always disabled.
    this.singleParcelSubmission = metadata.singleParcelSubmission === true
    this.multiSelect = !this.singleParcelSubmission && Boolean(config.multiSelect)
  }

  makeGetRouteHandler() {
    /** @param {FormRequest} request @param {FormContext} context @param {FormResponseToolkit} h */
    return async (request, context, h) => this.handleGet(request, context, h)
  }

  makePostRouteHandler() {
    /** @param {FormRequestPayload} request @param {FormContext} context @param {FormResponseToolkit} h */
    return async (request, context, h) => this.handlePost(request, context, h)
  }

  /**
   * The view model shared by the GET render and the POST validation re-render.
   * @param {FormRequest | FormRequestPayload} request
   * @param {FormContext} context
   * @param {Record<string, unknown>} [extra]
   */
  buildViewModel(request, context, extra = {}) {
    return {
      ...super.getViewModel(request, context),
      multiSelect: this.multiSelect,
      formAction: request.path,
      ...extra
    }
  }

  /**
   * @param {FormRequest} request
   * @param {FormContext} context
   * @param {FormResponseToolkit} h
   */
  handleGet(request, context, h) {
    return h.view(this.viewName, this.buildViewModel(request, context))
  }

  /**
   * @param {FormRequestPayload} request
   * @param {FormContext} context
   * @param {FormResponseToolkit} h
   */
  async handlePost(request, context, h) {
    const { state } = context
    const selectedParcelIds = getParcelIdsFromPayload(request)

    if (selectedParcelIds.length === 0) {
      const errorText = this.multiSelect
        ? 'Select at least one land parcel on the map to continue'
        : 'Select a land parcel on the map to continue'
      return h.view(
        this.viewName,
        this.buildViewModel(request, context, {
          selectedParcelIds: [],
          errors: [{ text: errorText, href: '#parcel-map' }]
        })
      )
    }

    const selectedParcelsDisplay = selectedParcelIds.join(', ')

    // In single-parcel-submission mode, selecting a parcel clears any previously selected parcel and its actions.
    const clearedParcels = this.singleParcelSubmission ? { landParcels: {} } : {}

    const newState = this.multiSelect
      ? { ...state, selectedParcelIds, selectedParcelsDisplay, ...clearedParcels }
      : {
          ...state,
          selectedParcelId: selectedParcelIds[0],
          selectedParcelIds,
          selectedParcelsDisplay,
          ...clearedParcels
        }

    await this.setState(request, /** @type {FormSubmissionState} */ (/** @type {unknown} */ (newState)))

    const nextPath = this.getNextPath(context)
    const redirect =
      !this.multiSelect && selectedParcelIds[0] && nextPath
        ? `${nextPath}?parcelId=${encodeURIComponent(selectedParcelIds[0])}`
        : nextPath

    return this.proceed(request, h, redirect)
  }
}

/**
 * @import { FormRequest, FormRequestPayload, FormContext, FormResponseToolkit, FormSubmissionState } from '@defra/forms-engine-plugin/types'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageQuestion as PageDef } from '@defra/forms-model'
 */

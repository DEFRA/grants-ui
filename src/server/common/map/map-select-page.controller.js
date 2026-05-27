import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { withTaskContext } from '~/src/server/task-list/task-list.helper.js'

export default class MapSelectPageController extends withTaskContext(QuestionPageController) {
  viewName = 'map-select-parcel'

  /** @type {boolean} */
  multiSelect = false

  /**
   * @param {FormModel} model
   * @param {PageDef} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    const pageConfig = /** @type {Record<string, unknown>} */ (/** @type {{ config?: Record<string, unknown> }} */ (/** @type {unknown} */ (pageDef)).config ?? {})
    this.multiSelect = Boolean(pageConfig.multiSelect)
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
   * @param {FormRequest} request
   * @param {FormContext} context
   * @param {FormResponseToolkit} h
   */
  async handleGet(request, context, h) {
    return h.view(this.viewName, {
      ...super.getViewModel(request, context),
      multiSelect: this.multiSelect,
      formAction: request.path
    })
  }

  /**
   * @param {FormRequestPayload} request
   * @param {FormContext} context
   * @param {FormResponseToolkit} h
   */
  async handlePost(request, context, h) {
    const { state } = context
    const payload = /** @type {Record<string, unknown>} */ (request.payload ?? {})
    const selectedParcelIds = parseParcelIdsFromPayload(payload)

    if (selectedParcelIds.length === 0) {
      return h.view(this.viewName, {
        ...super.getViewModel(request, context),
        multiSelect: this.multiSelect,
        selectedParcelIds: [],
        formAction: request.path,
        errors: this.multiSelect
          ? 'Select at least one land parcel on the map to continue'
          : 'Select a land parcel on the map to continue'
      })
    }

    const selectedParcelsDisplay = selectedParcelIds.join(', ')

    const newState = this.multiSelect
      ? { ...state, selectedParcelIds, selectedParcelsDisplay }
      : { ...state, selectedParcelId: selectedParcelIds[0], selectedParcelIds, selectedParcelsDisplay }

    await this.setState(request, /** @type {FormSubmissionState} */ (/** @type {unknown} */ (newState)))

    const nextPath = this.getNextPath(context)
    const redirect = !this.multiSelect && selectedParcelIds[0] && nextPath
      ? `${nextPath}?parcelId=${encodeURIComponent(selectedParcelIds[0])}`
      : nextPath

    return this.proceed(request, h, redirect)
  }
}

/**
 * Extract parcel IDs submitted from the hidden inputs (map path) or
 * radio/checkbox inputs (no-JS fallback path).
 * @param {Record<string, unknown>} payload
 * @returns {string[]}
 */
function parseParcelIdsFromPayload(payload) {
  const raw = payload.landParcels
  if (Array.isArray(raw)) {
    return raw.filter((v) => typeof v === 'string')
  }
  if (typeof raw === 'string' && raw) {
    return [raw]
  }
  return []
}

/**
 * @import { FormRequest, FormRequestPayload, FormContext, FormResponseToolkit, FormSubmissionState } from '@defra/forms-engine-plugin/types'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageQuestion as PageDef } from '@defra/forms-model'
 */

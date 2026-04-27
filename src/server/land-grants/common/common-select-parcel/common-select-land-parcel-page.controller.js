import { debug, log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import LandGrantsQuestionWithAuthCheckController from '../../controllers/auth/land-grants-question-with-auth-check.controller.js'
import { fetchParcels } from '../../services/land-grants.service.js'
import { mapParcelsToViewModel } from '../../view-models/parcel.view-model.js'
import { getParcelIdFromQuery, getParcelIdsFromPayload } from '../../utils/parcel-request.utils.js'
import { stringifyParcel } from '../../utils/format-parcel.js'

const PARCEL_FETCH_ERROR_MESSAGE =
  'Unable to find parcel information, please try again later or contact the Rural Payments Agency.'

export default class CommonSelectLandParcelPageController extends LandGrantsQuestionWithAuthCheckController {
  viewName = 'common-select-land-parcel'

  /**
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
    this.showSupportDetails = config.showSupportDetails !== false
    this.minimumAreaHa = config.minimumAreaHa ?? null

    // Resolve section
    if (pageDef.section) {
      this.section = model.getSection(pageDef.section)
    }
  }

  makeGetRouteHandler() {
    return async (request, context, h) => {
      if (request.query?.returnUrl) {
        return h.redirect(request.path)
      }

      return super.makeGetRouteHandler()(request, context, h)
    }
  }

  /**
   * @param {AnyFormRequest} request
   * @returns {string[]}
   */
  resolveParcelIds(request) {
    if (request.method === 'post') {
      return getParcelIdsFromPayload(request)
    }

    return getParcelIdFromQuery(request)
  }

  /**
   * @param {FormSubmissionState} state
   * @returns {string[]}
   */
  getSelectedParcelIdsFromState(state) {
    return Array.isArray(state.landParcels) ? /** @type {string[]} */ (state.landParcels) : []
  }

  /**
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {{ parcels?: RadioItem[], selectedParcelIds?: string[], errors?: string | string[] }} [overrides]
   * @returns {object}
   */
  buildViewModel(request, context, { parcels, selectedParcelIds, errors } = {}) {
    const { state } = context

    const sectionTitle = this.section?.hideTitle !== true ? this.section?.title : ''

    return {
      ...super.getViewModel(request, context),
      sectionTitle,
      parcels,
      hasExistingLandParcels: Array.isArray(state.landParcels) && state.landParcels.length > 0,
      selectionMode: this.enableMultipleParcelSelect ? 'multiple' : 'single',
      topSection: this.topSection,
      bottomSection: this.bottomSection,
      selectedParcelIds,
      selectionHint: this.selectionHint,
      showSupportDetails: this.showSupportDetails,
      supportDetailsSummaryText: this.supportDetailsSummaryText,
      supportDetailsHtml: this.supportDetailsHtml,
      ...(errors && { errors })
    }
  }

  /**
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
   */
  async handleGet(request, context, h) {
    const sbi = request.auth?.credentials?.sbi
    const { viewName } = this

    try {
      const fetchedParcels = await fetchParcels(request)
      const parcels = mapParcelsToViewModel(fetchedParcels)

      if (!parcels.length) {
        log(LogCodes.LAND_GRANTS.NO_LAND_PARCELS_FOUND, { sbi })
        return h.view(
          viewName,
          this.buildViewModel(request, context, { parcels: [], errors: [PARCEL_FETCH_ERROR_MESSAGE] })
        )
      }

      return h.view(
        viewName,
        this.buildViewModel(request, context, {
          parcels,
          selectedParcelIds: this.getSelectedParcelIdsFromState(context.state)
        })
      )
    } catch (error) {
      debug(
        {
          level: 'error',
          error: error instanceof Error ? error : undefined,
          messageFunc: () => 'Unexpected error when fetching parcel data'
        },
        {},
        request
      )
      return h.view(viewName, this.buildViewModel(request, context, { errors: [PARCEL_FETCH_ERROR_MESSAGE] }))
    }
  }

  /**
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
   */
  async handlePost(request, context, h) {
    const { state } = context
    const selectedParcelIds = getParcelIdsFromPayload(request)

    /** @type {Parcel[]} */
    let fetchedParcels = []
    try {
      fetchedParcels = await fetchParcels(request)
    } catch (error) {
      debug(
        {
          level: 'error',
          error: error instanceof Error ? error : undefined,
          messageFunc: () => 'Error fetching parcels for validation error rendering'
        },
        {},
        request
      )
    }

    if (!selectedParcelIds.length) {
      const parcels = mapParcelsToViewModel(fetchedParcels)
      const validationError = this.enableMultipleParcelSelect
        ? 'Select at least one land parcel'
        : 'Select a land parcel'
      return h.view(
        this.viewName,
        this.buildViewModel(request, context, { parcels, selectedParcelIds, errors: validationError })
      )
    }

    const parcelMap = new Map(fetchedParcels.map((p) => [stringifyParcel(p), p]))
    const landParcelMetadata = selectedParcelIds.map((id) => {
      const parcel = parcelMap.get(id)
      const rawArea = parcel?.area?.value
      return { parcelId: id, areaHa: rawArea == null ? null : Number(rawArea) }
    })

    const totalHectaresAppliedFor =
      Math.round(landParcelMetadata.reduce((sum, { areaHa }) => sum + (areaHa ?? 0), 0) * 10000) / 10000

    if (this.minimumAreaHa !== null && totalHectaresAppliedFor < this.minimumAreaHa) {
      const parcels = mapParcelsToViewModel(fetchedParcels)
      const validationError = `Total area of selected land parcels must be more than ${this.minimumAreaHa}ha`
      return h.view(
        this.viewName,
        this.buildViewModel(request, context, { parcels, selectedParcelIds, errors: validationError })
      )
    }

    await this.mergeState(request, state, {
      landParcels: selectedParcelIds,
      landParcelsDisplay: selectedParcelIds.join(', '),
      landParcelMetadata,
      totalHectaresAppliedFor,
      additionalAnswers: { totalHectaresAppliedFor }
    })

    const { returnUrl: _removed, ...queryWithoutReturnUrl } = request.query ?? {}
    const requestWithoutReturnUrl = { ...request, query: queryWithoutReturnUrl }
    return this.proceed(requestWithoutReturnUrl, h, `${this.getNextPath(context)}`)
  }
}

/**
 * @import { FormContext, AnyFormRequest, FormSubmissionState } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { ResponseToolkit } from '@hapi/hapi'
 * @import { RadioItem, Parcel } from '../../view-models/parcel.view-model.js'
 */

import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { withTaskContext } from '~/src/server/task-list/task-list.helper.js'
import { getParcelIdsFromPayload } from '~/src/server/land-grants/utils/parcel-request.utils.js'
import { fetchActionsForParcel } from '~/src/server/land-grants/services/land-grants.service.js'
import { getLandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
import { formatParcelReference, parseLandParcel } from '~/src/shared/format-parcel.js'
import { hasAvailableLand } from '~/src/shared/availability.js'
import { getAddedActionsForStateParcel } from '~/src/server/land-grants/view-state/land-parcel.view-state.js'
import { escapeHtml } from '~/src/server/common/utils/escape-html.js'
import { log, error, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { isNoActionsMockEnabled } from '~/src/server/dev-tools/mock-overrides.js'

// Second line must match the no-eligible-actions copy in
// src/server/land-grants/views/select-actions.html.
/** @param {string} selectedParcelId */
const noEligibleActionsError = (selectedParcelId) =>
  `There are no eligible actions for parcel ${escapeHtml(formatParcelReference(selectedParcelId))}.<br>` +
  'Change the parcel land cover or choose a different parcel to view eligible actions.'

export default class MapSelectPageController extends withTaskContext(QuestionPageController) {
  viewName = 'map-select-parcel'

  /** @type {boolean} */
  multiSelect = false

  /** @type {boolean} */
  singleParcelSubmission = false

  /** @type {string[]} */
  enabledLandActions = []

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

    this.enabledLandActions = Array.isArray(metadata.enabledLandActions) ? metadata.enabledLandActions : []
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
   * One parcel's eligible actions, or null when the fetch failed.
   *
   * Mirrors SelectActionsBasePageController.fetchActions: the catch is per
   * parcel, so one failing fetch cannot decide the outcome for the rest of the
   * selection.
   * @param {FormRequestPayload} request
   * @param {LandGrantsUserContext} userContext
   * @param {{ sheetId: string, parcelId: string }} parcel
   * @returns {Promise<ActionOption[] | null>}
   */
  async fetchActionsOrNull(request, userContext, { sheetId, parcelId }) {
    try {
      const { actions } = await fetchActionsForParcel(
        { sheetId, parcelId, enabledLandActions: this.enabledLandActions },
        userContext
      )
      return actions
    } catch (err) {
      const { message: errorMessage, status: statusCode } = /** @type {Error & {status?: number}} */ (err)
      error(
        LogCodes.LAND_GRANTS.FETCH_ACTIONS_ERROR,
        { sbi: userContext.sbi, sheetId, parcelId, errorMessage, statusCode },
        request
      )
      return null
    }
  }

  /**
   * Whether a parcel's already-saved actions would still be rendered on the
   * select-actions page, which makes it reachable even with nothing left
   * available. Never in single-parcel mode: handlePost wipes landParcels straight
   * after this check, so those saved actions would not survive to the render.
   * @param {FormSubmissionState} state
   * @param {string} selectedParcelId
   * @returns {boolean}
   */
  hasSavedActions(state, selectedParcelId) {
    if (this.singleParcelSubmission) {
      return false
    }
    return getAddedActionsForStateParcel(state, selectedParcelId).length > 0
  }

  /**
   * The selected parcels that have no action the user could go on to choose, so
   * that Continue can be rejected here rather than sending the user to the
   * select-actions page only to be told to come back.
   *
   * Uses the flat fetchActionsForParcel, matching SelectActionsPageController. A
   * journey pairing this map page with SelectGroupedActionsPageController would
   * need fetchGroupedActionsForParcel, which filters further by group definition
   * and caches under a different key prefix ('' vs 'flat:').
   *
   * Fails open per parcel: a parcel whose fetch failed is treated as eligible,
   * so an outage lets the user through to the select-actions page (which has its
   * own fetch-failure message) instead of being reported as "no actions".
   * @param {FormRequestPayload} request
   * @param {string[]} selectedParcelIds
   * @param {FormSubmissionState} state
   * @returns {Promise<string[]>}
   */
  async findParcelsWithNoActions(request, selectedParcelIds, state) {
    if (this.enabledLandActions.length === 0) {
      return []
    }

    // Dev-tools escape hatch: the local seed gives every parcel at least one
    // action, so this is the only way to see the error page locally.
    if (isNoActionsMockEnabled(request)) {
      return selectedParcelIds
    }

    let userContext
    try {
      userContext = getLandGrantsUserContext(request)
    } catch (err) {
      const { message: errorMessage, status: statusCode } = /** @type {Error & {status?: number}} */ (err)
      error(
        LogCodes.LAND_GRANTS.FETCH_ACTIONS_ERROR,
        { sbi: request.auth?.credentials?.sbi, sheetId: '', parcelId: '', errorMessage, statusCode },
        request
      )
      return []
    }

    const results = await Promise.all(
      [...new Set(selectedParcelIds)].map(async (selectedParcelId) => {
        const [sheetId = '', parcelId = ''] = parseLandParcel(selectedParcelId)
        const actions = await this.fetchActionsOrNull(request, userContext, { sheetId, parcelId })
        return { selectedParcelId, sheetId, parcelId, actions }
      })
    )

    // A null means the fetch failed — only a resolved list with nothing claimable is "no actions".
    const ineligible = results.filter(
      (result) =>
        result.actions != null &&
        !result.actions.some((action) => hasAvailableLand(action)) &&
        !this.hasSavedActions(state, result.selectedParcelId)
    )
    ineligible.forEach(({ sheetId, parcelId }) => {
      log(LogCodes.LAND_GRANTS.NO_ACTIONS_FOUND, { sheetId, parcelId }, request)
    })

    return ineligible.map((result) => result.selectedParcelId)
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
        ? 'Select at least one land parcel on the map before you continue.'
        : 'Select a land parcel on the map before you continue.'
      return h.view(
        this.viewName,
        this.buildViewModel(request, context, {
          errors: [{ text: errorText, href: '#parcel-map' }]
        })
      )
    }

    const parcelsWithNoActions = await this.findParcelsWithNoActions(request, selectedParcelIds, state)
    if (parcelsWithNoActions.length > 0) {
      // State is deliberately left untouched: a rejected change must not destroy a
      // previously completed selection and its actions.
      return h.view(
        this.viewName,
        this.buildViewModel(request, context, {
          errors: parcelsWithNoActions.map((selectedParcelId) => ({
            html: noEligibleActionsError(selectedParcelId),
            href: '#parcel-map'
          })),
          selectedParcelIds
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
 * @import { ActionOption } from '~/src/server/land-grants/types/land-grants.client.d.js'
 * @import { LandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
 */

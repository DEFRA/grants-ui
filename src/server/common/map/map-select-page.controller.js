import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { withTaskContext } from '~/src/server/task-list/task-list.helper.js'
import { getParcelIdsFromPayload } from '~/src/server/land-grants/utils/parcel-request.utils.js'
import { fetchActionsForParcel, fetchParcels } from '~/src/server/land-grants/services/land-grants.service.js'
import { buildParcelList } from './parcel-list.view-model.js'
import { attempt } from '~/src/server/common/helpers/attempt.js'
import { logUpstreamError } from '~/src/server/common/helpers/logging/upstream-error.js'
import { readUpstreamStatus } from '~/src/server/common/helpers/errors.js'
import { getLandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
import { formatParcelReference, parseLandParcel } from '~/src/shared/format-parcel.js'
import { isActionAvailable } from '~/src/shared/availability.js'
import { escapeHtml } from '@hapi/hoek'
import { error, log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { isNoActionsMockEnabled } from '~/src/server/common/helpers/mock-overrides.js'
import {
  CONFIRM_LAND_AND_ACTIONS_PATH,
  isFromConfirmLandAndActions,
  withConfirmLandAndActionsOrigin
} from '~/src/server/land-grants/utils/confirm-land-and-actions-navigation.js'

// fetchParcels combines the DAL parcel lookup with the land-grants parcel sizes.
const PARCELS_UPSTREAM_ENDPOINT = 'Land parcels lookup'
const SERVICE_LAND_GRANTS = 'land-grants-api'

/** @param {string} selectedParcelId */
const noEligibleActionsError = (selectedParcelId) =>
  `There are no actions available for parcel ${escapeHtml(formatParcelReference(selectedParcelId))}. Select another land parcel to continue.`

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
    const fromConfirmLandAndActions = isFromConfirmLandAndActions(request)
    return {
      ...super.getViewModel(request, context),
      multiSelect: this.multiSelect,
      enabledLandActions: this.enabledLandActions,
      formAction: fromConfirmLandAndActions ? withConfirmLandAndActionsOrigin(request.path) : request.path,
      cancelHref: fromConfirmLandAndActions ? this.getHref(CONFIRM_LAND_AND_ACTIONS_PATH) : undefined,
      ...extra
    }
  }

  /**
   * @param {FormRequest} request
   * @param {FormContext} context
   * @param {FormResponseToolkit} h
   */
  handleGet(request, context, h) {
    return this.renderSelection(request, context, h)
  }

  /**
   * Render the text-list fallback using only the bulk parcel/area lookup.
   * Actions and consent calculations happen only after a parcel is selected.
   * @param {FormRequest | FormRequestPayload} request
   * @param {FormContext} context
   * @param {FormResponseToolkit} h
   * @param {Record<string, unknown>} [extra]
   */
  async renderSelection(request, context, h, extra = {}) {
    const result = await attempt(() => fetchParcels(request, getLandGrantsUserContext(request)))
    if (!result.ok) {
      const err = /** @type {Error & { code?: unknown, status?: unknown }} */ (result.error)
      logUpstreamError(
        {
          endpoint: PARCELS_UPSTREAM_ENDPOINT,
          service: SERVICE_LAND_GRANTS,
          upstreamStatus: readUpstreamStatus(err),
          errorMessage: err.message
        },
        request
      )
    }
    const { parcels, totalArea } = buildParcelList(result.ok ? result.value : [], context.state)
    // Keep any POST validation errors alongside a failure to load the list.
    const errors = [.../** @type {Array<Record<string, unknown>>} */ (extra.errors ?? [])]
    if (!result.ok) {
      errors.push({ text: 'Unable to load your land parcels. Try again later.' })
    } else if (!parcels.length) {
      errors.push({ text: 'No land parcels were found for your account.' })
    }
    return h.view(
      this.viewName,
      this.buildViewModel(request, context, {
        parcels,
        totalArea,
        ...extra,
        ...(errors.length ? { errors } : {})
      })
    )
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
   * @returns {Promise<string[]>}
   */
  async findParcelsWithNoActions(request, selectedParcelIds) {
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
    const ineligible = results.filter((result) => result.actions != null && !result.actions.some(isActionAvailable))
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
        ? 'Select at least one land parcel before you continue.'
        : 'Select a land parcel before you continue.'
      return this.renderSelection(request, context, h, {
        errors: [{ text: errorText, href: '#land-parcels' }]
      })
    }

    const parcelsWithNoActions = await this.findParcelsWithNoActions(request, selectedParcelIds)
    if (parcelsWithNoActions.length > 0) {
      // State is deliberately left untouched: a rejected change must not destroy a
      // previously completed selection and its actions.
      return this.renderSelection(request, context, h, {
        errors: parcelsWithNoActions.map((selectedParcelId) => ({
          html: noEligibleActionsError(selectedParcelId),
          href: '#land-parcels'
        })),
        selectedParcelIds
      })
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

    return this.proceed(request, h, this.getPostRedirect(request, context, selectedParcelIds))
  }

  /**
   * Builds the next-page URL with the selected parcel and return-to-confirm origin.
   * @param {FormRequestPayload} request
   * @param {FormContext} context
   * @param {string[]} selectedParcelIds
   */
  getPostRedirect(request, context, selectedParcelIds) {
    const nextPath = this.getNextPath(context)
    let redirect =
      !this.multiSelect && selectedParcelIds[0] && nextPath
        ? `${nextPath}?parcelId=${encodeURIComponent(selectedParcelIds[0])}`
        : nextPath

    if (redirect && isFromConfirmLandAndActions(request)) {
      redirect = withConfirmLandAndActionsOrigin(redirect)
    }

    return redirect
  }
}

/**
 * @import { FormRequest, FormRequestPayload, FormContext, FormResponseToolkit, FormSubmissionState } from '@defra/forms-engine-plugin/types'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageQuestion as PageDef } from '@defra/forms-model'
 * @import { ActionOption } from '~/src/server/land-grants/types/land-grants.client.d.js'
 * @import { LandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
 */

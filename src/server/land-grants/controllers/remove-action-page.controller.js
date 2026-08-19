import QuestionPageWithParcelCheckController from '~/src/server/common/controllers/question-page-with-parcel-check.controller.js'
import { YarKeys } from '~/src/server/common/constants/session-keys.js'
import {
  findActionInfoFromState,
  deleteParcelFromState,
  deleteActionFromState
} from '~/src/server/land-grants/view-state/land-parcel.view-state.js'
import { formatParcelReference } from '~/src/shared/format-parcel.js'
import { getParcelIdFromQuery } from '../utils/parcel-request.utils.js'

const defaultReturnPath = '/check-selected-land-actions'
const selectActionsForParcelPath = '/select-actions-for-land-parcel'
const selectLandParcelPath = '/select-land-parcel'
const removeParcelPath = '/remove-parcel'
const confirmLandAndActionsPath = '/confirm-land-and-actions'

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

export default class RemoveActionPageController extends QuestionPageWithParcelCheckController {
  viewName = 'remove-action'

  /**
   * @param {FormModel} model
   * @param {import('@defra/forms-model').Page} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    const returnPath = model?.def?.metadata?.pageConfig?.[pageDef?.path]?.returnPath
    this.returnPath = isNonEmptyString(returnPath) ? returnPath.trim() : defaultReturnPath
    this.isParcelRemovalPage = pageDef?.path === removeParcelPath
  }

  /**
   * Direct-only utility page: force the Back link to the configured return
   * destination instead of inheriting a link based on YAML page order.
   *
   * Overrides the engine hook that `getViewModel` calls, so every render path
   * gets the forced link and it is normalised by the same `getHref` the
   * redirect uses - the two cannot disagree.
   * @returns {{ text: string, href: string }}
   */
  getBackLink() {
    return { text: 'Back', href: this.getHref(this.returnPath) }
  }

  resolveParcelIds(request) {
    return getParcelIdFromQuery(request)
  }

  /**
   * Whether this page's configured destination is the "Your land and actions"
   * summary. Compared through `getHref` so a config value that omits its
   * leading slash still matches the path this controller special-cases.
   * @returns {boolean}
   */
  returnsToConfirmLandAndActions() {
    return this.getHref(this.returnPath) === this.getHref(confirmLandAndActionsPath)
  }

  /**
   * Determine next path after action removal
   * @param {object} newState - Updated state after removal
   * @param {string} parcel - Parcel key
   * @param {string} [action] - Action code; omitted when the whole parcel is removed
   * @returns {string} - Next path to navigate to
   */
  getNextPathAfterRemoval(newState, parcel, action) {
    const hasRemainingActions = newState.landParcels?.[parcel]?.actionsObj
    const hasRemainingParcels = Object.keys(newState.landParcels || {}).length > 0

    // remove the only action
    if (!hasRemainingActions && action) {
      return `${selectActionsForParcelPath}?parcelId=${parcel}`
    }

    if (!hasRemainingParcels) {
      return this.returnsToConfirmLandAndActions() ? this.returnPath : selectLandParcelPath
    }

    return this.returnPath
  }

  /**
   * Validate POST request payload. Only `/remove-action` reaches this: the
   * whole-parcel page posts a hidden field, so it has nothing to select.
   * @param {object} payload - Request payload
   * @returns {{errorMessage: string}|null} - Validation error or null if valid
   */
  validatePostPayload(payload) {
    const { remove } = payload

    if (remove === undefined) {
      return { errorMessage: `Select yes to remove this action from this land parcel` }
    }

    return null
  }

  /**
   * Render error view for POST validation
   * @param {object} h - Response toolkit
   * @param {AnyFormRequest} request - Request object
   * @param {FormContext} context - Form context
   * @param {string} errorMessage - Error message to display
   * @param {string} parcelId - Parcel ID
   * @param {object} pageHeadingAndHint - Page header amd hint text
   * @returns {object} - Error view response
   */
  renderPostErrorView(h, request, context, errorMessage, parcelId, pageHeadingAndHint) {
    return h.view(this.viewName, {
      ...this.getViewModel(request, context),
      parcelId,
      ...pageHeadingAndHint,
      errors: errorMessage
    })
  }

  /**
   * Process action or parcel removal
   * @param {AnyFormRequest} request - Request object
   * @param {object} state - Current state
   * @param {object} h - Response toolkit
   * @param {string} parcel - Parcel key
   * @param {string} [action] - Action code; omitted when the whole parcel is removed
   * @returns {Promise<object>} - Response object
   */
  async processRemoval(request, state, h, parcel, action) {
    const newState = action ? deleteActionFromState(state, parcel, action) : deleteParcelFromState(state, parcel)
    const nextPath = this.getNextPathAfterRemoval(newState, parcel, action)

    await this.setState(request, newState)
    this.recordParcelRemovalSuccess(request, parcel)
    return this.proceed(request, h, nextPath)
  }

  /**
   * Leave a one-shot session marker so the confirmation page can announce the
   * removal once. Written only for whole-parcel removal on a journey that
   * returns to `/confirm-land-and-actions`, because that is the only
   * destination which renders the banner; the action-removal destinations
   * would otherwise carry a stale success message.
   * @param {AnyFormRequest} request - Request object
   * @param {string} parcel - Removed parcel key
   */
  recordParcelRemovalSuccess(request, parcel) {
    if (!this.isParcelRemovalPage || !this.returnsToConfirmLandAndActions()) {
      return
    }

    request.yar?.set(YarKeys.LAND_PARCEL_REMOVAL_SUCCESS, formatParcelReference(parcel))
  }

  /**
   * Build view model for GET request
   * @param {AnyFormRequest} request - Request object
   * @param {FormContext} context - Form context
   * @param {string} parcelId - Parcel ID
   * @param {string} pageHeading - Page heading
   * @param {string} hint - Hint text
   * @param {boolean} isParcelRemoval - Whether the page removes the whole parcel
   * @returns {object} - Complete view model
   */
  buildGetViewModel(request, context, parcelId, pageHeading, hint, isParcelRemoval) {
    return {
      ...this.getViewModel(request, context),
      parcelId,
      pageHeading,
      hint,
      isParcelRemoval
    }
  }

  /**
   * Build page heading and hint for the removal confirmation page.
   *
   * @param {{description?: string}|null|undefined} actionInfo - Optional action info object; when present its `description` is used in the heading/hint.
   * @param {string} parcelId ='' - Parcel identifier to include in the heading.
   * @param {boolean} isParcelRemoval =false - Whether the whole parcel is being removed.
   * @returns {{pageHeading: string, hint: string, isParcelRemoval: boolean}} Copy for the confirmation page plus the branch flag the template reads.
   */
  buildPageHeadingAndHint(actionInfo, parcelId = '', isParcelRemoval = false) {
    if (isParcelRemoval) {
      const reference = formatParcelReference(parcelId)
      return {
        pageHeading: `Remove all actions from ${reference}?`,
        hint: `This will remove ${reference} and all actions added to it from your application.`,
        isParcelRemoval: true
      }
    }

    return {
      pageHeading: `Do you want to remove ${actionInfo?.description} from land parcel ${parcelId.replaceAll('-', ' ')}?`,
      hint: `Select yes to remove this action from this land parcel. You can add a different action to the same parcel.`,
      isParcelRemoval: false
    }
  }

  /**
   * Handle GET requests to the page
   */
  async handleGet(request, context, h) {
    const { viewName, isParcelRemovalPage } = this
    const landParcels = context.state?.landParcels
    const { parcelId } = request.query

    if (!parcelId || !landParcels?.[parcelId]) {
      return this.proceed(request, h, this.returnPath)
    }

    const actionInfo = isParcelRemovalPage
      ? undefined
      : findActionInfoFromState(landParcels, parcelId, request.query.action)
    if (!isParcelRemovalPage && !actionInfo) {
      return this.proceed(request, h, this.returnPath)
    }

    const { pageHeading, hint, isParcelRemoval } = this.buildPageHeadingAndHint(
      actionInfo,
      parcelId,
      isParcelRemovalPage
    )

    const viewModel = this.buildGetViewModel(request, context, parcelId, pageHeading, hint, isParcelRemoval)
    return h.view(viewName, viewModel)
  }

  /**
   * Handle POST requests to the page
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
   * @returns {Promise<ResponseObject>}
   */
  async handlePost(request, context, h) {
    const { state } = context
    const payload = /** @type {{ remove?: string }} */ (request.payload ?? {})
    const { action, parcelId } = /** @type {{ action: string, parcelId: string }} */ (request.query)

    if (this.isParcelRemovalPage) {
      return payload.remove === 'true'
        ? this.processRemoval(request, state, h, parcelId, undefined)
        : this.proceed(request, h, this.returnPath)
    }

    const actionInfo = findActionInfoFromState(state.landParcels, parcelId, action)
    if (!actionInfo) {
      return this.proceed(request, h, this.returnPath)
    }

    const validationError = this.validatePostPayload(payload)
    if (validationError) {
      const pageHeadingAndHint = this.buildPageHeadingAndHint(actionInfo, parcelId, false)
      return this.renderPostErrorView(h, request, context, validationError.errorMessage, parcelId, pageHeadingAndHint)
    }

    if (payload.remove === 'true') {
      return this.processRemoval(request, state, h, parcelId, action)
    }

    return this.proceed(request, h, this.returnPath)
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */

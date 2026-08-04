import { validateApplication } from '~/src/server/land-grants/services/land-grants.service.js'
import QuestionPageWithParcelCheckController from '~/src/server/common/controllers/question-page-with-parcel-check.controller.js'
import { parseLandParcel } from '~/src/shared/format-parcel.js'
import { log, error, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import {
  getAddedActionsForStateParcel,
  getAddedActionsFromPayload
} from '~/src/server/land-grants/view-state/land-parcel.view-state.js'
import { getParcelIdFromQuery } from '../utils/parcel-request.utils.js'
import { getLandGrantsUserContext } from '../services/land-grants-user-context.js'

/** fallback path when no predecessor page is found. */
const SELECT_LAND_PARCEL_PATH = '/select-land-parcel'

/**
 * Shared GET/POST flow for the grouped-radio and flat-checkbox select-actions pages.
 * Subclasses provide the parts that differ between the two payload/view shapes:
 * `validateUserInput`, `getViewModelWithActions`, `buildValidationErrors` and
 * `writeActionsToState`.
 */
export default class SelectActionsBasePageController extends QuestionPageWithParcelCheckController {
  enabledLandActions = []

  /** @type {boolean} */
  singleParcelSubmission = false

  /**
   * Service function fetchActions calls to get the parcel's actions. Every
   * subclass must set its own - there is no shared default.
   * @type {(parcel: { parcelId?: string, sheetId?: string, enabledLandActions?: string[], plannedActions?: PlannedAction[] }, userContext: LandGrantsUserContext) => Promise<{actions: ActionGroup[] | ActionOption[], parcel: {parcelId: string, sheetId: string, size: Size}}>}
   */
  fetchActionsService = () => {
    throw new Error(`${this.constructor.name} must set fetchActionsService`)
  }

  /**
   * @param {FormModel} model
   * @param {PageQuestion} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    const { enabledLandActions, singleParcelSubmission } = model.def.metadata ?? {}
    this.enabledLandActions = Array.isArray(enabledLandActions) ? enabledLandActions : []
    this.singleParcelSubmission = singleParcelSubmission === true
  }

  resolveParcelIds(request) {
    return getParcelIdFromQuery(request)
  }

  /**
   * The bare path of the page before this one in the journey's page order.
   * @returns {string}
   */
  getPreviousPagePath() {
    const { pages } = this.model
    return pages[pages.indexOf(this) - 1]?.path ?? SELECT_LAND_PARCEL_PATH
  }

  /**
   * Resolve parcel identifiers from query param
   * @param {AnyFormRequest} request
   * @returns {{ selectedLandParcel: string, sheetId: string, parcelId: string }}
   */
  resolveParcelContext(request) {
    const selectedLandParcel = request?.query?.parcelId ?? ''
    const [sheetId = '', parcelId = ''] = parseLandParcel(selectedLandParcel)
    return { selectedLandParcel, sheetId, parcelId }
  }

  /**
   * Build the view model for the page with actions. Overridden per page since the
   * grouped page renders `groupedActions` and the flat page renders `actionItems`.
   * @param {AnyFormRequest} _request
   * @param {FormContext} _context
   * @param {Array} _groupedActions
   * @param {Array} _addedActions
   * @param {Record<string, string>} [_quantityErrorsByCode]
   * @param {boolean} [_hasErrors] - Whether this page load is redisplaying a rejected submission
   * @param {{ sheetId?: string, parcelId?: string, size?: Size }} [_parcel] - Identifiers and area for the
   *   "Selected land parcel" summary
   * @returns {object}
   */
  getViewModelWithActions(
    _request,
    _context,
    _groupedActions,
    _addedActions,
    _quantityErrorsByCode,
    _hasErrors,
    _parcel
  ) {
    throw new Error(`${this.constructor.name} must implement getViewModelWithActions()`)
  }

  /**
   * Validate the user input submitted from the page
   * @param {object} _payload
   * @returns {object}
   */
  validateUserInput(_payload) {
    throw new Error(`${this.constructor.name} must implement validateUserInput()`)
  }

  /**
   * Validate submitted quantities against the fetched action metadata. No-op
   * by default; only the flat-checkbox page overrides it.
   * @param {object} _payload
   * @param {Array} _actions
   * @returns {Array<{ text: string, href?: string }>}
   */
  validateActionQuantities(_payload, _actions) {
    return []
  }

  /**
   * Recompute action availability against this submission's quantity claims,
   * before writing to state. No-op by default; only the flat-checkbox page
   * overrides it.
   * @param {AnyFormRequest} _request
   * @param {{ selectedLandParcel: string, sheetId: string, parcelId: string }} _parcel
   * @param {object} _payload
   * @param {Array} actions
   * @returns {Promise<Array>}
   */
  async recomputeActionsForState(_request, _parcel, _payload, actions) {
    return actions
  }

  /**
   * Actions to show as added when re-rendering after a validateApplication
   * failure. Defaults to what's in state; only the flat-checkbox page
   * overrides it to read from payload instead (see getAddedActionsFromPayload).
   * @param {object} _payload
   * @param {Array} _actions
   * @param {object} state
   * @param {string} selectedLandParcel
   * @returns {Array<{ code: string, description: string, value?: string|number }>}
   */
  getAddedActionsForValidationError(_payload, _actions, state, selectedLandParcel) {
    return getAddedActionsForStateParcel(state, selectedLandParcel)
  }

  /**
   * Persist the submitted action selections (and any per-action overrides) into state.
   * @param {object} _prevState
   * @param {object} _payload
   * @param {Array} _actions
   * @param {object} _fetchedParcel
   * @returns {object}
   */
  writeActionsToState(_prevState, _payload, _actions, _fetchedParcel) {
    throw new Error(`${this.constructor.name} must implement writeActionsToState()`)
  }

  /**
   * Map failed application-validation messages to error-summary entries.
   * @param {object} _payload
   * @param {Array} _failedMessages
   * @returns {Array<{ text: string, href?: string }>}
   */
  buildValidationErrors(_payload, _failedMessages) {
    throw new Error(`${this.constructor.name} must implement buildValidationErrors()`)
  }

  /**
   * Codes to log when application validation throws. Overridden per page since the
   * grouped and flat pages read selections from the payload differently.
   * @param {object} _payload
   * @returns {Array<string>}
   */
  extractSelectedActionCodes(_payload) {
    throw new Error(`${this.constructor.name} must implement extractSelectedActionCodes()`)
  }

  /**
   * Render error view
   */
  renderErrorView(h, request, context, options) {
    const {
      errors,
      selectedLandParcel,
      actions = [],
      addedActions = [],
      additionalState,
      existingLandParcels = {},
      quantityErrorsByCode = {},
      size
    } = options
    const [sheetId = '', parcelId = ''] = parseLandParcel(selectedLandParcel)
    return h.view(this.viewName, {
      ...this.getViewModelWithActions(
        request,
        context,
        actions,
        addedActions,
        quantityErrorsByCode,
        errors.length > 0,
        { sheetId, parcelId, size }
      ),
      ...additionalState,
      parcelName: `${sheetId} ${parcelId}`,
      errors,
      existingLandParcels,
      singleParcelSubmission: this.singleParcelSubmission,
      pageTitle: `Select actions for land parcel ${sheetId} ${parcelId}`
    })
  }

  /**
   * Fetch actions with error handling.
   * @param {AnyFormRequest} request
   * @param {string} sheetId
   * @param {string} parcelId
   * @param {PlannedAction[]} [plannedActions] - When given, recomputes each
   *   action's availableArea against this combination.
   */
  async fetchActions(request, sheetId, parcelId, plannedActions = []) {
    try {
      const userContext = getLandGrantsUserContext(request)
      return await this.fetchActionsService(
        {
          parcelId,
          sheetId,
          enabledLandActions: this.enabledLandActions,
          plannedActions
        },
        userContext
      )
    } catch (err) {
      const { sbi } = request.auth.credentials
      const { message: errorMessage, status: statusCode } = /** @type {Error & {status?: number}} */ (err)
      error(LogCodes.LAND_GRANTS.FETCH_ACTIONS_ERROR, { sbi, sheetId, parcelId, errorMessage, statusCode }, request)
      return null
    }
  }

  /**
   * Fetch and prepare actions data for display
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {{ selectedLandParcel: string, sheetId: string, parcelId: string }} parcel
   */
  async fetchAndPrepareActions(request, context, parcel) {
    const { selectedLandParcel, sheetId, parcelId } = parcel
    const result = await this.fetchActions(request, sheetId, parcelId)
    const groupedActions = result?.actions || []
    const addedActions = getAddedActionsForStateParcel(context.state, selectedLandParcel)

    return { result, groupedActions, addedActions }
  }

  /**
   * Render success view with actions
   */
  renderSuccessView(h, request, context, groupedActions, addedActions, sheetId, parcelId, size) {
    const { state } = context

    if (!groupedActions.length) {
      log(LogCodes.LAND_GRANTS.NO_ACTIONS_FOUND, { sheetId, parcelId }, request)
    }

    return h.view(this.viewName, {
      ...this.getViewModelWithActions(request, context, groupedActions, addedActions, {}, false, {
        sheetId,
        parcelId,
        size
      }),
      ...state,
      parcelName: `${sheetId} ${parcelId}`,
      existingLandParcels: Object.keys(state.landParcels || {}).length > 0,
      singleParcelSubmission: this.singleParcelSubmission,
      errors: [],
      pageTitle: `Select actions for land parcel ${sheetId} ${parcelId}`
    })
  }

  /**
   * Handle GET requests to the page
   */
  async handleGet(request, context, h) {
    const parcel = this.resolveParcelContext(request)
    if (!parcel.selectedLandParcel) {
      return this.proceed(request, h, this.getPreviousPagePath())
    }

    const { result, groupedActions, addedActions } = await this.fetchAndPrepareActions(request, context, parcel)

    if (!result) {
      return this.renderErrorView(h, request, context, {
        errors: [
          {
            text: 'Unable to find actions information for parcel, please try again later or contact the Rural Payments Agency.'
          }
        ],
        selectedLandParcel: parcel.selectedLandParcel,
        actions: [],
        addedActions: []
      })
    }

    return this.renderSuccessView(
      h,
      request,
      context,
      groupedActions,
      addedActions,
      parcel.sheetId,
      parcel.parcelId,
      result.parcel?.size
    )
  }

  /**
   * Handle validation errors by rendering error view with actions
   * @param {object} h - Hapi response toolkit
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {object} options
   * @param {Array} options.errors
   * @param {{ selectedLandParcel: string, sheetId: string, parcelId: string }} options.parcel
   * @param {object} options.prevState
   * @param {object} [options.payload] - When given, re-renders with what was just
   *   submitted instead of prevState, so an invalid quantity stays visible to correct.
   */
  async handleValidationErrors(h, request, context, { errors, parcel, prevState, payload }) {
    const { selectedLandParcel, sheetId, parcelId } = parcel
    const result = await this.fetchActions(request, sheetId, parcelId)
    // Unwraps both ActionGroup[] (grouped page) and Action[] (flat page) into a flat list.
    const flatActions = (result?.actions || []).flatMap((a) => a.actions || [a])
    const prevAddedActions = getAddedActionsForStateParcel(prevState, selectedLandParcel)
    const addedActions = payload ? getAddedActionsFromPayload(payload, flatActions, prevAddedActions) : prevAddedActions
    const quantityErrorsByCode = Object.fromEntries(errors.filter((e) => e.code).map((e) => [e.code, e.text]))
    return this.renderErrorView(h, request, context, {
      errors,
      selectedLandParcel,
      actions: result?.actions || [],
      addedActions,
      additionalState: prevState,
      existingLandParcels: Object.keys(prevState.landParcels || {}).length > 0,
      quantityErrorsByCode,
      size: result?.parcel?.size
    })
  }

  /**
   * Handle application validation when action is 'validate'
   * @param {object} h - Hapi response toolkit
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {object} options
   * @param {object} options.payload
   * @param {Array} options.actions
   * @param {{ selectedLandParcel: string, sheetId: string, parcelId: string }} options.parcel
   * @param {object} options.state
   */
  async handleApplicationValidation(h, request, context, { payload, actions, parcel, state, size }) {
    const { selectedLandParcel, sheetId, parcelId } = parcel
    const { referenceNumber } = context
    const { sbi, crn } = request.auth.credentials

    try {
      const userContext = getLandGrantsUserContext(request)
      const validationResult = await validateApplication(
        {
          applicationId: /** @type {string} */ (referenceNumber),
          crn: /** @type {string} */ (crn),
          state
        },
        userContext
      )
      const { valid, errorMessages = [] } = validationResult

      if (!valid) {
        const failedMessages = errorMessages.filter((e) => !e.passed)
        const validationErrors = this.buildValidationErrors(payload, failedMessages)
        const quantityErrorsByCode = Object.fromEntries(
          failedMessages.filter((e) => e.code).map((e) => [e.code, e.description])
        )

        const addedActions = this.getAddedActionsForValidationError(payload, actions, state, selectedLandParcel)
        return this.renderErrorView(h, request, context, {
          errors: validationErrors,
          selectedLandParcel,
          actions,
          addedActions,
          additionalState: state,
          quantityErrorsByCode,
          size
        })
      }
    } catch (e) {
      const { message: errorMessage, status: statusCode } = /** @type {Error & {status?: number}} */ (e)
      const selectedActions = this.extractSelectedActionCodes(payload)
      error(
        LogCodes.LAND_GRANTS.VALIDATE_APPLICATION_ERROR,
        { sbi, parcelId, sheetId, errorMessage, statusCode, selectedActions },
        request
      )
      const addedActions = this.getAddedActionsForValidationError(payload, actions, state, selectedLandParcel)
      return this.renderErrorView(h, request, context, {
        errors: [
          {
            text: 'There has been an issue validating the application, please try again later or contact the Rural Payments Agency.',
            href: ''
          }
        ],
        selectedLandParcel,
        actions,
        addedActions,
        additionalState: state,
        size
      })
    }
    return null
  }

  /**
   * Handle POST requests to the select actions page
   */
  async handlePost(request, context, h) {
    const { state: prevState } = context
    const payload = request.payload ?? {}
    const parcel = this.resolveParcelContext(request)

    const errors = this.validateUserInput(payload)
    if (errors.length > 0) {
      return this.handleValidationErrors(h, request, context, { errors, parcel, prevState })
    }

    const result = await this.fetchActions(request, parcel.sheetId, parcel.parcelId)
    if (!result?.actions?.length) {
      return this.renderErrorView(h, request, context, {
        errors: [
          {
            text: 'Unable to find actions information for parcel, please try again later or contact the Rural Payments Agency.'
          }
        ],
        selectedLandParcel: parcel.selectedLandParcel,
        actions: [],
        addedActions: [],
        additionalState: context.state
      })
    }

    const { actions, parcel: fetchedParcel } = result

    const quantityErrors = this.validateActionQuantities(payload, actions)
    if (quantityErrors.length > 0) {
      return this.handleValidationErrors(h, request, context, { errors: quantityErrors, parcel, prevState, payload })
    }

    const recomputedActions = await this.recomputeActionsForState(request, parcel, payload, actions)
    const state = this.writeActionsToState(prevState, payload, recomputedActions, fetchedParcel)

    if (payload.action === 'validate') {
      const validationResult = await this.handleApplicationValidation(h, request, context, {
        payload,
        actions: recomputedActions,
        parcel,
        state,
        size: fetchedParcel.size
      })
      if (validationResult) {
        return validationResult
      }
    }

    await this.setState(request, state)
    return this.proceed(request, h, this.getNextPath(context))
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageQuestion } from '@defra/forms-model'
 * @import { PlannedAction, ActionGroup, ActionOption, Size } from '~/src/server/land-grants/types/land-grants.client.d.js'
 * @import { LandGrantsUserContext } from '../services/land-grants-user-context.js'
 */

import {
  fetchAvailableActionsForParcel,
  validateApplication
} from '~/src/server/land-grants/services/land-grants.service.js'
import QuestionPageWithParcelCheckController from '~/src/server/common/controllers/question-page-with-parcel-check.controller.js'
import { parseLandParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { log, error, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { getAddedActionsForStateParcel } from '~/src/server/land-grants/view-state/land-parcel.view-state.js'
import { getParcelIdFromQuery } from '../utils/parcel-request.utils.js'
import { getLandGrantsUserContext } from '../services/land-grants-user-context.js'

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
   * @returns {object}
   */
  getViewModelWithActions(_request, _context, _groupedActions, _addedActions, _quantityErrorsByCode) {
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
      quantityErrorsByCode = {}
    } = options
    const [sheetId = '', parcelId = ''] = parseLandParcel(selectedLandParcel)
    return h.view(this.viewName, {
      ...this.getViewModelWithActions(request, context, actions, addedActions, quantityErrorsByCode),
      ...additionalState,
      parcelName: `${sheetId} ${parcelId}`,
      errors,
      existingLandParcels,
      singleParcelSubmission: this.singleParcelSubmission,
      pageTitle: `Select actions for land parcel ${sheetId} ${parcelId}`
    })
  }

  /**
   * Fetch actions with error handling
   */
  async fetchActions(request, sheetId, parcelId) {
    try {
      const userContext = getLandGrantsUserContext(request)
      return await fetchAvailableActionsForParcel(
        { parcelId, sheetId, enabledLandActions: this.enabledLandActions },
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
  renderSuccessView(h, request, context, groupedActions, addedActions, sheetId, parcelId) {
    const { state } = context

    if (!groupedActions.length) {
      log(LogCodes.LAND_GRANTS.NO_ACTIONS_FOUND, { sheetId, parcelId }, request)
    }

    return h.view(this.viewName, {
      ...this.getViewModelWithActions(request, context, groupedActions, addedActions),
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
      return this.proceed(request, h, '/select-land-parcel')
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

    return this.renderSuccessView(h, request, context, groupedActions, addedActions, parcel.sheetId, parcel.parcelId)
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
   */
  async handleValidationErrors(h, request, context, { errors, parcel, prevState }) {
    const { selectedLandParcel, sheetId, parcelId } = parcel
    const result = await this.fetchActions(request, sheetId, parcelId)
    const addedActions = getAddedActionsForStateParcel(prevState, selectedLandParcel)
    return this.renderErrorView(h, request, context, {
      errors,
      selectedLandParcel,
      actions: result?.actions || [],
      addedActions,
      additionalState: prevState,
      existingLandParcels: Object.keys(prevState.landParcels || {}).length > 0
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
  async handleApplicationValidation(h, request, context, { payload, actions, parcel, state }) {
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

        // state, not prevState, so submitted selections/quantities survive the reload
        const addedActions = getAddedActionsForStateParcel(state, selectedLandParcel)
        return this.renderErrorView(h, request, context, {
          errors: validationErrors,
          selectedLandParcel,
          actions,
          addedActions,
          additionalState: state,
          quantityErrorsByCode
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
      const addedActions = getAddedActionsForStateParcel(state, selectedLandParcel)
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
        additionalState: state
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
    const state = this.writeActionsToState(prevState, payload, actions, fetchedParcel)

    if (payload.action === 'validate') {
      const validationResult = await this.handleApplicationValidation(h, request, context, {
        payload,
        actions,
        parcel,
        state
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
 */

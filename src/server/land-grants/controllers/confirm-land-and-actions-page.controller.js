import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { error, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'
import { getLandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
import { calculateLandActionsPayment } from '~/src/server/land-grants/services/land-grants.service.js'
import { buildConfirmLandAndActionsViewModel } from '~/src/server/land-grants/view-models/confirm-land-and-actions.view-model.js'
import { withTaskContext } from '~/src/server/task-list/task-list.helper.js'
import { logUpstreamError } from '~/src/server/common/helpers/logging/upstream-error.js'
import { YarKeys } from '~/src/server/common/constants/session-keys.js'

const CALCULATION_ERROR_MESSAGE =
  'Unable to get payment information, please try again later or contact the Rural Payments Agency.'

// Canonical forms-engine FormAction value (`add-another`). The generic POST
// route validates `action` against the engine's actionSchema, which only
// permits FormAction values or an `external-*` pattern, so a bespoke value is
// rejected with a 400 before reaching this controller.
const ADD_ANOTHER_ACTION = 'add-another'

const LAND_GRANTS_ENDPOINT = 'Land grants API'
const LAND_GRANTS_SERVICE = 'land-grants'

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * Resolves and validates the redirect config for this page.
 * @param {{ redirects?: { next?: string, addAnotherLandParcel?: string } }} config
 * @param {string} path
 * @returns {{ nextPath: string, addAnotherLandParcelPath: string }}
 */
function resolveConfig(config, path) {
  const redirects = config?.redirects ?? {}

  if (!isNonEmptyString(redirects.next)) {
    throw new SystemError({
      message: `"redirects.next" is required in config for page "${path}"`,
      source: 'ConfirmLandAndActionsPageController',
      reason: 'invalid_config'
    })
  }

  if (!isNonEmptyString(redirects.addAnotherLandParcel)) {
    throw new SystemError({
      message: `"redirects.addAnotherLandParcel" is required in config for page "${path}"`,
      source: 'ConfirmLandAndActionsPageController',
      reason: 'invalid_config'
    })
  }

  return {
    nextPath: /** @type {string} */ (redirects.next),
    addAnotherLandParcelPath: /** @type {string} */ (redirects.addAnotherLandParcel)
  }
}

/**
 * Consumes the one-shot land-parcel removal marker written by
 * `RemoveActionPageController`.
 *
 * The marker is cleared on the first read, so a refresh or a later direct GET
 * of this page does not repeat the notification. A stored value that is not a
 * usable reference is consumed without rendering anything.
 *
 * @param {FormRequest} request
 * @returns {string | undefined} The success message, or undefined when there is nothing to announce.
 */
export function consumeLandParcelRemovalSuccess(request) {
  const reference = request.yar?.get(YarKeys.LAND_PARCEL_REMOVAL_SUCCESS)
  if (!reference) {
    return undefined
  }

  request.yar.clear(YarKeys.LAND_PARCEL_REMOVAL_SUCCESS)

  return isNonEmptyString(reference)
    ? `${/** @type {string} */ (reference).trim()} and its actions have been removed.`
    : undefined
}

/**
 * Generic controller for the "Your land and actions" payment-summary page.
 *
 * Sends every selected parcel/action to the Land Grants payment API in one
 * request and renders the API-calculated action, parcel-grouped, and
 * application totals. It performs no rate lookup, quantity multiplication,
 * rounding, or total calculation, and is independent of the Farm Payments
 * `PaymentPageController`.
 *
 * @extends QuestionPageController
 */
export default class ConfirmLandAndActionsPageController extends withTaskContext(QuestionPageController) {
  viewName = 'confirm-land-and-actions'

  /**
   * @param {FormModel} model
   * @param {import('@defra/forms-model').Page} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    const config = model?.def?.metadata?.pageConfig?.[pageDef?.path] ?? {}
    const { nextPath, addAnotherLandParcelPath } = resolveConfig(config, pageDef?.path)

    this.nextPath = nextPath
    this.addAnotherLandParcelPath = addAnotherLandParcelPath
  }

  makeGetRouteHandler() {
    /**
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {FormResponseToolkit} h
     */
    return async (request, context, h) => {
      const { viewName } = this
      const { state } = context
      const landParcelRemovalSuccessMessage = consumeLandParcelRemovalSuccess(request)

      if (!Object.keys(/** @type {Record<string, unknown>} */ (state.landParcels ?? {})).length) {
        return this.renderNoLandParcels(request, context, h, landParcelRemovalSuccessMessage)
      }

      try {
        const userContext = getLandGrantsUserContext(request)
        const { payment, paymentTotal } = await calculateLandActionsPayment(state, userContext)
        const confirmModel = buildConfirmLandAndActionsViewModel(
          payment,
          /** @type {import('~/src/server/land-grants/types/form-state.d.js').LandParcels} */ (
            /** @type {unknown} */ (state.landParcels)
          )
        )

        await this.setState(
          request,
          /** @type {import('@defra/forms-engine-plugin/types').FormSubmissionState} */ (
            /** @type {unknown} */ ({
              ...state,
              payment,
              totalPence: payment.annualTotalPence,
              totalPayment: paymentTotal
            })
          )
        )

        return h.view(viewName, {
          ...this.getViewModel(request, context),
          ...confirmModel,
          hasCalculationError: false,
          landParcelRemovalSuccessMessage
        })
      } catch (err) {
        this.logCalculationFailure(err, request)

        const { payment, totalPence, totalPayment, ...clearedState } = state
        await this.setState(
          request,
          /** @type {import('@defra/forms-engine-plugin/types').FormSubmissionState} */ (
            /** @type {unknown} */ (clearedState)
          )
        )

        return h.view(viewName, {
          ...this.getViewModel(request, context),
          hasCalculationError: true,
          errors: [{ text: CALCULATION_ERROR_MESSAGE }],
          landParcelRemovalSuccessMessage,
          retryHref: this.getHref(this.path),
          selectLandParcelHref: this.getHref(this.addAnotherLandParcelPath)
        })
      }
    }
  }

  /**
   * Renders the empty state reached by removing the last land parcel: the
   * summary has nothing to show, so it offers the parcel picker instead of the
   * payment tables and the submit control.
   *
   * Any payment carried over from the previous selection is dropped from state,
   * because Check answers and the GAS mapper read it and it now prices parcels
   * that are no longer in the application.
   * @param {FormRequest} request
   * @param {FormContext} context
   * @param {FormResponseToolkit} h
   * @param {string | undefined} landParcelRemovalSuccessMessage
   */
  async renderNoLandParcels(request, context, h, landParcelRemovalSuccessMessage) {
    const { payment, totalPence, totalPayment, ...clearedState } = context.state
    await this.setState(
      request,
      /** @type {import('@defra/forms-engine-plugin/types').FormSubmissionState} */ (
        /** @type {unknown} */ (clearedState)
      )
    )

    return h.view(this.viewName, {
      ...this.getViewModel(request, context),
      hasCalculationError: false,
      hasNoLandParcels: true,
      landParcelRemovalSuccessMessage,
      selectLandParcelHref: this.getHref(this.addAnotherLandParcelPath)
    })
  }

  /**
   * Distinguishes a malformed payment response from a genuine upstream failure:
   * reporting a response we could not render as an API outage sends responders
   * to the wrong service. Both branches carry the SBI so an alert can be tied
   * to a business, and the stack, which neither log code carries on its own.
   * @param {unknown} err
   * @param {FormRequest} request
   */
  logCalculationFailure(err, request) {
    const sbi = /** @type {{ auth?: { credentials?: { sbi?: string } } }} */ (request).auth?.credentials?.sbi
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)

    if (err instanceof SystemError && err.details?.reason === 'invalid_payment_response') {
      error(
        LogCodes.SYSTEM.SERVER_ERROR,
        { errorMessage: `invalid payment response building land and actions summary for sbi ${sbi} - ${detail}` },
        request
      )
      return
    }

    logUpstreamError(
      {
        endpoint: LAND_GRANTS_ENDPOINT,
        service: LAND_GRANTS_SERVICE,
        upstreamStatus: /** @type {{ output?: { statusCode?: number } }} */ (err)?.output?.statusCode,
        errorMessage: `error building land and actions payment summary for sbi ${sbi} - ${detail}`
      },
      request
    )
  }

  makePostRouteHandler() {
    /**
     * @param {FormRequestPayload} request
     * @param {FormContext} context
     * @param {FormResponseToolkit} h
     */
    return async (request, context, h) => {
      if (!context.state?.payment) {
        return h.redirect(this.getHref(this.path))
      }

      const payload = /** @type {{ action?: string }} */ (request.payload ?? {})

      if (payload.action === ADD_ANOTHER_ACTION) {
        return h.redirect(this.getHref(this.addAnotherLandParcelPath))
      }

      return this.proceed(request, h, this.nextPath)
    }
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { FormContext, FormRequest, FormRequestPayload, FormResponseToolkit } from '@defra/forms-engine-plugin/types'
 */

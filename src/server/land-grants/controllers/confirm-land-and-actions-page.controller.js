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

// Owned by this page rather than the form definition, so the H1 and the browser
// title always match the design regardless of the journey's page name. The
// design uses the softer title only when a removal just emptied the
// application; arriving with nothing added yet still reviews what is there.
const PAGE_TITLE = 'Review land parcels and actions'
const AFTER_REMOVAL_PAGE_TITLE = 'Your land and actions'

// Must be one of the engine's FormAction values: the generic POST route
// validates `action` against the engine's actionSchema and rejects anything
// else with a 400 before this controller runs.
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
 * @returns {{ nextPath: string | undefined, addAnotherLandParcelPath: string }}
 */
function resolveConfig(config, path) {
  const redirects = config?.redirects ?? {}

  if (!isNonEmptyString(redirects.addAnotherLandParcel)) {
    throw new SystemError({
      message: `"redirects.addAnotherLandParcel" is required in config for page "${path}"`,
      source: 'ConfirmLandAndActionsPageController',
      reason: 'invalid_config'
    })
  }

  return {
    nextPath: isNonEmptyString(redirects.next) ? /** @type {string} */ (redirects.next) : undefined,
    addAnotherLandParcelPath: /** @type {string} */ (redirects.addAnotherLandParcel)
  }
}

/**
 * Reads the land-parcel removal marker set by `RemoveActionPageController` and
 * clears it, so a refresh or a later GET of this page does not show the
 * notification again. A stored value that is not a usable reference is cleared
 * without producing a message.
 *
 * @param {FormRequest} request
 * @returns {string | undefined} The success message, or undefined when there is no marker.
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
 * Controller for the "Your land and actions" payment summary page.
 *
 * Sends the selected parcels and actions to the Land Grants payment API in one
 * request and renders the action, parcel and application totals the API
 * returns. It does not look up rates or work out any totals itself.
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
          pageTitle: PAGE_TITLE,
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
          pageTitle: PAGE_TITLE,
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
   * Renders the page with no parcels left, reached by removing the last one.
   * There is nothing to price, so it shows the parcel picker instead of the
   * payment tables and the submit button.
   *
   * Also drops any payment left over from the previous selection, because Check
   * answers and the GAS mapper read it and it prices parcels that are no longer
   * in the application.
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
      pageTitle: landParcelRemovalSuccessMessage ? AFTER_REMOVAL_PAGE_TITLE : PAGE_TITLE,
      hasCalculationError: false,
      hasNoLandParcels: true,
      landParcelRemovalSuccessMessage,
      selectLandParcelHref: this.getHref(this.addAnotherLandParcelPath)
    })
  }

  /**
   * Logs a malformed payment response as a server error and everything else as
   * an upstream failure, so a response we could not render is not reported as a
   * Land Grants outage. Both branches include the SBI, which ties an alert to a
   * business, and the stack, which neither log code carries on its own.
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

      return this.proceed(request, h, this.nextPath ?? this.getNextPath(context))
    }
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { FormContext, FormRequest, FormRequestPayload, FormResponseToolkit } from '@defra/forms-engine-plugin/types'
 */

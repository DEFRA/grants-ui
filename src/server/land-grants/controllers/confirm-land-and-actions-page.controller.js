import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { error, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'
import { getLandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
import { calculateLandActionsPayment } from '~/src/server/land-grants/services/land-grants.service.js'
import { buildConfirmLandAndActionsViewModel } from '~/src/server/land-grants/view-models/confirm-land-and-actions.view-model.js'
import { withTaskContext } from '~/src/server/task-list/task-list.helper.js'

const CALCULATION_ERROR_MESSAGE =
  'Unable to get payment information, please try again later or contact the Rural Payments Agency.'

// Canonical forms-engine FormAction value (`add-another`). The generic POST
// route validates `action` against the engine's actionSchema, which only
// permits FormAction values or an `external-*` pattern, so a bespoke value is
// rejected with a 400 before reaching this controller.
const ADD_ANOTHER_ACTION = 'add-another'

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

    if (pageDef.section) {
      this.section = model.getSection(pageDef.section)
    }
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

      try {
        const userContext = getLandGrantsUserContext(request)
        const { payment, paymentTotal } = await calculateLandActionsPayment(state, userContext)
        const confirmModel = buildConfirmLandAndActionsViewModel(
          payment,
          paymentTotal,
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
          hasCalculationError: false
        })
      } catch (err) {
        error(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          {
            endpoint: `Land grants API`,
            errorMessage: `error building land and actions payment summary - ${/** @type {Error} */ (err).message}`
          },
          request
        )

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
          errors: [{ text: CALCULATION_ERROR_MESSAGE }]
        })
      }
    }
  }

  makePostRouteHandler() {
    /**
     * @param {FormRequestPayload} request
     * @param {FormContext} _context
     * @param {FormResponseToolkit} h
     */
    return async (request, _context, h) => {
      const payload = /** @type {{ action?: string }} */ (request.payload ?? {})
      const nextPath = payload.action === ADD_ANOTHER_ACTION ? this.addAnotherLandParcelPath : this.nextPath
      return this.proceed(request, h, nextPath)
    }
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { FormContext, FormRequest, FormRequestPayload, FormResponseToolkit } from '@defra/forms-engine-plugin/types'
 */

import TaskPageController from '~/src/server/task-list/task-page.controller.js'
import { validateWoodlandHectares } from '~/src/server/woodland/woodland.service.js'
import { debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * @import { AnyFormRequest, FormContext, FormSubmissionError } from '@defra/forms-engine-plugin/types'
 */

const MIN_WOODLAND_TOTAL_AREA_HA = 0.5
const HECTARES_OVER_TEN_FIELD_NAME = 'hectaresTenOrOverYearsOld'
const HECTARES_UNDER_TEN_FIELD_NAME = 'hectaresUnderTenYearsOld'

/**
 * @param {string} fieldName
 * @param {string} text
 * @returns {FormSubmissionError}
 */
const makeError = (fieldName, text) =>
  /** @type {FormSubmissionError} */ ({ path: [fieldName], href: `#${fieldName}`, name: fieldName, text })

export default class WoodlandHectaresPageController extends TaskPageController {
  /**
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   */
  getViewModel(request, context) {
    const { state } = context
    return {
      ...super.getViewModel(request, context),
      totalHectaresAppliedFor: state['totalHectaresAppliedFor']
    }
  }

  /**
   * Validates the hectare inputs against frontend rules.
   * Returns an array of errors, or null if non-numeric input should defer to the engine.
   * @param {string} overTenRaw
   * @param {string} underTenRaw
   * @param {number} totalHectaresAppliedFor
   * @returns {Array<object> | null}
   */
  validatePayload(overTenRaw, underTenRaw, totalHectaresAppliedFor) {
    if ((overTenRaw && Number.isNaN(Number(overTenRaw))) || (underTenRaw && Number.isNaN(Number(underTenRaw)))) {
      return null
    }

    const emptyErrors = [
      ...(overTenRaw
        ? []
        : [makeError(HECTARES_OVER_TEN_FIELD_NAME, 'Enter the total area of woodland over 10 years old')]),
      ...(underTenRaw
        ? []
        : [
            makeError(
              HECTARES_UNDER_TEN_FIELD_NAME,
              'Enter the total area of newly planted woodland under 10 years old'
            )
          ])
    ]
    if (emptyErrors.length) {
      return emptyErrors
    }

    const overTen = Number(overTenRaw)
    const underTen = Number(underTenRaw)

    if (overTen + underTen < MIN_WOODLAND_TOTAL_AREA_HA) {
      return [makeError(HECTARES_UNDER_TEN_FIELD_NAME, 'The total area of woodland must be larger than 0.5 ha')]
    }
    if (overTen > totalHectaresAppliedFor) {
      return [
        makeError(
          HECTARES_OVER_TEN_FIELD_NAME,
          `Area of woodland over 10 years old must not be more than the total area of land parcels. You have ${totalHectaresAppliedFor} ha available`
        )
      ]
    }
    if (overTen + underTen > totalHectaresAppliedFor) {
      return [
        makeError(
          HECTARES_UNDER_TEN_FIELD_NAME,
          `Combined area of woodland over 10 years old and under 10 years old must not be more than the total area of land parcels. You have ${totalHectaresAppliedFor - overTen} ha remaining`
        )
      ]
    }

    return []
  }

  /**
   * Calls the backend validate endpoint and maps any failed rules to errors.
   * @param {AnyFormRequest} request
   * @param {string[]} parcelIds
   * @param {number} oldWoodlandAreaHa
   * @param {number} newWoodlandAreaHa
   * @returns {Promise<Array<object>>}
   */
  async validateApplication(request, parcelIds, oldWoodlandAreaHa, newWoodlandAreaHa) {
    try {
      const errorReasons = await validateWoodlandHectares({ parcelIds, oldWoodlandAreaHa, newWoodlandAreaHa })
      return errorReasons.map((reason) => makeError(HECTARES_UNDER_TEN_FIELD_NAME, reason))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      debug(LogCodes.WOODLAND.VALIDATE_ERROR, { errorMessage: message }, request)
      return [
        makeError(
          HECTARES_UNDER_TEN_FIELD_NAME,
          'There has been an issue validating your woodland area. Please try again later or contact the Rural Payments Agency.'
        )
      ]
    }
  }

  makePostRouteHandler() {
    const parentHandler = super.makePostRouteHandler()

    /**
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {Pick<import('@hapi/hapi').ResponseToolkit, 'redirect' | 'view'>} h
     */
    return async (request, context, h) => {
      const { state } = context
      const payload = /** @type {Record<string, string>} */ (request.payload ?? {})

      const totalHectaresAppliedFor = Number(state['totalHectaresAppliedFor']) || 0
      const overTenRaw = payload[HECTARES_OVER_TEN_FIELD_NAME]
      const underTenRaw = payload[HECTARES_UNDER_TEN_FIELD_NAME]

      const frontendErrors = this.validatePayload(overTenRaw, underTenRaw, totalHectaresAppliedFor)
      if (frontendErrors === null) {
        return parentHandler(request, context, h)
      }

      if (frontendErrors.length) {
        context.errors = frontendErrors
      } else {
        const parcelIds = /** @type {string[]} */ (state['selectedParcelIds'] ?? [])
        const backendErrors = await this.validateApplication(request, parcelIds, Number(overTenRaw), Number(underTenRaw))
        if (backendErrors.length) {
          context.errors = backendErrors
        }
      }

      return parentHandler(request, context, h)
    }
  }
}

import nunjucks from 'nunjucks'
import { ComponentType } from '@defra/forms-model'
import TaskPageController from '~/src/server/task-list/task-page.controller.js'
import { validateWoodlandHectares } from '~/src/server/woodland/woodland.service.js'
import { debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * @import { AnyFormRequest, FormContext, FormSubmissionError } from '@defra/forms-engine-plugin/types'
 */

const MIN_WOODLAND_TOTAL_AREA_HA = 0.5
const HECTARES_OVER_TEN_FIELD_NAME = 'oldWoodlandAreaHa'
const HECTARES_UNDER_TEN_FIELD_NAME = 'newWoodlandAreaHa'

const ERROR_BELOW_MINIMUM = `The total area of woodland must be more than ${MIN_WOODLAND_TOTAL_AREA_HA}ha`
const ERROR_EXCEEDS_MAX = (/** @type {number} */ max) =>
  `Total area of woodland cannot be more than total area of selected land parcels (${max}ha)`

/**
 * @param {string} fieldName
 * @param {string} text
 * @returns {FormSubmissionError}
 */
const makeError = (fieldName, text) => ({ path: [fieldName], href: `#${fieldName}`, name: fieldName, text })

/**
 * Returns two errors with the same text: one full error on the first field (appears in summary),
 * and a path-only error on the second field (highlights it inline without duplicating the summary).
 * @param {string} text
 * @returns {Array<object>}
 */
const makeBothFieldsError = (text) => [
  makeError(HECTARES_OVER_TEN_FIELD_NAME, text),
  { path: [HECTARES_UNDER_TEN_FIELD_NAME], href: `#${HECTARES_OVER_TEN_FIELD_NAME}`, text }
]

export default class WoodlandHectaresPageController extends TaskPageController {
  /**
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   */
  getViewModel(request, context) {
    const { state } = context
    const totalHectaresAppliedFor = state['totalHectaresAppliedFor'] ?? 0
    const viewModel = /** @type {Record<string, any>} */ (super.getViewModel(request, context))

    const guidanceIndex = viewModel.components?.findIndex(
      (/** @type {{ type: string }} */ c) => c.type === ComponentType.Html
    )
    if (guidanceIndex !== -1) {
      viewModel.components[guidanceIndex].model.content = nunjucks.renderString(
        viewModel.components[guidanceIndex].model.content,
        { totalHectaresAppliedFor }
      )
    }

    return { ...viewModel, totalHectaresAppliedFor }
  }

  /**
   * Validates the hectare inputs against frontend rules.
   * @param {number} overTen
   * @param {number} underTen
   * @param {number} totalHectaresAppliedFor
   * @returns {Array<object>}
   */
  validatePayload(overTen, underTen, totalHectaresAppliedFor) {
    const missingErrors = []
    if (Number.isNaN(overTen)) {
      missingErrors.push(makeError(HECTARES_OVER_TEN_FIELD_NAME, ERROR_BELOW_MINIMUM))
    }
    if (Number.isNaN(underTen)) {
      missingErrors.push(makeError(HECTARES_UNDER_TEN_FIELD_NAME, ERROR_BELOW_MINIMUM))
    }
    if (missingErrors.length) {
      return missingErrors
    }

    if (overTen + underTen < MIN_WOODLAND_TOTAL_AREA_HA) {
      return makeBothFieldsError(ERROR_BELOW_MINIMUM)
    }
    if (overTen > totalHectaresAppliedFor || overTen + underTen > totalHectaresAppliedFor) {
      return makeBothFieldsError(ERROR_EXCEEDS_MAX(totalHectaresAppliedFor))
    }
    return []
  }

  /**
   * Calls the backend validate endpoint and returns true if validation passed.
   * On failure, renders the page with a top-level error and returns false.
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Pick<import('@hapi/hapi').ResponseToolkit, 'redirect' | 'view'>} h
   * @param {string[]} parcelIds
   * @param {number} oldWoodlandAreaHa
   * @param {number} newWoodlandAreaHa
   * @returns {Promise<import('@hapi/hapi').ResponseObject | null>} a rendered response if validation failed, otherwise null
   */
  async renderBackendErrors(request, context, h, parcelIds, oldWoodlandAreaHa, newWoodlandAreaHa) {
    try {
      const failedReasons = await validateWoodlandHectares({ parcelIds, oldWoodlandAreaHa, newWoodlandAreaHa })
      if (!failedReasons.length) {
        return null
      }
      return this.renderWithErrors(request, context, h, failedReasons.flatMap(makeBothFieldsError))
    } catch (err) {
      debug(
        LogCodes.WOODLAND.VALIDATE_ERROR,
        { errorMessage: err instanceof Error ? err.message : String(err) },
        request
      )
      const viewModel = /** @type {Record<string, unknown>} */ (this.getViewModel(request, context))
      viewModel.errors = [
        {
          path: [],
          text: 'There has been an issue validating your woodland area. Please try again later or contact the Rural Payments Agency.'
        }
      ]
      return h.view(/** @type {string} */ (this.viewName), viewModel)
    }
  }

  /**
   * Renders the page with errors, deduplicating the summary when multiple errors share the same text.
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Pick<import('@hapi/hapi').ResponseToolkit, 'redirect' | 'view'>} h
   * @param {Array<object>} errors
   */
  renderWithErrors(request, context, h, errors) {
    context.errors = errors
    const viewModel = /** @type {Record<string, any>} */ (this.getViewModel(request, context))
    viewModel.errors = this.collection.getViewErrors(errors)
    const seen = new Set()
    viewModel.errors = viewModel.errors?.filter((/** @type {{ text: string }} */ e) => {
      const { text } = e
      if (seen.has(text)) {
        return false
      }
      seen.add(text)
      return true
    })
    return h.view(/** @type {string} */ (this.viewName), viewModel)
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
      const overTen = Number.parseFloat(payload[HECTARES_OVER_TEN_FIELD_NAME])
      const underTen = Number.parseFloat(payload[HECTARES_UNDER_TEN_FIELD_NAME])

      const frontendErrors = this.validatePayload(overTen, underTen, totalHectaresAppliedFor)
      if (frontendErrors.length) {
        return this.renderWithErrors(request, context, h, frontendErrors)
      }

      const parcelIds = /** @type {string[]} */ (state['landParcels'] ?? [])
      const backendResponse = await this.renderBackendErrors(request, context, h, parcelIds, overTen, underTen)
      if (backendResponse) {
        return backendResponse
      }

      return parentHandler(request, context, h)
    }
  }
}

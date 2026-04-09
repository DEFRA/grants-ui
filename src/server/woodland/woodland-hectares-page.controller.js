import TaskPageController from '~/src/server/task-list/task-page.controller.js'

/** @import { AnyFormRequest, FormContext } from '@defra/forms-engine-plugin/engine/types.js' */

const MIN_WOODLAND_TOTAL_AREA_HA = 0.5

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
      const overTenRaw = payload['hectaresTenOrOverYearsOld']
      const underTenRaw = payload['hectaresUnderTenYearsOld']
      if ((overTenRaw && Number.isNaN(Number(overTenRaw))) || (underTenRaw && Number.isNaN(Number(underTenRaw)))) {
        return parentHandler(request, context, h)
      }

      const overTen = Number(overTenRaw) || 0
      const underTen = Number(underTenRaw) || 0

      /** @param {string} fieldName @param {string} text */
      const makeError = (fieldName, text) => ({ path: [fieldName], href: `#${fieldName}`, name: fieldName, text })

      const emptyErrors = [
        ...(!overTenRaw ? [makeError('hectaresTenOrOverYearsOld', 'Enter the total area of woodland over 10 years old')] : []),
        ...(!underTenRaw ? [makeError('hectaresUnderTenYearsOld', 'Enter the total area of newly planted woodland under 10 years old')] : [])
      ]

      if (emptyErrors.length) {
        context.errors = emptyErrors
      } else if (overTen + underTen < MIN_WOODLAND_TOTAL_AREA_HA) {
        context.errors = [makeError('hectaresUnderTenYearsOld', 'The total area of woodland must be larger than 0.5 ha')]
      } else if (overTen > totalHectaresAppliedFor) {
        context.errors = [makeError(
          'hectaresTenOrOverYearsOld',
          `Area of woodland over 10 years old must not be more than the total area of land parcels. You have ${totalHectaresAppliedFor} ha available`
        )]
      } else if (overTen + underTen > totalHectaresAppliedFor) {
        context.errors = [makeError(
          'hectaresUnderTenYearsOld',
          `Combined area of woodland over 10 years old and under 10 years old must not be more than the total area of land parcels. You have ${totalHectaresAppliedFor - overTen} ha remaining`
        )]
      }

      return parentHandler(request, context, h)
    }
  }
}

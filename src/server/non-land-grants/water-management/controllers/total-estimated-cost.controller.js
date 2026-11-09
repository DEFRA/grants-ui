import Joi from 'joi'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { withDerivedState } from '~/src/server/common/helpers/state/with-derived-state.js'

const required = Joi.any().required()
const costsSchema = Joi.object({
  reservoirClayHighCostPerUnit: required,
  reservoirClayLowCostPerUnit: required,
  reservoirSyntheticHighCostPerUnit: required,
  reservoirSyntheticLowCostPerUnit: required,
  distNetworkCostPerUnit: required,
  tanksCostPerUnit: required,
  grantMaxRate: required
})
  .unknown(true)
  .required()

export default class TotalEstimatedCostController extends withDerivedState(QuestionPageController) {
  /**
   * Handle GET requests to the total estimated cost page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      context.state = await this.refreshState(request, context)

      const baseViewModel = this.getViewModel(request, context)
      return h.view(this.viewName, baseViewModel)
    }
  }

  /**
   * Override getNextPath to redirect to exit page when minimum grant amount not reached
   * @param context
   * @returns {*}
   */
  getNextPath(context) {
    const minGrantReached = context.state.additionalAnswers.minGrantReached
    return minGrantReached ? super.getNextPath(context) : '/exit-total-estimated-cost'
  }

  /**
   * Calculates the derived answers without changing persisted state.
   * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
   * @param {any} state
   * @returns {Record<string, any>}
   */
  getCalculatedAnswers(request, state) {
    const config = this.validatePageConfig(request)

    const { distNetworkCostPerUnit, tanksCostPerUnit } = config

    const reservoirs = Reservoir.createAllFromState(state, config)

    const {
      reservoirCost,
      waterDistributionNetworkCost,
      waterTanksCost,
      totalEstimatedCost,
      estimatedMaxGrantBeforeReduction,
      estimatedMaxGrant,
      minGrantReached,
      maxGrantReached
    } = new EstimatedCosts(reservoirs, state, config)

    return {
      reservoirs,
      reservoirCost,
      distNetworkCostPerUnit,
      waterDistributionNetworkCost,
      tanksCostPerUnit,
      waterTanksCost,
      totalEstimatedCost,
      estimatedMaxGrantBeforeReduction,
      estimatedMaxGrant,
      minGrantReached,
      maxGrantReached
    }
  }

  /**
   * Validates the costs configuration in the form metadata.
   * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
   * @returns {{reservoirClayHighCostPerUnit: number, reservoirClayLowCostPerUnit: number, reservoirSyntheticHighCostPerUnit: number, reservoirSyntheticLowCostPerUnit: number, distNetworkCostPerUnit: number, tanksCostPerUnit: number, grantMaxRate: number}}
   * @private
   */
  validatePageConfig(request) {
    const costsConfig = request.app.model?.def?.metadata?.pageConfig?.[this.path]?.costs
    const hapiRequest = /** @type {import('@hapi/hapi').Request} */ (/** @type {unknown} */ (request))

    // Report every missing or invalid cost unit at once rather than the first one.
    const { error, value } = costsSchema.validate(costsConfig, { abortEarly: false })
    if (error) {
      const missing = error.details.map(({ path }) => ['config.costs', ...path].join('.'))
      log(LogCodes.SYSTEM.CONFIG_MISSING, { missing }, hapiRequest)
      throw new Error(`Missing required configuration: ${missing.join(', ')}`)
    }

    return value
  }
}

export class Reservoir {
  constructor({ name, type, size, reservoirHighCostPerUnit, reservoirLowCostPerUnit }) {
    this.name = name
    this.type = type
    this.size = size
    this.reservoirHighCostPerUnit = reservoirHighCostPerUnit
    this.reservoirLowCostPerUnit = reservoirLowCostPerUnit
    this.cost = this.#calculateCost()
  }

  #calculateCost() {
    if (this.size > 10000) {
      return this.reservoirHighCostPerUnit * 10000 + this.reservoirLowCostPerUnit * (this.size - 10000)
    }
    return this.reservoirHighCostPerUnit * this.size
  }

  static createAllFromState(state, config) {
    const {
      itemsPlanningToInstall = [],
      moreThanOneReservoir = false,
      reservoirItems = [],
      whatTypeOfReservoir,
      howMuchWater = 0
    } = state

    if (!itemsPlanningToInstall.includes('RESERVOIR')) {
      return []
    }

    if (moreThanOneReservoir) {
      return reservoirItems
        .map((item) => {
          const { reservoirItemName, reservoirItemWhatTypeOfReservoir, reservoirItemHowMuchWater } = item
          const unitCosts = this.calculateUnitCosts(reservoirItemWhatTypeOfReservoir, config)
          return new Reservoir({
            name: reservoirItemName,
            type: reservoirItemWhatTypeOfReservoir,
            size: reservoirItemHowMuchWater,
            ...unitCosts
          })
        })
        .map((r) => ({ ...r }))
    }

    const unitCosts = this.calculateUnitCosts(whatTypeOfReservoir, config)
    return [
      new Reservoir({
        name: 'Unnamed reservoir',
        type: whatTypeOfReservoir,
        size: howMuchWater,
        ...unitCosts
      })
    ].map((r) => ({ ...r }))
  }

  static calculateUnitCosts(type, config) {
    const isSynthetic = type === 'synthetic'
    return {
      reservoirHighCostPerUnit: isSynthetic
        ? config.reservoirSyntheticHighCostPerUnit
        : config.reservoirClayHighCostPerUnit,
      reservoirLowCostPerUnit: isSynthetic
        ? config.reservoirSyntheticLowCostPerUnit
        : config.reservoirClayLowCostPerUnit
    }
  }
}

class EstimatedCosts {
  #MIN_GRANT = 35000
  #MIN_GRANT_TANKS_ONLY = 15000
  #MAX_GRANT = 300000

  constructor(reservoirs, state, config) {
    const { itemsPlanningToInstall = [], waterDistributionLength = 0, waterStorageCapacity = 0 } = state

    const reservoirCost = reservoirs.reduce((total, r) => total + r.cost, 0)

    const waterDistributionNetworkCost = itemsPlanningToInstall.includes('WATER_DISTRIBUTION_NETWORK')
      ? config.distNetworkCostPerUnit * waterDistributionLength
      : 0

    const waterTanksCost = itemsPlanningToInstall.includes('WATER_STORAGE_TANKS')
      ? config.tanksCostPerUnit * waterStorageCapacity
      : 0

    const totalEstimatedCost = reservoirCost + waterDistributionNetworkCost + waterTanksCost

    const estimatedMaxGrantBeforeReduction = totalEstimatedCost * config.grantMaxRate

    const minGrantThreshold =
      reservoirCost > 0 || waterDistributionNetworkCost > 0 ? this.#MIN_GRANT : this.#MIN_GRANT_TANKS_ONLY

    this.reservoirCost = reservoirCost
    this.waterDistributionNetworkCost = waterDistributionNetworkCost
    this.waterTanksCost = waterTanksCost
    this.totalEstimatedCost = totalEstimatedCost
    this.estimatedMaxGrantBeforeReduction = estimatedMaxGrantBeforeReduction
    this.minGrantReached = estimatedMaxGrantBeforeReduction >= minGrantThreshold
    this.maxGrantReached = estimatedMaxGrantBeforeReduction > this.#MAX_GRANT
    this.estimatedMaxGrant = Math.min(estimatedMaxGrantBeforeReduction, this.#MAX_GRANT)
  }
}

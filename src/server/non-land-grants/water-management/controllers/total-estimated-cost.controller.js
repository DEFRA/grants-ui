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

    const reservoirs = buildReservoirs(state, config)

    const {
      reservoirCost,
      waterDistributionNetworkCost,
      waterTanksCost,
      totalEstimatedCost,
      estimatedMaxGrantBeforeReduction,
      estimatedMaxGrant,
      minGrantReached,
      maxGrantReached
    } = calculateEstimatedCosts(reservoirs, state, config)

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

/**
 * Calculates the cost of a reservoir based on its size and tiered pricing.
 * @param {number} size
 * @param {number} highCostPerUnit
 * @param {number} lowCostPerUnit
 * @returns {number}
 */
function calculateReservoirCost(size, highCostPerUnit, lowCostPerUnit) {
  if (size > 10000) {
    return highCostPerUnit * 10000 + lowCostPerUnit * (size - 10000)
  }
  return highCostPerUnit * size
}

/**
 * Determines the unit costs for a reservoir based on its type.
 * @param {string} type
 * @param {any} config
 * @returns {{reservoirHighCostPerUnit: number, reservoirLowCostPerUnit: number}}
 */
function getReservoirUnitCosts(type, config) {
  const isSynthetic = type === 'synthetic'
  return {
    reservoirHighCostPerUnit: isSynthetic
      ? config.reservoirSyntheticHighCostPerUnit
      : config.reservoirClayHighCostPerUnit,
    reservoirLowCostPerUnit: isSynthetic ? config.reservoirSyntheticLowCostPerUnit : config.reservoirClayLowCostPerUnit
  }
}

/**
 * Builds an array of reservoir objects from the state and configuration.
 * @param {any} state
 * @param {any} config
 * @returns {Array<{name: string|null, type: string, size: number, reservoirHighCostPerUnit: number, reservoirLowCostPerUnit: number, cost: number}>}
 */
export function buildReservoirs(state, config) {
  const {
    itemsPlanningToInstall = [],
    moreThanOneReservoir = false,
    reservoirItems = [],
    whatTypeOfReservoir = null,
    howMuchWater = 0
  } = state

  if (!itemsPlanningToInstall.includes('RESERVOIR')) {
    return []
  }

  if (moreThanOneReservoir && reservoirItems.length > 0) {
    return reservoirItems.map((item) => {
      const { reservoirItemName, reservoirItemWhatTypeOfReservoir, reservoirItemHowMuchWater } = item
      const { reservoirHighCostPerUnit, reservoirLowCostPerUnit } = getReservoirUnitCosts(
        reservoirItemWhatTypeOfReservoir,
        config
      )
      return {
        name: reservoirItemName,
        type: reservoirItemWhatTypeOfReservoir,
        size: reservoirItemHowMuchWater,
        reservoirHighCostPerUnit,
        reservoirLowCostPerUnit,
        cost: calculateReservoirCost(reservoirItemHowMuchWater, reservoirHighCostPerUnit, reservoirLowCostPerUnit)
      }
    })
  }

  const unitCosts = getReservoirUnitCosts(whatTypeOfReservoir, config)
  return [
    {
      name: null,
      type: whatTypeOfReservoir,
      size: howMuchWater,
      ...unitCosts,
      cost: calculateReservoirCost(howMuchWater, unitCosts.reservoirHighCostPerUnit, unitCosts.reservoirLowCostPerUnit)
    }
  ]
}

/**
 * Calculates estimated costs and grant amounts based on reservoirs and other items.
 * @param {Array<any>} reservoirs
 * @param {any} state
 * @param {any} config
 * @returns {{reservoirCost: number, waterDistributionNetworkCost: number, waterTanksCost: number, totalEstimatedCost: number, estimatedMaxGrantBeforeReduction: number, minGrantReached: boolean, maxGrantReached: boolean, estimatedMaxGrant: number}}
 */
export function calculateEstimatedCosts(reservoirs, state, config) {
  const MIN_GRANT = 35000
  const MIN_GRANT_TANKS_ONLY = 15000
  const MAX_GRANT = 300000

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

  const minGrantThreshold = reservoirCost > 0 || waterDistributionNetworkCost > 0 ? MIN_GRANT : MIN_GRANT_TANKS_ONLY

  return {
    reservoirCost,
    waterDistributionNetworkCost,
    waterTanksCost,
    totalEstimatedCost,
    estimatedMaxGrantBeforeReduction,
    minGrantReached: estimatedMaxGrantBeforeReduction >= minGrantThreshold,
    maxGrantReached: estimatedMaxGrantBeforeReduction > MAX_GRANT,
    estimatedMaxGrant: Math.min(estimatedMaxGrantBeforeReduction, MAX_GRANT)
  }
}

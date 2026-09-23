import { isDeepStrictEqual } from 'node:util'
import { mergeAdditionalAnswers } from './additional-answers-helper.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'
import { DANGEROUS_KEYS } from '~/src/server/common/utils/objects.js'

/**
 * @typedef {object} DerivedStateOptions
 * @property {string[]} stateKeys - Exclusive top-level keys owned in state.additionalAnswers.
 * @property {boolean} requiresAcknowledgement - Visit the result page when stale; false permits an automatic refresh.
 */

/**
 * Adds derived-answer freshness and persistence without changing navigation or task counting.
 * The controller implements getCalculatedAnswers(request, state), returning all owned keys
 * using local calculations. API-backed results are saved by their result page and read
 * from additionalAnswers on Check answers; they must not use this freshness check.
 * Freshness checks compare calculated outputs with saved answers.
 * Invoke the asynchronous methods in handlers, never in getRelevantPath.
 * See docs/DERIVED-STATE-PAGES.md for the complete contract and acknowledgement semantics.
 * @template {new (...args: any[]) => any} T
 * @param {T} Base
 * @param {DerivedStateOptions} [options]
 */
export function withDerivedState(Base, options) {
  return class DerivedStateMixin extends Base {
    /**
     * Derived-state behaviour belongs to the page's form-definition `config`
     * block. Static options remain supported for reusable controllers whose
     * behaviour is intentionally fixed.
     * @param {any[]} args
     */
    constructor(...args) {
      super(...args)
      const [model, pageDef] = args
      const configured = model?.def?.metadata?.pageConfig?.[pageDef?.path]?.derivedState
      // A reusable controller with static options owns its contract. Omitting
      // them opts a controller into the individual page definition instead.
      const derivedState = validateOptions(options ?? configured)
      this.derivedState = Object.freeze(derivedState)
    }

    /** @param {FormContext} context */
    isDerivedStateApplicable(context) {
      return !context.isForceAccess && context.relevantPages.some((page) => page.path === this.path)
    }

    /**
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @returns {Promise<boolean>}
     */
    async isStateStale(request, context) {
      if (!this.isDerivedStateApplicable(context)) {
        return false
      }
      try {
        const state = /** @type {Record<string, any>} */ (context.state)
        const saved = state.additionalAnswers ?? {}
        if (this.derivedState.stateKeys.some((key) => !Object.hasOwn(saved, key) || saved[key] === undefined)) {
          return true
        }
        const calculated = await this.#calculate(request, state)
        return this.derivedState.stateKeys.some((key) => !isDeepStrictEqual(saved[key], calculated[key]))
      } catch (error) {
        throw operationError('check', error)
      }
    }

    /**
     * Returns persisted state without mutating the supplied context. Writes only
     * the owned answers.
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @returns {Promise<FormContext['state']>}
     */
    async refreshState(request, context) {
      if (!this.isDerivedStateApplicable(context)) {
        return context.state
      }
      try {
        const state = /** @type {Record<string, any>} */ (context.state)
        const answers = await this.#calculate(request, state)
        const updated = mergeAdditionalAnswers(context.state, answers)
        return await this.setState(request, updated)
      } catch (error) {
        throw operationError('refresh', error)
      }
    }

    async #calculate(request, state) {
      const answers = await this.getCalculatedAnswers(request, state)
      const { stateKeys } = this.derivedState
      if (
        !answers ||
        Object.keys(answers).length !== stateKeys.length ||
        stateKeys.some((key) => !Object.hasOwn(answers, key) || answers[key] === undefined)
      ) {
        throw contractError('Calculation must return exactly its owned state keys')
      }
      return answers
    }
  }
}

/** @param {DerivedStateOptions | undefined} options */
function validateOptions(options) {
  const { stateKeys, requiresAcknowledgement } = options ?? {}
  if (
    !Array.isArray(stateKeys) ||
    !stateKeys.length ||
    new Set(stateKeys).size !== stateKeys.length ||
    stateKeys.some((key) => typeof key !== 'string' || !key || DANGEROUS_KEYS.has(key) || key.includes('.')) ||
    typeof requiresAcknowledgement !== 'boolean'
  ) {
    throw contractError('Invalid derived-state options')
  }
  return { stateKeys: Object.freeze([...stateKeys]), requiresAcknowledgement }
}

function contractError(message) {
  return new SystemError({ message, source: 'withDerivedState', reason: 'derived_state_contract_invalid', status: 500 })
}

function operationError(operation, error) {
  return new SystemError({
    message: `Failed to ${operation} derived answers`,
    source: `withDerivedState.${operation}`,
    reason: 'derived_state_failure',
    status: 500
  }).from(error)
}

/**
 * @import { AnyFormRequest, FormContext } from '@defra/forms-engine-plugin/types'
 */

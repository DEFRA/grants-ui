/**
 * Returns a new state object with the given answers merged into state.additionalAnswers.
 * Safe to use when state.additionalAnswers is undefined, empty, or already populated.
 * Existing keys are preserved; keys in newAnswers overwrite any matching existing keys.
 *
 * @param {FormSubmissionState} state
 * @param {Record<string, unknown>} newAnswers
 * @returns {FormSubmissionState}
 */
export function mergeAdditionalAnswers(state, newAnswers) {
  return /** @type {FormSubmissionState} */ (
    /** @type {unknown} */ ({
      ...state,
      additionalAnswers: {
        .../** @type {Record<string, unknown>} */ (/** @type {unknown} */ (state?.additionalAnswers) ?? {}),
        ...newAnswers
      }
    })
  )
}

/**
 * @import { FormSubmissionState } from '@defra/forms-engine-plugin/engine/types.js'
 */

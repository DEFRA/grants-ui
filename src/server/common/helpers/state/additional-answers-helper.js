/**
 * Returns a new state object with the given answers merged into state.additionalAnswers.
 * Safe to use when state.additionalAnswers is undefined, empty, or already populated.
 * Existing keys are preserved; keys in newAnswers overwrite any matching existing keys.
 *
 * @param {object} state
 * @param {object} newAnswers
 * @returns {object}
 */
export function mergeAdditionalAnswers(state, newAnswers) {
  return {
    ...state,
    additionalAnswers: {
      ...(state?.additionalAnswers ?? {}),
      ...newAnswers
    }
  }
}

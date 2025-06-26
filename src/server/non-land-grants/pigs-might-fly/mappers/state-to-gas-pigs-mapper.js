/**
 * @typedef {object} GASAnswers
 * @property {string} isPigFarmer - isPigFarmer
 * @property {number} totalPigs - totalPigs
 * @property {string} [pigBreeds] - types of pigs
 * @property {number} whitePigsCount - number of white pigs
 * @property {number} britishLandracePigsCount - number of british landrace pigs
 * @property {number} berkshirePigsCount - number of berkshire pigs
 * @property {number} otherPigsCount - number of other pigs
 */

/**
 * Transforms FormContext object into a GAS Application answers object for Land Grants.
 * @param {object} state
 * @returns {GASAnswers}
 */

export function stateToPigsMightFlyGasAnswers(state) {
  const result = {
    isPigFarmer: state.isPigFarmer || false,
    totalPigs: state.totalPigs || 0,
    pigBreeds: state.pigBreeds || []
  }

  if (state.whitePigsCount !== undefined) {
    result.whitePigsCount = state.whitePigsCount
  }

  if (state.britishLandracePigsCount !== undefined) {
    result.britishLandracePigsCount = state.britishLandracePigsCount
  }

  if (state.berkshirePigsCount !== undefined) {
    result.berkshirePigsCount = state.berkshirePigsCount
  }

  if (state.otherPigsCount !== undefined) {
    result.otherPigsCount = state.otherPigsCount
  }

  return result
}

/**
 * Transforms the raw submission state into the answers shape expected by GAS
 * for the grasslands journey.
 *
 * @param {Record<string, unknown>} submissionState
 * @param {Record<string, unknown>} rawState
 * @returns {object}
 */
export const transformGrasslandsAnswers = (submissionState, rawState) => {
  const { ...rest } = submissionState
  delete rest.selectedParcelsDisplay
  delete rest.landParcels

  const selectedParcelId = rawState.selectedParcelId
  const selectedParcel = /** @type {Record<string, unknown> | undefined} */ (
    /** @type {Record<string, Record<string, unknown>> | undefined} */ (rawState.landParcels)?.[
      /** @type {string} */ (selectedParcelId)
    ]
  )
  const [actionCode] = Object.keys(
    /** @type {Record<string, unknown> | undefined} */ (selectedParcel?.actionsObj) ?? {}
  )

  return {
    ...rest,
    selectedParcelId,
    ...(actionCode ? { actionCode } : {})
  }
}

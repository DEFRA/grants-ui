/**
 * Helpers for managing claims that live inside the journey state.
 *
 * A grant application can have more than one claim over its lifetime, so claims
 * are stored as an array under `state.claims`, each with its own `status`. Only
 * ever one claim is "current" (not yet submitted); each GAS submission targets
 * that single current claim.
 *
 * @typedef {object} Claim
 * @property {string} claimNumber - Human-readable claim number derived from the application reference
 * @property {ClaimStatusValue} status - Per-claim lifecycle status
 * @property {number} [totalEligibleArea] - Total eligible area for the claim (e.g. `24.95`)
 * @property {string} [unit] - Unit for the total eligible area (e.g. `ha`)
 * @property {number} [totalClaimAmountPence] - Total claim amount for the claim, as an integer number of pence
 * @property {string} [submittedAt] - ISO timestamp set when the claim is submitted to GAS
 */

/**
 * @typedef {(typeof ClaimStatus)[keyof typeof ClaimStatus]} ClaimStatusValue
 */

export const ClaimStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED'
}

/**
 * Derive a human-readable claim number from the application reference number
 * and a 1-based sequence, with the sequence zero-padded to 2 digits, e.g.
 * `WMP-A1B2-C3D4` + `1` -> `WMP-A1B2-C3D4-C01`.
 * @param {string} referenceNumber - Application reference number
 * @param {number} sequence - 1-based claim sequence for this application
 * @returns {string} The derived claim number
 */
export function generateClaimNumber(referenceNumber, sequence) {
  return `${referenceNumber}-C${String(sequence).padStart(2, '0')}`
}

/**
 * Read the claims array from state, always returning an array.
 * @param {Record<string, unknown> | undefined} state
 * @returns {Claim[]}
 */
export function getClaims(state) {
  const claims = /** @type {unknown} */ (state?.claims)
  return Array.isArray(claims) ? /** @type {Claim[]} */ (claims) : []
}

/**
 * The current claim is the first claim that has not yet been submitted.
 * @param {Record<string, unknown> | undefined} state
 * @returns {Claim | undefined}
 */
export function getCurrentClaim(state) {
  return getClaims(state).find((claim) => claim?.status !== ClaimStatus.SUBMITTED)
}

/**
 * The latest claim is the most recent one in state, i.e. the last entry in the
 * claims array. On the claim confirmation page this is the claim that was just
 * submitted (it has already been marked `SUBMITTED`).
 * @param {Record<string, unknown> | undefined} state
 * @returns {Claim | undefined}
 */
export function getLatestClaim(state) {
  return getClaims(state).at(-1)
}

/**
 * Ensure there is a current (unsubmitted) claim in state. When one already
 * exists its amounts are refreshed; otherwise a new claim is created with a
 * derived claim number. Returns a new claims array (state is not mutated) and
 * the resulting current claim.
 * @param {Record<string, unknown> | undefined} state
 * @param {{ referenceNumber: string, totalEligibleArea?: number, unit?: string, totalClaimAmountPence?: number }} data
 * @returns {{ claims: Claim[], currentClaim: Claim }}
 */
export function upsertCurrentClaim(state, { referenceNumber, totalEligibleArea, unit, totalClaimAmountPence }) {
  const claims = getClaims(state).map((claim) => ({ ...claim }))
  const currentIndex = claims.findIndex((claim) => claim?.status !== ClaimStatus.SUBMITTED)

  if (currentIndex >= 0) {
    claims[currentIndex] = { ...claims[currentIndex], totalEligibleArea, unit, totalClaimAmountPence }
    return { claims, currentClaim: claims[currentIndex] }
  }

  /** @type {Claim} */
  const currentClaim = {
    claimNumber: generateClaimNumber(referenceNumber, claims.length + 1),
    status: ClaimStatus.IN_PROGRESS,
    totalEligibleArea,
    unit,
    totalClaimAmountPence
  }
  claims.push(currentClaim)

  return { claims, currentClaim }
}

/**
 * Mark the claim with the given claim number as submitted. Returns a new claims
 * array (state is not mutated).
 * @param {Record<string, unknown> | undefined} state
 * @param {string} claimNumber
 * @param {string} submittedAt - ISO timestamp
 * @returns {Claim[]}
 */
export function markClaimSubmitted(state, claimNumber, submittedAt) {
  return getClaims(state).map((claim) =>
    claim?.claimNumber === claimNumber ? { ...claim, status: ClaimStatus.SUBMITTED, submittedAt } : { ...claim }
  )
}

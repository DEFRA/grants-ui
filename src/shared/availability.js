/**
 * The action's claimable ceiling, or undefined when it has no restriction.
 * @param {{ value?: number | null, unit?: string } | null} [availability]
 * @returns {number | undefined}
 */
export function getAvailabilityLimit(availability) {
  return availability?.value ?? undefined
}

/**
 * Whether an action still has land left to claim.
 * @param {{ availability?: { value?: number | null, unit?: string } | null, staticAvailability?: { value?: number | null, unit?: string } | null } | null} [action]
 * @returns {boolean}
 */
export function hasAvailableLand(action) {
  return getAvailabilityLimit(action?.staticAvailability ?? action?.availability) !== 0
}

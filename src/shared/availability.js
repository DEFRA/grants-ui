/**
 * The action's claimable ceiling, or undefined when it has no restriction.
 * @param {{ value?: number | null, unit?: string } | null} [availability]
 * @returns {number | undefined}
 */
export function getAvailabilityLimit(availability) {
  return availability?.value ?? undefined
}

/**
 * Whether the API allows an action on the parcel, independently of its quantity limit.
 * @param {{ isAvailable?: boolean } | null} [action]
 * @returns {boolean}
 */
export function isActionAvailable(action) {
  return action?.isAvailable === true
}

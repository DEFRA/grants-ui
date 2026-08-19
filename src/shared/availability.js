/**
 * The action's claimable ceiling, or undefined when it has no restriction.
 * @param {{ value?: number | null, unit?: string } | null} [availability]
 * @returns {number | undefined}
 */
export function getAvailabilityLimit(availability) {
  return availability?.value ?? undefined
}

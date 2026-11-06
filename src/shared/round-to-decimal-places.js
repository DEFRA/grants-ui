const FOUR_DECIMAL_PLACES = 10_000

/**
 * Rounds a number to 4 decimal places, removing floating point noise
 * (e.g. 0.1 + 0.2 = 0.30000000000000004). GAS expects area values in
 * hectares to have no more than 4 decimal places.
 * @param {number} value
 * @returns {number}
 */
export const roundToFourDecimalPlaces = (value) => Math.round(value * FOUR_DECIMAL_PLACES) / FOUR_DECIMAL_PLACES

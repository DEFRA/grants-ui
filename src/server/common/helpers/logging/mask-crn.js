const VISIBLE_DIGITS = 4
const MASKABLE_CRN = new RegExp(String.raw`^\d{${VISIBLE_DIGITS + 1},}$`)

/**
 * Mask a CRN for logging, revealing only the last 4 digits (e.g. `******1262`).
 * @param {string|number|null|undefined} value - The CRN or sentinel value to mask.
 * @returns {string} The masked CRN, or the original value when it is not a maskable CRN.
 */
export function maskCrn(value) {
  if (value === null || value === undefined) {
    return 'unknown'
  }

  const str = String(value)

  if (!MASKABLE_CRN.test(str)) {
    return str
  }

  return `${'*'.repeat(str.length - VISIBLE_DIGITS)}${str.slice(-VISIBLE_DIGITS)}`
}

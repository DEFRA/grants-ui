/**
 * Default text formatter - converts value to string
 * @param {*} value - The value to format
 * @returns {{ text: string } | null} Formatted value object or null if empty
 */
export function textFormatter(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  return { text: String(value) }
}

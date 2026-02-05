/**
 * Full name formatter - joins name parts (title, first, middle, last) with spaces
 * @param {object} value - Name object with title, first, middle, last properties
 * @returns {{ text: string } | null} Formatted value object or null if empty
 */
export function fullNameFormatter(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const fullName = [value.title, value.first, value.middle, value.last].filter(Boolean).join(' ')

  if (!fullName) {
    return null
  }

  return { text: fullName }
}

/**
 * Format linear (length) unit
 * @param {string} abbrev - Linear unit abbreviation
 * @returns {string} - full unit name
 */
export function formatLinearUnit(abbrev = '') {
  const lookup = {
    m: 'metres',
    km: 'kilometres'
  }

  const key = abbrev.trim().toLowerCase()
  return lookup[key] ?? abbrev
}

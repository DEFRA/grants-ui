/**
 * Format area unit
 * @param {string} abbrev - Area unit abbreviation
 * @returns {string} - full unit name
 */
export function formatAreaUnit(abbrev = '') {
  const lookup = {
    sqm: 'square metres',
    m2: 'square metres',

    sqkm: 'square kilometres',
    km2: 'square kilometres',

    sqft: 'square feet',
    ft2: 'square feet',

    sqyd: 'square yards',
    yd2: 'square yards',

    sqmi: 'square miles',
    mi2: 'square miles',

    ha: 'hectares',
    are: 'ares',

    ac: 'acres'
  }

  const key = abbrev.trim().toLowerCase()
  return lookup[key] ?? abbrev
}

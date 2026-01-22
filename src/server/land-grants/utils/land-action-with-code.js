/**
 * Formats land action with code
 * @param {string} description - Action description
 * @param {string} code - Action code
 * @returns {string} - Formatted action string, or fallback if data is missing
 */
export const landActionWithCode = (description, code) => {
  // Handle missing data gracefully rather than throwing
  if (!description && !code) {
    return ''
  }
  if (!code) {
    return description
  }
  if (!description) {
    return code
  }

  return `${description}: ${code}`
}

/**
 * Formats land action with code and optional SSSI consent notice
 * @param {string} description - Action description
 * @param {string} code - Action code
 * @param {boolean} [sssiConsentRequired] - Whether SSSI consent is required
 * @returns {string} - Formatted action string with optional consent notice
 */
export const landActionWithConsentData = (description, code, sssiConsentRequired) => {
  const baseText = `${description}: ${code}`
  return sssiConsentRequired ? `${baseText}. SSSI consent needed.` : baseText
}

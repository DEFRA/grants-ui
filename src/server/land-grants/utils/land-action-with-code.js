/**
 * @param {string} description
 * @param {string} code
 */
export const landActionWithCode = (description, code) => {
  if (!code) {
    throw new Error(`Missing land action code for "${description}"`)
  }

  if (!description) {
    throw new Error(`Missing land action description for "${code}"`)
  }

  return `${description}: ${code}`
}

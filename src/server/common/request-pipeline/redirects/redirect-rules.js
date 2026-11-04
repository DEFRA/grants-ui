/**
 * Finds the first redirect rule matching a Grants UI status and a GAS status. A rule's
 * 'default' matches any status for that field. `undefined` when no rule matches.
 *
 * @param {string} fromGrantsStatus - Current Grants UI status (previous state)
 * @param {string} gasStatus - Current status returned from GAS
 * @param {RedirectRule[]} redirectRules - Rules to match against, in order
 * @returns {RedirectRule | undefined}
 */
export function findRedirectRule(fromGrantsStatus, gasStatus, redirectRules = []) {
  return redirectRules.find((rule) => {
    const fromStatuses = new Set((rule.fromGrantsStatus || 'default').split(',').map((s) => s.trim()))
    const gasStatuses = new Set((rule.gasStatus || 'default').split(',').map((s) => s.trim()))

    const fromMatch = fromStatuses.has(fromGrantsStatus) || fromStatuses.has('default')
    const gasMatch = gasStatuses.has(gasStatus) || gasStatuses.has('default')

    return fromMatch && gasMatch
  })
}

/**
 * @import { RedirectRule } from './forms-status-redirect.js'
 */

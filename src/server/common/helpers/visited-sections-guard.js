/**
 * CWE-400 Protection: Prevents unbounded session array growth
 */

const MAX_VISITED_SECTIONS = 500

/**
 * Updates visited sections array with FIFO eviction when at capacity
 *
 * @param {string[]} sections - Current visited sections
 * @param {string | null | undefined} sectionId - Section to add
 * @returns {string[]} Updated sections array
 */
export function updateVisitedSections(sections, sectionId) {
  const visited = sections || []

  if (sectionId && !visited.includes(sectionId)) {
    if (visited.length >= MAX_VISITED_SECTIONS) {
      visited.shift()
    }
    visited.push(sectionId)
  }

  return visited
}

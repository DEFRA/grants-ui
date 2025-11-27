/**
 * Converts a TTL in milliseconds to a human-readable format
 * @param {number} ttlMs - TTL in milliseconds
 * @returns {string} Human-readable duration (e.g., "4 hours", "28 days")
 */
export const formatTtlToReadable = (ttlMs) => {
  const hours = ttlMs / (1000 * 60 * 60)
  const days = hours / 24
  if (days >= 1) {
    return days === 1 ? '1 day' : `${Math.round(days)} days`
  }
  return hours === 1 ? '1 hour' : `${Math.round(hours)} hours`
}

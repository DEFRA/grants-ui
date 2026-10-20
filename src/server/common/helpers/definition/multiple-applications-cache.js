// Only scheme configuration is cached; never application state or business identity.
const FLAG_TTL_MS = 60_000
const MAX_CACHED_GRANTS = 1000
/** @type {Map<string, {enabled: boolean, expiresAt: number}>} */
const flags = new Map()

/** @param {string} grantCode @param {any} definition */
export function rememberMultipleApplications(grantCode, definition) {
  if (!definition) {
    return
  }
  const enabled =
    definition.allowMultipleApplications === true || definition.definition?.metadata?.allowMultipleApplications === true
  const existing = flags.get(grantCode)
  // Repeated reads of a pinned definition must not postpone the next latest-definition check.
  if (existing?.enabled === enabled && existing.expiresAt > Date.now()) {
    return
  }
  if (!flags.has(grantCode) && flags.size >= MAX_CACHED_GRANTS) {
    const oldestGrant = flags.keys().next().value
    if (oldestGrant !== undefined) {
      flags.delete(oldestGrant)
    }
  }
  flags.set(grantCode, { enabled, expiresAt: Date.now() + FLAG_TTL_MS })
}

/** @param {string} grantCode @returns {boolean | undefined} */
export function cachedMultipleApplications(grantCode) {
  const entry = flags.get(grantCode)
  if (entry && entry.expiresAt > Date.now()) {
    return entry.enabled
  }
  flags.delete(grantCode)
  return undefined
}

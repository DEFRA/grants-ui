const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

const parcelActionsCache = new Map()
const sbiParcelsCache = new Map()

function getCached(cache, key) {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }
  return null
}

function setCached(cache, key, data) {
  cache.set(key, { data, timestamp: Date.now() })
}

export function getCachedParcel(key) {
  return getCached(parcelActionsCache, key)
}

export function setCachedParcel(key, data) {
  setCached(parcelActionsCache, key, data)
}

export function getCachedSbiParcels(sbi) {
  return getCached(sbiParcelsCache, sbi)
}

export function setCachedSbiParcels(sbi, data) {
  setCached(sbiParcelsCache, sbi, data)
}

export function clearParcelCache() {
  parcelActionsCache.clear()
  sbiParcelsCache.clear()
}

import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'

const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000
const CACHE_TTL_MINUTES = 5
const CACHE_TTL_MS = CACHE_TTL_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND
const CACHE_MAX_ENTRIES = 500

function createCache() {
  const store = new Map()
  return {
    get(key) {
      const entry = store.get(key)
      if (!entry) {
        return null
      }
      if (Date.now() > entry.expiresAt) {
        store.delete(key)
        return null
      }
      return entry.value
    },
    set(key, value) {
      if (store.size >= CACHE_MAX_ENTRIES) {
        const now = Date.now()
        for (const [k, e] of store) {
          if (now > e.expiresAt) {
            store.delete(k)
            break
          }
        }
        if (store.size >= CACHE_MAX_ENTRIES) {
          store.delete(store.keys().next().value)
        }
      }
      store.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
    },
    clear() {
      store.clear()
    }
  }
}

const parcelActionsCache = createCache()
const sbiParcelsCache = createCache()
const authParcelsCache = createCache()

export function getCachedParcel(key) {
  return parcelActionsCache.get(key) ?? null
}

export function setCachedParcel(key, data) {
  parcelActionsCache.set(key, data)
}

export function getCachedSbiParcels(sbi) {
  return sbiParcelsCache.get(sbi) ?? null
}

export function setCachedSbiParcels(sbi, data) {
  sbiParcelsCache.set(sbi, data)
}

export function getCachedAuthParcels(sbi) {
  return authParcelsCache.get(sbi) ?? null
}

export function setCachedAuthParcels(sbi, data) {
  authParcelsCache.set(sbi, data)
}

/**
 * The SBI's authorised parcel ids (as `sheetId-parcelId` strings), served from
 * cache when available. On a cache miss, fetches from the consolidated view
 * and populates the cache; on fetch failure, returns null without caching so
 * the next call retries.
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyFormRequest} request
 * @returns {Promise<string[] | null>}
 */
export async function fetchAuthorisedParcelIds(request) {
  const sbi = request.auth?.credentials?.sbi
  const cached = getCachedAuthParcels(sbi)
  if (cached) {
    return cached
  }

  try {
    const landParcels = (await fetchParcelsFromDal(request)) || []
    const parcelIds = landParcels.map((parcel) => stringifyParcel(parcel))
    setCachedAuthParcels(sbi, parcelIds)
    return parcelIds
  } catch (error) {
    debug(
      LogCodes.SYSTEM.EXTERNAL_API_ERROR,
      {
        endpoint: 'fetchAuthorisedParcelIds (consolidated view)',
        errorMessage: `fetch parcel data for auth check: ${/** @type {Error} */ (error).message}`
      },
      request
    )
    return null
  }
}

export function clearParcelCache() {
  parcelActionsCache.clear()
  sbiParcelsCache.clear()
  authParcelsCache.clear()
}

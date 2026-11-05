import { randomUUID } from 'node:crypto'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import {
  defineCachedMethod,
  GENERATE_TIMEOUT_HEADROOM_MS,
  retryWindowMs,
  UNRETRIED_GENERATE_TIMEOUT_MS
} from '~/src/server/common/helpers/cache/cached-method.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { LAND_GRANTS_ACTION_SIZE, LAND_GRANTS_ACTIONS } from '~/src/server/land-grants/services/land-grants.client.js'
import { logHandledError } from '~/src/server/common/helpers/logging/handled-error.js'
import { stringifyParcel } from '~/src/shared/format-parcel.js'

const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000
const CACHE_TTL_MINUTES = 5
const CACHE_TTL_MS = CACHE_TTL_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND

const ENTRA_TOKEN_TIMEOUT_SECONDS = 15
const LAND_GRANTS_TIMEOUT_SECONDS = 30
const CONSOLIDATED_VIEW_TIMEOUT_SECONDS = 30

const ENTRA_TOKEN_WINDOW_MS = retryWindowMs(ENTRA_TOKEN_TIMEOUT_SECONDS * MS_PER_SECOND)
const LAND_GRANTS_WINDOW_MS = retryWindowMs(LAND_GRANTS_TIMEOUT_SECONDS * MS_PER_SECOND)
const CONSOLIDATED_VIEW_WINDOW_MS =
  retryWindowMs(CONSOLIDATED_VIEW_TIMEOUT_SECONDS * MS_PER_SECOND) + ENTRA_TOKEN_WINDOW_MS
const SBI_PARCEL_FIELDS = [[LAND_GRANTS_ACTION_SIZE], [LAND_GRANTS_ACTION_SIZE, LAND_GRANTS_ACTIONS]]

/**
 * @param {string} _key
 * @param {() => Promise<unknown>} load
 * @returns {Promise<unknown>}
 */
const runLoader = (_key, load) => load()

/**
 * @param {unknown} _sbi
 * @param {AnyFormRequest} request
 * @returns {Promise<string[]>}
 */
async function loadAuthorisedParcelIds(_sbi, request) {
  const landParcels = (await fetchParcelsFromDal(request)) || []
  return landParcels.map((parcel) => stringifyParcel(parcel))
}

const authorisedParcelIds = defineCachedMethod('landGrants.authorisedParcelIds', loadAuthorisedParcelIds, {
  expiresIn: CACHE_TTL_MS,
  generateTimeout: CONSOLIDATED_VIEW_WINDOW_MS + GENERATE_TIMEOUT_HEADROOM_MS,
  generateKey: String
})

const sbiParcels = defineCachedMethod('landGrants.sbiParcels', runLoader, {
  expiresIn: CACHE_TTL_MS,
  // Loads the SBI's parcels from consolidated view, then their sizes from land grants.
  generateTimeout: CONSOLIDATED_VIEW_WINDOW_MS + LAND_GRANTS_WINDOW_MS + GENERATE_TIMEOUT_HEADROOM_MS,
  generateKey: (key) => key
})

const parcelActions = defineCachedMethod('landGrants.parcelActions', runLoader, {
  expiresIn: CACHE_TTL_MS,
  generateTimeout: LAND_GRANTS_WINDOW_MS + GENERATE_TIMEOUT_HEADROOM_MS,
  generateKey: (key) => key
})

// A shared version invalidates every action-key variant for an SBI without scanning Redis.
// Old entries expire normally, and an in-flight load cannot repopulate the new version.
const parcelActionsVersion = defineCachedMethod(
  'landGrants.parcelActionsVersion',
  async (/** @type {unknown} */ _sbi) => randomUUID(),
  {
    expiresIn: CACHE_TTL_MS,
    generateTimeout: UNRETRIED_GENERATE_TIMEOUT_MS,
    generateKey: String
  }
)

export const parcelCachePlugin = {
  plugin: {
    name: 'parcel-cache',
    register(/** @type {Server} */ server) {
      authorisedParcelIds.register(server)
      sbiParcels.register(server)
      parcelActions.register(server)
      parcelActionsVersion.register(server)
    }
  }
}

/**
 * @param {unknown} sbi
 * @param {string[]} fields
 * @returns {string}
 */
export function sbiParcelsKey(sbi, fields) {
  return `${sbi}:${[...fields].sort((a, b) => a.localeCompare(b)).join(',')}`
}

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} load
 * @returns {Promise<T>}
 */
export function cachedSbiParcels(key, load) {
  return /** @type {Promise<T>} */ (sbiParcels.call(key, load))
}

/**
 * @template T
 * @param {string} sbi
 * @param {string} key
 * @param {() => Promise<T>} load
 * @returns {Promise<T>}
 */
export async function cachedParcelActions(sbi, key, load) {
  const version = await parcelActionsVersion.call(sbi)
  return /** @type {Promise<T>} */ (parcelActions.call(`${sbi}:${version}:${key}`, load))
}

/**
 * The SBI's authorised parcel ids (as `sheetId-parcelId` strings), served from
 * cache when available. On a cache miss, fetches from the consolidated view
 * and populates the cache; on fetch failure, returns null without caching so
 * the next call retries.
 * @param {AnyFormRequest} request
 * @returns {Promise<string[] | null>}
 */
export async function fetchAuthorisedParcelIds(request) {
  const sbi = request.auth?.credentials?.sbi
  try {
    return await authorisedParcelIds.call(sbi, request)
  } catch (error) {
    logHandledError(error, request, {
      fallbackCode: LogCodes.SYSTEM.EXTERNAL_API_ERROR,
      fallbackDetails: { endpoint: `fetch authorised parcel ids for sbi ${sbi}`, service: 'consolidated-view' }
    })
    return null
  }
}

/**
 * @param {unknown} sbi
 * @returns {Promise<void>}
 */
export async function clearParcelCache(sbi) {
  await Promise.all([
    authorisedParcelIds.drop(sbi),
    parcelActionsVersion.drop(sbi),
    ...SBI_PARCEL_FIELDS.map((fields) => sbiParcels.drop(sbiParcelsKey(sbi, fields)))
  ])
}

/**
 * @import { Server } from '@hapi/hapi'
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */

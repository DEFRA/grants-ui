import { fetchAuthorisedParcelIds } from '~/src/server/land-grants/services/parcel-cache.js'
import { parseLandParcel } from '~/src/shared/format-parcel.js'

/**
 * The parcel named by `request.params.parcelId` when the signed-in user holds
 * it, else null. A failed lookup counts as not authorised.
 * @param {Request} request
 * @returns {Promise<{ formRequest: AnyFormRequest, sheetId: string, parcelId: string } | null>}
 */
export async function getAuthorisedParcel(request) {
  const formRequest = /** @type {AnyFormRequest} */ (/** @type {unknown} */ (request))
  const { parcelId: compoundParcelId } = request.params

  const authorisedParcelIds = await fetchAuthorisedParcelIds(formRequest)
  if (!authorisedParcelIds?.includes(compoundParcelId)) {
    return null
  }

  const [sheetId, parcelId] = parseLandParcel(compoundParcelId)
  return { formRequest, sheetId, parcelId }
}

/**
 * @import { Request } from '@hapi/hapi'
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */

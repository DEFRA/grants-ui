import { fetchParcels, fetchParcelTileLocation } from '../services/land-grants.service.js'
import { stringifyParcel } from '../utils/format-parcel.js'
import { getParcelIdsFromPayload } from '../utils/parcel-request.utils.js'
import { setCachedTileParcelIds } from '../services/parcel-cache.js'
import QuestionPageWithParcelCheckController from '~/src/server/common/controllers/question-page-with-parcel-check.controller.js'

/**
 * Build a parcel metadata array for the client — used by the map tooltip to
 * display area and actions count. Geometry comes from the tile server.
 * @param {Array<{sheetId: string, parcelId: string, area?: {value?: string|number}}>} parcels
 * @param {Record<string, {actionsObj?: Record<string, unknown>}>} landParcelsState
 * @returns {Array<{id: string, sheetId: string, parcelId: string, areaHa: number | null, actionsCount: number}>}
 */
function buildParcelMeta(parcels, landParcelsState) {
  return parcels.map((parcel) => {
    const id = stringifyParcel(parcel)
    const areaHa = parcel.area?.value == null ? null : Number(parcel.area.value)
    const actionsCount = Object.keys(landParcelsState[id]?.actionsObj ?? {}).length
    return { id, sheetId: parcel.sheetId, parcelId: parcel.parcelId, areaHa, actionsCount }
  })
}

/**
 * Map-based land parcel selection controller. Geometry is served via the tile
 * proxy — no fake GeoJSON geometry is generated server-side.
 *
 * GET  — fetches parcels, caches IDs for tile proxy, renders map view
 * POST — reads selected parcel IDs from hidden inputs, validates, saves to state
 *
 * To use in a form definition YAML:
 *   controller: MapSelectLandParcelPageController
 */
export default class MapSelectLandParcelPageController extends QuestionPageWithParcelCheckController {
  viewName = 'map-select-land-parcel'

  /**
   * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyFormRequest} request
   * @returns {string[] | null}
   */
  resolveParcelIds(request) {
    return null
  }

  /**
   * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyFormRequest} request
   * @param {import('@defra/forms-engine-plugin/engine/types.js').FormContext} context
   * @param {Pick<import('@hapi/hapi').ResponseToolkit, 'redirect' | 'view'>} h
   */
  async handleGet(request, context, h) {
    const { state } = context
    const landParcelsState = /** @type {Record<string, {actionsObj?: Record<string, unknown>}>} */ (state.landParcels ?? {})

    /** @type {import('../view-models/parcel.view-model.js').Parcel[]} */
    let parcels = []
    try {
      parcels = await fetchParcels(request)
    } catch {
      // render with empty parcel list if fetch fails
    }

    const parcelIds = parcels.map((p) => stringifyParcel(p))
    const parcelMeta = buildParcelMeta(parcels, landParcelsState)
    const totalAreaHa = parcels.reduce((sum, p) => sum + (p.area?.value == null ? 0 : Number(p.area.value)), 0)

    // Cache parcel IDs keyed by SBI so the tile proxy can look them up from GET requests
    const sbi = request.auth?.credentials?.sbi ?? 'spike'
    setCachedTileParcelIds(sbi, parcelIds)

    const tileLocation = parcelIds.length ? await fetchParcelTileLocation(parcelIds) : null

    return h.view(this.viewName, {
      ...super.getViewModel(request, context),
      pageTitle: 'Select your land parcels',
      parcelMeta: JSON.stringify(parcelMeta),
      parcelIds: JSON.stringify(parcelIds),
      tileLocation: JSON.stringify(tileLocation),
      totalAreaHa: totalAreaHa > 0 ? totalAreaHa.toFixed(4) : null,
      parcelCount: parcels.length,
      formAction: request.path
    })
  }

  /**
   * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyFormRequest} request
   * @param {import('@defra/forms-engine-plugin/engine/types.js').FormContext} context
   * @param {Pick<import('@hapi/hapi').ResponseToolkit, 'redirect' | 'view'>} h
   */
  async handlePost(request, context, h) {
    const { state } = context
    const selectedParcelIds = getParcelIdsFromPayload(request)

    /** @type {import('../view-models/parcel.view-model.js').Parcel[]} */
    let fetchedParcels = []
    try {
      fetchedParcels = await fetchParcels(request)
    } catch {
      // proceed without metadata if fetch fails
    }

    if (!selectedParcelIds.length) {
      return h.view(this.viewName, {
        ...super.getViewModel(request, context),
        pageTitle: 'Select your land parcels',
        parcelMeta: JSON.stringify(buildParcelMeta(fetchedParcels, /** @type {Record<string, {actionsObj?: Record<string, unknown>}>} */ (state.landParcels ?? {}))),
        parcelIds: JSON.stringify(fetchedParcels.map((p) => stringifyParcel(p))),
        formAction: request.path,
        errors: 'Select at least one land parcel on the map'
      })
    }

    const parcelMap = new Map(fetchedParcels.map((p) => [stringifyParcel(p), p]))
    const landParcelMetadata = selectedParcelIds.map((id) => {
      const parcel = parcelMap.get(id)
      const rawArea = parcel?.area?.value
      const areaHa = rawArea == null ? null : Number(rawArea)
      return { parcelId: id, areaHa }
    })
    const totalHectaresForSelectedParcels =
      landParcelMetadata.reduce((sum, { areaHa }) => sum + (areaHa ?? 0), 0)

    const landParcels = Object.fromEntries(
      selectedParcelIds.map((id) => {
        const parcel = parcelMap.get(id)
        const size = parcel?.size ?? parcel?.area ?? {}
        const existing = state.landParcels?.[id]
        return [id, { size, actionsObj: existing?.actionsObj ?? {} }]
      })
    )

    await this.mergeState(request, state, {
      landParcels,
      landParcelsDisplay: selectedParcelIds.join(', '),
      landParcelMetadata,
      totalHectaresForSelectedParcels
    })

    return this.proceed(request, h, `${this.getNextPath(context)}?parcelId=${selectedParcelIds[0]}`)
  }
}

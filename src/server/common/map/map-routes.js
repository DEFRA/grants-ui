import Joi from 'joi'

/** Every map route path in one place, so handlers and the mock plugin agree. */
export const ROUTES = {
  parcels: '/api/map/parcels',
  parcelsMockGeojson: '/api/map/parcels/geojson',
  parcelTiles: '/api/map/parcel-tiles/{z}/{x}/{y}',
  osBasemap: '/api/map/os-basemap',
  osTiles: '/api/map/os-tiles/{z}/{x}/{y}'
}

// Shared by both tile routes. NOTE: this single schema is wrong for both routes
// by construction — the OS and parcel tile services have different valid zoom
// ranges — and it places no upper bound on z/x/y forwarded to a metered key.
// Stage 6 replaces it with two per-route schemas that clamp the range.
export const tileParamsValidation = {
  params: Joi.object({
    z: Joi.number().integer().min(0).required(),
    x: Joi.number().integer().min(0).required(),
    y: Joi.number().integer().min(0).required()
  })
}

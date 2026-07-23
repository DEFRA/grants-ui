/** Every map route path in one place, so handlers and the mock plugin agree. */
export const ROUTES = {
  parcels: '/api/map/parcels',
  parcelsMockGeojson: '/api/map/parcels/geojson',
  parcelTiles: '/api/map/parcel-tiles/{z}/{x}/{y}',
  osBasemap: '/api/map/os-basemap',
  osTiles: '/api/map/os-tiles/{z}/{x}/{y}'
}

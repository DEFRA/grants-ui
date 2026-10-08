import expect from '../support/expect.js'

export default class GeospatialField {
  constructor(page, label) {
    this.field = page.locator('.app-geospatial-field').filter({ has: page.getByLabel(label, { exact: true }) })
  }

  async addPoint(description) {
    const value = JSON.stringify([
      {
        id: 'acceptance-location',
        type: 'Feature',
        properties: {
          description,
          coordinateGridReference: 'SJ 61896 71377',
          centroidGridReference: 'SJ 61896 71377'
        },
        geometry: {
          type: 'Point',
          coordinates: [-2.5723699, 53.2380485]
        }
      }
    ])
    // Populate the submitted field directly: these journeys exercise form data,
    // not map rendering or the external Ordnance Survey service.
    const input = this.field.locator('textarea')
    await input.evaluate((element, geojson) => {
      element.value = geojson
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
    }, value)
    await expect(input).toHaveValue(value)
  }
}

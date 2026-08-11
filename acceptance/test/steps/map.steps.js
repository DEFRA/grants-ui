import { Given, When, Then } from '@cucumber/cucumber'
import expect from '../support/expect.js'

Given('the map has the following land parcels available for selection', async function (dataTable) {
  const parcels = dataTable.hashes().map((row) => ({ id: row.PARCEL, areaHa: Number(row.HECTARES) }))
  await this.page.waitForLoadState('domcontentloaded')
  await this.page.evaluate((parcels) => {
    document.getElementById('parcel-map').dispatchEvent(
      new CustomEvent('parcel-map:ready', {
        bubbles: true,
        detail: {
          parcelIds: parcels.map((p) => p.id),
          metaIndex: Object.fromEntries(parcels.map((p) => [p.id, { areaHa: p.areaHa }]))
        }
      })
    )
  }, parcels)
})

When('the user selects parcel {string} of area {string} hectares on the map', async function (parcelId, areaHa) {
  await this.page.waitForLoadState('domcontentloaded')
  await this.page.evaluate(
    ({ id, areaHa }) => {
      const [sheetId, parcelNumber] = id.split('-')
      document.getElementById('parcel-map').dispatchEvent(
        new CustomEvent('parcel-map:selection', {
          bubbles: true,
          detail: { selectedParcels: [{ id, sheet_id: sheetId, parcel_id: parcelNumber, areaHa: Number(areaHa) }] }
        })
      )
    },
    { id: parcelId, areaHa }
  )
})

When('the user decides to change their selected parcel', async function () {
  await this.page.waitForLoadState('domcontentloaded')
  await this.page.evaluate(() => {
    document.getElementById('parcel-map').dispatchEvent(
      new CustomEvent('parcel-map:selection', {
        bubbles: true,
        detail: { selectedParcels: [] }
      })
    )
  })
})

Then(
  '(the user )should see {string} totalling {string} hectares in the selected parcel summary',
  async function (parcelId, area) {
    await expect(this.page.locator('#selected-parcel-reference')).toHaveText(parcelId)
    await expect(this.page.locator('#selected-parcel-area')).toHaveText(`${area} hectares`)
  }
)

Then('(the user )should not see a selected parcel summary', async function () {
  await expect(this.page.locator('#selected-parcel-details')).toBeHidden()
})

Then(
  '(the user )should see {string} has {int} available land parcels totalling {string} hectares',
  async function (organisationName, count, totalArea) {
    await expect(this.page.locator('#parcel-map-totals caption')).toHaveText(organisationName)
    await expect(this.page.locator('#parcel-map-total-count')).toHaveText(String(count))
    await expect(this.page.locator('#parcel-map-total-area')).toHaveText(totalArea)
  }
)

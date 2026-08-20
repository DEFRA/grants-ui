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

// Intercepts only the informational selected-parcel consent lookup, so the
// rest of the journey (including the availability route) still hits the app.
Given('the selected parcel consent lookup returns', async function (dataTable) {
  const noticeByParcel = Object.fromEntries(
    dataTable.hashes().map((row) => [row.PARCEL.replace(' ', '-'), row.NOTICE ?? ''])
  )
  await this.page.route(/\/api\/land-grants\/actions\/[^/]+\/consents$/, (route) => {
    const compoundParcelId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2))
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: noticeByParcel[compoundParcelId] ?? '' })
    })
  })
})

When('the user selects parcel {string} of area {string} hectares on the map', async function (parcelId, areaHa) {
  await this.page.waitForLoadState('domcontentloaded')
  await this.page.evaluate(
    ({ id, areaHa }) => {
      const [sheetId, parcelNumber] = id.split(' ')
      const compoundId = `${sheetId}-${parcelNumber}`
      document.getElementById('parcel-map').dispatchEvent(
        new CustomEvent('parcel-map:selection', {
          bubbles: true,
          detail: {
            selectedParcels: [{ id: compoundId, sheet_id: sheetId, parcel_id: parcelNumber, areaHa: Number(areaHa) }]
          }
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
  '(the user )should see additional details {string} in the selected parcel summary',
  async function (requirementText) {
    await expect(this.page.locator('#selected-parcel-additional-details-row')).toBeVisible()
    await expect(this.page.locator('#selected-parcel-additional-details')).toHaveText(requirementText)
  }
)

Then('(the user )should not see additional details in the selected parcel summary', async function () {
  await expect(this.page.locator('#selected-parcel-additional-details-row')).toBeHidden()
})

Then(
  '(the user )should see {string} has {int} available land parcels totalling {string} hectares',
  async function (organisationName, count, totalArea) {
    await expect(this.page.locator('#parcel-map-totals caption')).toHaveText(organisationName)
    await expect(this.page.locator('#parcel-map-total-count')).toHaveText(String(count))
    await expect(this.page.locator('#parcel-map-total-area')).toHaveText(totalArea)
  }
)

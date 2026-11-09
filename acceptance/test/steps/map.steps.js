import { Given, Then, When } from '@cucumber/cucumber'
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
    await expect(this.page.locator('#selected-parcel-area')).toHaveText(`${area} ha`)
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

Then('(the user )should see the following requirements applied to the land parcel', async function (dataTable) {
  const [intro, ...expectedItems] = dataTable.raw().map((row) => row[0])
  await expect(this.page.locator('#selected-parcel-requirements-intro')).toHaveText(intro)
  const items = this.page.locator('#selected-parcel-requirements-list li')
  await expect(items).toHaveText(expectedItems)
})

// The map bundle is stubbed out in the world, so the map itself never renders: check the
// view's hidden state rather than its visibility, which needs a non-empty bounding box.
Then('(the user )should see the land parcels on a map', async function () {
  await expect(this.page.locator('#parcel-map-view')).not.toHaveAttribute('hidden')
  await expect(this.page.locator('#land-parcels')).toBeHidden()
  await expect(this.page.locator('#parcel-view-toggle')).toHaveText('View parcels as a list')
})

Then('(the user )should see the following land parcels as a list', async function (dataTable) {
  await expect(this.page.locator('#land-parcels')).toBeVisible()
  await expect(this.page.locator('#parcel-map-view')).toHaveAttribute('hidden')
  await expect(this.page.locator('#parcel-view-toggle')).toHaveText('View parcels on a map')
  const rows = dataTable.hashes()
  const items = this.page.locator('#land-parcels .parcel-list-item')
  await expect(items).toHaveCount(rows.length)
  for (const [index, row] of rows.entries()) {
    const item = items.nth(index)
    await expect(item.locator('[id$="-reference"]')).toHaveText(row.PARCEL)
    await expect(item.locator('[id$="-hint"]')).toContainText(`Total area: ${row['TOTAL AREA']}`)
    const tag = item.locator('.parcel-list-tag')
    if (row.STATUS) {
      await expect(tag).toHaveText(row.STATUS)
    } else {
      await expect(tag).toHaveCount(0)
    }
  }
})

Then(
  '(the user )should see the following details for land parcel {string} in the list',
  async function (reference, dataTable) {
    const panel = this.page.locator(`[data-parcel-details="${reference.replace(' ', '-')}"]`)
    await expect(panel).toBeVisible()
    for (const row of dataTable.hashes()) {
      // Rows for unavailable details stay in the DOM but hidden, so match visible rows only.
      const detail = panel
        .locator('.govuk-summary-list__row:visible')
        .filter({ has: this.page.locator('dt', { hasText: row.FIELD }) })
      await expect(detail.locator('dd')).toHaveText(row.VALUE)
    }
  }
)

Then(
  '(the user )should see the following requirements for land parcel {string} in the list',
  async function (reference, dataTable) {
    const [intro, ...expectedItems] = dataTable.raw().map((row) => row[0])
    const panel = this.page.locator(`[data-parcel-details="${reference.replace(' ', '-')}"]`)
    await expect(panel.locator('[data-parcel-requirements-intro]')).toHaveText(intro)
    await expect(panel.locator('[data-parcel-requirements-list] li')).toHaveText(expectedItems)
  }
)

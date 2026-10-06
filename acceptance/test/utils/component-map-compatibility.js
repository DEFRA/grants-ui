import { expect as playwrightExpect } from '@playwright/test'

const expect = playwrightExpect.configure({ timeout: 15000 })

const CASES = [
  {
    name: 'latlong',
    type: 'latlongfield',
    values: ['51.5039908', '0'],
    changed: ['51.5074', '-0.1276'],
    center: [0, 51.5039908],
    changedCenter: [-0.1276, 51.5074]
  },
  {
    name: 'grid',
    type: 'eastingnorthingfield',
    values: ['530000', '180000'],
    changed: ['531000', '181000'],
    center: [-0.1283539, 51.5039908],
    changedCenter: [-0.1135832, 51.5127467]
  },
  {
    name: 'reference',
    type: 'osgridreffield',
    values: ['TQ 30000 80000'],
    changed: ['TQ 31000 81000'],
    center: [-0.1283539, 51.5039908],
    changedCenter: [-0.1135832, 51.5127467]
  }
]
const STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eee' } }]
}

/** Load the deployed bundle and CSS, substituting only the document and external map services. */
export async function openComponentMapFixture(page) {
  const response = await page.request.get('/public/assets-manifest.json')
  expect(response.ok()).toBe(true)
  const assets = await response.json()
  expect(assets['application.js']).toEqual(expect.any(String))
  expect(assets['application.css']).toEqual(expect.any(String))
  expect(assets['map.css']).toEqual(expect.any(String))

  await page.route('**/api/maps/vts/*.json', (route) => route.fulfill({ json: STYLE }))
  await page.route('**/api/geocode-proxy?*', (route) =>
    route.fulfill({
      json: {
        results: [
          { GAZETTEER_ENTRY: { NAME1: 'SW1A 1AA', LOCAL_TYPE: 'Postcode', GEOMETRY_X: 530000, GEOMETRY_Y: 180000 } }
        ]
      }
    })
  )
  const fields = CASES.map(
    ({ name, type, values }) => `
    <div id="${name}" class="app-location-field" data-locationtype="${type}">
      <div class="app-location-field-inputs">${values
        .map(
          (value, index) =>
            `<input class="govuk-input" name="${name}__${index}" value="${value}" aria-label="${name} coordinate ${index}" />`
        )
        .join('')}</div>
    </div>`
  ).join('')
  await page.route('**/component-map-compatibility', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><head><title>Map dependency compatibility</title>
      <link rel="stylesheet" href="/public/${assets['application.css']}" />
      <link rel="stylesheet" href="/public/${assets['map.css']}" />
      <style>body { margin: 20px; } .app-location-field { margin-bottom: 30px; }</style>
      </head><body class="js-enabled"><form>${fields}
      <div id="help" class="app-location-field" data-locationtype="latlongfield">
        <div class="app-location-field-inputs"><input class="govuk-input" name="help__latitude" value="51.5074" />
        <input class="govuk-input" name="help__longitude" value="-0.1276" /></div>
      </div>
      <div id="empty" class="app-location-field" data-locationtype="latlongfield">
        <div class="app-location-field-inputs"><input class="govuk-input" name="empty__latitude" value="" />
        <input class="govuk-input" name="empty__longitude" value="" /></div>
      </div>
      <div id="overview" class="app-location-field" data-locationtype="latlongfield">
        <div class="app-location-field-inputs"><input class="govuk-input" name="overview__latitude" value="" />
        <input class="govuk-input" name="overview__longitude" value="" /></div>
      </div><button type="submit">Continue</button></form>
      <div id="component-map-settings" data-map-postcode="SW1A 1AA" hidden>
        <div data-map-component="help" data-hide-map-help-panel="false"></div>
        <div data-map-component="overview" data-zoom-to-postcode="false"></div>
      </div><script>window.componentMapsEnabled = true</script>
      <script type="module" src="/public/${assets['application.js']}"></script></body></html>`
    })
  )
  await page.goto('/component-map-compatibility')
}

async function expectMapView(page, field, index, center, { marker = true } = {}) {
  await expect(field.locator('.maplibregl-canvas')).toBeVisible()
  if (marker) {
    await expect(field.locator('.im-c-marker')).toBeVisible()
  } else {
    await expect(field.locator('.im-c-marker')).toHaveCount(0)
  }
  // The map pads its view around controls; inspect geographic centre rather than the pin's pixel position.
  await expect
    .poll(() => {
      const value = new URL(page.url()).searchParams.get(`map_${index}:center`)
      if (!value) {
        return Infinity
      }
      const [long, lat] = value.split(',').map(Number)
      return Math.hypot(long - center[0], lat - center[1])
    })
    .toBeLessThan(0.00001)
}

/** Real clicks must emit the dependency's marker event and update the form inputs. */
export async function verifyComponentMapCompatibility(page, errors) {
  for (const [index, { name, type, values, changed, center, changedCenter }] of CASES.entries()) {
    const field = page.locator(`#${name}`)
    const inputs = field.locator('input.govuk-input')
    await expectMapView(page, field, index, center)
    await expect(field.locator('[id$="-panel-info"]')).toHaveCount(0)
    for (const [index, value] of values.entries()) {
      await expect(inputs.nth(index)).toHaveValue(value)
    }
    for (const [index, value] of changed.entries()) {
      await inputs.nth(index).fill(value)
      await inputs.nth(index).blur()
    }
    await expectMapView(page, field, index, changedCenter)
    const canvas = field.locator('.maplibregl-canvas')
    const size = await canvas.boundingBox()
    await canvas.click({ position: { x: size.width / 2 + 80, y: size.height / 2 + 50 } })
    await expect(inputs.first()).not.toHaveValue(changed[0])
    if (type === 'latlongfield') {
      await expect(inputs.nth(0)).toHaveValue(/^51\.\d{7}$/)
      await expect(inputs.nth(1)).toHaveValue(/^-0\.\d{7}$/)
    } else if (type === 'eastingnorthingfield') {
      await expect(inputs.nth(0)).toHaveValue(/^\d{6}$/)
      await expect(inputs.nth(1)).toHaveValue(/^\d{6}$/)
    } else {
      await expect(inputs.first()).toHaveValue(/^TQ \d{5} \d{5}$/)
    }
  }
  // A zero longitude must also work after a change, not just when loading a saved answer.
  const longitude = page.locator('#latlong input').nth(1)
  await longitude.fill('0')
  await longitude.blur()
  const latitude = Number(await page.locator('#latlong input').first().inputValue())
  await expectMapView(page, page.locator('#latlong'), 0, [0, latitude])
  const empty = page.locator('#empty')
  await expectMapView(page, empty, 4, [-0.1283539, 51.5039908], { marker: false })
  await expectMapView(page, page.locator('#overview'), 5, [-2.421975, 53.825564], { marker: false })
  expect(new URL(page.url()).searchParams.get('map_4:zoom')).toBe('10')
  expect(new URL(page.url()).searchParams.get('map_5:zoom')).toBe('6')
  await empty.locator('input').first().fill('51.5074')
  await empty.locator('input').first().blur()
  await expect(empty.locator('.im-c-marker')).toHaveCount(0)
  await empty.locator('input').nth(1).fill('0')
  await empty.locator('input').nth(1).blur()
  await expectMapView(page, empty, 4, [0, 51.5074])
  const help = page.locator('#help [id$="-panel-info"]')
  await expect(help).toBeVisible()
  await expect(help).toContainText('How to use the map')
  await help.locator('.im-c-panel__close').click()
  await expect(help).toBeHidden()
  expect(errors).toEqual([])
}

import { componentMapOptions } from './component-map-options.js'

describe('componentMapOptions', () => {
  test.each([undefined, {}, { collection: {} }, { collection: { fields: [] } }])(
    'handles pages without map fields (%j)',
    (page) => expect(componentMapOptions(page)).toEqual([])
  )

  test.each(['OsGridRefField', 'EastingNorthingField', 'LatLongField', 'GeospatialField'])(
    'enables both options by default for %s',
    (type) => {
      expect(componentMapOptions({ collection: { fields: [{ type, name: 'location' }] } })).toEqual([
        { name: 'location', hideMapHelpPanel: true, zoomToPostcode: true, showApproximateLocation: false }
      ])
    }
  )

  test.each([
    { options: { hideMapHelpPanel: false }, hideMapHelpPanel: false, zoomToPostcode: true },
    { options: { zoomToPostcode: false }, hideMapHelpPanel: true, zoomToPostcode: false },
    { options: { hideMapHelpPanel: false, zoomToPostcode: false }, hideMapHelpPanel: false, zoomToPostcode: false },
    { options: { hideMapHelpPanel: true, zoomToPostcode: true }, hideMapHelpPanel: true, zoomToPostcode: true },
    { options: { hideMapHelpPanel: 'false', zoomToPostcode: null }, hideMapHelpPanel: true, zoomToPostcode: true }
  ])('disables options only for the boolean false ($options)', ({ options, hideMapHelpPanel, zoomToPostcode }) => {
    expect(
      componentMapOptions({ collection: { fields: [{ type: 'OsGridRefField', name: 'location', options }] } })
    ).toEqual([{ name: 'location', hideMapHelpPanel, zoomToPostcode, showApproximateLocation: false }])
  })

  test('keeps per-component options separate and excludes unrelated fields and options', () => {
    const fields = [
      { type: 'OsGridRefField', name: 'location', options: { hideMapHelpPanel: false, unrelated: 'private' } },
      { type: 'GeospatialField', name: 'boundary', options: { zoomToPostcode: false } },
      { type: 'NationalGridFieldNumberField', name: 'grid' },
      { type: 'TextField', name: 'description' }
    ]
    expect(componentMapOptions({ collection: { fields } })).toEqual([
      { name: 'location', hideMapHelpPanel: false, zoomToPostcode: true, showApproximateLocation: false },
      { name: 'boundary', hideMapHelpPanel: true, zoomToPostcode: false, showApproximateLocation: false }
    ])
  })

  test.each(['OsGridRefField', 'EastingNorthingField', 'LatLongField', 'GeospatialField'])(
    'the installed form schema preserves custom map options for %s',
    async (type) => {
      const { componentSchema } = await vi.importActual('@defra/forms-model')
      const options = {
        hideMapHelpPanel: false,
        zoomToPostcode: false,
        showApproximateLocation: true,
        approximateLocationPrefix: 'Nearby location:'
      }
      const { error, value } = componentSchema.validate({ type, name: 'location', title: 'Location', options })
      expect(error).toBeUndefined()
      expect(value.options).toMatchObject(options)
    }
  )

  test.each(['OsGridRefField', 'EastingNorthingField', 'LatLongField', 'GeospatialField'])(
    'enables approximate locations only for supported point fields: %s',
    (type) => {
      const fields = [{ type, name: 'location', options: { showApproximateLocation: true } }]
      expect(componentMapOptions({ collection: { fields } })[0].showApproximateLocation).toBe(
        type !== 'GeospatialField'
      )
    }
  )

  test.each([undefined, false, 'true', 1])('requires a boolean true to show approximate locations (%j)', (setting) => {
    const fields = [{ type: 'LatLongField', name: 'location', options: { showApproximateLocation: setting } }]
    expect(componentMapOptions({ collection: { fields } })[0].showApproximateLocation).toBe(false)
  })

  test.each([undefined, null, false, 123, 'Nearby location:', ''])(
    'exposes only string approximate location prefixes (%j)',
    (prefix) => {
      const fields = [{ type: 'LatLongField', name: 'location', options: { approximateLocationPrefix: prefix } }]
      expect(componentMapOptions({ collection: { fields } })[0].approximateLocationPrefix).toBe(
        typeof prefix === 'string' ? prefix : undefined
      )
    }
  )
})

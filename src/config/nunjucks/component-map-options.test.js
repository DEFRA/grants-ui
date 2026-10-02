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
        { name: 'location', hideMapHelpPanel: true, zoomToPostcode: true }
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
    ).toEqual([{ name: 'location', hideMapHelpPanel, zoomToPostcode }])
  })

  test('keeps per-component options separate and excludes unrelated fields and options', () => {
    const fields = [
      { type: 'OsGridRefField', name: 'location', options: { hideMapHelpPanel: false, unrelated: 'private' } },
      { type: 'GeospatialField', name: 'boundary', options: { zoomToPostcode: false } },
      { type: 'NationalGridFieldNumberField', name: 'grid' },
      { type: 'TextField', name: 'description' }
    ]
    expect(componentMapOptions({ collection: { fields } })).toEqual([
      { name: 'location', hideMapHelpPanel: false, zoomToPostcode: true },
      { name: 'boundary', hideMapHelpPanel: true, zoomToPostcode: false }
    ])
  })

  test.each(['OsGridRefField', 'EastingNorthingField', 'LatLongField', 'GeospatialField'])(
    'the installed form schema preserves custom map options for %s',
    async (type) => {
      const { componentSchema } = await vi.importActual('@defra/forms-model')
      const options = { hideMapHelpPanel: false, zoomToPostcode: false }
      const { error, value } = componentSchema.validate({ type, name: 'location', title: 'Location', options })
      expect(error).toBeUndefined()
      expect(value.options).toMatchObject(options)
    }
  )
})

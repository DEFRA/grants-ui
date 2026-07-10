import { describe, it, expect, vi } from 'vitest'
import {
  COMPOUND_ID_EXPR,
  buildParcelLayers,
  getMapStyle,
  withParcelHitTolerance,
  nearestFeatureToPoint,
  getScreenBounds,
  buildSkeleton,
  buildColorExpr,
  resolveFeatureId,
  showTooltip,
  hideTooltip,
  htmlEncode
} from './map-helpers.js'

describe('buildParcelLayers', () => {
  it('labels with Arial Regular for the OS provider', () => {
    const layers = buildParcelLayers(['match', COMPOUND_ID_EXPR], undefined, 'ordnance-survey')
    expect(layers.label.layout['text-font']).toEqual(['Arial Regular'])
  })

  it('labels with Open Sans Regular for the OpenStreetMap provider', () => {
    const layers = buildParcelLayers(['match', COMPOUND_ID_EXPR], undefined, 'openstreetmap')
    expect(layers.label.layout['text-font']).toEqual(['Open Sans Regular'])
  })

  it('sets source-layer on every layer when provided (vector tiles)', () => {
    const layers = buildParcelLayers(['match', COMPOUND_ID_EXPR], 'parcels', 'ordnance-survey')
    expect(layers.fill['source-layer']).toBe('parcels')
    expect(layers.outline['source-layer']).toBe('parcels')
    expect(layers.label['source-layer']).toBe('parcels')
  })

  it('omits source-layer when not provided (geojson source)', () => {
    const layers = buildParcelLayers(['match', COMPOUND_ID_EXPR], undefined, 'ordnance-survey')
    expect(layers.fill).not.toHaveProperty('source-layer')
  })
})

describe('getMapStyle', () => {
  it('returns the OS Maps style by default', () => {
    const style = getMapStyle('ordnance-survey')
    expect(style.url).toBe('/api/map/os-basemap')
  })

  it('returns the CartoCDN style for openstreetmap', () => {
    const style = getMapStyle('openstreetmap')
    expect(style.url).toBe('https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json')
  })
})

describe('buildColorExpr', () => {
  it('assigns each distinct parcel ID a colour', () => {
    const expr = buildColorExpr(['A-1', 'A-2'])
    expect(expr).toEqual([
      'match',
      COMPOUND_ID_EXPR,
      'A-1',
      expect.any(String),
      'A-2',
      expect.any(String),
      expect.any(String)
    ])
  })

  it('de-duplicates repeated IDs', () => {
    const expr = buildColorExpr(['A-1', 'A-1'])
    // ['match', COMPOUND_ID_EXPR, 'A-1', colour, fallbackColour] — one pair, not two
    expect(expr).toHaveLength(5)
  })
})

describe('resolveFeatureId', () => {
  it('reads the compound id property off a feature', () => {
    const feature = { properties: { id: 'SD7148-9160' } }
    expect(resolveFeatureId(feature)).toBe('SD7148-9160')
  })

  it('returns an empty string when the id is missing', () => {
    expect(resolveFeatureId({ properties: {} })).toBe('')
  })
})

describe('nearestFeatureToPoint', () => {
  it('returns the input unchanged when 0 or 1 features', () => {
    expect(nearestFeatureToPoint(null, { x: 0, y: 0 }, [])).toEqual([])
  })

  it('picks the polygon feature whose bounding box centre is closest to the point', () => {
    const map = { project: ([lng, lat]) => ({ x: lng, y: lat }) }
    const near = {
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2]
          ]
        ]
      }
    }
    const far = {
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [100, 100],
            [102, 100],
            [102, 102],
            [100, 102]
          ]
        ]
      }
    }

    expect(nearestFeatureToPoint(map, { x: 1, y: 1 }, [far, near])).toEqual([near])
  })
})

describe('getScreenBounds', () => {
  it('computes the pixel bounding box of a Polygon', () => {
    const map = { project: ([lng, lat]) => ({ x: lng, y: lat }) }
    const feature = {
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4]
          ]
        ]
      }
    }

    expect(getScreenBounds(map, feature)).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 4 })
  })

  it('flattens MultiPolygon rings', () => {
    const map = { project: ([lng, lat]) => ({ x: lng, y: lat }) }
    const feature = {
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [1, 1]
            ]
          ],
          [
            [
              [5, 5],
              [6, 6]
            ]
          ]
        ]
      }
    }

    expect(getScreenBounds(map, feature)).toEqual({ minX: 0, minY: 0, maxX: 6, maxY: 6 })
  })

  it('returns null when there are no rings', () => {
    const map = { project: vi.fn() }
    const feature = { geometry: { type: 'Polygon', coordinates: [] } }

    expect(getScreenBounds(map, feature)).toBeNull()
  })
})

describe('withParcelHitTolerance', () => {
  function makeDescriptor(baseGetFeaturesAtPoint) {
    class BaseProvider {
      getFeaturesAtPoint(...args) {
        return baseGetFeaturesAtPoint(...args)
      }
    }
    return {
      load: vi.fn().mockResolvedValue({ MapProvider: BaseProvider })
    }
  }

  it('returns the base provider hits unchanged when there are any', async () => {
    const descriptor = makeDescriptor(() => [{ id: 'hit' }])
    const { MapProvider } = await withParcelHitTolerance(descriptor).load()
    const provider = new MapProvider()
    provider.map = { getLayer: () => true }

    expect(provider.getFeaturesAtPoint({ x: 0, y: 0 })).toEqual([{ id: 'hit' }])
  })

  it('falls back to the nearest rendered parcel within tolerance when there are no exact hits', async () => {
    const descriptor = makeDescriptor(() => [])
    const { MapProvider } = await withParcelHitTolerance(descriptor).load()
    const provider = new MapProvider()
    const nearby = {
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2]
          ]
        ]
      }
    }
    provider.map = {
      getLayer: () => true,
      queryRenderedFeatures: vi.fn().mockReturnValue([nearby]),
      project: ([lng, lat]) => ({ x: lng, y: lat })
    }

    expect(provider.getFeaturesAtPoint({ x: 1, y: 1 })).toEqual([nearby])
  })

  it('returns no hits when the parcels layer is not on the map', async () => {
    const descriptor = makeDescriptor(() => [])
    const { MapProvider } = await withParcelHitTolerance(descriptor).load()
    const provider = new MapProvider()
    provider.map = { getLayer: () => false }

    expect(provider.getFeaturesAtPoint({ x: 0, y: 0 })).toEqual([])
  })
})

describe('buildSkeleton', () => {
  it('builds an accessible loading status element', () => {
    const el = buildSkeleton()
    expect(el.getAttribute('role')).toBe('status')
    expect(el.textContent).toBe('Loading map…')
  })
})

describe('tooltip helpers', () => {
  it('shows area and parcel id, escaping HTML in the id', () => {
    const tooltip = document.createElement('div')
    showTooltip(tooltip, '<b>SD1</b>', { areaHa: 2.5 }, 10, 20, null)

    expect(tooltip.style.display).toBe('block')
    expect(tooltip.innerHTML).toContain('&lt;b&gt;SD1&lt;/b&gt;')
    expect(tooltip.innerHTML).toContain('2.50 ha')
  })

  it('falls back to "Unknown parcel"/"Unknown" when id/area are missing', () => {
    const tooltip = document.createElement('div')
    showTooltip(tooltip, '', {}, 0, 0, null)

    expect(tooltip.innerHTML).toContain('Unknown parcel')
    expect(tooltip.innerHTML).toContain('Unknown')
  })

  it('hides the tooltip', () => {
    const tooltip = document.createElement('div')
    tooltip.style.display = 'block'
    hideTooltip(tooltip)

    expect(tooltip.style.display).toBe('none')
  })
})

describe('htmlEncode', () => {
  it('escapes HTML-significant characters', () => {
    expect(htmlEncode('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})

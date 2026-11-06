// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fitToParcels } from './helpers.js'
import { attachParcelLabels } from './labels.js'
import { makeMlMap } from './test-helpers.js'
import { CLUSTER_EXPAND_MAX_ZOOM } from './config.js'

const polygon = (rings) => ({ type: 'Polygon', coordinates: [rings] })

function setup({ sourceFeatures = [] } = {}) {
  const setData = vi.fn()
  const ml = makeMlMap({
    getSource: vi.fn().mockReturnValue({ setData }),
    querySourceFeatures: vi.fn().mockReturnValue(sourceFeatures)
  })
  const cleanups = []
  attachParcelLabels({ ml, cleanups })
  return { ml, setData, cleanups }
}

describe('attachParcelLabels', () => {
  it('registers an idle listener and an off() cleanup for it', () => {
    const { ml, cleanups } = setup()
    expect(ml.on).toHaveBeenCalledWith('idle', expect.any(Function))

    cleanups.forEach((off) => off())
    expect(ml.off).toHaveBeenCalledWith('idle', expect.any(Function))
  })

  it('wires up click-to-zoom and a pointer-cursor mousemove on the cluster badge layer, with matching cleanups', () => {
    const { ml, cleanups } = setup()
    expect(ml.on).toHaveBeenCalledWith('click', 'parcels-label-cluster', expect.any(Function))
    expect(ml.on).toHaveBeenCalledWith('mousemove', expect.any(Function))

    cleanups.forEach((off) => off())
    expect(ml.off).toHaveBeenCalledWith('click', 'parcels-label-cluster', expect.any(Function))
    expect(ml.off).toHaveBeenCalledWith('mousemove', expect.any(Function))
  })

  it('does nothing until the map goes idle', () => {
    const { setData } = setup()
    expect(setData).not.toHaveBeenCalled()
  })

  it('only calls setData once when repeated idles produce the same features, avoiding an idle -> setData -> render -> idle cycle', () => {
    const feature = {
      properties: { id: 'SD7148-9160' },
      geometry: polygon([
        [-2.5, 51.4],
        [-2.4, 51.4],
        [-2.4, 51.5],
        [-2.5, 51.5]
      ])
    }
    const { ml, setData } = setup({ sourceFeatures: [feature] })

    ml._emit('idle')
    ml._emit('idle')
    ml._emit('idle')

    expect(setData).toHaveBeenCalledTimes(1)
  })

  it('calls setData again once the underlying features actually change', () => {
    const feature = {
      properties: { id: 'SD7148-9160' },
      geometry: polygon([
        [-2.5, 51.4],
        [-2.4, 51.4],
        [-2.4, 51.5],
        [-2.5, 51.5]
      ])
    }
    const querySourceFeatures = vi.fn().mockReturnValue([feature])
    const setData = vi.fn()
    const ml = makeMlMap({
      getSource: vi.fn().mockReturnValue({ setData }),
      querySourceFeatures
    })
    attachParcelLabels({ ml, cleanups: [] })

    ml._emit('idle')
    expect(setData).toHaveBeenCalledTimes(1)

    const moved = {
      ...feature,
      geometry: polygon([
        [-2.9, 51.4],
        [-2.8, 51.4],
        [-2.8, 51.5],
        [-2.9, 51.5]
      ])
    }
    querySourceFeatures.mockReturnValue([moved])
    ml._emit('idle')

    expect(setData).toHaveBeenCalledTimes(2)
  })

  it('builds one labelled point per parcel id from its rendered fragment', () => {
    const feature = {
      properties: { id: 'SD7148-9160' },
      geometry: polygon([
        [-2.5, 51.4],
        [-2.4, 51.4],
        [-2.4, 51.5],
        [-2.5, 51.5]
      ])
    }
    const { ml, setData } = setup({ sourceFeatures: [feature] })

    ml._emit('idle')

    expect(setData).toHaveBeenCalledTimes(1)
    const collection = setData.mock.calls[0][0]
    expect(collection.features).toHaveLength(1)
    expect(collection.features[0]).toMatchObject({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-2.45, 51.45] },
      properties: { id: 'SD7148-9160', label: 'SD7148 9160' }
    })
  })

  it('merges every fragment sharing an id into one point, so a parcel split across tiles labels once', () => {
    // Two fragments of the same parcel, as a vector source would deliver for a
    // polygon clipped at a tile boundary — disjoint boxes, same id.
    const west = {
      properties: { id: 'SD7148-9160' },
      geometry: polygon([
        [-2.5, 51.4],
        [-2.45, 51.4],
        [-2.45, 51.5],
        [-2.5, 51.5]
      ])
    }
    const east = {
      properties: { id: 'SD7148-9160' },
      geometry: polygon([
        [-2.45, 51.4],
        [-2.4, 51.4],
        [-2.4, 51.5],
        [-2.45, 51.5]
      ])
    }
    const { ml, setData } = setup({ sourceFeatures: [west, east] })

    ml._emit('idle')

    const collection = setData.mock.calls[0][0]
    expect(collection.features).toHaveLength(1)
    // Centre of the combined bounds across both fragments, not either fragment alone.
    expect(collection.features[0].geometry.coordinates).toEqual([-2.45, 51.45])
  })

  it('gives two distinct parcels two distinct labels', () => {
    const a = {
      properties: { id: 'SD7148-9160' },
      geometry: polygon([
        [-2.5, 51.4],
        [-2.49, 51.4],
        [-2.49, 51.41],
        [-2.5, 51.41]
      ])
    }
    const b = {
      properties: { id: 'SD7148-9161' },
      geometry: polygon([
        [-2.3, 51.6],
        [-2.29, 51.6],
        [-2.29, 51.61],
        [-2.3, 51.61]
      ])
    }
    const { ml, setData } = setup({ sourceFeatures: [a, b] })

    ml._emit('idle')

    const ids = setData.mock.calls[0][0].features.map((f) => f.properties.id)
    expect(ids.sort()).toEqual(['SD7148-9160', 'SD7148-9161'])
  })

  it('skips fragments with no usable id and does nothing when the label source is missing', () => {
    const untagged = {
      properties: {},
      geometry: polygon([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1]
      ])
    }
    const { ml, setData } = setup({ sourceFeatures: [untagged] })

    ml._emit('idle')
    expect(setData.mock.calls[0][0].features).toHaveLength(0)

    const noSource = makeMlMap({ getSource: vi.fn().mockReturnValue(undefined) })
    attachParcelLabels({ ml: noSource, cleanups: [] })
    expect(() => noSource._emit('idle')).not.toThrow()
  })

  describe('cluster click-to-zoom', () => {
    function setupCluster({ clusterId = 5, pointCount = 8, leaves = [] } = {}) {
      const getClusterLeaves = vi.fn().mockResolvedValue(leaves)
      const fitBounds = vi.fn()
      const ml = makeMlMap({
        getSource: vi.fn().mockReturnValue({ getClusterLeaves }),
        fitBounds
      })
      attachParcelLabels({ ml, cleanups: [] })
      const cluster = {
        properties: { cluster_id: clusterId, point_count: pointCount },
        geometry: { type: 'Point', coordinates: [-2.45, 51.45] }
      }
      return { ml, fitBounds, getClusterLeaves, cluster }
    }

    it('fits the viewport to the bounding box of the parcels the cluster groups, on click', async () => {
      const leaves = [
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-2.5, 51.4] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-2.4, 51.5] } }
      ]
      const { ml, fitBounds, getClusterLeaves, cluster } = setupCluster({ pointCount: 2, leaves })

      ml._emitLayer('click', 'parcels-label-cluster', { features: [cluster] })
      expect(getClusterLeaves).toHaveBeenCalledWith(5, 2, 0)
      await vi.waitFor(() =>
        expect(fitBounds).toHaveBeenCalledWith(
          [
            [-2.5, 51.4],
            [-2.4, 51.5]
          ],
          expect.objectContaining({ padding: expect.any(Number) })
        )
      )
    })

    it('caps the zoom at CLUSTER_EXPAND_MAX_ZOOM, so a tight cluster of 2-3 parcels does not zoom in too aggressively', async () => {
      const leaves = [
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-2.45, 51.45] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-2.451, 51.451] } }
      ]
      const { ml, fitBounds, cluster } = setupCluster({ pointCount: 2, leaves })

      ml._emitLayer('click', 'parcels-label-cluster', { features: [cluster] })

      await vi.waitFor(() =>
        expect(fitBounds).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({ maxZoom: CLUSTER_EXPAND_MAX_ZOOM })
        )
      )
    })

    it('does nothing when the click carries no cluster feature', () => {
      const { ml, fitBounds, getClusterLeaves } = setupCluster()

      ml._emitLayer('click', 'parcels-label-cluster', { features: [] })

      expect(getClusterLeaves).not.toHaveBeenCalled()
      expect(fitBounds).not.toHaveBeenCalled()
    })

    it('sets a pointer cursor a frame after mousemove when the point hits a cluster badge, so it wins over the vendor hover-cursor handler', async () => {
      const getClusterLeaves = vi.fn().mockResolvedValue([])
      const ml = makeMlMap({
        getSource: vi.fn().mockReturnValue({ getClusterLeaves }),
        queryRenderedFeatures: vi.fn().mockReturnValue([{ properties: { cluster_id: 5, point_count: 8 } }])
      })
      attachParcelLabels({ ml, cleanups: [] })

      ml._emit('mousemove', { point: { x: 5, y: 5 } })
      // Simulates the vendor's own same-tick 'mousemove' handler clobbering
      // the cursor before our deferred check runs.
      ml.getCanvas().style.cursor = ''

      await vi.waitFor(() => expect(ml.getCanvas().style.cursor).toBe('pointer'))
    })

    it('does not touch the cursor on mousemove when the point misses every cluster badge', async () => {
      const ml = makeMlMap({ queryRenderedFeatures: vi.fn().mockReturnValue([]) })
      attachParcelLabels({ ml, cleanups: [] })
      ml.getCanvas().style.cursor = ''

      ml._emit('mousemove', { point: { x: 5, y: 5 } })
      await new Promise((resolve) => globalThis.requestAnimationFrame(resolve))

      // Left to whichever other handler (e.g. the fill-layer hover, or the
      // vendor's own setupHoverCursor) owns the cursor when no cluster is hit.
      expect(ml.getCanvas().style.cursor).toBe('')
    })
  })

  describe('keeping the cluster badge on top', () => {
    it('moves the cluster layers back to the top when something else (e.g. a selection highlight) is drawn above them', () => {
      const getStyle = vi.fn().mockReturnValue({
        layers: [
          { id: 'parcels-fill' },
          { id: 'parcels-label-cluster' },
          { id: 'parcels-label-cluster-count' },
          { id: 'selected-highlight-parcels-fill-line' }
        ]
      })
      const ml = makeMlMap({ getStyle })
      attachParcelLabels({ ml, cleanups: [] })

      ml._emit('styledata')

      expect(ml.moveLayer).toHaveBeenCalledWith('parcels-label-cluster')
      expect(ml.moveLayer).toHaveBeenCalledWith('parcels-label-cluster-count')
    })

    it('limits selection and keyboard highlights to detail zoom without changing other layers', () => {
      const ml = makeMlMap({
        getStyle: vi
          .fn()
          .mockReturnValue({
            layers: [
              { id: 'selected-highlight-parcels-fill-line', source: 'parcels' },
              { id: 'active-highlight-parcels-fill-line', source: 'parcels', maxzoom: 18 },
              { id: 'active-highlight-other-line', source: 'other' },
              { id: 'parcels-outline', source: 'parcels' },
              { id: 'selected-highlight-parcels-fill-fill', source: 'parcels', minzoom: 11 },
              { id: 'parcels-label-cluster' },
              { id: 'parcels-label-cluster-count' }
            ]
          })
      })
      attachParcelLabels({ ml, cleanups: [] })
      ml._emit('styledata')
      expect(ml.setLayerZoomRange.mock.calls).toEqual([
        ['selected-highlight-parcels-fill-line', 11, 24],
        ['active-highlight-parcels-fill-line', 11, 18]
      ])
      expect(ml.moveLayer).not.toHaveBeenCalled()
    })

    it('does nothing when the cluster layers are already last, avoiding a moveLayer -> styledata -> moveLayer loop', () => {
      const getStyle = vi.fn().mockReturnValue({
        layers: [{ id: 'parcels-fill' }, { id: 'parcels-label-cluster' }, { id: 'parcels-label-cluster-count' }]
      })
      const ml = makeMlMap({ getStyle })
      attachParcelLabels({ ml, cleanups: [] })

      ml._emit('styledata')

      expect(ml.moveLayer).not.toHaveBeenCalled()
    })

    it('does nothing before the cluster layers exist', () => {
      const ml = makeMlMap({ getLayer: vi.fn().mockReturnValue(false) })
      attachParcelLabels({ ml, cleanups: [] })

      expect(() => ml._emit('styledata')).not.toThrow()
      expect(ml.moveLayer).not.toHaveBeenCalled()
    })
  })
  it.each([1, 5])('opens a complete single cluster of %i parcels at detail zoom, including on reset', (count) => {
    const fragment = {
      properties: { id: 'a' },
      geometry: polygon([
        [-2.5, 51.4],
        [-2.4, 51.4],
        [-2.4, 51.5],
        [-2.5, 51.5]
      ])
    }
    const ml = makeMlMap({
      getSource: vi.fn().mockReturnValue({ setData: vi.fn() }),
      querySourceFeatures: vi
        .fn()
        .mockImplementation((source) =>
          source === 'parcels'
            ? Array.from({ length: count }, (_, index) => ({ ...fragment, properties: { id: String(index) } }))
            : [{ properties: count === 1 ? { id: '0' } : { cluster_id: 5, point_count: count } }]
        ),
      cameraForBounds: vi.fn().mockReturnValue({ center: [-2.45, 51.45], zoom: 9 })
    })
    const bbox = { minLng: -2.5, minLat: 51.4, maxLng: -2.4, maxLat: 51.5 }
    attachParcelLabels({
      ml,
      cleanups: [],
      store: { parcelIds: Array.from({ length: count }, (_, index) => String(index)), metaIndex: {}, bbox }
    })
    ml._emit('idle') // update source
    ml._emit('idle') // source clustering has settled
    expect(ml.easeTo).toHaveBeenLastCalledWith({ center: [-2.45, 51.45], zoom: 11, animate: false })
    fitToParcels(ml, bbox, { animate: true })
    expect(ml.easeTo).toHaveBeenLastCalledWith({ center: [-2.45, 51.45], zoom: 11, animate: true })
  })

  it('expands a singleton badge using its parcel bounds, rather than only its label point', () => {
    const ml = makeMlMap({ cameraForBounds: vi.fn().mockReturnValue({ center: [-2.45, 51.45], zoom: 9 }) })
    attachParcelLabels({ ml, cleanups: [] })
    ml._emitLayer('click', 'parcels-label-cluster', {
      features: [
        {
          properties: { id: 'a', minLng: -2.5, minLat: 51.4, maxLng: -2.4, maxLat: 51.5 },
          geometry: { type: 'Point', coordinates: [-2.45, 51.45] }
        }
      ]
    })
    return vi.waitFor(() => {
      expect(ml.cameraForBounds).toHaveBeenCalledWith(
        [
          [-2.5, 51.4],
          [-2.4, 51.5]
        ],
        { padding: 40, maxZoom: 14 }
      )
      expect(ml.easeTo).toHaveBeenCalledWith({ center: [-2.45, 51.45], zoom: 11, animate: true })
    })
  })

  it('waits for all parcels before deciding whether the initial holding has a single cluster', () => {
    const fragment = {
      properties: { id: 'a' },
      geometry: polygon([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1]
      ])
    }
    const ml = makeMlMap({
      getSource: vi.fn().mockReturnValue({ setData: vi.fn() }),
      querySourceFeatures: vi.fn().mockReturnValue([fragment])
    })
    attachParcelLabels({ ml, cleanups: [], store: { parcelIds: ['a', 'b'], metaIndex: {}, bbox: null } })
    ml._emit('idle')
    ml._emit('idle')
    expect(ml.fitBounds).not.toHaveBeenCalled()
    expect(ml.easeTo).not.toHaveBeenCalled()
  })
  it('keeps multiple MapLibre groups in the holding overview', () => {
    const fragments = ['a', 'b'].map((id) => ({
      properties: { id },
      geometry: polygon([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1]
      ])
    }))
    const ml = makeMlMap({
      getSource: vi.fn().mockReturnValue({ setData: vi.fn() }),
      querySourceFeatures: vi
        .fn()
        .mockImplementation((source) =>
          source === 'parcels' ? fragments : [{ properties: { id: 'a' } }, { properties: { id: 'b' } }]
        )
    })
    attachParcelLabels({ ml, cleanups: [], store: { parcelIds: ['a', 'b'], metaIndex: {}, bbox: null } })
    ml._emit('idle')
    ml._emit('idle')
    expect(ml.easeTo).not.toHaveBeenCalled()
    expect(ml.fitBounds).not.toHaveBeenCalled()
  })
})

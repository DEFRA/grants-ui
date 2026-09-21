import { describe, expect, it, vi } from 'vitest'
import { attachParcelLabels } from './parcel-map-labels.js'
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
  attachParcelLabels(ml, cleanups)
  return { ml, setData, cleanups }
}

describe('attachParcelLabels', () => {
  it('registers an idle listener and an off() cleanup for it', () => {
    const { ml, cleanups } = setup()
    expect(ml.on).toHaveBeenCalledWith('idle', expect.any(Function))

    cleanups.forEach((off) => off())
    expect(ml.off).toHaveBeenCalledWith('idle', expect.any(Function))
  })

  it('wires up click-to-zoom and a pointer cursor on the cluster badge layer, with matching cleanups', () => {
    const { ml, cleanups } = setup()
    expect(ml.on).toHaveBeenCalledWith('click', 'parcels-label-cluster', expect.any(Function))
    expect(ml.on).toHaveBeenCalledWith('mouseenter', 'parcels-label-cluster', expect.any(Function))
    expect(ml.on).toHaveBeenCalledWith('mouseleave', 'parcels-label-cluster', expect.any(Function))

    cleanups.forEach((off) => off())
    expect(ml.off).toHaveBeenCalledWith('click', 'parcels-label-cluster', expect.any(Function))
    expect(ml.off).toHaveBeenCalledWith('mouseenter', 'parcels-label-cluster', expect.any(Function))
    expect(ml.off).toHaveBeenCalledWith('mouseleave', 'parcels-label-cluster', expect.any(Function))
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
    attachParcelLabels(ml, [])

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
    attachParcelLabels(noSource, [])
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
      attachParcelLabels(ml, [])
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

    it('shows a pointer cursor over a cluster and restores it on leave', () => {
      const { ml } = setupCluster()

      ml._emitLayer('mouseenter', 'parcels-label-cluster')
      expect(ml.getCanvas().style.cursor).toBe('pointer')

      ml._emitLayer('mouseleave', 'parcels-label-cluster')
      expect(ml.getCanvas().style.cursor).toBe('')
    })
  })
})

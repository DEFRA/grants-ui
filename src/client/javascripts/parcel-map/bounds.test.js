import { describe, expect, it } from 'vitest'
import {
  boundsCentre,
  boundsOfPolygon,
  boundsOfPositions,
  boundsToArray,
  boundsToLngLatPairs,
  unionBounds
} from './bounds.js'

const box = (minLng, minLat, maxLng, maxLat) => ({ minLng, minLat, maxLng, maxLat })

describe('bounds', () => {
  it('unionBounds covers both boxes without modifying either', () => {
    const a = box(-2.5, 51.4, -2.4, 51.5)
    const b = box(-2.45, 51.45, -2.3, 51.6)

    expect(unionBounds(a, b)).toEqual(box(-2.5, 51.4, -2.3, 51.6))
    expect(a).toEqual(box(-2.5, 51.4, -2.4, 51.5))
    expect(b).toEqual(box(-2.45, 51.45, -2.3, 51.6))
  })

  it('boundsOfPositions covers every position, and is null for none', () => {
    expect(
      boundsOfPositions([
        [-2.5, 51.4],
        [-2.4, 51.5],
        [-2.45, 51.3]
      ])
    ).toEqual(box(-2.5, 51.3, -2.4, 51.5))
    expect(boundsOfPositions([[-2.5, 51.4]])).toEqual(box(-2.5, 51.4, -2.5, 51.4))
    expect(boundsOfPositions([])).toBeNull()
  })

  it('boundsOfPolygon covers every ring of a MultiPolygon', () => {
    const geometry = /** @type {GeoJSON.MultiPolygon} */ ({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [-2.5, 51.4],
            [-2.4, 51.4],
            [-2.4, 51.5]
          ]
        ],
        [
          [
            [-2.9, 51.6],
            [-2.8, 51.6],
            [-2.8, 51.7]
          ]
        ]
      ]
    })

    expect(boundsOfPolygon(geometry)).toEqual(box(-2.9, 51.4, -2.4, 51.7))
  })

  it('boundsOfPolygon is null for a polygon with no coordinates', () => {
    expect(boundsOfPolygon(/** @type {GeoJSON.Polygon} */ ({ type: 'Polygon', coordinates: [] }))).toBeNull()
  })

  it('converts to the array, lng/lat pair and centre forms', () => {
    const bounds = box(-2.5, 51.4, -2.3, 51.6)

    expect(boundsToArray(bounds)).toEqual([-2.5, 51.4, -2.3, 51.6])
    expect(boundsToLngLatPairs(bounds)).toEqual([
      [-2.5, 51.4],
      [-2.3, 51.6]
    ])
    expect(boundsCentre(bounds)).toEqual([-2.4, 51.5])
  })

  it('coerces string coordinates in the lng/lat pair form', () => {
    expect(boundsToLngLatPairs(/** @type {any} */ (box('-2.5', '51.4', '-2.3', '51.6')))).toEqual([
      [-2.5, 51.4],
      [-2.3, 51.6]
    ])
  })
})

// @ts-nocheck
import { vi } from 'vitest'

vi.mock('~/src/server/common/map/map.mock.js', () => ({
  buildMockFeatures: vi.fn()
}))

import { buildMockParcelsResponse } from './map.mock.response.js'
import { buildMockFeatures } from '~/src/server/common/map/map.mock.js'
import { mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

const makeH = () => mockHapiResponseToolkit()

describe('buildMockParcelsResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the built features, bbox and mock: true', () => {
    buildMockFeatures.mockReturnValue({
      features: [{ type: 'Feature', id: 'SD7148-9160' }],
      bbox: { minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 }
    })
    const h = makeH()
    const parcelData = [{ id: 'SD7148-9160', sheetId: 'SD7148', parcelId: '9160', areaHa: 2.5 }]

    buildMockParcelsResponse(parcelData, h)

    expect(buildMockFeatures).toHaveBeenCalledWith(parcelData)
    expect(h.response).toHaveBeenCalledWith({
      features: [{ type: 'Feature', id: 'SD7148-9160' }],
      bbox: { minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 },
      mock: true
    })
    expect(h.code).toHaveBeenCalledWith(200)
  })
})

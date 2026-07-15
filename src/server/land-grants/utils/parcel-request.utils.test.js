import { getParcelIdsFromPayload, getParcelIdFromQuery } from './parcel-request.utils.js'

describe('getParcelIdsFromPayload', () => {
  test('returns empty array when payload is undefined', () => {
    const request = {}

    const result = getParcelIdsFromPayload(request)

    expect(result).toEqual([])
  })

  test('returns empty array when landParcels is undefined', () => {
    const request = { payload: {} }

    const result = getParcelIdsFromPayload(request)

    expect(result).toEqual([])
  })

  test('returns empty array when landParcels is null', () => {
    const request = { payload: { landParcels: null } }

    const result = getParcelIdsFromPayload(request)

    expect(result).toEqual([])
  })

  test('wraps single value in array', () => {
    const request = {
      payload: { landParcels: 'ABC123' }
    }

    const result = getParcelIdsFromPayload(request)

    expect(result).toEqual(['ABC123'])
  })

  test('returns array as-is when multiple values provided', () => {
    const request = {
      payload: { landParcels: ['ABC123', 'DEF456'] }
    }

    const result = getParcelIdsFromPayload(request)

    expect(result).toEqual(['ABC123', 'DEF456'])
  })

  test('handles empty string as no selection', () => {
    const request = {
      payload: { landParcels: '' }
    }

    const result = getParcelIdsFromPayload(request)

    expect(result).toEqual([])
  })

  test('filters non-string values out of an array payload', () => {
    const request = {
      payload: { landParcels: ['SD7148-9160', 123, null, undefined, {}, 'SD7148-9161'] }
    }

    const result = getParcelIdsFromPayload(request)

    expect(result).toEqual(['SD7148-9160', 'SD7148-9161'])
  })

  test('returns empty array when a non-string, non-array value is provided', () => {
    const request = {
      payload: { landParcels: 42 }
    }

    const result = getParcelIdsFromPayload(request)

    expect(result).toEqual([])
  })
})

describe('getParcelIdFromQuery', () => {
  test('returns empty array when query is undefined', () => {
    const request = {}

    const result = getParcelIdFromQuery(request)

    expect(result).toEqual([])
  })

  test('returns empty array when parcelId is undefined', () => {
    const request = { query: {} }

    const result = getParcelIdFromQuery(request)

    expect(result).toEqual([])
  })

  test('returns array with parcelId when present', () => {
    const request = {
      query: { parcelId: 'ABC123' }
    }

    const result = getParcelIdFromQuery(request)

    expect(result).toEqual(['ABC123'])
  })

  test('returns empty array when parcelId is empty string', () => {
    const request = {
      query: { parcelId: '' }
    }

    const result = getParcelIdFromQuery(request)

    expect(result).toEqual([])
  })
})

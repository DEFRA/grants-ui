import { describe, it, expect } from 'vitest'
import { stateToLandActionsMapper } from './state-to-land-grants-mapper.js'

describe('stateToLandActionsMapper', () => {
  it('should return an empty array when landParcels is empty', () => {
    const state = { landParcels: {} }
    const result = stateToLandActionsMapper(state)

    expect(result).toEqual([])
  })

  it('should map a single land parcel with actions correctly', () => {
    const state = {
      landParcels: {
        'SD1234-5678': {
          actionsObj: {
            CMOR1: { value: 100 },
            UPL2: { value: 250.5 }
          }
        }
      }
    }

    const result = stateToLandActionsMapper(state)

    expect(result).toEqual([
      {
        sheetId: 'SD1234',
        parcelId: '5678',
        actions: [
          { code: 'CMOR1', quantity: 100 },
          { code: 'UPL2', quantity: 250.5 }
        ]
      }
    ])
  })

  it('should handle multiple land parcels', () => {
    const state = {
      landParcels: {
        'SD1234-5678': {
          actionsObj: {
            CMOR1: { value: 100 }
          }
        },
        'SD2224-3214': {
          actionsObj: {
            UPL2: { value: 300 }
          }
        }
      }
    }

    const result = stateToLandActionsMapper(state)

    expect(result).toHaveLength(2)
    expect(result).toEqual([
      {
        sheetId: 'SD1234',
        parcelId: '5678',
        actions: [{ code: 'CMOR1', quantity: 100 }]
      },
      {
        sheetId: 'SD2224',
        parcelId: '3214',
        actions: [{ code: 'UPL2', quantity: 300 }]
      }
    ])
  })

  it('should handle parcel with no actionsObj', () => {
    const state = {
      landParcels: {
        'SD1234-5678': {}
      }
    }

    const result = stateToLandActionsMapper(state)

    expect(result).toEqual([
      {
        sheetId: 'SD1234',
        parcelId: '5678',
        actions: []
      }
    ])
  })

  it('should handle parcel with empty actionsObj', () => {
    const state = {
      landParcels: {
        'SD1234-5678': {
          actionsObj: {}
        }
      }
    }

    const result = stateToLandActionsMapper(state)

    expect(result).toEqual([
      {
        sheetId: 'SD1234',
        parcelId: '5678',
        actions: []
      }
    ])
  })

  it('should convert string values to numbers', () => {
    const state = {
      landParcels: {
        'SD1234-5678': {
          actionsObj: {
            CMOR1: { value: '123.45' }
          }
        }
      }
    }

    const result = stateToLandActionsMapper(state)

    expect(result[0].actions[0].quantity).toBe(123.45)
    expect(typeof result[0].actions[0].quantity).toBe('number')
  })

  it('should handle zero quantity values', () => {
    const state = {
      landParcels: {
        'SD1234-5678': {
          actionsObj: {
            CMOR1: { value: 0 }
          }
        }
      }
    }

    const result = stateToLandActionsMapper(state)

    expect(result[0].actions[0].quantity).toBe(0)
  })

  it('should maintain action order from actionsObj', () => {
    const state = {
      landParcels: {
        'SD1234-5678': {
          actionsObj: {
            CMOR1: { value: 3 },
            UPL1: { value: 1 },
            UPL4: { value: 2 }
          }
        }
      }
    }

    const result = stateToLandActionsMapper(state)

    expect(result[0].actions).toHaveLength(3)
    expect(result[0].actions.map((a) => a.code)).toEqual(['CMOR1', 'UPL1', 'UPL4'])
  })
})

import { describe, it, expect } from 'vitest'
import { formatParcelForView, buildParcelHint, mapParcelsToViewModel } from './parcel-view-model.mapper.js'

describe('parcel-view-model.mapper', () => {
  describe('buildParcelHint', () => {
    it('should build hint with area only when no actions', () => {
      const parcel = {
        sheetId: 'AB1234',
        parcelId: '5678',
        area: { value: '10.5', unit: 'ha' }
      }

      const result = buildParcelHint(parcel, 0)

      expect(result).toBe('Total size: 10.5 hectares')
    })

    it('should build hint with area and actions', () => {
      const parcel = {
        sheetId: 'AB1234',
        parcelId: '5678',
        area: { value: '10.5', unit: 'ha' }
      }

      const result = buildParcelHint(parcel, 2)

      expect(result).toBe('Total size 10.5 hectares, 2 actions added')
    })

    it('should build hint with single action', () => {
      const parcel = {
        sheetId: 'AB1234',
        parcelId: '5678',
        area: { value: '10.5', unit: 'ha' }
      }

      const result = buildParcelHint(parcel, 1)

      expect(result).toBe('Total size 10.5 hectares, 1 action added')
    })

    it('should build hint with actions only when no area', () => {
      const parcel = {
        sheetId: 'AB1234',
        parcelId: '5678',
        area: { value: '', unit: '' }
      }

      const result = buildParcelHint(parcel, 3)

      expect(result).toBe('3 actions added')
    })

    it('should return empty string when no area and no actions', () => {
      const parcel = {
        sheetId: 'AB1234',
        parcelId: '5678',
        area: { value: '', unit: '' }
      }

      const result = buildParcelHint(parcel, 0)

      expect(result).toBe('')
    })

    it('should handle different area units', () => {
      const parcel = {
        sheetId: 'AB1234',
        parcelId: '5678',
        area: { value: '2.5', unit: 'm2' }
      }

      const result = buildParcelHint(parcel, 0)

      expect(result).toBe('Total size: 2.5 square metres')
    })
  })

  describe('formatParcelForView', () => {
    it('should format parcel with hint', () => {
      const parcel = {
        sheetId: 'AB1234',
        parcelId: '5678',
        area: { value: '10.5', unit: 'ha' }
      }

      const result = formatParcelForView(parcel, 1)

      expect(result).toEqual({
        text: 'AB1234 5678',
        value: 'AB1234-5678',
        hint: { text: 'Total size 10.5 hectares, 1 action added' }
      })
    })

    it('should format parcel without hint when no data', () => {
      const parcel = {
        sheetId: 'AB1234',
        parcelId: '5678',
        area: { value: '', unit: '' }
      }

      const result = formatParcelForView(parcel, 0)

      expect(result).toEqual({
        text: 'AB1234 5678',
        value: 'AB1234-5678',
        hint: undefined
      })
    })
  })

  describe('mapParcelsToViewModel', () => {
    it('should map multiple parcels correctly', () => {
      const parcels = [
        {
          sheetId: 'AB1234',
          parcelId: '5678',
          area: { value: '10.5', unit: 'ha' }
        },
        {
          sheetId: 'CD5678',
          parcelId: '1234',
          area: { value: '5.0', unit: 'ha' }
        }
      ]
      const landParcels = {
        'AB1234-5678': {
          actionsObj: {
            SAM1: { description: 'Action 1' },
            SAM2: { description: 'Action 2' }
          }
        }
      }

      const result = mapParcelsToViewModel(parcels, landParcels)

      expect(result).toHaveLength(2)
      expect(result[0].text).toBe('AB1234 5678')
      expect(result[0].hint.text).toContain('2 actions added')
      expect(result[1].text).toBe('CD5678 1234')
      expect(result[1].hint.text).toBe('Total size: 5.0 hectares')
    })

    it('should handle empty parcels array', () => {
      const result = mapParcelsToViewModel([])

      expect(result).toEqual([])
    })

    it('should handle missing landParcels state', () => {
      const parcels = [
        {
          sheetId: 'AB1234',
          parcelId: '5678',
          area: { value: '10.5', unit: 'ha' }
        }
      ]

      const result = mapParcelsToViewModel(parcels)

      expect(result).toHaveLength(1)
      expect(result[0].hint.text).toBe('Total size: 10.5 hectares')
    })

    it('should correctly count actions from state', () => {
      const parcels = [
        {
          sheetId: 'AB1234',
          parcelId: '5678',
          area: { value: '10.5', unit: 'ha' }
        }
      ]
      const landParcels = {
        'AB1234-5678': {
          actionsObj: {
            SAM1: {},
            SAM2: {},
            SAM3: {}
          }
        }
      }

      const result = mapParcelsToViewModel(parcels, landParcels)

      expect(result[0].hint.text).toContain('3 actions added')
    })
  })
})

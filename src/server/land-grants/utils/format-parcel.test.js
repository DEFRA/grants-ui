import { parseLandParcel, stringifyParcel } from './format-parcel.js'

describe('format-parcel', () => {
  describe('parseLandParcel', () => {
    it('should parse valid land parcel identifier', () => {
      const result = parseLandParcel('ABC123-XYZ789')
      expect(result).toEqual(['ABC123', 'XYZ789'])
    })

    it('should handle land parcel with multiple hyphens', () => {
      const result = parseLandParcel('ABC-123-XYZ-789')
      expect(result).toEqual(['ABC', '123', 'XYZ', '789'])
    })

    it('should handle land parcel without hyphen', () => {
      const result = parseLandParcel('ABC123')
      expect(result).toEqual(['ABC123'])
    })

    it('should handle empty string', () => {
      const result = parseLandParcel('')
      expect(result).toEqual([''])
    })

    it('should handle null/undefined input', () => {
      expect(parseLandParcel(null)).toEqual([''])
      expect(parseLandParcel(undefined)).toEqual([''])
    })

    it('should handle land parcel with trailing hyphen', () => {
      const result = parseLandParcel('ABC123-')
      expect(result).toEqual(['ABC123', ''])
    })

    it('should handle land parcel with leading hyphen', () => {
      const result = parseLandParcel('-XYZ789')
      expect(result).toEqual(['', 'XYZ789'])
    })
  })

  describe('stringifyParcel', () => {
    it('should stringify parcel object correctly', () => {
      const result = stringifyParcel({ parcelId: 'XYZ789', sheetId: 'ABC123' })
      expect(result).toBe('ABC123-XYZ789')
    })

    it('should handle empty strings', () => {
      const result = stringifyParcel({ parcelId: '', sheetId: '' })
      expect(result).toBe('-')
    })

    it('should handle special characters', () => {
      const result = stringifyParcel({
        parcelId: 'parcelId',
        sheetId: 'sheetId'
      })
      expect(result).toBe('sheetId-parcelId')
    })

    it('should handle numeric values', () => {
      const result = stringifyParcel({ parcelId: 789, sheetId: 123 })
      expect(result).toBe('123-789')
    })
  })
})

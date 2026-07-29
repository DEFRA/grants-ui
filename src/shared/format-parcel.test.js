import { isValidCompoundParcelId, parseLandParcel, stringifyParcel } from './format-parcel.js'

describe('format-parcel', () => {
  describe('isValidCompoundParcelId', () => {
    it('should accept a well-formed compound parcel id', () => {
      expect(isValidCompoundParcelId('SD7946-0155')).toBe(true)
    })

    it('should reject a sheet id that is not 6 characters', () => {
      expect(isValidCompoundParcelId('SD79461-0155')).toBe(false)
    })

    it('should reject a parcel id that is not 4 digits', () => {
      expect(isValidCompoundParcelId('SD7946-01555')).toBe(false)
    })

    it('should reject a non-numeric parcel id', () => {
      expect(isValidCompoundParcelId('SD7946-01AB')).toBe(false)
    })

    it('should reject a value with no hyphen', () => {
      expect(isValidCompoundParcelId('SD79460155')).toBe(false)
    })

    it('should reject an empty string', () => {
      expect(isValidCompoundParcelId('')).toBe(false)
    })
  })

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

    it('should handle null/undefined input', () => {
      expect(parseLandParcel(null)).toEqual([''])
      expect(parseLandParcel(undefined)).toEqual([''])
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

    it('should handle numeric values', () => {
      const result = stringifyParcel({ parcelId: 789, sheetId: 123 })
      expect(result).toBe('123-789')
    })
  })
})

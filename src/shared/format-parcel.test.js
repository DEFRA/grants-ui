import {
  compareParcelReferences,
  formatParcelReference,
  isValidCompoundParcelId,
  parseLandParcel,
  stringifyParcel
} from './format-parcel.js'

describe('format-parcel', () => {
  describe('compareParcelReferences', () => {
    const references = ['ZZ1234-0001', 'SD6351-8781', 'SD6252-7537', 'SD6351-0012', 'AA1234-9999']
    const expected = ['AA1234-9999', 'SD6252-7537', 'SD6351-0012', 'SD6351-8781', 'ZZ1234-0001']

    it('orders saved references across sheet prefixes, sheet numbers and parcel numbers', () => {
      expect([...references].sort(compareParcelReferences)).toEqual(expected)
    })

    it('applies the same order to parcel objects used by both selection controllers', () => {
      const parcels = references.map((reference) => {
        const [sheetId, parcelId] = parseLandParcel(reference)
        return { sheetId, parcelId }
      })
      expect(parcels.sort(compareParcelReferences).map(stringifyParcel)).toEqual(expected)
    })

    it('compares object and string representations consistently', () => {
      expect(compareParcelReferences({ sheetId: 'SD6351', parcelId: '0012' }, 'SD6351-0012')).toBe(0)
    })
  })

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

  describe('formatParcelReference', () => {
    it('should format a parcel identifier object as a space-separated reference', () => {
      expect(formatParcelReference({ sheetId: 'SD7946', parcelId: '0155' })).toBe('SD7946 0155')
    })

    it('should format a compound id string as a space-separated reference', () => {
      expect(formatParcelReference('SD7946-0155')).toBe('SD7946 0155')
    })

    it('should omit empty or missing parts rather than render blanks', () => {
      expect(formatParcelReference({ sheetId: 'SD7946', parcelId: '' })).toBe('SD7946')
      expect(formatParcelReference({ sheetId: undefined, parcelId: undefined })).toBe('')
      expect(formatParcelReference('')).toBe('')
    })
  })
})

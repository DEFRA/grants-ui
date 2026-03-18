import { describe, expect, it } from 'vitest'
import { addressFormatter } from './address.formatter.js'

describe('address formatter', () => {
  describe('with no UPRN set', () => {
    it('should return null for non-object input', () => {
      expect(addressFormatter(null)).toBeNull()
      expect(addressFormatter(undefined)).toBeNull()
      expect(addressFormatter(123)).toBeNull()
      expect(addressFormatter('string')).toBeNull()
      expect(addressFormatter([])).toBeNull()
    })

    it('should return html with formatted address lines', () => {
      const inputAddress = {
        line1: '123 Main Street',
        line2: 'Apt. 4B',
        city: 'New York',
        postalCode: '10001'
      }

      const expectedOutput = {
        html: '123 Main Street<br/>Apt. 4B<br/>New York<br/>10001'
      }

      expect(addressFormatter(inputAddress)).toEqual(expectedOutput)
    })

    it('should escape HTML characters in address lines', () => {
      const inputAddress = {
        line1: '<b>456 Elm St</b>',
        city: 'Los Angeles',
        postalCode: '90001'
      }

      const expectedOutput = {
        html: '&lt;b&gt;456 Elm St&lt;/b&gt;<br/>Los Angeles<br/>90001'
      }

      expect(addressFormatter(inputAddress)).toEqual(expectedOutput)
    })

    it('should filter out empty or whitespace-only address lines', () => {
      const inputAddress = {
        line1: '  ',
        line2: 'Suite 100',
        city: ' ',
        postalCode: '90210'
      }

      const expectedOutput = {
        html: 'Suite 100<br/>90210'
      }

      expect(addressFormatter(inputAddress)).toEqual(expectedOutput)
    })

    it('should return null if all address lines are empty or missing', () => {
      const inputAddress = {
        line1: '',
        line2: '',
        line3: null,
        city: ' ',
        postalCode: null
      }

      expect(addressFormatter(inputAddress)).toBeNull()
    })
  })

  describe('with UPRN set', () => {
    it('should use UPRN fields instead of structured address fields', () => {
      const inputAddress = {
        line1: '123 Main Street',
        line2: 'Apt. 4B',
        city: 'New York',
        postalCode: '10001',
        uprn: '1234567890',
        buildingName: 'My Building',
        buildingNumberRange: '123'
      }

      const expectedOutput = {
        html: 'My Building 123<br/>New York<br/>10001'
      }

      const formattedAddress = addressFormatter(inputAddress)

      expect(formattedAddress).toEqual(expectedOutput)
    })
  })
})

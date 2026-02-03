import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createCustomerNameRow,
  createBusinessNameRow,
  createAddressRow,
  createSbiRow,
  createContactDetailsRow
} from './create-rows.js'

// Mock the formatPhone function
vi.mock('~/src/server/land-grants/utils/format-phone.js', () => ({
  formatPhone: vi.fn((phone) => `formatted-${phone}`)
}))

describe('create-rows utilities', () => {
  describe('createCustomerNameRow', () => {
    it('should create a row when all name parts are provided', () => {
      const name = { first: 'John', middle: 'Michael', last: 'Doe' }
      const result = createCustomerNameRow(name)

      expect(result).toEqual({
        key: { text: 'Name' },
        value: { text: 'John Michael Doe' }
      })
    })

    it('should create a row with only first and last name', () => {
      const name = { first: 'John', last: 'Doe' }
      const result = createCustomerNameRow(name)

      expect(result).toEqual({
        key: { text: 'Name' },
        value: { text: 'John Doe' }
      })
    })

    it('should create a row with only first name', () => {
      const name = { first: 'John' }
      const result = createCustomerNameRow(name)

      expect(result).toEqual({
        key: { text: 'Name' },
        value: { text: 'John' }
      })
    })

    it('should return null when name is null or undefined', () => {
      expect(createCustomerNameRow(null)).toBeNull()
      expect(createCustomerNameRow(undefined)).toBeNull()
    })

    it('should return null when all name parts are empty or missing', () => {
      expect(createCustomerNameRow({})).toBeNull()
      expect(createCustomerNameRow({ first: '', middle: '', last: '' })).toBeNull()
      expect(createCustomerNameRow({ first: null, middle: null, last: null })).toBeNull()
    })

    it('should filter out empty strings and null values', () => {
      const name = { first: 'John', middle: '', last: 'Doe' }
      const result = createCustomerNameRow(name)

      expect(result).toEqual({
        key: { text: 'Name' },
        value: { text: 'John Doe' }
      })
    })
  })

  describe('createBusinessNameRow', () => {
    it('should create a row when business name is provided', () => {
      const result = createBusinessNameRow('Acme Corp')

      expect(result).toEqual({
        key: { text: 'Business name' },
        value: { text: 'Acme Corp' }
      })
    })

    it('should return null when business name is empty string', () => {
      expect(createBusinessNameRow('')).toBeNull()
    })

    it('should return null when business name is null or undefined', () => {
      expect(createBusinessNameRow(null)).toBeNull()
      expect(createBusinessNameRow(undefined)).toBeNull()
    })
  })

  describe('createAddressRow', () => {
    it('should create a row with all address parts', () => {
      const address = {
        line1: '123 Main St',
        line2: 'Apt 4B',
        line3: 'Building C',
        street: 'Main Street',
        city: 'Springfield',
        postalCode: 'SP1 2AB'
      }
      const result = createAddressRow(address)

      expect(result).toEqual({
        key: { text: 'Address' },
        value: { html: '123 Main St<br/>Apt 4B<br/>Building C<br/>Main Street<br/>Springfield<br/>SP1 2AB' }
      })
    })

    it('should create a row with only some address parts', () => {
      const address = {
        line1: '123 Main St',
        city: 'Springfield',
        postalCode: 'SP1 2AB'
      }
      const result = createAddressRow(address)

      expect(result).toEqual({
        key: { text: 'Address' },
        value: { html: '123 Main St<br/>Springfield<br/>SP1 2AB' }
      })
    })

    it('should trim whitespace from address parts', () => {
      const address = {
        line1: '  123 Main St  ',
        city: '  Springfield  ',
        postalCode: 'SP1 2AB'
      }
      const result = createAddressRow(address)

      expect(result).toEqual({
        key: { text: 'Address' },
        value: { html: '123 Main St<br/>Springfield<br/>SP1 2AB' }
      })
    })

    it('should filter out empty strings and whitespace-only strings', () => {
      const address = {
        line1: '123 Main St',
        line2: '',
        line3: '   ',
        city: 'Springfield',
        postalCode: 'SP1 2AB'
      }
      const result = createAddressRow(address)

      expect(result).toEqual({
        key: { text: 'Address' },
        value: { html: '123 Main St<br/>Springfield<br/>SP1 2AB' }
      })
    })

    it('should return null when address is null or undefined', () => {
      expect(createAddressRow(null)).toBeNull()
      expect(createAddressRow(undefined)).toBeNull()
    })

    it('should return null when all address parts are empty', () => {
      const address = {
        line1: '',
        line2: '',
        line3: '',
        street: '',
        city: '',
        postalCode: ''
      }
      expect(createAddressRow(address)).toBeNull()
      expect(createAddressRow({})).toBeNull()
    })

    it('should handle UPRN addresses with correct field order', () => {
      const address = {
        uprn: '12345678',
        line1: 'Flat 2B',
        line2: '123-125 Enterprise House',
        line3: 'Industrial Estate',
        line4: 'North District',
        street: 'Main Road',
        city: 'Test City',
        postalCode: 'TC1 2AB'
      }
      const result = createAddressRow(address)

      expect(result).toEqual({
        key: { text: 'Address' },
        value: {
          html: 'Flat 2B<br/>123-125 Enterprise House<br/>Main Road<br/>Industrial Estate<br/>North District<br/>Test City<br/>TC1 2AB'
        }
      })
    })

    it('should handle UPRN addresses with missing optional fields', () => {
      const address = {
        uprn: '12345678',
        line1: 'Acme Farm',
        line2: '123',
        street: 'Main Road',
        city: 'Test City',
        postalCode: 'TC1 2AB'
      }
      const result = createAddressRow(address)

      expect(result).toEqual({
        key: { text: 'Address' },
        value: { html: 'Acme Farm<br/>123<br/>Main Road<br/>Test City<br/>TC1 2AB' }
      })
    })

    it('should handle UPRN addresses with all fields empty except street, city, postcode', () => {
      const address = {
        uprn: '12345678',
        line1: '',
        line2: '',
        line3: '',
        line4: '',
        street: 'Main Road',
        city: 'Test City',
        postalCode: 'TC1 2AB'
      }
      const result = createAddressRow(address)

      expect(result).toEqual({
        key: { text: 'Address' },
        value: { html: 'Main Road<br/>Test City<br/>TC1 2AB' }
      })
    })

    it('should handle non-UPRN addresses with all line fields', () => {
      const address = {
        line1: 'Flat 5',
        line2: '123 Main Street',
        line3: 'Business Park',
        street: 'Main Street',
        city: 'Test City',
        postalCode: 'TC1 2AB'
      }
      const result = createAddressRow(address)

      expect(result).toEqual({
        key: { text: 'Address' },
        value: { html: 'Flat 5<br/>123 Main Street<br/>Business Park<br/>Main Street<br/>Test City<br/>TC1 2AB' }
      })
    })

    it('should differentiate field order between UPRN and non-UPRN addresses', () => {
      // UPRN address: line1, line2, street, line3, line4, city, postalCode
      const uprnAddress = {
        uprn: '12345678',
        line1: 'Line 1',
        line2: 'Line 2',
        line3: 'Line 3',
        line4: 'Line 4',
        street: 'Street',
        city: 'City',
        postalCode: 'PC1 2AB'
      }
      const uprnResult = createAddressRow(uprnAddress)

      // Non-UPRN address: line1, line2, line3, street, city, postalCode
      const nonUprnAddress = {
        line1: 'Line 1',
        line2: 'Line 2',
        line3: 'Line 3',
        street: 'Street',
        city: 'City',
        postalCode: 'PC1 2AB'
      }
      const nonUprnResult = createAddressRow(nonUprnAddress)

      // UPRN should include line4 and have street between line2 and line3
      expect(uprnResult).toEqual({
        key: { text: 'Address' },
        value: { html: 'Line 1<br/>Line 2<br/>Street<br/>Line 3<br/>Line 4<br/>City<br/>PC1 2AB' }
      })

      // Non-UPRN should not have line4 and street comes after line3
      expect(nonUprnResult).toEqual({
        key: { text: 'Address' },
        value: { html: 'Line 1<br/>Line 2<br/>Line 3<br/>Street<br/>City<br/>PC1 2AB' }
      })
    })
  })

  describe('createSbiRow', () => {
    it('should create a row with SBI number', () => {
      const result = createSbiRow('123456789')

      expect(result).toEqual({
        key: { text: 'SBI number' },
        value: { text: '123456789' }
      })
    })

    it('should create a row even with null or undefined SBI', () => {
      expect(createSbiRow(null)).toEqual({
        key: { text: 'SBI number' },
        value: { text: null }
      })

      expect(createSbiRow(undefined)).toEqual({
        key: { text: 'SBI number' },
        value: { text: undefined }
      })
    })
  })

  describe('createContactDetailsRow', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should create a row with landline, mobile and email', () => {
      const result = createContactDetailsRow('02012345678', '07123456789', 'test@example.com')

      expect(result).toEqual({
        key: { text: 'Contact details' },
        value: { html: 'formatted-02012345678<br/>formatted-07123456789<br/>test@example.com' }
      })
    })

    it('should create a row with mobile and email', () => {
      const result = createContactDetailsRow(null, '07123456789', 'test@example.com')

      expect(result).toEqual({
        key: { text: 'Contact details' },
        value: { html: 'formatted-07123456789<br/>test@example.com' }
      })
    })

    it('should create a row with only landline', () => {
      const result = createContactDetailsRow('02012345678', null, null)

      expect(result).toEqual({
        key: { text: 'Contact details' },
        value: { html: 'formatted-02012345678' }
      })
    })

    it('should create a row with only mobile', () => {
      const result = createContactDetailsRow(null, '07123456789', null)

      expect(result).toEqual({
        key: { text: 'Contact details' },
        value: { html: 'formatted-07123456789' }
      })
    })

    it('should create a row with only email', () => {
      const result = createContactDetailsRow(null, null, 'test@example.com')

      expect(result).toEqual({
        key: { text: 'Contact details' },
        value: { html: 'test@example.com' }
      })
    })

    it('should not create a row if no data is provided', () => {
      const result = createContactDetailsRow(null, null, null)

      expect(result).toEqual(null)
    })
  })
})

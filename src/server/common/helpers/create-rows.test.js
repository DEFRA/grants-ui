import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildRows,
  createCustomerNameRow,
  createBusinessNameRow,
  createAddressRow,
  createSbiRow,
  createContactDetailsRow,
  createPersonRows,
  createBusinessRows,
  createContactRows
} from './create-rows.js'

// Mock the formatPhone function
vi.mock('~/src/server/land-grants/utils/format-phone.js', () => ({
  formatPhone: vi.fn((phone) => (phone ? `formatted-${phone}` : undefined))
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
        line4: 'Main Street',
        city: 'Springfield',
        postalCode: 'SP1 2AB'
      }
      const result = createAddressRow(address)

      expect(result).toEqual({
        key: { text: 'Address' },
        value: {
          html: '123 Main St<br/>Apt 4B<br/>Building C<br/>Main Street<br/>Springfield<br/>SP1 2AB'
        }
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
        line4: '',
        city: '',
        postalCode: ''
      }
      expect(createAddressRow(address)).toBeNull()
      expect(createAddressRow({})).toBeNull()
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

  describe('createPersonRows', () => {
    it('should create rows with all name parts including optional middle name', () => {
      const name = { title: 'Mr', first: 'John', middle: 'Michael', last: 'Doe' }
      const result = createPersonRows(name)

      expect(result).toEqual({
        rows: [
          { key: { text: 'Title' }, value: { text: 'Mr' } },
          { key: { text: 'First name' }, value: { text: 'John' } },
          { key: { text: 'Middle name' }, value: { text: 'Michael' } },
          { key: { text: 'Last name' }, value: { text: 'Doe' } }
        ]
      })
    })

    it('should hide optional middle name when missing', () => {
      const name = { title: 'Mrs', first: 'Jane', last: 'Doe' }
      const result = createPersonRows(name)

      expect(result).toEqual({
        rows: [
          { key: { text: 'Title' }, value: { text: 'Mrs' } },
          { key: { text: 'First name' }, value: { text: 'Jane' } },
          { key: { text: 'Last name' }, value: { text: 'Doe' } }
        ]
      })
    })

    it('should show mandatory fields as blank when name is null or undefined', () => {
      const expected = {
        rows: [
          { key: { text: 'Title' }, value: { text: undefined } },
          { key: { text: 'First name' }, value: { text: undefined } },
          { key: { text: 'Last name' }, value: { text: undefined } }
        ]
      }
      expect(createPersonRows(null)).toEqual(expected)
      expect(createPersonRows(undefined)).toEqual(expected)
    })
  })

  describe('createBusinessRows', () => {
    const fullBusiness = {
      name: 'Acme Corp',
      address: {
        line1: '123 Main St',
        line2: 'Suite 4',
        line3: 'Building C',
        line4: 'Industrial Park',
        city: 'Springfield',
        postalCode: 'SP1 2AB'
      }
    }

    it('should create rows with all business data', () => {
      const result = createBusinessRows('123456789', 'Acme Corp', fullBusiness)

      expect(result).toEqual({
        rows: [
          { key: { text: 'Business name' }, value: { text: 'Acme Corp' } },
          { key: { text: 'Address 1' }, value: { text: '123 Main St' } },
          { key: { text: 'Address 2' }, value: { text: 'Suite 4' } },
          { key: { text: 'Address 3' }, value: { text: 'Building C' } },
          { key: { text: 'Address 4' }, value: { text: 'Industrial Park' } },
          { key: { text: 'City' }, value: { text: 'Springfield' } },
          { key: { text: 'Postcode' }, value: { text: 'SP1 2AB' } },
          { key: { text: 'SBI number' }, value: { text: '123456789' } }
        ]
      })
    })

    it('should hide optional address lines when missing', () => {
      const business = {
        address: { line1: '123 Main St', city: 'Springfield', postalCode: 'SP1 2AB' }
      }
      const result = createBusinessRows('123456789', 'Acme Corp', business)

      expect(result).toEqual({
        rows: [
          { key: { text: 'Business name' }, value: { text: 'Acme Corp' } },
          { key: { text: 'Address 1' }, value: { text: '123 Main St' } },
          { key: { text: 'City' }, value: { text: 'Springfield' } },
          { key: { text: 'Postcode' }, value: { text: 'SP1 2AB' } },
          { key: { text: 'SBI number' }, value: { text: '123456789' } }
        ]
      })
    })

    it('should show mandatory fields as blank when business has no address', () => {
      const result = createBusinessRows('123456789', 'Acme Corp', {})

      expect(result).toEqual({
        rows: [
          { key: { text: 'Business name' }, value: { text: 'Acme Corp' } },
          { key: { text: 'Address 1' }, value: { text: undefined } },
          { key: { text: 'City' }, value: { text: undefined } },
          { key: { text: 'Postcode' }, value: { text: undefined } },
          { key: { text: 'SBI number' }, value: { text: '123456789' } }
        ]
      })
    })

    it('should show mandatory fields as blank when business and organisationName are missing', () => {
      const expected = {
        rows: [
          { key: { text: 'Business name' }, value: { text: undefined } },
          { key: { text: 'Address 1' }, value: { text: undefined } },
          { key: { text: 'City' }, value: { text: undefined } },
          { key: { text: 'Postcode' }, value: { text: undefined } },
          { key: { text: 'SBI number' }, value: { text: '123456789' } }
        ]
      }
      expect(createBusinessRows('123456789', undefined, null)).toEqual(expected)
      expect(createBusinessRows('123456789', undefined, undefined)).toEqual(expected)
    })
  })

  describe('buildRows', () => {
    it('should include mandatory fields even when value is empty', () => {
      const fields = [
        { label: 'Required', value: undefined, mandatory: true },
        { label: 'Optional', value: undefined }
      ]
      const result = buildRows(fields)

      expect(result).toEqual({
        rows: [{ key: { text: 'Required' }, value: { text: undefined } }]
      })
    })

    it('should include optional fields when they have a value', () => {
      const fields = [
        { label: 'Required', value: 'A', mandatory: true },
        { label: 'Optional', value: 'B' }
      ]
      const result = buildRows(fields)

      expect(result).toEqual({
        rows: [
          { key: { text: 'Required' }, value: { text: 'A' } },
          { key: { text: 'Optional' }, value: { text: 'B' } }
        ]
      })
    })

    it('should return empty rows when all optional fields are empty', () => {
      const fields = [
        { label: 'Optional1', value: undefined },
        { label: 'Optional2', value: null }
      ]
      const result = buildRows(fields)

      expect(result).toEqual({ rows: [] })
    })

    it('should handle an empty fields array', () => {
      expect(buildRows([])).toEqual({ rows: [] })
    })
  })

  describe('createContactRows', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should create rows with all contact details', () => {
      const business = {
        landlinePhoneNumber: '02012345678',
        mobilePhoneNumber: '07123456789',
        email: 'test@example.com'
      }
      const result = createContactRows(business)

      expect(result).toEqual({
        rows: [
          { key: { text: 'Landline number' }, value: { text: 'formatted-02012345678' } },
          { key: { text: 'Mobile number' }, value: { text: 'formatted-07123456789' } },
          { key: { text: 'Email address' }, value: { text: 'test@example.com' } }
        ]
      })
    })

    it('should hide optional fields when missing', () => {
      const business = { email: 'test@example.com' }
      const result = createContactRows(business)

      expect(result).toEqual({
        rows: [{ key: { text: 'Email address' }, value: { text: 'test@example.com' } }]
      })
    })

    it('should show only landline when others are missing', () => {
      const business = { landlinePhoneNumber: '02012345678' }
      const result = createContactRows(business)

      expect(result).toEqual({
        rows: [{ key: { text: 'Landline number' }, value: { text: 'formatted-02012345678' } }]
      })
    })

    it('should return empty rows when business is null or undefined', () => {
      expect(createContactRows(null)).toEqual({ rows: [] })
      expect(createContactRows(undefined)).toEqual({ rows: [] })
    })
  })
})

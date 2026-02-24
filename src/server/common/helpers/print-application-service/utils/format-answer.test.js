import { formatAnswer } from './format-answer.js'

describe('formatAnswer', () => {
  describe('null and undefined values', () => {
    test.each([null, undefined])('should return empty string for %s value', (value) => {
      expect(formatAnswer({ type: 'TextField' }, value)).toBe('')
    })
  })

  describe('unknown component type', () => {
    test('should stringify value for unrecognised type', () => {
      expect(formatAnswer({ type: 'SomeUnknownField' }, 'hello')).toBe('hello')
    })

    test('should stringify numeric value for unrecognised type', () => {
      expect(formatAnswer({ type: 'UnknownField' }, 42)).toBe('42')
    })
  })

  describe('YesNoField', () => {
    const component = { type: 'YesNoField' }

    test('should return "Yes" for true', () => {
      expect(formatAnswer(component, true)).toBe('Yes')
    })

    test('should return "No" for false', () => {
      expect(formatAnswer(component, false)).toBe('No')
    })

    test('should return "No" for non-boolean truthy value', () => {
      expect(formatAnswer(component, 'yes')).toBe('No')
    })
  })

  describe('CheckboxesField', () => {
    const component = {
      type: 'CheckboxesField',
      items: [
        { value: 'a', text: 'Option A' },
        { value: 'b', text: 'Option B' },
        { value: 'c', text: 'Option C' }
      ]
    }

    test('should join selected item labels with commas', () => {
      expect(formatAnswer(component, ['a', 'c'])).toBe('Option A, Option C')
    })

    test('should return single label for single selection', () => {
      expect(formatAnswer(component, ['b'])).toBe('Option B')
    })

    test('should fall back to raw value when item not found', () => {
      expect(formatAnswer(component, ['a', 'unknown'])).toBe('Option A, unknown')
    })

    test('should stringify non-array value', () => {
      expect(formatAnswer(component, 'not-an-array')).toBe('not-an-array')
    })

    test('should return empty string for empty array', () => {
      expect(formatAnswer(component, [])).toBe('')
    })
  })

  describe('DatePartsField', () => {
    const component = { type: 'DatePartsField' }

    test('should format date with month name', () => {
      expect(formatAnswer(component, { day: '15', month: '1', year: '2025' })).toBe('15 January 2025')
    })

    test('should strip leading zeros from day', () => {
      expect(formatAnswer(component, { day: '03', month: '12', year: '2024' })).toBe('3 December 2024')
    })

    test('should handle all twelve months', () => {
      expect(formatAnswer(component, { day: '1', month: '6', year: '2025' })).toBe('1 June 2025')
      expect(formatAnswer(component, { day: '1', month: '11', year: '2025' })).toBe('1 November 2025')
    })

    test('should fall back to raw month value for invalid month number', () => {
      expect(formatAnswer(component, { day: '1', month: '13', year: '2025' })).toBe('1 13 2025')
    })

    test('should stringify non-object value', () => {
      expect(formatAnswer(component, '2025-01-15')).toBe('2025-01-15')
    })

    test('should stringify when day is missing', () => {
      expect(formatAnswer(component, { month: '1', year: '2025' })).toBe('[object Object]')
    })
  })

  describe('MonthYearField', () => {
    const component = { type: 'MonthYearField' }

    test('should format as month name and year', () => {
      expect(formatAnswer(component, { month: '3', year: '2025' })).toBe('March 2025')
    })

    test('should fall back to raw month value for invalid month number', () => {
      expect(formatAnswer(component, { month: '0', year: '2025' })).toBe('0 2025')
    })

    test('should stringify non-object value', () => {
      expect(formatAnswer(component, 'March 2025')).toBe('March 2025')
    })

    test('should stringify when month is missing', () => {
      expect(formatAnswer(component, { year: '2025' })).toBe('[object Object]')
    })
  })

  describe('RadiosField', () => {
    const component = {
      type: 'RadiosField',
      items: [
        { value: 'opt1', text: 'First option' },
        { value: 'opt2', text: 'Second option' }
      ]
    }

    test('should return label for matching value', () => {
      expect(formatAnswer(component, 'opt1')).toBe('First option')
    })

    test('should fall back to raw value when not found', () => {
      expect(formatAnswer(component, 'unknown')).toBe('unknown')
    })

    test('should fall back to raw value when component has no items', () => {
      expect(formatAnswer({ type: 'RadiosField' }, 'opt1')).toBe('opt1')
    })
  })

  describe('SelectField', () => {
    const component = {
      type: 'SelectField',
      items: [{ value: 'gb', text: 'United Kingdom' }]
    }

    test('should return label for matching value', () => {
      expect(formatAnswer(component, 'gb')).toBe('United Kingdom')
    })
  })

  describe('AutocompleteField', () => {
    const component = {
      type: 'AutocompleteField',
      list: {
        items: [
          { value: 'breed1', text: 'Hereford' },
          { value: 'breed2', text: 'Angus' }
        ]
      }
    }

    test('should look up item from list.items', () => {
      expect(formatAnswer(component, 'breed2')).toBe('Angus')
    })

    test('should fall back to raw value when not found in list.items', () => {
      expect(formatAnswer(component, 'breed99')).toBe('breed99')
    })
  })

  describe('UkAddressField', () => {
    const component = { type: 'UkAddressField' }

    test('should join address parts with newlines', () => {
      const address = {
        addressLine1: '10 Downing Street',
        addressLine2: '',
        town: 'London',
        county: '',
        postcode: 'SW1A 2AA'
      }

      expect(formatAnswer(component, address)).toBe('10 Downing Street\nLondon\nSW1A 2AA')
    })

    test('should include all parts when present', () => {
      const address = {
        addressLine1: 'Unit 5',
        addressLine2: 'Business Park',
        town: 'Exeter',
        county: 'Devon',
        postcode: 'EX1 1AA'
      }

      expect(formatAnswer(component, address)).toBe('Unit 5\nBusiness Park\nExeter\nDevon\nEX1 1AA')
    })

    test('should stringify non-object value', () => {
      expect(formatAnswer(component, 'flat address')).toBe('flat address')
    })
  })

  describe('string-type fields', () => {
    test.each([
      ['TextField', 'some text'],
      ['NumberField', 12345],
      ['EmailAddressField', 'test@example.com'],
      ['TelephoneNumberField', '01onal234567'],
      ['MultilineTextField', 'line1\nline2']
    ])('%s should stringify the value', (type, value) => {
      expect(formatAnswer({ type }, value)).toBe(String(value))
    })
  })
})

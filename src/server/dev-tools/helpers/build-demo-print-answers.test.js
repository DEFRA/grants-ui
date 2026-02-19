import { buildDemoPrintAnswers } from './build-demo-print-answers.js'
import { MOCK_DISPLAY_ONLY_COMPONENTS } from '~/src/__test-fixtures__/mock-forms-cache.js'

describe('build-demo-print-answers', () => {
  describe('buildDemoPrintAnswers', () => {
    test('should generate correct demo values for each component type', () => {
      const definition = {
        pages: [
          {
            title: 'Page 1',
            components: [
              { name: 'yesNo', type: 'YesNoField' },
              { name: 'text', type: 'TextField' },
              { name: 'number', type: 'NumberField' },
              { name: 'email', type: 'EmailAddressField' },
              { name: 'tel', type: 'TelephoneNumberField' },
              { name: 'multiline', type: 'MultilineTextField' },
              { name: 'date', type: 'DatePartsField' },
              { name: 'monthYear', type: 'MonthYearField' },
              { name: 'address', type: 'UkAddressField' }
            ]
          }
        ]
      }

      const answers = buildDemoPrintAnswers(definition)

      expect(answers.yesNo).toBe(true)
      expect(answers.text).toBe('Demo text')
      expect(answers.number).toBe(12345)
      expect(answers.email).toBe('demo@example.gov.uk')
      expect(answers.tel).toBe('01234 567890')
      expect(answers.multiline).toBe('This is demo multiline text for development preview purposes.')
      expect(answers.date).toEqual({ day: 15, month: 6, year: 2025 })
      expect(answers.monthYear).toEqual({ month: 6, year: 2025 })
      expect(answers.address).toEqual({ addressLine1: '10 Downing Street', town: 'London', postcode: 'SW1A 2AA' })
    })

    test('should use first item value for list-based components', () => {
      const definition = {
        pages: [
          {
            title: 'Page 1',
            components: [
              { name: 'radios', type: 'RadiosField', items: [{ text: 'Option A', value: 'opt-a' }] },
              { name: 'select', type: 'SelectField', items: [{ text: 'Option B', value: 'opt-b' }] },
              { name: 'autocomplete', type: 'AutocompleteField', items: [{ text: 'Option C', value: 'opt-c' }] },
              {
                name: 'checkboxes',
                type: 'CheckboxesField',
                items: [{ text: 'Check A', value: 'chk-a' }]
              }
            ]
          }
        ]
      }

      const answers = buildDemoPrintAnswers(definition)

      expect(answers.radios).toBe('opt-a')
      expect(answers.select).toBe('opt-b')
      expect(answers.autocomplete).toBe('opt-c')
      expect(answers.checkboxes).toEqual(['chk-a'])
    })

    test('should fall back to Demo value for list components with no items', () => {
      const definition = {
        pages: [
          {
            title: 'Page 1',
            components: [
              { name: 'radios', type: 'RadiosField' },
              { name: 'select', type: 'SelectField' },
              { name: 'autocomplete', type: 'AutocompleteField' },
              { name: 'checkboxes', type: 'CheckboxesField' }
            ]
          }
        ]
      }

      const answers = buildDemoPrintAnswers(definition)

      expect(answers.radios).toBe('Demo value')
      expect(answers.select).toBe('Demo value')
      expect(answers.autocomplete).toBe('Demo value')
      expect(answers.checkboxes).toEqual(['Demo value'])
    })

    test('should skip display-only component types', () => {
      const definition = {
        pages: [
          {
            title: 'Page 1',
            components: [...MOCK_DISPLAY_ONLY_COMPONENTS, { name: 'realField', type: 'TextField' }]
          }
        ]
      }

      const answers = buildDemoPrintAnswers(definition)

      for (const component of MOCK_DISPLAY_ONLY_COMPONENTS) {
        expect(answers[component.name]).toBeUndefined()
      }
      expect(answers.realField).toBe('Demo text')
    })

    test('should skip components with $$-prefixed names', () => {
      const definition = {
        pages: [
          {
            title: 'Page 1',
            components: [
              { name: '$$internal', type: 'TextField' },
              { name: 'visibleField', type: 'TextField' }
            ]
          }
        ]
      }

      const answers = buildDemoPrintAnswers(definition)

      expect(answers['$$internal']).toBeUndefined()
      expect(answers.visibleField).toBe('Demo text')
    })

    test('should return Demo value for unknown component types', () => {
      const definition = {
        pages: [{ title: 'Page 1', components: [{ name: 'unknown', type: 'FutureField' }] }]
      }

      const answers = buildDemoPrintAnswers(definition)

      expect(answers.unknown).toBe('Demo value')
    })

    test('should handle empty definition gracefully', () => {
      expect(buildDemoPrintAnswers({})).toEqual({})
      expect(buildDemoPrintAnswers({ pages: [] })).toEqual({})
    })

    test('should handle pages with no components', () => {
      const definition = { pages: [{ title: 'Empty page' }] }

      expect(buildDemoPrintAnswers(definition)).toEqual({})
    })
  })
})

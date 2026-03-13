import { buildDemoPrintAnswers, buildDemoPayment } from './build-demo-print-answers.js'
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

    test.each([
      ['RadiosField', [{ text: 'Option A', value: 'opt-a' }], 'opt-a'],
      ['SelectField', [{ text: 'Option B', value: 'opt-b' }], 'opt-b'],
      ['AutocompleteField', [{ text: 'Option C', value: 'opt-c' }], 'opt-c'],
      ['CheckboxesField', [{ text: 'Check A', value: 'chk-a' }], ['chk-a']],
      ['RadiosField', undefined, 'Demo value'],
      ['SelectField', undefined, 'Demo value'],
      ['AutocompleteField', undefined, 'Demo value'],
      ['CheckboxesField', undefined, ['Demo value']]
    ])('%s with items=%j should produce %j', (type, items, expected) => {
      const definition = {
        pages: [{ title: 'Page 1', components: [{ name: 'field', type, ...(items && { items }) }] }]
      }
      expect(buildDemoPrintAnswers(definition).field).toEqual(expected)
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

    test.each([
      ['empty object', {}],
      ['empty pages', { pages: [] }],
      ['page with no components', { pages: [{ title: 'Empty page' }] }]
    ])('should return {} for %s', (_desc, definition) => {
      expect(buildDemoPrintAnswers(definition)).toEqual({})
    })
  })

  describe('buildDemoPayment', () => {
    test('should return payment object with correct structure and values', () => {
      const payment = buildDemoPayment()

      expect(payment.annualTotalPence).toBe(822438)
      expect(Object.keys(payment.parcelItems)).toHaveLength(3)
      expect(Object.keys(payment.agreementLevelItems)).toHaveLength(1)

      const firstItem = Object.values(payment.parcelItems)[0]
      expect(firstItem).toEqual({
        sheetId: 'SD5949',
        parcelId: '6060',
        code: 'CMOR1',
        description: 'Assess moorland and produce a written record',
        quantity: '681.6133',
        annualPaymentPence: 722510
      })
    })
  })
})

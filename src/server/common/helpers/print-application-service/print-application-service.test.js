import {
  buildPrintViewModel,
  enrichDefinitionWithListItems,
  processConfigurablePrintContent
} from './print-application-service.js'
import { ComponentsRegistry } from '../../../confirmation/services/components.registry.js'
import { MOCK_FORM_ENTRIES, MOCK_DISPLAY_ONLY_COMPONENTS } from '~/src/__test-fixtures__/mock-forms-cache.js'
import { MOCK_PAYMENT } from '~/src/__test-fixtures__/mock-payment.js'

vi.mock('../../../confirmation/services/components.registry.js', () => ({
  ComponentsRegistry: {
    replaceComponents: vi.fn((html) => html)
  }
}))

vi.mock('~/src/config/nunjucks/filters/filters.js', async () => {
  const { mockFilters } = await import('~/src/__mocks__')
  return mockFilters()
})

describe('print-application-service', () => {
  describe('buildPrintViewModel', () => {
    const baseParams = {
      definition: {
        pages: [
          {
            title: 'Your details',
            components: [
              { type: 'TextField', name: 'fullName', title: 'Full name' },
              { type: 'EmailAddressField', name: 'email', title: 'Email address' }
            ]
          },
          {
            title: 'About your project',
            components: [
              { type: 'YesNoField', name: 'hasPlanning', title: 'Do you have planning permission?' },
              { type: 'NumberField', name: 'projectCost', title: 'Total project cost' }
            ]
          }
        ]
      },
      answers: {
        fullName: 'Jane Smith',
        email: 'jane@example.com',
        hasPlanning: true,
        projectCost: 50000
      },
      referenceNumber: 'REF-123',
      submittedAt: '15 January 2025 at 10:30am',
      slug: MOCK_FORM_ENTRIES.exampleGrant.slug,
      sessionData: {
        contactName: 'Jane Smith',
        businessName: 'Smith Farms',
        sbi: '123456789'
      },
      form: MOCK_FORM_ENTRIES.exampleGrant
    }

    test('should build correct view model from base params', () => {
      const result = buildPrintViewModel(baseParams)

      expect(result.pageTitle).toBe(`${MOCK_FORM_ENTRIES.exampleGrant.title} application`)
      expect(result.serviceName).toBe(MOCK_FORM_ENTRIES.exampleGrant.title)
      expect(result.serviceUrl).toBe(`/${MOCK_FORM_ENTRIES.exampleGrant.slug}`)
      expect(result.referenceNumber).toBe('REF-123')
      expect(result.submittedAt).toBe('15 January 2025 at 10:30am')
      expect(result.breadcrumbs).toEqual([])

      expect(result.applicantDetails).toEqual({
        contactName: 'Jane Smith',
        businessName: 'Smith Farms',
        sbi: '123456789'
      })

      expect(result.sections).toHaveLength(2)
      expect(result.sections[0].title).toBe('Your details')
      expect(result.sections[0].questions).toEqual([
        { label: 'Full name', answer: 'Jane Smith' },
        { label: 'Email address', answer: 'jane@example.com' }
      ])
      expect(result.sections[1].title).toBe('About your project')
      expect(result.sections[1].questions).toEqual([
        { label: 'Do you have planning permission?', answer: 'Yes' },
        { label: 'Total project cost', answer: '50000' }
      ])

      expect(result.paymentInfo).toBeNull()
    })

    test('should default referenceNumber to "Not available" when not provided', () => {
      const result = buildPrintViewModel({
        ...baseParams,
        referenceNumber: undefined
      })

      expect(result.referenceNumber).toBe('Not available')
    })

    test('should exclude pages where no questions have answers', () => {
      const result = buildPrintViewModel({
        ...baseParams,
        answers: { fullName: 'Jane Smith' }
      })

      expect(result.sections).toHaveLength(1)
      expect(result.sections[0].title).toBe('Your details')
    })

    test('should exclude display-only components', () => {
      const displayOnlyAnswers = Object.fromEntries(MOCK_DISPLAY_ONLY_COMPONENTS.map((c) => [c.name, 'some content']))

      const result = buildPrintViewModel({
        ...baseParams,
        definition: {
          pages: [
            {
              title: 'Info page',
              components: [
                ...MOCK_DISPLAY_ONLY_COMPONENTS,
                { type: 'TextField', name: 'realField', title: 'Real field' }
              ]
            }
          ]
        },
        answers: { ...displayOnlyAnswers, realField: 'actual answer' }
      })

      expect(result.sections).toHaveLength(1)
      expect(result.sections[0].questions).toEqual([{ label: 'Real field', answer: 'actual answer' }])
    })

    test('should exclude components with $$-prefixed names', () => {
      const result = buildPrintViewModel({
        ...baseParams,
        definition: {
          pages: [
            {
              title: 'Page 1',
              components: [
                { type: 'TextField', name: '$$internal', title: 'Internal' },
                { type: 'TextField', name: 'visible', title: 'Visible field' }
              ]
            }
          ]
        },
        answers: { $$internal: 'hidden', visible: 'shown' }
      })

      expect(result.sections[0].questions).toEqual([{ label: 'Visible field', answer: 'shown' }])
    })

    test('should skip questions with null or undefined answers', () => {
      const result = buildPrintViewModel({
        ...baseParams,
        definition: {
          pages: [
            {
              title: 'Page 1',
              components: [
                { type: 'TextField', name: 'answered', title: 'Answered' },
                { type: 'TextField', name: 'unanswered', title: 'Unanswered' },
                { type: 'TextField', name: 'nullAnswer', title: 'Null' }
              ]
            }
          ]
        },
        answers: { answered: 'yes', unanswered: undefined, nullAnswer: null }
      })

      expect(result.sections[0].questions).toEqual([{ label: 'Answered', answer: 'yes' }])
    })

    test('should handle definition with no pages', () => {
      const result = buildPrintViewModel({
        ...baseParams,
        definition: {},
        answers: {}
      })

      expect(result.sections).toEqual([])
    })

    test('should handle pages with no components', () => {
      const result = buildPrintViewModel({
        ...baseParams,
        definition: { pages: [{ title: 'Empty page' }] },
        answers: {}
      })

      expect(result.sections).toEqual([])
    })

    const datePartsDefinition = {
      pages: [{ title: 'Dates', components: [{ type: 'DatePartsField', name: 'startDate', title: 'Start date' }] }]
    }

    test.each([
      {
        type: 'DatePartsField',
        name: 'startDate',
        title: 'Start date',
        answers: { startDate__day: 15, startDate__month: 1, startDate__year: 2025 },
        expected: '15 January 2025'
      },
      {
        type: 'MonthYearField',
        name: 'targetMonth',
        title: 'Target month',
        answers: { targetMonth__month: 6, targetMonth__year: 2025 },
        expected: 'June 2025'
      },
      {
        type: 'UkAddressField',
        name: 'businessAddress',
        title: 'Business address',
        answers: {
          businessAddress__addressLine1: '10 Downing Street',
          businessAddress__addressLine2: '',
          businessAddress__town: 'London',
          businessAddress__county: '',
          businessAddress__postcode: 'SW1A 2AA'
        },
        expected: '10 Downing Street, London, SW1A 2AA'
      }
    ])('should resolve $type from flat __ keys in answers', ({ type, name, title, answers, expected }) => {
      const result = buildPrintViewModel({
        ...baseParams,
        definition: { pages: [{ title: 'Page', components: [{ type, name, title }] }] },
        answers
      })

      expect(result.sections).toHaveLength(1)
      expect(result.sections[0].questions).toEqual([{ label: title, answer: expected }])
    })

    test('should exclude composite fields when no flat __ keys are present', () => {
      const result = buildPrintViewModel({
        ...baseParams,
        definition: datePartsDefinition,
        answers: {}
      })

      expect(result.sections).toEqual([])
    })

    test('should prefer direct answer key over flat __ keys for composite fields', () => {
      const result = buildPrintViewModel({
        ...baseParams,
        definition: datePartsDefinition,
        answers: {
          startDate: { day: 1, month: 3, year: 2026 }
        }
      })

      expect(result.sections[0].questions).toEqual([{ label: 'Start date', answer: '1 March 2026' }])
    })

    test.each([
      {
        desc: 'passes through configurablePrintContent',
        field: 'configurablePrintContent',
        input: { html: '<p>Custom print content</p>' },
        expected: { html: '<p>Custom print content</p>' }
      },
      {
        desc: 'passes through applicantDetailsSections',
        field: 'applicantDetailsSections',
        input: {
          person: { rows: [{ key: { text: 'First name' }, value: { text: 'Jane' } }] },
          business: { rows: [{ key: { text: 'Business name' }, value: { text: 'Smith Farms' } }] },
          contact: { rows: [{ key: { text: 'Email address' }, value: { text: 'jane@example.com' } }] }
        },
        expected: {
          person: { rows: [{ key: { text: 'First name' }, value: { text: 'Jane' } }] },
          business: { rows: [{ key: { text: 'Business name' }, value: { text: 'Smith Farms' } }] },
          contact: { rows: [{ key: { text: 'Email address' }, value: { text: 'jane@example.com' } }] }
        }
      },
      {
        desc: 'defaults configurablePrintContent to undefined',
        field: 'configurablePrintContent',
        input: undefined,
        expected: undefined
      },
      {
        desc: 'defaults applicantDetailsSections to undefined',
        field: 'applicantDetailsSections',
        input: undefined,
        expected: undefined
      }
    ])('should resolve $field — $desc', ({ field, input, expected }) => {
      const result = buildPrintViewModel({ ...baseParams, ...(input === undefined ? {} : { [field]: input }) })
      expect(result[field]).toEqual(expected)
    })

    test('should return populated paymentInfo when answers contain payment data', () => {
      const result = buildPrintViewModel({
        ...baseParams,
        answers: {
          ...baseParams.answers,
          payment: MOCK_PAYMENT
        }
      })

      expect(result.paymentInfo).not.toBeNull()
      expect(result.paymentInfo.totalAnnualPayment).toBe('£1500.00')
      expect(result.paymentInfo.parcelItems).toHaveLength(2)
      expect(result.paymentInfo.parcelItems[0].cardTitle).toBe('Land parcel ID AB1234 0001')
    })
  })

  describe('enrichDefinitionWithListItems', () => {
    test('should resolve list UUID references to items on components', () => {
      const definition = {
        pages: [
          {
            components: [
              { name: 'radios', type: 'RadiosField', list: 'list-uuid-1' },
              { name: 'text', type: 'TextField' }
            ]
          }
        ],
        lists: [
          {
            id: 'list-uuid-1',
            items: [
              { text: 'Option A', value: 'a' },
              { text: 'Option B', value: 'b' }
            ]
          }
        ]
      }

      enrichDefinitionWithListItems(definition)

      expect(definition.pages[0].components[0].items).toEqual([
        { text: 'Option A', value: 'a' },
        { text: 'Option B', value: 'b' }
      ])
      expect(definition.pages[0].components[1].items).toBeUndefined()
    })

    test('should overwrite existing items when list UUID is present', () => {
      const existingItems = [{ text: 'Existing', value: 'existing' }]
      const definition = {
        pages: [
          {
            components: [{ name: 'radios', type: 'RadiosField', list: 'list-uuid-1', items: existingItems }]
          }
        ],
        lists: [{ id: 'list-uuid-1', items: [{ text: 'New', value: 'new' }] }]
      }

      enrichDefinitionWithListItems(definition)

      expect(definition.pages[0].components[0].items).toEqual([{ text: 'New', value: 'new' }])
    })

    test('should handle definition with no lists', () => {
      const definition = {
        pages: [{ components: [{ name: 'field', type: 'RadiosField', list: 'missing-uuid' }] }]
      }

      enrichDefinitionWithListItems(definition)

      expect(definition.pages[0].components[0].items).toBeUndefined()
    })

    test('should handle empty definition', () => {
      const definition = {}
      const result = enrichDefinitionWithListItems(definition)
      expect(result).toBe(definition)
    })

    test('should resolve list with no items to an empty array', () => {
      const definition = {
        pages: [
          {
            components: [{ name: 'radios', type: 'RadiosField', list: 'list-uuid-1' }]
          }
        ],
        lists: [{ id: 'list-uuid-1' }]
      }

      enrichDefinitionWithListItems(definition)

      expect(definition.pages[0].components[0].items).toEqual([])
    })

    test('should handle pages with no components property', () => {
      const definition = {
        pages: [{ title: 'Empty page' }],
        lists: [{ id: 'list-uuid-1', items: [{ text: 'A', value: 'a' }] }]
      }

      const result = enrichDefinitionWithListItems(definition)

      expect(result).toBe(definition)
    })

    test('should ignore non-string list references', () => {
      const definition = {
        pages: [{ components: [{ name: 'field', type: 'RadiosField', list: { nested: true } }] }],
        lists: [{ id: 'some-id', items: [{ text: 'A', value: 'a' }] }]
      }

      enrichDefinitionWithListItems(definition)

      expect(definition.pages[0].components[0].items).toBeUndefined()
    })
  })

  describe('processConfigurablePrintContent', () => {
    beforeEach(() => {
      vi.mocked(ComponentsRegistry.replaceComponents).mockImplementation((html) => html)
    })

    test.each([
      ['undefined', undefined],
      ['has no html', {}]
    ])('should return undefined when configurablePrintContent is %s', (_desc, input) => {
      expect(processConfigurablePrintContent(input, 'test-form')).toBeUndefined()
    })

    test('should replace {{SLUG}} tokens in html', () => {
      const result = processConfigurablePrintContent({ html: '<a href="/{{SLUG}}/help">Help</a>' }, 'my-form')

      expect(result).toEqual({ html: '<a href="/my-form/help">Help</a>' })
    })

    test('should call ComponentsRegistry.replaceComponents', () => {
      ComponentsRegistry.replaceComponents.mockReturnValue('<p>replaced</p>')

      const result = processConfigurablePrintContent({ html: '<p>{{COMPONENT}}</p>' }, 'slug')

      expect(ComponentsRegistry.replaceComponents).toHaveBeenCalledWith('<p>{{COMPONENT}}</p>')
      expect(result).toEqual({ html: '<p>replaced</p>' })
    })
  })
})

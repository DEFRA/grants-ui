import { validateApplicationAnswers } from './gas-answers.schema.js'
import { transformAnswerKeysToText } from './state-to-gas-answers-mapper.js'

describe('transformAnswerKeysToText', () => {
  const listDefMap = new Map([
    [
      'schemeList',
      {
        items: [
          { value: 'scheme-1', text: 'Scheme One' },
          { value: 'scheme-2', text: 'Scheme Two' }
        ]
      }
    ],
    [
      'actionCodeList',
      {
        items: [
          { value: 'code-1', text: 'Action Code One' },
          { value: 'code-2', text: 'Action Code Two' }
        ]
      }
    ]
  ])

  const componentDefMap = new Map([
    ['scheme', { list: 'schemeList' }],
    ['applicantFirstName', {}],
    ['isInEngland', {}],
    ['code', { list: 'actionCodeList' }]
  ])

  it('should transform single list fields into text', () => {
    const state = { scheme: 'scheme-1' }
    const result = transformAnswerKeysToText(state, componentDefMap, listDefMap)
    expect(result.scheme).toBe('Scheme One')
  })

  it('should transform non-list fields as-is', () => {
    const state = { applicantFirstName: 'John', isInEngland: true }
    const result = transformAnswerKeysToText(state, componentDefMap, listDefMap)
    expect(result.applicantFirstName).toBe('John')
    expect(result.isInEngland).toBe(true)
  })

  it('should handle array fields (checkbox style) into array of text', () => {
    const extendedComponentDefMap = new Map(componentDefMap)
    extendedComponentDefMap.set('multiSelectField', { list: 'schemeList' })

    const state = { multiSelectField: ['scheme-1', 'scheme-2'] }
    const result = transformAnswerKeysToText(
      state,
      extendedComponentDefMap,
      listDefMap
    )

    expect(result.multiSelectField).toEqual(['Scheme One', 'Scheme Two'])
  })

  it('should fallback to using raw value if no list entry is found', () => {
    const state = { scheme: 'unknown-scheme' }
    const result = transformAnswerKeysToText(state, componentDefMap, listDefMap)
    expect(result.scheme).toBe('unknown-scheme')
  })

  it('should handle empty state gracefully', () => {
    const result = transformAnswerKeysToText({}, componentDefMap, listDefMap)
    expect(result).toEqual({})
  })
})

describe('schema validation', () => {
  describe('output always conforms to GASPayload schema structure', () => {
    const validPayload = {
      $$__referenceNumber: 'AV-108-333',
      natureOfBusinessRadiosField:
        'A grower or producer of agricultural or horticultural produce',
      legalStatusRadiosField: 'Sole trader',
      countryYesNoField: true,
      planningPermissionRadiosField: 'Not needed',
      projectStartRadiosField: 'Yes, preparatory work',
      tenancyYesNoField: true,
      smallerAbattoirYesNoField: true,
      otherFarmersYesNoField: true,
      projectItemsCheckboxesField: [
        'Constructing or improving buildings for processing'
      ],
      storageRadiosField: 'Yes, we will need storage facilities',
      projectCostNumberField: 123456,
      remainingCostsYesNoField: true,
      produceProcessedRadiosField: 'Arable produce',
      howAddingValueRadiosField: 'Introducing a new product to your farm',
      projectImpactCheckboxesField: [
        'Increasing range of added-value products'
      ],
      mechanisationYesNoField: true,
      manualLabourAmountRadiosField: 'Up to 5% of workforce',
      applyingRadiosField: 'Applicant',
      applicantFirstName: 'John',
      applicantLastName: 'Doe',
      applicantEmailAddress: 'john.doe@example.com',
      applicantConfirmEmailAddress: 'john.doe@example.com',
      applicantMobileNumber: '1234567890',
      applicantLandlineNumber: '0987654321',
      applicantBusinessAddress__addressLine1: '123 Main St',
      applicantBusinessAddress__addressLine2: null,
      applicantBusinessAddress__town: 'Townsville',
      applicantBusinessAddress__county: null,
      applicantBusinessAddress__postcode: 'AB12 3CD',
      applicantProjectPostcode: 'XY45 6ZT'
    }

    it('should validate a correct payload without errors', () => {
      const result = validateApplicationAnswers(validPayload)
      expect(result.error).toBeUndefined()
      expect(result.value).toEqual(validPayload)
    })

    it('should return an error if a boolean field has wrong type', () => {
      const invalidPayload = {
        ...validPayload,
        countryYesNoField: 'yes'
      }
      const result = validateApplicationAnswers(invalidPayload)
      expect(result.error).toBeDefined()
      expect(result.error.details[0].path).toContain('countryYesNoField')
    })

    it('should allow missing optional fields without error', () => {
      const partialPayload = {
        applicantFirstName: 'John'
      }
      const result = validateApplicationAnswers(partialPayload)
      expect(result.error).toBeUndefined()
      expect(result.value.applicantFirstName).toBe('John')
    })

    it('should return an error if email fields are invalid', () => {
      const invalidPayload = {
        ...validPayload,
        applicantEmailAddress: 'not-an-email'
      }
      const result = validateApplicationAnswers(invalidPayload)
      expect(result.error).toBeDefined()
      expect(result.error.details[0].path).toContain('applicantEmailAddress')
    })
  })
})

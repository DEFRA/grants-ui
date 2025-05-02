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
    ['year', {}],
    ['hasCheckedLandIsUpToDate', {}],
    ['actionApplications', {}], // nested, handled directly, not by list
    ['code', { list: 'actionCodeList' }]
  ])

  it('should transform single list fields into value-text objects', () => {
    const state = { scheme: 'scheme-1' }
    const result = transformAnswerKeysToText(state, componentDefMap, listDefMap)
    expect(result.scheme).toEqual({ value: 'scheme-1', text: 'Scheme One' })
  })

  it('should transform non-list fields as-is', () => {
    const state = { year: 2025, hasCheckedLandIsUpToDate: true }
    const result = transformAnswerKeysToText(state, componentDefMap, listDefMap)
    expect(result.year).toBe(2025)
    expect(result.hasCheckedLandIsUpToDate).toBe(true)
  })

  it('should handle array fields (checkbox style) into array of value-text objects', () => {
    const extendedComponentDefMap = new Map(componentDefMap)
    extendedComponentDefMap.set('multiSelectField', { list: 'schemeList' })

    const state = { multiSelectField: ['scheme-1', 'scheme-2'] }
    const result = transformAnswerKeysToText(
      state,
      extendedComponentDefMap,
      listDefMap
    )

    expect(result.multiSelectField).toEqual([
      { value: 'scheme-1', text: 'Scheme One' },
      { value: 'scheme-2', text: 'Scheme Two' }
    ])
  })

  it('should fallback to using raw value if no list entry is found', () => {
    const state = { scheme: 'unknown-scheme' }
    const result = transformAnswerKeysToText(state, componentDefMap, listDefMap)
    expect(result.scheme).toEqual({
      value: 'unknown-scheme',
      text: 'unknown-scheme'
    })
  })

  it('should skip list transformation for nested actionApplications array', () => {
    const state = {
      actionApplications: [
        {
          parcelId: 'P1',
          sheetId: 'S1',
          code: 'code-1',
          appliedFor: { unit: 'ha', quantity: 10 }
        }
      ]
    }
    const result = transformAnswerKeysToText(state, componentDefMap, listDefMap)
    expect(result.actionApplications).toEqual([
      {
        parcelId: 'P1',
        sheetId: 'S1',
        code: 'code-1',
        appliedFor: { unit: 'ha', quantity: 10 }
      }
    ])
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
      natureOfBusinessRadiosField: {
        value: 'natureOfBusiness-A1',
        text: 'A grower or producer of agricultural or horticultural produce'
      },
      legalStatusRadiosField: {
        value: 'legalStatus-A1',
        text: 'Sole trader'
      },
      countryYesNoField: true,
      planningPermissionRadiosField: {
        value: 'planningPermission-A1',
        text: 'Not needed'
      },
      projectStartRadiosField: {
        value: 'projectStart-A1',
        text: 'Yes, preparatory work'
      },
      tenancyYesNoField: true,
      smallerAbattoirYesNoField: true,
      otherFarmersYesNoField: true,
      projectItemsCheckboxesField: [
        {
          value: 'projectItems-A1',
          text: 'Constructing or improving buildings for processing'
        }
      ],
      storageRadiosField: {
        value: 'storageRadios-A1',
        text: 'Yes, we will need storage facilities'
      },
      projectCostNumberField: 123456,
      remainingCostsYesNoField: true,
      produceProcessedRadiosField: {
        value: 'produceProcessed-A1',
        text: 'Arable produce'
      },
      howAddingValueRadiosField: {
        value: 'howAddingValue-A1',
        text: 'Introducing a new product to your farm'
      },
      projectImpactCheckboxesField: [
        {
          value: 'projectImpact-A1',
          text: 'Increasing range of added-value products'
        }
      ],
      mechanisationYesNoField: true,
      manualLabourAmountRadiosField: {
        value: 'manualLabourAmount-A1',
        text: 'Up to 5% of workforce'
      },
      applyingRadiosField: {
        value: 'applying-A1',
        text: 'Applicant'
      },
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

    it('should return an error if value/text pair is missing', () => {
      const invalidPayload = {
        ...validPayload,
        natureOfBusinessRadiosField: 'just a string'
      }
      const result = validateApplicationAnswers(invalidPayload)
      expect(result.error).toBeDefined()
      expect(result.error.details[0].path).toContain(
        'natureOfBusinessRadiosField'
      )
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

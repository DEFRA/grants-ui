import {
  formSubmissionService,
  loadSubmissionSchemaValidators,
  validateSubmissionAnswers
} from './submission.js'

describe('formSubmissionService', () => {
  test('submit resolves with expected structure when formData is empty', async () => {
    const state = {
      referenceNumber: 'REF123'
    }
    await expect(formSubmissionService.submit({}, state)).resolves.toEqual({
      message: 'Form submitted successfully',
      result: {
        referenceNumber: 'REF123'
      }
    })
  })

  test('submit includes submissionDetails when formData has fields', async () => {
    const state = {
      referenceNumber: 'REF123'
    }
    const formData = {
      field1: 'value1',
      field2: 'value2'
    }
    const result = await formSubmissionService.submit(formData, state)

    expect(result.message).toBe('Form submitted successfully')
    expect(result.result.referenceNumber).toBe('REF123')
    expect(result.result.submissionDetails).toBeDefined()
    expect(result.result.submissionDetails.fieldsSubmitted).toBe(2)
    expect(result.result.submissionDetails.timestamp).toBeDefined()
  })

  test('submit handles null formData', async () => {
    const state = {
      referenceNumber: 'REF123'
    }
    await expect(formSubmissionService.submit(null, state)).resolves.toEqual({
      message: 'Form submitted successfully',
      result: {
        referenceNumber: 'REF123'
      }
    })
  })
})

describe('Validate submission answers', () => {
  const GRANT_CODE = 'adding-value' // update this to match the real code, e.g., 'GAS123'

  const validPayload = {
    referenceNumber: 'AV-108-333',
    businessNature:
      'A grower or producer of agricultural or horticultural produce',
    businessLegalStatus: 'Sole trader',
    isInEngland: true,
    planningPermissionStatus: 'Not needed',
    projectStartStatus: 'Yes, preparatory work',
    isLandBusinessOwned: true,
    hasFiveYearTenancyAgreement: false,
    isBuildingSmallerAbattoir: true,
    isBuildingFruitStorage: false,
    isProvidingServicesToOtherFarmers: true,
    eligibleItemsNeeded: ['Constructing or improving buildings for processing'],
    needsStorageFacilities: 'Yes, we will need storage facilities',
    estimatedCost: 123456,
    canPayRemainingCosts: true,
    processedProduceType: 'Arable produce',
    valueAdditionMethod: 'Introducing a new product to your farm',
    impactType: ['Increasing range of added-value products'],
    hasMechanisationUsage: true,
    manualLabourEquivalence: 'Up to 5% of workforce',
    grantApplicantType: 'Applicant',
    agentFirstName: 'Ted',
    agentLastName: 'Smith',
    agentBusinessName: 'Business 1',
    agentEmail: 'some.one@example.com',
    agentEmailConfirmation: 'some.one@example.com',
    agentMobile: '04324325435',
    agentLandline: '02124325435',
    agentBusinessAddress__addressLine1: 'Somewhere',
    agentBusinessAddress__addressLine2: 'Somewhere Else',
    agentBusinessAddress__town: 'Some Town',
    agentBusinessAddress__county: 'Some County',
    agentBusinessAddress__postcode: 'CR5 1AA',
    applicantFirstName: 'John',
    applicantLastName: 'Doe',
    applicantEmail: 'john.doe@example.com',
    applicantEmailConfirmation: 'john.doe@example.com',
    applicantMobile: '1234567890',
    applicantLandline: '0987654321',
    applicantBusinessAddress__addressLine1: '123 Main St',
    applicantBusinessAddress__addressLine2: null,
    applicantBusinessAddress__town: 'Townsville',
    applicantBusinessAddress__county: null,
    applicantBusinessAddress__postcode: 'AB12 3CD',
    applicantProjectPostcode: 'XY45 6ZT'
  }

  beforeAll(() => {
    loadSubmissionSchemaValidators()
  })

  it('throws an error when no validator exists for a grant code', () => {
    expect(() => {
      validateSubmissionAnswers({}, 'UNKNOWN_CODE')
    }).toThrow('No validator found for grantCode: UNKNOWN_CODE')
  })

  it('should validate a correct payload without errors', () => {
    const result = validateSubmissionAnswers(validPayload, GRANT_CODE)
    expect(result.errors).toBeUndefined()
    expect(result.value).toEqual(validPayload)
  })

  it('should return an error if a boolean field has wrong type', () => {
    const invalidPayload = {
      ...validPayload,
      isInEngland: 'yes'
    }
    const result = validateSubmissionAnswers(invalidPayload, GRANT_CODE)
    expect(result.errors).toBeDefined()
    expect(result.errors[0].instancePath).toContain('/isInEngland')
    expect(result.errors[0].message).toContain('must be boolean')
  })

  it('should allow missing optional fields without error', () => {
    const payloadWithoutOptionalField = { ...validPayload }
    delete payloadWithoutOptionalField.agentFirstName

    const result = validateSubmissionAnswers(
      payloadWithoutOptionalField,
      GRANT_CODE
    )
    expect(result.errors).toBeUndefined()
    expect(result.value.agentFirstName).toBeUndefined()
  })

  it('should return an error if email fields are invalid', () => {
    const invalidPayload = {
      ...validPayload,
      applicantEmail: 'not-an-email'
    }
    const result = validateSubmissionAnswers(invalidPayload, GRANT_CODE)
    expect(result.errors).toBeDefined()
    expect(result.errors[0].message).toContain('must match format "email"')
  })

  it('should return an error if missing required field', () => {
    const payloadWithoutRequiredField = { ...validPayload }
    delete payloadWithoutRequiredField.applicantFirstName

    const result = validateSubmissionAnswers(
      payloadWithoutRequiredField,
      GRANT_CODE
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors[0].message).toContain(
      "must have required property 'applicantFirstName'"
    )
  })
})

import { loadSubmissionSchemaValidators, validateSubmissionAnswers } from './submission.js'

describe('Validate submission answers', () => {
  const GRANT_CODE = 'example-grant-with-auth-v3'

  const validPayload = {
    yesNoField: true,
    autocompleteField: 'WAL',
    radiosField: 'radiosFieldOption-A2',
    checkboxesField: ['checkboxesFieldOption-A2'],
    numberField: 100000,
    datePartsField__day: 1,
    datePartsField__month: 12,
    datePartsField__year: 2025,
    monthYearField__month: 12,
    monthYearField__year: 2026,
    selectField: 'selectFieldOption-A4',
    multilineTextField: 'This is a test',
    applicantName: 'John Smith',
    applicantEmail: 'john.smith@example.com',
    applicantMobile: '07111 111111',
    applicantBusinessAddress__addressLine1: '111 Test Street',
    applicantBusinessAddress__addressLine2: null,
    applicantBusinessAddress__town: 'Testville',
    applicantBusinessAddress__county: null,
    applicantBusinessAddress__postcode: 'TE5 7PO'
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
      yesNoField: 'yes'
    }
    const result = validateSubmissionAnswers(invalidPayload, GRANT_CODE)
    expect(result.errors).toBeDefined()
    expect(result.errors[0].instancePath).toContain('/yesNoField')
    expect(result.errors[0].message).toContain('must be boolean')
  })

  it('should allow missing optional fields without error', () => {
    const payloadWithoutOptionalField = { ...validPayload }
    delete payloadWithoutOptionalField.applicantBusinessAddress__addressLine2

    const result = validateSubmissionAnswers(payloadWithoutOptionalField, GRANT_CODE)
    expect(result.errors).toBeUndefined()
    expect(result.value.applicantBusinessAddress__addressLine2).toBeUndefined()
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
    delete payloadWithoutRequiredField.applicantName

    const result = validateSubmissionAnswers(payloadWithoutRequiredField, GRANT_CODE)

    expect(result.valid).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors[0].message).toContain("must have required property 'applicantName'")
  })
})

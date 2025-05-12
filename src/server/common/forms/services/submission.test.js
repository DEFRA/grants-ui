import { formSubmissionService } from './submission.js'

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

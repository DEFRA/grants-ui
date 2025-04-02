import { formSubmissionService } from './submission.js'

describe('formSubmissionService', () => {
  test('submit resolves with expected structure', async () => {
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
})

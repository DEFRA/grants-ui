import { formSubmissionService } from './submission.js'

describe('formSubmissionService', () => {
  test('submit resolves with expected structure', async () => {
    await expect(formSubmissionService.submit()).resolves.toEqual({
      message: 'string',
      result: {}
    })
  })
})

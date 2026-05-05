import { Given, Then, Before, After } from '@wdio/cucumber-framework'
import Gas from '../utils/gas'
import referenceNumbers from '../utils/reference-number-store'
import expectationIds from '../utils/expectation-id-store'

if (process.env.MOCKSERVER_HOST) {
  Before(async () => {
    const expectationId = await Gas.setDefaultStatusQuery404Response()
    expectationIds.push(expectationId)
  })

  After(async () => {
    for (const expectationId of expectationIds.all) {
      await Gas.clearExpectation(expectationId)
    }
  })
}

Given(
  'the next application submitted to GAS for SBI {string} will return HTTP {int} {string} for {int} requests',
  async (sbi, httpStatusCode, errorText, times) => {
    const expectationId = await Gas.setApplicationSubmissionResponse(sbi, httpStatusCode, errorText, times)
    expectationIds.push(expectationId)
  }
)

Given('the application status in GAS is now {string}', async (gasStatus) => {
  if (!referenceNumbers.current) {
    throw new Error('No reference number stored by earlier step')
  }

  const expectationId = await Gas.setStatusQueryResponse(referenceNumbers.current, gasStatus)
  expectationIds.push(expectationId)
})

Given(
  'the application status in GAS for reference number {string} is now {string}',
  async (referenceNumber, gasStatus) => {
    await Gas.setStatusQueryResponse(referenceNumber, gasStatus)
  }
)

Then('the reference number along with SBI {string} and CRN {string} should be submitted to GAS', async (sbi, crn) => {
  if (!referenceNumbers.current) {
    throw new Error('No reference number stored by earlier step')
  }

  const request = await Gas.getApplicationSubmission(referenceNumbers.current)
  expect(request).not.toBeNull()
  expect(request.body.json.metadata.clientRef).toEqual(referenceNumbers.current.toLowerCase())
  expect(request.body.json.metadata.sbi).toEqual(sbi)
  expect(request.body.json.metadata.crn).toEqual(crn)
  expect(request.body.json.answers.referenceNumber).toEqual(referenceNumbers.current)
})

Then(
  'the reference number and previous reference number along with SBI {string} and CRN {string} should be submitted to GAS',
  async (sbi, crn) => {
    if (!referenceNumbers.current) {
      throw new Error('No reference number stored by earlier step')
    }

    if (!referenceNumbers.previous) {
      throw new Error('No previous reference number stored by earlier step')
    }

    const request = await Gas.getApplicationSubmission(referenceNumbers.current)
    expect(request).not.toBeNull()
    expect(request.body.json.metadata.clientRef).toEqual(referenceNumbers.current.toLowerCase())
    expect(request.body.json.metadata.previousClientRef).toEqual(referenceNumbers.previous.toLowerCase())
    expect(request.body.json.metadata.sbi).toEqual(sbi)
    expect(request.body.json.metadata.crn).toEqual(crn)
    expect(request.body.json.answers.referenceNumber).toEqual(referenceNumbers.current)
  }
)

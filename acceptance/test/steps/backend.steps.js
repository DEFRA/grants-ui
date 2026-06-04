import { Given, Then } from '@cucumber/cucumber'
import expect from '../support/expect.js'
import { transformStepArgument } from '../utils/step-argument-transformation.js'
import Backend from '../utils/backend.js'

Given(
  'there is no application lock for CRN {string} and SBI {string} and grant {string}',
  async function (crn, sbi, grantCode) {
    await Backend.deleteLock(crn, sbi, grantCode)
  }
)

Given(
  'there is no application state stored for CRN {string} and SBI {string} and grant {string}',
  async function (crn, sbi, grantCode) {
    await Backend.deleteState(crn, sbi, grantCode)
  }
)

Then(
  'there should be application state stored for CRN {string} and SBI {string} and grant {string}',
  async function (crn, sbi, grantCode) {
    await Backend.getState(crn, sbi, grantCode)
  }
)

Then(
  'the following application state should be stored for CRN {string} and SBI {string} and grant {string}',
  async function (crn, sbi, grantCode, dataTable) {
    const state = await Backend.getState(crn, sbi, grantCode)
    for (const row of dataTable.hashes()) {
      expect(state[row.FIELD]).toEqual(transformStepArgument(row.VALUE))
    }
  }
)

Then(
  'the following application submissions should be stored for CRN {string} and SBI {string} and grant {string}',
  async function (crn, sbi, grantCode, dataTable) {
    const submissions = await Backend.getSubmissions(crn, sbi, grantCode)
    dataTable.hashes().forEach((row, i) => {
      expect(submissions[i].referenceNumber).toEqual(transformStepArgument(row['REFERENCE NUMBER']))
      if (row['PREVIOUS REFERENCE NUMBER']) {
        expect(submissions[i].previousReferenceNumber).toEqual(transformStepArgument(row['PREVIOUS REFERENCE NUMBER']))
      }
      expect(submissions[i].crn).toEqual(row.CRN)
    })
  }
)

Then(
  'the grants-ui application status for CRN {string} and SBI {string} and grant {string} should (still )be {string}',
  async function (crn, sbi, grantCode, status) {
    const application = await Backend.getState(crn, sbi, grantCode)
    expect(application.applicationStatus).toEqual(status)
  }
)

import { Given, Then } from '@cucumber/cucumber'
import expect from '../support/expect.js'
import { purgeAuditQueue, waitForAuditEvent } from '../utils/audit.js'
import { transformStepArgument } from '../utils/step-argument-transformation.js'

Given('the audit queue is empty', async function () {
  await purgeAuditQueue()
})

Then(
  'an authorised audit event should be published for grant {string} with CRN {string} and SBI {string}',
  async function (grantCode, crn, sbi) {
    const event = await waitForAuditEvent({
      entity: 'application',
      action: 'authorised',
      entityId: grantCode,
      crn,
      sbi
    })
    expect(event).not.toBeNull()
  }
)

Then(
  'a navigate audit event should be published for page {string} with CRN {string} and SBI {string}',
  async function (entityId, crn, sbi) {
    const event = await waitForAuditEvent({ entity: 'page', action: 'navigate', entityId, crn, sbi })
    expect(event).not.toBeNull()
  }
)

Then(
  'a resubmit audit event should be published for entity {string} with CRN {string} and SBI {string}',
  async function (entityId, crn, sbi) {
    const event = await waitForAuditEvent({
      entity: 'application',
      action: 'resubmit',
      entityId: transformStepArgument(entityId),
      crn,
      sbi
    })
    expect(event).not.toBeNull()
  }
)

Then(
  'a submit audit event should be published for entity {string} with CRN {string} and SBI {string}',
  async function (entityId, crn, sbi) {
    const event = await waitForAuditEvent({
      entity: 'application',
      action: 'submit',
      entityId: transformStepArgument(entityId),
      crn,
      sbi
    })
    expect(event).not.toBeNull()
  }
)

Then('an unauthorised audit event should be published for grant {string}', async function (grantCode) {
  const event = await waitForAuditEvent({ entity: 'application', action: 'unauthorised', entityId: grantCode })
  expect(event).not.toBeNull()
})

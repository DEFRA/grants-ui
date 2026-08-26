import { Then } from '@cucumber/cucumber'
import expect from '../support/expect.js'
import { waitForAuditEvent } from '../utils/audit.js'
import { transformStepArgument } from '../utils/step-argument-transformation.js'

Then(
  'an authorised audit event should be published for entity {string} and grant {string} with CRN {string} and SBI {string}',
  async function (entity, grantCode, crn, sbi) {
    const event = await waitForAuditEvent(this.auditQueue.queueUrl, {
      entity,
      action: 'authorised',
      entityId: grantCode,
      crn,
      sbi
    })
    expect(event).not.toBeNull()
  }
)

async function assertNavigateAuditEvent(world, { grantCode, entityId, crn, sbi, dataTable }) {
  const answers = Object.fromEntries(
    (dataTable?.hashes() ?? []).map((row) => [row.FIELD, transformStepArgument(row.VALUE)])
  )
  const event = await waitForAuditEvent(world.auditQueue.queueUrl, {
    entity: 'page',
    action: 'navigate',
    entityId,
    crn,
    sbi,
    grant: grantCode,
    answers
  })
  expect(event).not.toBeNull()
}

Then(
  'a navigate audit event should be published for grant {string} and entityId {string} with CRN {string} and SBI {string}',
  async function (grantCode, entityId, crn, sbi) {
    await assertNavigateAuditEvent(this, { grantCode, entityId, crn, sbi })
  }
)

Then(
  'a navigate audit event should be published for grant {string} and entityId {string} with CRN {string} and SBI {string} with the following answers',
  async function (grantCode, entityId, crn, sbi, dataTable) {
    await assertNavigateAuditEvent(this, { grantCode, entityId, crn, sbi, dataTable })
  }
)

Then(
  'a resubmit audit event should be published for entity {string} with CRN {string} and SBI {string}',
  async function (entityId, crn, sbi) {
    const event = await waitForAuditEvent(this.auditQueue.queueUrl, {
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
  'a submit audit event should be published for entity {string} and entityId {string} with CRN {string} and SBI {string}',
  async function (entity, entityId, crn, sbi) {
    const event = await waitForAuditEvent(this.auditQueue.queueUrl, {
      entity,
      action: 'submit',
      entityId: transformStepArgument(entityId),
      crn,
      sbi
    })
    expect(event).not.toBeNull()
  }
)

Then(
  'an unauthorised audit event should be published for entity {string} and grant {string} with CRN {string} and SBI {string} and reason {string}',
  async function (entity, grantCode, crn, sbi, reason) {
    const event = await waitForAuditEvent(this.auditQueue.queueUrl, {
      entity,
      action: 'unauthorised',
      entityId: grantCode,
      crn,
      sbi,
      reason
    })
    expect(event).not.toBeNull()
  }
)

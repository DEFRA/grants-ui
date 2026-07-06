import { Then } from '@cucumber/cucumber'
import expect from '../support/expect.js'
import { waitForAuditEvent } from '../utils/audit.js'
import { transformStepArgument } from '../utils/step-argument-transformation.js'

Then(
  'an authorised audit event should be published for grant {string} with CRN {string} and SBI {string}',
  async function (grantCode, crn, sbi) {
    const event = await waitForAuditEvent(this.auditQueue.queueUrl, {
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
  'a navigate audit event should be published for grant {string} and page {string} with CRN {string} and SBI {string}( with the following answers)',
  async function (grantCode, entityId, crn, sbi, dataTable) {
    const answers = Object.fromEntries(
      (dataTable?.hashes() ?? []).map((row) => [row.FIELD, transformStepArgument(row.VALUE)])
    )
    const event = await waitForAuditEvent(this.auditQueue.queueUrl, {
      entity: 'page',
      action: 'navigate',
      entityId,
      crn,
      sbi,
      grant: grantCode,
      ...(dataTable && { answers })
    })
    expect(event).not.toBeNull()
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
  'a submit audit event should be published for entity {string} with CRN {string} and SBI {string}',
  async function (entityId, crn, sbi) {
    const event = await waitForAuditEvent(this.auditQueue.queueUrl, {
      entity: 'application',
      action: 'submit',
      entityId: transformStepArgument(entityId),
      crn,
      sbi
    })
    expect(event).not.toBeNull()
  }
)

Then(
  'an unauthorised audit event should be published for grant {string} with CRN {string} and SBI {string} and reason {string}',
  async function (grantCode, crn, sbi, reason) {
    const event = await waitForAuditEvent(this.auditQueue.queueUrl, {
      entity: 'application',
      action: 'unauthorised',
      entityId: grantCode,
      crn,
      sbi,
      reason
    })
    expect(event).not.toBeNull()
  }
)

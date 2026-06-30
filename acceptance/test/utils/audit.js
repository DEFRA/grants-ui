import { SQSClient, PurgeQueueCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs'

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT
const QUEUE_URL = `${LOCALSTACK_ENDPOINT}/000000000000/fcp_audit`
const POLL_INTERVAL_MS = 500
const POLL_TIMEOUT_MS = 20_000

const client = new SQSClient({
  region: 'eu-west-2',
  credentials: { accessKeyId: 'x', secretAccessKey: 'x' },
  endpoint: () => Promise.resolve({ url: new URL(LOCALSTACK_ENDPOINT) })
})

/**
 * Purges all messages from the fcp_audit SQS queue.
 */
export const purgeAuditQueue = async () => {
  await client.send(new PurgeQueueCommand({ QueueUrl: QUEUE_URL }))
}

/**
 * Polls the fcp_audit queue until a matching event arrives or the timeout elapses.
 * @param {{ entity: string, action: string, entityId: string, crn?: string, sbi?: string }} criteria - crn and sbi must be provided together
 * @returns {Promise<Record<string, unknown> | null>}
 */
export const waitForAuditEvent = async ({ entity, action, entityId, crn, sbi }) => {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  const seen = new Set()

  while (Date.now() < deadline) {
    const { Messages = [] } = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 1
      })
    )

    for (const message of Messages) {
      if (seen.has(message.MessageId)) {
        continue
      }
      seen.add(message.MessageId)

      try {
        const body = JSON.parse(message.Body)
        if (
          body.audit.entities.some(
            (e) => e.entity === entity && e.action === action && e.entityid.toLowerCase() === entityId.toLowerCase()
          ) &&
          (crn === undefined || (body.audit.accounts.crn === crn && body.audit.accounts.sbi === sbi))
        ) {
          return body
        }
      } catch {
        // unparseable message — skip
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  return null
}

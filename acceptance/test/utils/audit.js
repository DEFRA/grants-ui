import { randomUUID } from 'node:crypto'
import { SNSClient, SubscribeCommand, UnsubscribeCommand } from '@aws-sdk/client-sns'
import { SQSClient, CreateQueueCommand, DeleteQueueCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs'

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT
const AUDIT_TOPIC_ARN = process.env.AUDIT_SNS_TOPIC_ARN || 'arn:aws:sns:eu-west-2:000000000000:fcp_audit_events'
const POLL_INTERVAL_MS = 500
const POLL_TIMEOUT_MS = 20_000

const endpoint = () => Promise.resolve({ url: new URL(LOCALSTACK_ENDPOINT) })

const sqsClient = new SQSClient({
  region: 'eu-west-2',
  credentials: { accessKeyId: 'x', secretAccessKey: 'x' },
  endpoint
})

const snsClient = new SNSClient({
  region: 'eu-west-2',
  credentials: { accessKeyId: 'x', secretAccessKey: 'x' },
  endpoint
})

/**
 * Creates a queue dedicated to one scenario and subscribes it to the audit SNS
 * topic, so the scenario gets its own uncontended copy of every audit event
 * published during its lifetime — no sampling contention with other
 * concurrently-running scenarios reading the shared fcp_audit queue.
 * @returns {Promise<{ queueUrl: string, subscriptionArn: string }>}
 */
export const createScenarioAuditQueue = async () => {
  const queueName = `fcp_audit_test_${randomUUID()}`

  const { QueueUrl: queueUrl } = await sqsClient.send(new CreateQueueCommand({ QueueName: queueName }))

  const queueArn = `arn:aws:sqs:eu-west-2:000000000000:${queueName}`
  const { SubscriptionArn: subscriptionArn } = await snsClient.send(
    new SubscribeCommand({
      TopicArn: AUDIT_TOPIC_ARN,
      Protocol: 'sqs',
      Endpoint: queueArn,
      Attributes: { RawMessageDelivery: 'true' }
    })
  )

  return { queueUrl, subscriptionArn }
}

/**
 * Tears down a scenario's dedicated audit queue and its topic subscription.
 * @param {{ queueUrl: string, subscriptionArn: string }} scenarioQueue
 */
export const deleteScenarioAuditQueue = async ({ queueUrl, subscriptionArn }) => {
  await snsClient.send(new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }))
  await sqsClient.send(new DeleteQueueCommand({ QueueUrl: queueUrl }))
}

/**
 * Polls the given queue until a matching audit event arrives or the timeout
 * elapses.
 * @param {string} queueUrl - URL of the queue to poll (a scenario's own dedicated queue).
 * @param {{ entity: string, action: string, entityId: string, crn?: string, sbi?: string, reason?: string, grant?: string, answers?: Record<string, unknown> }} criteria - crn and sbi must be provided together
 * @returns {Promise<Record<string, unknown> | null>}
 */
export const waitForAuditEvent = async (queueUrl, { entity, action, entityId, crn, sbi, reason, grant, answers }) => {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  const seen = new Set()

  while (Date.now() < deadline) {
    const { Messages = [] } = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
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
          (crn === undefined || (body.audit.accounts.crn === crn && body.audit.accounts.sbi === sbi)) &&
          (reason === undefined || body.audit.details.reason === reason) &&
          (grant === undefined || body.audit.details.grant === grant) &&
          (answers === undefined ||
            Object.entries(answers).every(([key, value]) => body.audit.details.answers?.[key] === value))
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

declare module '@defra/fcp-audit-publisher' {
  import { SNSClient } from '@aws-sdk/client-sns'

  type AuditEvent = Record<string, unknown>

  interface PublishConfig {
    snsClient: SNSClient
    sns: { topicArn: string }
    version?: string
    application?: string
    component?: string
    environment?: string
    ip?: string
    generateCorrelationId?: boolean
  }

  type ValidationResult = { valid: true; value: AuditEvent } | { valid: false; errors: string[] }

  /** Validates an event against the FCP Audit schema. */
  export function validateAuditEvent(event: AuditEvent): ValidationResult

  /** Applies defaults, validates, then publishes the event to an SNS topic. */
  export function publishAuditEvent(
    event: AuditEvent,
    config: PublishConfig
  ): Promise<{ messageId: string | undefined }>
}

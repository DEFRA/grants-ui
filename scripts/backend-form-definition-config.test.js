import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const composeConfig = parse(readFileSync('compose.grants-ui.yml', 'utf8'))
const landGrantsComposeConfig = parse(readFileSync('compose.land-grants.yml', 'utf8'))

const csv = (value = '') =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

describe('backend-sourced form deployment config', () => {
  it('waits for grants-config-broker before starting grants-ui-backend', () => {
    expect(composeConfig.services['grants-ui-backend'].depends_on['grants-config-broker']).toEqual({
      condition: 'service_healthy'
    })
  })

  it('waits for LocalStack base resources before dependent services start', () => {
    const localstack = composeConfig.services.localstack

    expect(localstack.volumes).toContain(
      './localstack/check-localstack-resources.sh:/usr/local/bin/check-localstack-resources.sh:ro'
    )
    expect(localstack.healthcheck.test).toEqual(['CMD-SHELL', '/usr/local/bin/check-localstack-resources.sh'])
    expect(csv(localstack.environment.LOCALSTACK_REQUIRED_S3_BUCKETS)).toEqual(
      expect.arrayContaining(['configs-bucket'])
    )
    expect(csv(localstack.environment.LOCALSTACK_REQUIRED_SQS_QUEUES)).toEqual(
      expect.arrayContaining(['fcp_audit', 'gfr__sqs___config_input', 'grants_ui_backend__sqs__config_updates'])
    )
    expect(csv(localstack.environment.LOCALSTACK_REQUIRED_SNS_TOPICS)).toEqual(
      expect.arrayContaining(['fcp_audit_events', 'gfr__sns___config_update'])
    )
  })

  it('extends LocalStack readiness for land-grants resources', () => {
    const localstack = landGrantsComposeConfig.services.localstack
    const environment = localstack.environment ?? {}

    expect(csv(environment.LOCALSTACK_REQUIRED_S3_BUCKETS)).toEqual(
      expect.arrayContaining(['configs-bucket', 'land-data'])
    )
    expect(csv(environment.LOCALSTACK_REQUIRED_SQS_QUEUES)).toEqual(
      expect.arrayContaining([
        'fcp_audit',
        'gfr__sqs___config_input',
        'grants_ui_backend__sqs__config_updates',
        'grants_config_broker_update'
      ])
    )
    expect(csv(environment.LOCALSTACK_REQUIRED_SNS_TOPICS)).toEqual(
      expect.arrayContaining(['fcp_audit_events', 'gfr__sns___config_update'])
    )
  })
})

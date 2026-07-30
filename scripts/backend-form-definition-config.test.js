import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const grantsUIComposeConfig = parse(readFileSync('compose.grants-ui.yml', 'utf8'))
const landGrantsComposeConfig = parse(readFileSync('compose.land-grants.yml', 'utf8'))

const csv = (value = '') =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

describe('backend-sourced form deployment config', () => {
  it('waits for grants-config-broker before starting grants-ui-backend', () => {
    expect(grantsUIComposeConfig.services['grants-ui-backend'].depends_on['grants-config-broker']).toEqual({
      condition: 'service_healthy'
    })
  })

  it('waits for Floci base resources before dependent services start', () => {
    const floci = grantsUIComposeConfig.services.floci

    expect(floci.volumes).toContain(
      './compose/floci/check-floci-resources.sh:/usr/local/bin/check-floci-resources.sh:ro'
    )
    expect(floci.healthcheck.test).toEqual(['CMD-SHELL', '/usr/local/bin/check-floci-resources.sh'])
    expect(csv(floci.environment.FLOCI_REQUIRED_S3_BUCKETS)).toEqual(expect.arrayContaining(['configs-bucket']))
    expect(csv(floci.environment.FLOCI_REQUIRED_SQS_QUEUES)).toEqual(
      expect.arrayContaining(['fcp_audit', 'gfr__sqs___config_input', 'grants_ui_backend__sqs__config_updates'])
    )
    expect(csv(floci.environment.FLOCI_REQUIRED_SNS_TOPICS)).toEqual(
      expect.arrayContaining(['fcp_audit_events', 'gfr__sns___config_update'])
    )
  })

  it('extends Floci readiness for land-grants resources', () => {
    const floci = landGrantsComposeConfig.services.floci
    const environment = floci.environment ?? {}

    expect(csv(environment.FLOCI_REQUIRED_S3_BUCKETS)).toEqual(expect.arrayContaining(['configs-bucket', 'land-data']))
    expect(csv(environment.FLOCI_REQUIRED_SQS_QUEUES)).toEqual(
      expect.arrayContaining([
        'fcp_audit',
        'gfr__sqs___config_input',
        'grants_ui_backend__sqs__config_updates',
        'grants_config_broker_update'
      ])
    )
    expect(csv(environment.FLOCI_REQUIRED_SNS_TOPICS)).toEqual(
      expect.arrayContaining(['fcp_audit_events', 'gfr__sns___config_update'])
    )
  })
})

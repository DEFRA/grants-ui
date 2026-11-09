import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const grantsUIComposeConfig = parse(readFileSync('compose.grants-ui.yml', 'utf8'))

const gasComposeConfig = parse(readFileSync('compose.gas.yml', 'utf8'))

const setupResources = readFileSync('compose/floci/common/10-setup-resources.sh', 'utf8')

const landGrantsSetup = readFileSync('compose/floci/land-grants/20-land-grants.sh', 'utf8')

const gasSetup = readFileSync('compose/floci/gas/20-gas.sh', 'utf8')

describe('backend-sourced form deployment config', () => {
  it('starts GAS after Mongo replica-set initialisation without a circular health dependency', () => {
    const gas = gasComposeConfig.services['fg-gas-backend']

    expect(gas.depends_on['mongo-ready']).toEqual({ condition: 'service_completed_successfully' })
    expect(gas.environment.GAS__SNS__AUDIT_TOPIC_ARN).toBe(
      'arn:aws:sns:eu-west-2:000000000000:gas__sns__audit_topic_arn'
    )
    expect(gas.environment.GAS__SNS__REPORTING_EVENTS_TOPIC_ARN).toBe(
      'arn:aws:sns:eu-west-2:000000000000:gfr__sns___reporting_events'
    )
    expect(gas.environment.GAS__SNS__AGREEMENT_STATUS_UPDATED_TOPIC_ARN).toBe(
      'arn:aws:sns:eu-west-2:000000000000:gas__sns__agreement_status_updated_fifo.fifo'
    )
    expect(gas.environment.GAS__SNS__CREATE_PAYMENT_TOPIC_ARN).toBe(
      'arn:aws:sns:eu-west-2:000000000000:gas__sns__create_payment_fifo.fifo'
    )
    expect(gasSetup).toContain('create_standard_topic "gfr__sns___reporting_events"')
  })

  it('registers the local token after GAS migrations and before the UI starts', () => {
    const gas = gasComposeConfig.services['fg-gas-backend']
    const token = gasComposeConfig.services['grants-ui'].environment.GAS_API_AUTH_TOKEN

    expect(gasComposeConfig.services['mongo-ready']).toBeUndefined()
    expect(gasComposeConfig.services['gas-token-ready']).toBeUndefined()
    expect(gasComposeConfig.services['grants-ui'].depends_on['fg-gas-backend']).toEqual({
      condition: 'service_healthy'
    })
    expect(gas.environment.GAS_API_AUTH_TOKEN_HASH).toBe(createHash('sha256').update(token).digest('hex'))
    expect(gas.command).toEqual(['/bin/sh', '-c', 'node scripts/seed-local-gas-token.mjs && exec scripts/run.sh'])
    expect(gas.volumes).toContain('./scripts/seed-local-gas-token.mjs:/home/node/scripts/seed-local-gas-token.mjs:ro')
  })

  it('waits for grants-config-broker before starting grants-ui-backend', () => {
    expect(grantsUIComposeConfig.services['grants-ui-backend'].depends_on['grants-config-broker']).toEqual({
      condition: 'service_healthy'
    })
  })

  it('creates the required Floci base resources', () => {
    expect(setupResources).toContain('configs-bucket')
    expect(setupResources).toContain('gfr__sqs___config_input')
    expect(setupResources).toContain('grants_ui_backend__sqs__config_updates')
    expect(setupResources).toContain('fcp_audit')
    expect(setupResources).toContain('fcp_audit_events')
    expect(setupResources).toContain('gfr__sns___config_update')
  })

  it('creates the required land-grants resources', () => {
    expect(landGrantsSetup).toContain('INGEST_BUCKET=land-data')
    expect(landGrantsSetup).toContain('s3 mb')
    expect(landGrantsSetup).toContain('INGEST_BUCKET')

    expect(landGrantsSetup).toContain('UPDATES_QUEUE_NAME=grants_config_broker_update')
    expect(landGrantsSetup).toContain('create-queue --queue-name "$UPDATES_QUEUE_NAME"')
  })
})

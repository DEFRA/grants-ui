import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const grantsUIComposeConfig = parse(readFileSync('compose.grants-ui.yml', 'utf8'))

const setupResources = readFileSync('compose/floci/common/10-setup-resources.sh', 'utf8')

const landGrantsSetup = readFileSync('compose/floci/land-grants/20-land-grants.sh', 'utf8')

describe('backend-sourced form deployment config', () => {
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

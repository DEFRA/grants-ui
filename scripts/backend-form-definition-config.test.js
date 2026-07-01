import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const composeConfig = parse(readFileSync('compose.yml', 'utf8'))
const releaseAllConfig = parse(readFileSync('localstack/config-broker/release.all.yml', 'utf8'))
const backendFormDefEnv = composeConfig.services['grants-ui'].environment.BACKEND_FORM_DEF_ENABLED_SLUGS

const getDefaultSlugs = (environmentValue) =>
  environmentValue
    .replace(/^\$\{[^:]+:-/, '')
    .replace(/}$/, '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)

describe('backend-sourced form deployment config', () => {
  it('enables farm-payments as backend-sourced when farm-payments@1.0.1 is active in config broker', () => {
    const activeFarmPaymentsRelease = releaseAllConfig.releases.find(
      (release) =>
        release.name === 'farm-payments' &&
        release.version === '1.0.1' &&
        release.environments.some((environment) => environment.status === 'active')
    )

    expect(activeFarmPaymentsRelease).toBeDefined()
    expect(getDefaultSlugs(backendFormDefEnv)).toContain('farm-payments')
  })

  it('waits for grants-config-broker before starting grants-ui-backend', () => {
    expect(composeConfig.services['grants-ui-backend'].depends_on['grants-config-broker']).toEqual({
      condition: 'service_healthy'
    })
  })
})

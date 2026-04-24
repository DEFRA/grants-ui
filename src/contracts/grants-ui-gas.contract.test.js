import fs from 'fs'
import path from 'path'
import { PactV4, SpecificationVersion, MatchersV3 } from '@pact-foundation/pact'
import { describe, expect, it, vi } from 'vitest'
import { makeGasApiRequest } from '../server/common/services/grant-application/grant-application.service.js'

vi.mock('../server/common/helpers/retry.js', () => ({
  retry: (operation) => operation()
}))

vi.mock('../server/common/helpers/logging/log.js', () => ({
  debug: vi.fn(),
  log: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

function createProvider() {
  return new PactV4({
    consumer: 'grants-ui',
    provider: 'fg-gas-backend',
    dir: path.join(__dirname, './pacts'),
    spec: SpecificationVersion.SPECIFICATION_VERSION_V4,
    port: 0
  })
}

const { string, regex } = MatchersV3

describe.sequential('Pact between grants-ui (consumer) and fg-gas-backend (provider)', () => {
  describe('POST /applications', () => {
    it('successfully submits farm-payments application', async () => {
      const provider = createProvider()
      const payload = JSON.parse(fs.readFileSync(path.join(__dirname, 'resources/farm-payments.json'), 'utf-8'))

      await provider
        .addInteraction()
        .given('frps-private-beta is configured in fg-gas-backend')
        .uponReceiving('an frps-private-beta application')
        .withRequest('POST', '/grants/frps-private-beta/applications', (builder) => {
          builder.headers({
            'Content-Type': 'application/json',
            Authorization: 'Bearer 00000000-0000-0000-0000-000000000000'
          })
          builder.jsonBody(payload)
        })
        .willRespondWith(204)
        .executeTest(async (mockServer) => {
          const response = await makeGasApiRequest(
            `${mockServer.url}/grants/frps-private-beta/applications`,
            'frps-private-beta',
            {},
            {
              method: 'POST',
              payload
            }
          )

          expect(response.status).toBe(204)
        })
    })

    it('successfully submits farm-payments application with only required properties', async () => {
      const provider = createProvider()
      const payload = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'resources/farm-payments-required-only.json'), 'utf-8')
      )

      await provider
        .addInteraction()
        .given('frps-private-beta is configured in fg-gas-backend')
        .uponReceiving('an frps-private-beta application with only required properties')
        .withRequest('POST', '/grants/frps-private-beta/applications', (builder) => {
          builder.headers({
            'Content-Type': 'application/json',
            Authorization: 'Bearer 00000000-0000-0000-0000-000000000000'
          })
          builder.jsonBody(payload)
        })
        .willRespondWith(204)
        .executeTest(async (mockServer) => {
          const response = await makeGasApiRequest(
            `${mockServer.url}/grants/frps-private-beta/applications`,
            'frps-private-beta',
            {},
            {
              method: 'POST',
              payload
            }
          )

          expect(response.status).toBe(204)
        })
    })

    it('successfully submits amendment application', async () => {
      const provider = createProvider()
      const payload = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'resources/farm-payments-amendment.json'), 'utf-8')
      )

      await provider
        .addInteraction()
        .given('frps-private-beta is configured in fg-gas-backend')
        .uponReceiving('an amendment application')
        .withRequest('POST', '/grants/frps-private-beta/applications', (builder) => {
          builder.headers({
            'Content-Type': 'application/json',
            Authorization: 'Bearer 00000000-0000-0000-0000-000000000000'
          })
          builder.jsonBody(payload)
        })
        .willRespondWith(204)
        .executeTest(async (mockServer) => {
          const response = await makeGasApiRequest(
            `${mockServer.url}/grants/frps-private-beta/applications`,
            'frps-private-beta',
            {},
            {
              method: 'POST',
              payload
            }
          )

          expect(response.status).toBe(204)
        })
    })
  })

  describe('GET /grants/{grantCode}/applications/{clientRef}/status', () => {
    it('successfully gets the status of farm-payments application with reference 710-877-8fd', async () => {
      const provider = createProvider()
      await provider
        .addInteraction()
        .given('frps-private-beta is configured in fg-gas-backend with a client reference 710-877-8fd')
        .uponReceiving(
          'a request to get the status of an frps-private-beta application with client reference 710-877-8fd'
        )
        .withRequest('GET', '/grants/frps-private-beta/applications/710-877-8fd/status', (builder) => {
          builder.headers({
            'Content-Type': 'application/json',
            Authorization: regex(
              'Bearer [0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
              'Bearer 00000000-0000-0000-0000-000000000000'
            )
          })
        })
        .willRespondWith(200, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' })
          builder.jsonBody({
            status: string('RECEIVED')
          })
        })
        .executeTest(async (mockServer) => {
          const response = await makeGasApiRequest(
            `${mockServer.url}/grants/frps-private-beta/applications/710-877-8fd/status`,
            'frps-private-beta',
            {},
            { method: 'GET' }
          )

          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body).toHaveProperty('status')
          expect(typeof body.status).toBe('string')
        })
    })

    it('returns 404 when application does not exist', async () => {
      const provider = createProvider()
      await provider
        .addInteraction()
        .given('frps-private-beta is configured in fg-gas-backend')
        .uponReceiving('a request for a non-existent application status')
        .withRequest('GET', '/grants/frps-private-beta/applications/non-existent-ref/status', (builder) => {
          builder.headers({
            'Content-Type': 'application/json',
            Authorization: regex(
              'Bearer [0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
              'Bearer 00000000-0000-0000-0000-000000000000'
            )
          })
        })
        .willRespondWith(404, (builder) => {
          builder.headers({ 'Content-Type': 'application/json' })
          builder.jsonBody({
            statusCode: 404,
            error: 'Not Found',
            message: string('Application with clientRef "non-existent-ref" and code "frps-private-beta" not found')
          })
        })
        .executeTest(async (mockServer) => {
          await expect(
            makeGasApiRequest(
              `${mockServer.url}/grants/frps-private-beta/applications/non-existent-ref/status`,
              'frps-private-beta',
              {},
              { method: 'GET' }
            )
          ).rejects.toMatchObject({ status: 404 })
        })
    })
  })
})

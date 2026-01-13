import fs from 'fs'
import path from 'path'
import { PactV4, SpecificationVersion, MatchersV3 } from '@pact-foundation/pact'
import { describe, expect, it } from 'vitest'
import { makeGasApiRequest } from '../server/common/services/grant-application/grant-application.service.js'

const provider = new PactV4({
  consumer: 'grants-ui',
  provider: 'fg-gas-backend',
  dir: path.join(path.join(__dirname, './pacts')),
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4
})

const { string, regex } = MatchersV3

describe('Pact between grants-ui (consumer) and fg-gas-backend (provider)', () => {
  describe('POST /applications', () => {
    it('successfully submits example-grant-with-auth application', async () => {
      const payload = JSON.parse(fs.readFileSync(path.join(__dirname, 'example-grant-with-auth.json'), 'utf-8'))

      await provider
        .addInteraction()
        .given('example-grant-with-auth-v3 is configured in fg-gas-backend')
        .uponReceiving('an example-grant-with-auth-v3 application')
        .withRequest('POST', '/grants/example-grant-with-auth-v3/applications', (builder) => {
          builder.headers({
            'Content-Type': 'application/json',
            Authorization: 'Bearer 00000000-0000-0000-0000-000000000000'
          })
          builder.jsonBody(payload)
        })
        .willRespondWith(204)
        .executeTest(async (mockServer) => {
          const response = await makeGasApiRequest(
            `${mockServer.url}/grants/example-grant-with-auth-v3/applications`,
            'example-grant-with-auth-v3',
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
    it('successfully gets the status of example-grant-with-auth application with reference egwa-123-abc', async () => {
      await provider
        .addInteraction()
        .given('example-grant-with-auth-v3 is configured in fg-gas-backend with a client reference egwa-123-abc')
        .uponReceiving(
          'a request to get the status of an example-grant-with-auth-v3 application with client reference egwa-123-abc'
        )
        .withRequest('GET', '/grants/example-grant-with-auth-v3/applications/egwa-123-abc/status', (builder) => {
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
            `${mockServer.url}/grants/example-grant-with-auth-v3/applications/egwa-123-abc/status`,
            'example-grant-with-auth-v3',
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
      await provider
        .addInteraction()
        .given('example-grant-with-auth-v3 is configured in fg-gas-backend')
        .uponReceiving('a request for a non-existent application status')
        .withRequest('GET', '/grants/example-grant-with-auth-v3/applications/non-existent-ref/status', (builder) => {
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
            message: string(
              'Application with clientRef "non-existent-ref" and code "example-grant-with-auth-v3" not found'
            )
          })
        })
        .executeTest(async (mockServer) => {
          let thrownError
          try {
            await makeGasApiRequest(
              `${mockServer.url}/grants/example-grant-with-auth-v3/applications/non-existent-ref/status`,
              'example-grant-with-auth-v3',
              {},
              { method: 'GET' }
            )
          } catch (error) {
            thrownError = error
          }

          expect(thrownError).toBeDefined()
          expect(thrownError.status).toBe(404)
        })
    })
  })
})

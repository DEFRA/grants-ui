import path from 'path'
import { PactV4, SpecificationVersion } from '@pact-foundation/pact'
import { describe, expect, it } from 'vitest'

function createProvider() {
  return new PactV4({
    consumer: 'grants-ui',
    provider: 'grants-ui-backend',
    dir: path.join(path.join(__dirname, './pacts')),
    spec: SpecificationVersion.SPECIFICATION_VERSION_V4,
    port: 0
  })
}

describe('Pact between grants-ui (consumer) and grants-ui-backend (provider)', () => {
  describe('POST /submissions', () => {
    it('successfully persists a grant application submission', async () => {
      const provider = createProvider()
      const submission = {
        crn: '1234567890',
        grantCode: 'example-grant-with-auth',
        grantVersion: 1,
        referenceNumber: 'ABC-123',
        sbi: '123456789',
        submittedAt: '2024-01-01T00:00:00.000Z'
      }

      await provider
        .addInteraction()
        .uponReceiving('a submission for a grant application')
        .withRequest('POST', '/submissions', (builder) => {
          builder.headers({
            'Content-Type': 'application/json',
            Authorization: 'Bearer some-encrypted-token',
            'X-Application-Lock-Owner': 'some-lock-token'
          })
          builder.jsonBody(submission)
        })
        .willRespondWith(201)
        .executeTest(async (mockServer) => {
          const response = await fetch(`${mockServer.url}/submissions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer some-encrypted-token',
              'X-Application-Lock-Owner': 'some-lock-token'
            },
            body: JSON.stringify(submission)
          })

          expect(response.status).toBe(201)
        })
    })
  })
})

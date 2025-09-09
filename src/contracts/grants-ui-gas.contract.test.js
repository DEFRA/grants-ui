import fs from 'fs'
import path from 'path'
import { PactV4, SpecificationVersion } from '@pact-foundation/pact'
import { describe, it, expect } from 'vitest'
import { makeGasApiRequest } from '../server/common/services/grant-application/grant-application.service.js'

const provider = new PactV4({
  consumer: 'grants-ui',
  provider: 'fg-gas-backend',
  dir: path.join(path.join(__dirname, './pacts')),
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4
})

describe('Pact between grants-ui (consumer) and fg-gas-backend (provider)', () => {
  describe('POST /applications', () => {
    it('successfully submits example-grant-with-auth application', async () => {
      const payload = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'example-grant-with-auth.json'), 'utf-8')
      )

      await provider
        .addInteraction()
        .given('example-grant-with-auth-v3 is configured in fg-gas-backend')
        .uponReceiving('an example-grant-with-auth-v3 application')
        .withRequest('POST', '/grants/example-grant-with-auth-v3/applications', (builder) => {
          builder.headers({ 'Content-Type': 'application/json' })
          builder.jsonBody(payload)
        })
        .willRespondWith(204)
        .executeTest(async (mockServer) => {
          await makeGasApiRequest(
            `${mockServer.url}/grants/example-grant-with-auth-v3/applications`,
            'example-grant-with-auth-v3',
            {
              method: 'POST', payload
            })
        })
    })
  })
})

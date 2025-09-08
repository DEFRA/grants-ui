import { PactV4, SpecificationVersion } from '@pact-foundation/pact'
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const provider = new PactV4({
  consumer: 'grants-ui',
  provider: 'fg-gas-backend',
  dir: path.resolve(process.cwd(), 'contracts/pacts'),
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4
})

describe('grants-ui -> fg-gas-backend', () => {
  it('successfully submits example-grant-with-auth application', async () => {
    const body = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'contracts/example-grant-with-auth.json'), 'utf-8')
    )

    await provider
      .addInteraction()
      .given('an applicant is using grants-ui')
      .uponReceiving('an example-grant-with-auth application')
      .withRequest('POST', '/grants/example-grant-with-auth-v3/applications', (builder) => {
        builder.headers({ 'Content-Type': 'application/json' })
        builder.jsonBody(body)
      })
      .willRespondWith(204)
      .executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/grants/example-grant-with-auth-v3/applications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        expect(response.status).toBe(204)
      })
  })
})

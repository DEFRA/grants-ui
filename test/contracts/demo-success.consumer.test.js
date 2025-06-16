import { Pact } from '@pact-foundation/pact'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = resolve(filename, '..')

describe('Demo Success Contract', () => {
  let provider

  beforeAll(async () => {
    provider = new Pact({
      consumer: 'grants-ui-demo',
      provider: 'demo-service',
      port: 8888,
      log: resolve(dirname, '../logs', 'demo-pact.log'),
      dir: resolve(dirname, '../pacts'),
      logLevel: 'INFO'
    })
    await provider.setup()
  })

  afterAll(async () => {
    await provider.finalize()
  })

  it('should create a successful pact contract', async () => {
    // Add interaction BEFORE making request
    await provider.addInteraction({
      state: 'demo service is available',
      uponReceiving: 'a demo request',
      withRequest: {
        method: 'GET',
        path: '/demo'
      },
      willRespondWith: {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          message: 'success',
          service: 'demo'
        }
      }
    })

    // Add a small delay to ensure mock server is ready
    await new Promise(resolve => setTimeout(resolve, 100))

    // Make request to mock server
    const response = await fetch('http://localhost:8888/demo')
    
    console.log('Response status:', response.status)
    console.log('Response content-type:', response.headers.get('content-type'))
    
    const text = await response.text()
    console.log('Response text:', text)
    
    // Try to parse as JSON
    let result
    try {
      result = JSON.parse(text)
    } catch (e) {
      console.log('JSON parse error:', e.message)
      throw new Error(`Could not parse response as JSON: ${text}`)
    }

    // Verify response
    expect(response.status).toBe(200)
    expect(result.message).toBe('success')
    expect(result.service).toBe('demo')

    // This will verify and generate pact file
    await provider.verify()
  })
})
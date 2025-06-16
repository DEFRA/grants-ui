import { Pact } from '@pact-foundation/pact'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

// Setup __dirname for ES modules  
const filename = fileURLToPath(import.meta.url)
const dirname = resolve(filename, '..')

describe('Working Consumer Test', () => {
  let provider

  beforeAll(async () => {
    provider = new Pact({
      consumer: 'grants-ui',
      provider: 'test-service', 
      port: 9999,
      log: resolve(dirname, '../logs', 'working-pact.log'),
      dir: resolve(dirname, '../pacts'),
      logLevel: 'INFO'
    })
    await provider.setup()
  })

  afterAll(async () => {
    await provider.finalize()
  })

  it('should successfully create a pact file', async () => {
    // Define expected interaction
    await provider.addInteraction({
      state: 'service is healthy',
      uponReceiving: 'a health check request',
      withRequest: {
        method: 'GET',
        path: '/health'
      },
      willRespondWith: {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          status: 'ok'
        }
      }
    })

    // Make actual request to mock server
    const response = await fetch('http://localhost:9999/health')
    
    // Check if we got a response
    console.log('Response status:', response.status)
    console.log('Response headers:', response.headers.get('content-type'))
    
    if (!response.ok) {
      const text = await response.text()
      console.log('Response text:', text)
      throw new Error(`HTTP ${response.status}: ${text}`)
    }
    
    const result = await response.json()

    // Verify response
    expect(response.status).toBe(200)
    expect(result.status).toBe('ok')

    // Verify interaction occurred
    await provider.verify()
  })
})
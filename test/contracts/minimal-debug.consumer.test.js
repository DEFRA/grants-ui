import { Pact } from '@pact-foundation/pact'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = resolve(filename, '..')

describe('Minimal Debug Test', () => {
  let provider

  beforeAll(async () => {
    provider = new Pact({
      consumer: 'test-consumer',
      provider: 'test-provider',
      port: 7777,
      log: resolve(dirname, '../logs', 'minimal-debug.log'),
      dir: resolve(dirname, '../pacts'),
      logLevel: 'DEBUG'
    })
    
    console.log('Setting up provider...')
    await provider.setup()
    console.log('Provider setup complete')
  })

  afterAll(async () => {
    console.log('Finalizing provider...')
    await provider.finalize()
  })

  it('should work with minimal interaction', async () => {
    console.log('Adding interaction...')
    
    await provider.addInteraction({
      state: 'service is available',
      uponReceiving: 'a simple request',
      withRequest: {
        method: 'GET',
        path: '/test',
        headers: {}
      },
      willRespondWith: {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          result: 'ok'
        })
      }
    })
    
    console.log('Interaction added, making request...')
    
    // Wait a moment for the interaction to be registered
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const response = await fetch('http://localhost:7777/test')
    
    console.log('Response status:', response.status)
    console.log('Response content-type:', response.headers.get('content-type'))
    console.log('Response headers:', [...response.headers.entries()])
    
    const text = await response.text()
    console.log('Response text:', text)
    
    let result
    try {
      result = JSON.parse(text)
      console.log('Parsed JSON:', result)
    } catch (e) {
      console.log('JSON parse error:', e.message)
      throw new Error(`Expected JSON response but got: ${text}`)
    }

    expect(response.status).toBe(200)
    expect(result.result).toBe('ok')

    console.log('Verifying interaction...')
    await provider.verify()
    console.log('Verification complete')
  })
})
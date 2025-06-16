import { Pact } from '@pact-foundation/pact'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = resolve(filename, '..')

describe('Basic Pact Test', () => {
  let provider
  let mockServerPort

  beforeAll(async () => {
    // Use dynamic port to avoid conflicts
    mockServerPort = 6000 + Math.floor(Math.random() * 1000)
    
    provider = new Pact({
      consumer: 'basic-consumer',
      provider: 'basic-provider',
      port: mockServerPort,
      log: resolve(dirname, '../logs', 'basic.log'),
      dir: resolve(dirname, '../pacts'),
      logLevel: 'INFO',
      spec: 2
    })
    
    await provider.setup()
  })

  afterAll(async () => {
    await provider.finalize()
  })

  it('should handle a simple GET request', async () => {
    await provider.addInteraction({
      uponReceiving: 'a simple GET request',
      withRequest: {
        method: 'GET',
        path: '/simple'
      },
      willRespondWith: {
        status: 200,
        body: 'Hello World'
      }
    })
    
    const response = await fetch(`http://localhost:${mockServerPort}/simple`)
    const text = await response.text()
    
    console.log('Response status:', response.status)
    console.log('Response text:', text)
    
    expect(response.status).toBe(200)
    expect(text).toBe('Hello World')
    
    await provider.verify()
  })
})
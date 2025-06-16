import { Pact } from '@pact-foundation/pact'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import net from 'net'

// Setup __dirname for ES modules
const filename = fileURLToPath(import.meta.url)
const dirname = resolve(filename, '..')

// Helper function to find an available port
async function findAvailablePort(startPort = 9000, endPort = 9999) {
  for (let port = startPort; port <= endPort; port++) {
    try {
      await new Promise((resolve, reject) => {
        const server = net.createServer()
        server.listen(port, () => {
          server.close(resolve)
        })
        server.on('error', reject)
      })
      return port
    } catch (err) {
      continue
    }
  }
  throw new Error('No available port found')
}

describe('Working Pact Test', () => {
  let provider
  let mockServerPort

  beforeAll(async () => {
    // Find an actually available port
    mockServerPort = await findAvailablePort(9300, 9399)
    console.log(`Using port ${mockServerPort} for working-test mock server`)

    provider = new Pact({
      consumer: 'working-consumer',
      provider: 'working-provider',
      port: mockServerPort,
      log: resolve(dirname, '../logs', 'working.log'),
      dir: resolve(dirname, '../pacts'),
      logLevel: 'INFO'
    })

    await provider.setup()
  })

  afterEach(async () => {
    // Small delay between tests to ensure mock server is ready
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  afterAll(async () => {
    try {
      await provider.finalize()
    } catch (err) {
      console.log('Provider finalize error (non-critical):', err.message)
    }
    // Longer delay to ensure complete cleanup
    await new Promise(resolve => setTimeout(resolve, 500))
  })


  describe('Simple API Tests', () => {
    it('should handle a simple GET request', async () => {
      const expectedResponse = {
        message: 'success',
        timestamp: '2024-01-01T00:00:00Z'
      }

      await provider.addInteraction({
        state: 'service is available',
        uponReceiving: 'a simple health check request',
        withRequest: {
          method: 'GET',
          path: '/health'
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: expectedResponse
        }
      })

      const response = await fetch(`http://localhost:${mockServerPort}/health`)
      const result = await response.json()

      console.log('Working test - Response status:', response.status)
      console.log('Working test - Response body:', result)

      expect(response.status).toBe(200)
      expect(result.message).toBe('success')

      await provider.verify()
    })

    it('should handle a POST request with JSON body', async () => {
      const requestBody = {
        name: 'test',
        value: 123
      }

      const expectedResponse = {
        id: 'test-123',
        status: 'created'
      }

      await provider.addInteraction({
        state: 'service accepts data',
        uponReceiving: 'a POST request with JSON data',
        withRequest: {
          method: 'POST',
          path: '/data',
          headers: {
            'Content-Type': 'application/json'
          },
          body: requestBody
        },
        willRespondWith: {
          status: 201,
          headers: {
            'Content-Type': 'application/json'
          },
          body: expectedResponse
        }
      })

      const response = await fetch(`http://localhost:${mockServerPort}/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      const result = await response.json()

      console.log('Working test POST - Response status:', response.status)
      console.log('Working test POST - Response body:', result)

      expect(response.status).toBe(201)
      expect(result.status).toBe('created')
      expect(result.id).toBe('test-123')

      await provider.verify()
    })
  })
})
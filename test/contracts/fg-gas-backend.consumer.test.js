import { Pact } from '@pact-foundation/pact'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import fetch from 'node-fetch'
import net from 'net'

// Setup __dirname for ES modules
const filename = fileURLToPath(import.meta.url)
const dirname = resolve(filename, '..')

// Make fetch available globally
globalThis.fetch = fetch

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

describe('grants-ui → fg-gas-backend Contract', () => {
  let provider
  let mockServerPort

  beforeAll(async () => {
    // Find an actually available port
    mockServerPort = await findAvailablePort(9200, 9299)
    console.log(`Using port ${mockServerPort} for fg-gas-backend mock server`)

    provider = new Pact({
      consumer: 'grants-ui',
      provider: 'fg-gas-backend',
      port: mockServerPort,
      log: resolve(dirname, '../logs', 'pact.log'),
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

  describe('Grant Application Submission API', () => {
    it('should submit grant application successfully', async () => {
      const applicationRequest = {
        metadata: {
          clientRef: 'TEST-REF-123456',
          sbi: '123456789',
          frn: '987654321',
          crn: '555666777',
          defraId: 'DEF123456',
          submittedAt: '2024-01-15T14:30:00Z'
        },
        answers: {
          scheme: 'SFI',
          year: 2024,
          agreementName: 'Test Agreement',
          actionApplications: [
            {
              parcelId: '1234',
              sheetId: 'SX1234',
              code: 'CSAM1',
              appliedFor: {
                unit: 'ha',
                quantity: 10.5
              }
            }
          ]
        }
      }

      await provider.addInteraction({
        state: 'grant system is available for application submission',
        uponReceiving: 'a valid grant application submission',
        withRequest: {
          method: 'POST',
          path: '/grants/frps-private-beta/applications',
          headers: {
            'Content-Type': 'application/json'
          },
          body: applicationRequest
        },
        willRespondWith: {
          status: 204,
          headers: {}
        }
      })

      const response = await fetch(
        `http://localhost:${mockServerPort}/grants/frps-private-beta/applications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(applicationRequest)
        }
      )

      expect(response.status).toBe(204)

      await provider.verify()
    })

    it('should reject application with invalid grant code', async () => {
      const applicationRequest = {
        metadata: {
          clientRef: 'TEST-REF-123456',
          sbi: '123456789',
          frn: '987654321'
        },
        answers: {
          scheme: 'SFI'
        }
      }

      const expectedResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: 'Grant not found'
      }

      await provider.addInteraction({
        state: 'grant system validates grant codes',
        uponReceiving: 'an application for non-existent grant',
        withRequest: {
          method: 'POST',
          path: '/grants/invalid-grant-code/applications',
          headers: {
            'Content-Type': 'application/json'
          },
          body: applicationRequest
        },
        willRespondWith: {
          status: 404,
          headers: {
            'Content-Type': 'application/json'
          },
          body: expectedResponse
        }
      })

      const response = await fetch(
        `http://localhost:${mockServerPort}/grants/invalid-grant-code/applications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(applicationRequest)
        }
      )

      const result = await response.json()

      expect(response.status).toBe(404)
      expect(result.error).toBe('Not Found')

      await provider.verify()
    })

    it('should reject application with duplicate clientRef', async () => {
      const applicationRequest = {
        metadata: {
          clientRef: 'DUPLICATE-REF-123',
          sbi: '123456789',
          frn: '987654321'
        },
        answers: {
          scheme: 'SFI'
        }
      }

      const expectedResponse = {
        statusCode: 409,
        error: 'Conflict',
        message: 'Duplicate clientRef'
      }

      await provider.addInteraction({
        state: 'application with clientRef DUPLICATE-REF-123 already exists',
        uponReceiving: 'an application with duplicate clientRef',
        withRequest: {
          method: 'POST',
          path: '/grants/frps-private-beta/applications',
          headers: {
            'Content-Type': 'application/json'
          },
          body: applicationRequest
        },
        willRespondWith: {
          status: 409,
          headers: {
            'Content-Type': 'application/json'
          },
          body: expectedResponse
        }
      })

      const response = await fetch(
        `http://localhost:${mockServerPort}/grants/frps-private-beta/applications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(applicationRequest)
        }
      )

      const result = await response.json()

      expect(response.status).toBe(409)
      expect(result.error).toBe('Conflict')

      await provider.verify()
    })
  })

  describe('Grant Action Invocation API', () => {
    it('should invoke scoring action via GAS backend', async () => {
      const scoringRequest = {
        data: {
          main: {
            '/collaboration': 'collaboration-A1',
            '/environmental-impact': ['environmental-impact-A1'],
            '/adding-value': 'adding-value-A1'
          }
        }
      }

      const expectedResponse = {
        score: 25,
        scoreBand: 'Strong',
        status: 'Eligible',
        answers: [
          {
            questionId: '/collaboration',
            score: { value: 7, band: 'Strong' }
          }
        ]
      }

      await provider.addInteraction({
        state: 'scoring action is configured for adding-value grant',
        uponReceiving: 'a request to invoke scoring action',
        withRequest: {
          method: 'POST',
          path: '/grants/adding-value/actions/score/invoke',
          headers: {
            'Content-Type': 'application/json'
          },
          body: scoringRequest
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: expectedResponse
        }
      })

      const response = await fetch(
        `http://localhost:${mockServerPort}/grants/adding-value/actions/score/invoke`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(scoringRequest)
        }
      )

      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.score).toBeDefined()
      expect(result.scoreBand).toBeDefined()
      expect(result.status).toBeDefined()

      await provider.verify()
    })

    it('should handle action not found error', async () => {
      const requestData = { test: 'data' }

      const expectedResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: 'Action not found'
      }

      await provider.addInteraction({
        state: 'grant exists but action does not',
        uponReceiving: 'a request for non-existent action',
        withRequest: {
          method: 'POST',
          path: '/grants/adding-value/actions/non-existent-action/invoke',
          headers: {
            'Content-Type': 'application/json'
          },
          body: requestData
        },
        willRespondWith: {
          status: 404,
          headers: {
            'Content-Type': 'application/json'
          },
          body: expectedResponse
        }
      })

      const response = await fetch(
        `http://localhost:${mockServerPort}/grants/adding-value/actions/non-existent-action/invoke`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestData)
        }
      )

      const result = await response.json()

      expect(response.status).toBe(404)
      expect(result.error).toBe('Not Found')

      await provider.verify()
    })
  })

  describe('Grant Management API', () => {
    it('should retrieve all grants', async () => {
      const expectedResponse = [
        {
          code: 'frps-private-beta',
          metadata: {
            description: 'Farming Resilience Private Beta',
            startDate: '2024-01-01T00:00:00.000Z'
          },
          actions: [
            {
              name: 'score',
              method: 'POST',
              url: 'https://ffc-grants-scoring.dev.cdp-int.defra.cloud/scoring/api/v1/adding-value/score'
            }
          ]
        }
      ]

      await provider.addInteraction({
        state: 'grants are available in the system',
        uponReceiving: 'a request to get all grants',
        withRequest: {
          method: 'GET',
          path: '/grants',
          headers: {}
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: expectedResponse
        }
      })

      const response = await fetch(`http://localhost:${mockServerPort}/grants`)

      const result = await response.json()

      expect(response.status).toBe(200)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
      expect(result[0]).toHaveProperty('code')
      expect(result[0]).toHaveProperty('metadata')

      await provider.verify()
    })

    it('should retrieve specific grant by code', async () => {
      const expectedResponse = {
        code: 'frps-private-beta',
        metadata: {
          description: 'Farming Resilience Private Beta',
          startDate: '2024-01-01T00:00:00.000Z'
        },
        actions: [
          {
            name: 'score',
            method: 'POST',
            url: 'https://ffc-grants-scoring.dev.cdp-int.defra.cloud/scoring/api/v1/adding-value/score'
          }
        ],
        questions: {
          type: 'object',
          properties: {
            scheme: { type: 'string' },
            year: { type: 'number' }
          }
        }
      }

      await provider.addInteraction({
        state: 'grant frps-private-beta exists',
        uponReceiving: 'a request to get specific grant',
        withRequest: {
          method: 'GET',
          path: '/grants/frps-private-beta',
          headers: {}
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          },
          body: expectedResponse
        }
      })

      const response = await fetch(`http://localhost:${mockServerPort}/grants/frps-private-beta`)

      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.code).toBe('frps-private-beta')
      expect(result.metadata).toBeDefined()
      expect(result.actions).toBeDefined()

      await provider.verify()
    })
  })
})
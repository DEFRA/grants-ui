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

describe('grants-ui → ffc-grants-scoring Contract', () => {
  let provider
  let mockServerPort

  beforeAll(async () => {
    // Find an actually available port
    mockServerPort = await findAvailablePort(9100, 9199)
    console.log(`Using port ${mockServerPort} for ffc-grants-scoring mock server`)

    provider = new Pact({
      consumer: 'grants-ui',
      provider: 'ffc-grants-scoring',
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


  describe('Grant Scoring API', () => {
    it('should calculate score for adding value grant with strong collaboration', async () => {
      const scoringRequest = {
        data: {
          main: {
            '/collaboration': 'collaboration-A1',
            '/environmental-impact': ['environmental-impact-A1', 'environmental-impact-A2'],
            '/adding-value': 'adding-value-A1',
            '/project-impact': ['project-impact-A1'],
            '/future-customers': 'future-customers-A1',
            '/products-processed': 'products-processed-A1'
          }
        }
      }

      const expectedResponse = {
        answers: [
          {
            questionId: '/collaboration',
            category: 'Collaboration',
            fundingPriorities: ['Improve processing and supply chains'],
            score: {
              value: 7,
              band: 'Strong'
            }
          },
          {
            questionId: '/environmental-impact',
            category: 'Environmental impact',
            fundingPriorities: ['Improve the environment'],
            score: {
              value: 9,
              band: 'Strong'
            }
          },
          {
            questionId: '/adding-value',
            category: 'Adding value',
            fundingPriorities: ['Grow your business'],
            score: {
              value: 8,
              band: 'Strong'
            }
          },
          {
            questionId: '/project-impact',
            category: 'Project impact',
            fundingPriorities: ['Grow your business'],
            score: {
              value: 12,
              band: 'Strong'
            }
          },
          {
            questionId: '/future-customers',
            category: 'Future customers',
            fundingPriorities: ['Grow your business'],
            score: {
              value: 7,
              band: 'Strong'
            }
          },
          {
            questionId: '/products-processed',
            category: 'Products processed',
            fundingPriorities: ['Create and expand processing capacity'],
            score: {
              value: 7,
              band: 'Strong'
            }
          }
        ],
        score: 37,
        status: 'Eligible',
        scoreBand: 'Strong'
      }

      await provider.addInteraction({
        state: 'scoring system is available for adding value grants',
        uponReceiving: 'a request to calculate score for strong project',
        withRequest: {
          method: 'POST',
          path: '/scoring/api/v1/adding-value/score',
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

      const response = await fetch(`http://localhost:${mockServerPort}/scoring/api/v1/adding-value/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(scoringRequest)
      })

      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.scoreBand).toBe('Strong')
      expect(result.score).toBe(37)
      expect(result.answers).toHaveLength(6)
      expect(result.status).toBe('Eligible')

      await provider.verify()
    })

    it('should calculate score for project with weak environmental impact', async () => {
      const scoringRequest = {
        data: {
          main: {
            '/collaboration': 'collaboration-B1',
            '/environmental-impact': ['environmental-impact-B1'],
            '/adding-value': 'adding-value-B2',
            '/project-impact': ['project-impact-B1'],
            '/future-customers': 'future-customers-B1',
            '/products-processed': 'products-processed-B1'
          }
        }
      }

      const expectedResponse = {
        answers: [
          {
            questionId: '/collaboration',
            category: 'Collaboration',
            fundingPriorities: ['Improve processing and supply chains'],
            score: {
              value: 3,
              band: 'Weak'
            }
          },
          {
            questionId: '/environmental-impact',
            category: 'Environmental impact',
            fundingPriorities: ['Improve the environment'],
            score: {
              value: 2,
              band: 'Weak'
            }
          },
          {
            questionId: '/adding-value',
            category: 'Adding value',
            fundingPriorities: ['Grow your business'],
            score: {
              value: 5,
              band: 'Medium'
            }
          },
          {
            questionId: '/project-impact',
            category: 'Project impact',
            fundingPriorities: ['Grow your business'],
            score: {
              value: 4,
              band: 'Weak'
            }
          },
          {
            questionId: '/future-customers',
            category: 'Future customers',
            fundingPriorities: ['Grow your business'],
            score: {
              value: 3,
              band: 'Weak'
            }
          },
          {
            questionId: '/products-processed',
            category: 'Products processed',
            fundingPriorities: ['Create and expand processing capacity'],
            score: {
              value: 3,
              band: 'Weak'
            }
          }
        ],
        score: 20,
        status: 'Ineligible',
        scoreBand: 'Medium'
      }

      await provider.addInteraction({
        state: 'scoring system is available for adding value grants',
        uponReceiving: 'a request to calculate score for average project',
        withRequest: {
          method: 'POST',
          path: '/scoring/api/v1/adding-value/score',
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

      const response = await fetch(`http://localhost:${mockServerPort}/scoring/api/v1/adding-value/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(scoringRequest)
      })

      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.scoreBand).toBe('Medium')
      expect(result.score).toBe(20)
      expect(result.answers).toHaveLength(6)
      expect(result.status).toBe('Ineligible')

      await provider.verify()
    })

    it('should handle invalid grant type', async () => {
      const validRequest = {
        data: {
          main: {
            '/collaboration': 'collaboration-A1',
            '/environmental-impact': ['environmental-impact-A1']
          }
        }
      }

      const expectedResponse = {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid grant type'
      }

      await provider.addInteraction({
        state: 'scoring system validates grant types',
        uponReceiving: 'a request with invalid grant type',
        withRequest: {
          method: 'POST',
          path: '/scoring/api/v1/invalid-grant/score',
          headers: {
            'Content-Type': 'application/json'
          },
          body: validRequest
        },
        willRespondWith: {
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          },
          body: expectedResponse
        }
      })

      const response = await fetch(`http://localhost:${mockServerPort}/scoring/api/v1/invalid-grant/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(validRequest)
      })

      const result = await response.json()

      expect(response.status).toBe(400)
      expect(result.error).toBe('Bad Request')
      expect(result.message).toBe('Invalid grant type')

      await provider.verify()
    })
  })

})
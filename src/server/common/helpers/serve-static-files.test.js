import { vi } from 'vitest'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { startServer } from '~/src/server/common/helpers/start-server.js'
import Wreck from '@hapi/wreck'

vi.mock('@hapi/wreck')

describe('#serveStaticFiles', () => {
  let server

  describe('When secure context is disabled', () => {
    beforeEach(async () => {
      // Mock the well-known OIDC config before server starts
      vi.mocked(Wreck.get).mockResolvedValue({
        payload: {
          authorization_endpoint: 'https://mock-auth/authorize',
          token_endpoint: 'https://mock-auth/token'
        }
      })

      server = await startServer()
    })

    afterEach(async () => {
      if (server && typeof server.stop === 'function') {
        await server.stop({ timeout: 0 })
      }
    })

    test('Should serve favicon as expected', async () => {
      expect(server).toBeDefined()
      expect(typeof server.inject).toBe('function')

      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/favicon.ico'
      })

      expect(statusCode).toBe(statusCodes.ok)
    })

    test('Should serve assets as expected', async () => {
      // Note npm run build is ran in the postinstall hook in package.json to make sure there is always a file
      // available for this test. Remove as you see fit
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/public/assets/images/govuk-crest.svg'
      })

      expect(statusCode).toBe(statusCodes.ok)
    })
  })
})

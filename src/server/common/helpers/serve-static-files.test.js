import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { startServer } from '~/src/server/common/helpers/start-server.js'
import Wreck from '@hapi/wreck'

jest.mock('@hapi/wreck', () => ({
  get: jest.fn()
}))

describe('#serveStaticFiles', () => {
  let server

  describe('When secure context is disabled', () => {
    beforeEach(async () => {
      // Mock the well-known OIDC config before server starts
      Wreck.get.mockResolvedValue({
        payload: {
          authorization_endpoint: 'https://mock-auth/authorize',
          token_endpoint: 'https://mock-auth/token'
        }
      })
      server = await startServer()
    })

    afterEach(async () => {
      await server.stop({ timeout: 0 })
    })

    test('Should serve favicon as expected', async () => {
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/favicon.ico'
      })

      expect(statusCode).toBe(statusCodes.noContent)
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

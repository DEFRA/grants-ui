import { createServer } from '~/src/server/index.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'

describe('#aboutController', () => {
  /** @type {Server} */
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should provide expected response', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/about'
    })

    expect(result).toEqual(expect.stringContaining('About |'))
    expect(statusCode).toBe(statusCodes.ok)
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */

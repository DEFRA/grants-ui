import { vi } from 'vitest'
import Hapi from '@hapi/hapi'
import { unauthorized } from '@hapi/boom'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { healthController } from './health.controller.js'
import { health } from './index.js'

describe('#healthController', () => {
  /** @type {Server} */
  let server

  beforeAll(async () => {
    server = Hapi.server()
    server.auth.scheme('test-session', () => ({
      authenticate: (_request, h) => h.unauthenticated(unauthorized(null, 'test-session'))
    }))
    server.auth.strategy('session', 'test-session')
    server.auth.default('session')
    await server.register(health)
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should provide expected response without authentication', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/health'
    })

    expect(result).toEqual({ message: 'success' })
    expect(statusCode).toBe(statusCodes.ok)
  })

  test('handler function returns correct response and status code', () => {
    const mockH = {
      response: vi.fn().mockReturnThis(),
      code: vi.fn().mockReturnThis()
    }

    const result = healthController.handler({}, mockH)

    expect(mockH.response).toHaveBeenCalledWith({ message: 'success' })
    expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
    expect(result).toBe(mockH)
  })
})

/**
 * @import { Server } from '@hapi/hapi'
 */

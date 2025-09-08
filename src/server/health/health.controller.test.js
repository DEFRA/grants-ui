import { vi } from 'vitest'
import { createServer } from '~/src/server/index.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { healthController } from './health.controller.js'
import Wreck from '@hapi/wreck'

describe('#healthController', () => {
  /** @type {Server} */
  let server

  beforeAll(async () => {
    // Mock the well-known OIDC config before server starts
    Wreck.get.mockResolvedValue({
      payload: {
        authorization_endpoint: 'https://mock-auth/authorize',
        token_endpoint: 'https://mock-auth/token'
      }
    })
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should provide expected response', async () => {
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

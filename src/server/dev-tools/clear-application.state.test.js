import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Hapi from '@hapi/hapi'
import { clearApplicationState } from './clear-application-state.js'

vi.mock('./handlers/clear-application-state.handler.js', () => ({
  clearApplicationStateHandler: vi.fn((request, h) => {
    return h.response({ message: 'State cleared', slug: request.params.slug })
  })
}))

describe('clearApplicationState plugin - integration tests', () => {
  let server

  beforeEach(async () => {
    server = Hapi.server({
      port: 3000,
      host: 'localhost'
    })

    await server.register(clearApplicationState)
  })

  afterEach(async () => {
    await server.stop()
  })

  it('should respond to /clear-application-state', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/clear-application-state'
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toEqual({
      message: 'State cleared',
      slug: undefined
    })
  })

  it('should respond to /{slug}/clear-application-state', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/farm-payments/clear-application-state'
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toEqual({
      message: 'State cleared',
      slug: 'farm-payments'
    })
  })

  it('should handle different slug values', async () => {
    const slugs = ['test', 'another-slug', '123', 'slug-with-dashes']

    for (const slug of slugs) {
      const response = await server.inject({
        method: 'GET',
        url: `/${slug}/clear-application-state`
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.payload).slug).toBe(slug)
    }
  })
})

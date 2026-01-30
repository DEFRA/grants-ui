import { describe, expect, it, vi } from 'vitest'
import { FetchClient } from './fetch.client'

global.fetch = vi.fn()

describe('FetchClient', () => {
  const mockEndpoint = new URL('https://example.com/api')
  const mockQuery = { query: { key: 'value' } }
  const mockResponse = { data: 'response' }

  beforeEach(() => {
    fetch.mockClear()
  })

  it('should set the endpoint in the constructor', () => {
    const client = new FetchClient(mockEndpoint)
    expect(client.endpoint).toBe(mockEndpoint)
  })

  it('should perform a fetch call with the correct options', async () => {
    const client = new FetchClient(mockEndpoint)
    fetch.mockResolvedValueOnce({
      json: async () => mockResponse,
      ok: true
    })

    const result = await client.fetch(mockQuery)

    expect(fetch).toHaveBeenCalledWith(mockEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mockQuery.query })
    })
    expect(result).toEqual({
      json: expect.any(Function),
      ok: true
    })
  })

  it('should reset fetch options to default', () => {
    const client = new FetchClient(mockEndpoint)
    client.fetchOptions = {
      headers: { Authorization: 'Bearer token' }
    }

    client.resetFetchOptions()

    expect(client.fetchOptions).toEqual({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
  })

  it('should merge custom fetch options when set', () => {
    const client = new FetchClient(mockEndpoint)
    client.fetchOptions = {
      headers: { Authorization: 'Bearer token' }
    }

    expect(client.fetchOptions).toEqual({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token'
      }
    })
  })
})

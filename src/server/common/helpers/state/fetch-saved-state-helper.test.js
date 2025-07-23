import { fetchSavedStateFromApi } from '~/src/server/common/helpers/state/fetch-saved-state-helper.js'
import { mockRequestWithIdentity } from './mock-request-with-identity.test-helper.js'

fetch.mockResolvedValue({
  ok: true,
  json: () => ({ state: { foo: 'bar' } }),
  text: () => JSON.stringify({ state: { foo: 'bar' } })
})

describe('fetchSavedStateFromApi', () => {
  it('returns state when response is valid', async () => {
    const request = mockRequestWithIdentity({ params: { slug: 'test-slug' } })
    const result = await fetchSavedStateFromApi(request)
    expect(result).toHaveProperty('state')
  })

  it('returns null on 404', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => {
        throw new Error('No content') // or simply don't call json at all
      }
    })

    const request = mockRequestWithIdentity({
      params: { slug: 'test-slug' }
    })
    const result = await fetchSavedStateFromApi(request)
    expect(result).toBeNull()
  })

  it('throws on 500', async () => {
    const request = mockRequestWithIdentity({ simulate500: true })
    await expect(fetchSavedStateFromApi(request)).rejects.toThrow()
  })
})

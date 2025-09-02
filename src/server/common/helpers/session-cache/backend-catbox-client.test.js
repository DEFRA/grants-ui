import { BackendCatboxClient } from '~/src/server/common/helpers/session-cache/backend-catbox-client.js'
import * as fetchModule from '../state/fetch-saved-state-helper.js'
import * as persistModule from '../state/persist-state-helper.js'

jest.mock('../state/fetch-saved-state-helper.js')
jest.mock('../state/persist-state-helper.js')

describe('BackendCatboxClient', () => {
  let client

  beforeEach(() => {
    client = new BackendCatboxClient()
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  describe('validateSegmentName', () => {
    it('throws on invalid segment', () => {
      const invalidSegments = [null, '', 123, 'invalid!segment', {}, []]
      invalidSegments.forEach((segment) => {
        expect(() => client.validateSegmentName(segment)).toThrow()
      })
    })

    it('does not throw on valid segment', () => {
      const validSegments = ['abc', 'ABC_123', 'valid-segment']
      validSegments.forEach((segment) => {
        expect(client.validateSegmentName(segment)).toBeNull()
      })
    })
  })

  describe('get', () => {
    it('calls fetchSavedStateFromApi and returns proper object', async () => {
      const key = { userId: 'u1' }
      const state = { foo: 'bar' }
      fetchModule.fetchSavedStateFromApi.mockResolvedValue(state)

      const result = await client.get(key)

      expect(fetchModule.fetchSavedStateFromApi).toHaveBeenCalledWith(key)
      expect(result).toHaveProperty('item', state)
      expect(result).toHaveProperty('stored')
      expect(result).toHaveProperty('ttl', 365 * 24 * 60 * 60 * 1000)
    })

    it('returns item=null when fetchSavedStateFromApi returns null', async () => {
      const key = { userId: 'u1' }
      fetchModule.fetchSavedStateFromApi.mockResolvedValue(null)

      const result = await client.get(key)

      expect(result.item).toBeNull()
    })
  })

  describe('set', () => {
    it('calls persistStateToApi with value and key', async () => {
      const key = { userId: 'u1' }
      const value = { foo: 'bar' }
      persistModule.persistStateToApi.mockResolvedValue()

      await client.set(key, value, 1234)

      expect(persistModule.persistStateToApi).toHaveBeenCalledWith(value, key)
    })
  })

  describe('drop', () => {
    it('logs drop call and does not throw', async () => {
      const key = { userId: 'u1' }
      await expect(client.drop(key)).resolves.toBeUndefined()
    })
  })

  describe('start', () => {
    it('logs start call and does not throw', async () => {
      await expect(client.start()).resolves.toBeUndefined()
    })
  })

  describe('stop', () => {
    it('logs stop call and does not throw', async () => {
      await expect(client.stop()).resolves.toBeUndefined()
    })
  })

  describe('isReady', () => {
    it('always returns true', () => {
      expect(client.isReady()).toBe(true)
    })
  })
})

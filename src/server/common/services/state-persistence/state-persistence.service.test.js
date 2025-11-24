import { vi } from 'vitest'
import { StatePersistenceService } from './state-persistence.service.js'
import * as fetchModule from '../../helpers/state/fetch-saved-state-helper.js'
import * as persistModule from '../../helpers/state/persist-state-helper.js'
import { getCacheKey } from '~/src/server/common/helpers/state/get-cache-key-helper.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

vi.mock('../../helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    SYSTEM: {
      SESSION_STATE_KEY_PARSE_FAILED: { level: 'error', messageFunc: vi.fn() },
      SESSION_STATE_FETCH_FAILED: { level: 'error', messageFunc: vi.fn() }
    }
  }
}))

vi.mock('../../helpers/state/fetch-saved-state-helper.js', () => ({
  fetchSavedStateFromApi: vi.fn(),
  clearSavedStateFromApi: vi.fn()
}))
vi.mock('../../helpers/state/persist-state-helper.js', () => ({
  persistStateToApi: vi.fn()
}))
vi.mock('~/src/server/common/helpers/state/get-cache-key-helper.js', () => ({
  getCacheKey: vi.fn()
}))

describe('StatePersistenceService', () => {
  let service
  const fakeLogger = vi.fn()
  const server = { log: vi.fn(), logger: { debug: fakeLogger }, cache: vi.fn(() => ({ get: vi.fn(), set: vi.fn() })) }

  const fakeRequest = {
    params: { slug: 'grant-a', state: '123' },
    auth: { credentials: { crn: 'user-1', relationships: ['rel:biz-1'] } }
  }

  beforeEach(() => {
    service = new StatePersistenceService({ server })
    vi.clearAllMocks()
  })

  test('Key generates the correct key', () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
    const key = service._Key(fakeRequest)
    expect(key).toBe('biz-1:grant-a')
  })

  test('ConfirmationKey appends the confirmation identifier', () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
    const key = service._ConfirmationKey(fakeRequest)
    expect(key).toBe(`biz-1:grant-a:confirmation`) // assuming ADDITIONAL_IDENTIFIER.Confirmation === 'confirmation'
  })

  test('getState calls fetchSavedStateFromApi and returns result', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
    fetchModule.fetchSavedStateFromApi.mockResolvedValue({ foo: 'bar' })

    const result = await service.getState(fakeRequest)
    expect(result).toEqual({ foo: 'bar' })
    expect(fetchModule.fetchSavedStateFromApi).toHaveBeenCalledWith('biz-1:grant-a', fakeRequest)
  })

  test('getState logs SESSION_STATE_KEY_PARSE_FAILED when key parsing fails', async () => {
    const parseError = new Error('bad key')
    getCacheKey.mockImplementation(() => {
      throw parseError
    })

    await expect(service.getState(fakeRequest)).rejects.toThrow('bad key')

    expect(log).toHaveBeenCalledWith(
      LogCodes.SYSTEM.SESSION_STATE_KEY_PARSE_FAILED,
      expect.objectContaining({
        errorMessage: 'bad key',
        requestPath: fakeRequest.path
      }),
      fakeRequest
    )
  })

  test('getState logs SESSION_STATE_FETCH_FAILED when fetchSavedStateFromApi throws', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })

    const fetchError = new Error('backend down')
    fetchModule.fetchSavedStateFromApi.mockRejectedValue(fetchError)

    await expect(service.getState(fakeRequest)).rejects.toThrow('backend down')

    expect(log).toHaveBeenCalledWith(
      LogCodes.SYSTEM.SESSION_STATE_FETCH_FAILED,
      expect.objectContaining({
        sessionKey: 'biz-1:grant-a',
        errorMessage: 'backend down',
        requestPath: fakeRequest.path
      }),
      fakeRequest
    )
  })

  test('setState calls persistStateToApi and returns state', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
    const state = { foo: 'bar' }
    await service.setState(fakeRequest, state)
    expect(persistModule.persistStateToApi).toHaveBeenCalledWith(state, 'biz-1:grant-a')
  })

  test('getConfirmationState calls fetchSavedStateFromApi with confirmation key', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
    fetchModule.fetchSavedStateFromApi.mockResolvedValue({ confirmed: true })
    await service.getConfirmationState(fakeRequest)
    expect(fakeLogger).toHaveBeenCalledWith(expect.stringContaining('getConfirmationState called for biz-1:grant-a'))
  })

  test('setConfirmationState calls persistStateToApi with confirmation key', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
    const state = { confirmed: true }
    await service.setConfirmationState(fakeRequest, state)
    expect(fakeLogger).toHaveBeenCalledWith(expect.stringContaining('setConfirmationState called for biz-1:grant-a'))
  })

  test('clearState logs info and does nothing', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
    await service.clearState(fakeRequest)
    expect(fakeLogger).toHaveBeenCalledWith(expect.stringContaining('clearState called for biz-1:grant-a'))
  })

  test('clearState does NOT call clearSavedStateFromApi when force=false', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })

    await service.clearState(fakeRequest)

    expect(persistModule.persistStateToApi).not.toHaveBeenCalled()
    expect(fetchModule.fetchSavedStateFromApi).not.toHaveBeenCalled()
    expect(fetchModule.clearSavedStateFromApi).not.toHaveBeenCalled()
  })

  test('clearState(force=true) calls clearSavedStateFromApi', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })

    await service.clearState(fakeRequest, true)

    expect(fetchModule.clearSavedStateFromApi).toHaveBeenCalledWith('biz-1:grant-a', fakeRequest)
  })

  test('clearState(force=true) logs and rethrows if clearSavedStateFromApi fails', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })

    const err = new Error('clear failed')
    fetchModule.clearSavedStateFromApi.mockRejectedValue(err)

    await expect(service.clearState(fakeRequest, true)).rejects.toThrow('clear failed')
  })
})

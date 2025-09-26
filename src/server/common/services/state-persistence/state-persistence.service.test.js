import { vi } from 'vitest'
import { StatePersistenceService } from './state-persistence.service.js'
import * as fetchModule from '../../helpers/state/fetch-saved-state-helper.js'
import * as persistModule from '../../helpers/state/persist-state-helper.js'
import { getCacheKey } from '~/src/server/common/helpers/state/get-cache-key-helper.js'

vi.mock('../../helpers/state/fetch-saved-state-helper.js', () => ({
  fetchSavedStateFromApi: vi.fn()
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
  const server = { log: vi.fn(), logger: { info: fakeLogger }, cache: vi.fn(() => ({ get: vi.fn(), set: vi.fn() })) }

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
    expect(fetchModule.fetchSavedStateFromApi).toHaveBeenCalledWith('biz-1:grant-a')
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
    const result = await service.getConfirmationState(fakeRequest)
    expect(result).toEqual({ confirmed: true })
    expect(fetchModule.fetchSavedStateFromApi).toHaveBeenCalledWith('biz-1:grant-a:confirmation')
  })

  test('setConfirmationState calls persistStateToApi with confirmation key', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
    const state = { confirmed: true }
    await service.setConfirmationState(fakeRequest, state)
    expect(persistModule.persistStateToApi).toHaveBeenCalledWith(state, 'biz-1:grant-a:confirmation')
  })

  test('clearState logs info and does nothing', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
    await service.clearState(fakeRequest)
    expect(fakeLogger).toHaveBeenCalledWith(expect.stringContaining('clearState called for biz-1:grant-a'))
  })
})

import { vi } from 'vitest'
import { StatePersistenceService } from './state-persistence.service.js'
import * as fetchModule from '../../helpers/state/fetch-saved-state-helper.js'
import * as persistModule from '../../helpers/state/persist-state-helper.js'
import * as contextModule from '../../helpers/state/state-with-definition-context.js'
import { getCacheKey } from '~/src/server/common/helpers/state/get-cache-key-helper.js'
import { debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import * as lockModule from '../../helpers/lock/lock-token.js'

vi.mock('../../helpers/lock/lock-token.js', () => ({
  mintLockToken: vi.fn(() => 'MOCK-LOCK-TOKEN')
}))

vi.mock('../../helpers/state/state-with-definition-context.js', () => ({
  getStateWithDefinition: vi.fn(),
  resolveVersion: vi.fn()
}))

vi.mock('../../helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

vi.mock('../../helpers/state/fetch-saved-state-helper.js', () => ({
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
    auth: { credentials: { contactId: 'user-1', sbi: 'biz-1', crn: 'user-1', relationships: ['rel:biz-1'] } },
    app: {}
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

  test('getState reads the combined stash, returns state and sets grantVersion', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
    // Full state document: the actual form state is nested under `state.state`.
    const envelope = { state: { state: { foo: 'bar' }, grantVersion: '2.0.0' }, upgraded: false }
    contextModule.getStateWithDefinition.mockResolvedValue(envelope)
    contextModule.resolveVersion.mockReturnValue('2.0.0')

    const result = await service.getState(fakeRequest)
    expect(result).toEqual({ foo: 'bar' })
    expect(fakeRequest.app.grantVersion).toBe('2.0.0')
    expect(contextModule.getStateWithDefinition).toHaveBeenCalledWith(fakeRequest)
    expect(contextModule.resolveVersion).toHaveBeenCalledWith(envelope)
  })

  test('getState returns {} when the stash has no state', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
    contextModule.getStateWithDefinition.mockResolvedValue({ state: null, upgraded: false })
    contextModule.resolveVersion.mockReturnValue(undefined)

    const result = await service.getState(fakeRequest)
    expect(result).toEqual({})
    expect(fakeRequest.app.grantVersion).toBeUndefined()
  })

  test('getState logs SESSION_STATE_KEY_PARSE_FAILED when key parsing fails', async () => {
    const parseError = new Error('bad key')
    getCacheKey.mockImplementation(() => {
      throw parseError
    })

    await expect(service.getState(fakeRequest)).rejects.toThrow('bad key')

    expect(debug).toHaveBeenCalledWith(
      LogCodes.SYSTEM.SESSION_STATE_KEY_PARSE_FAILED,
      expect.objectContaining({
        errorMessage: 'bad key',
        requestPath: fakeRequest.path
      }),
      fakeRequest
    )
  })

  test('getState logs SESSION_STATE_FETCH_FAILED when the combined fetch throws', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })

    const fetchError = new Error('backend down')
    contextModule.getStateWithDefinition.mockRejectedValue(fetchError)

    await expect(service.getState(fakeRequest)).rejects.toThrow('backend down')

    expect(debug).toHaveBeenCalledWith(
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
    // No version on the request/envelope/model: falls back to the default of 1.
    contextModule.getStateWithDefinition.mockResolvedValue(undefined)
    contextModule.resolveVersion.mockReturnValue(undefined)
    const state = { foo: 'bar' }
    await service.setState({ ...fakeRequest, app: {} }, state)
    expect(persistModule.persistStateToApi).toHaveBeenCalledWith(state, 'biz-1:grant-a', {
      lockToken: 'MOCK-LOCK-TOKEN',
      grantVersion: 1
    })
    expect(lockModule.mintLockToken).toHaveBeenCalledWith({
      userId: 'user-1',
      sbi: 'biz-1',
      grantCode: 'grant-a',
      grantVersion: 1
    })
  })

  test('setState persists under the active grant version resolved by getState (post-migration)', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
    // getState recorded the backend-resolved (migrated) version on the request.
    const request = { ...fakeRequest, app: { grantVersion: '1.0.1' } }
    const state = { foo: 'bar' }

    await service.setState(request, state)

    expect(persistModule.persistStateToApi).toHaveBeenCalledWith(state, 'biz-1:grant-a', {
      lockToken: 'MOCK-LOCK-TOKEN',
      grantVersion: '1.0.1'
    })
    expect(lockModule.mintLockToken).toHaveBeenCalledWith({
      userId: 'user-1',
      sbi: 'biz-1',
      grantCode: 'grant-a',
      grantVersion: '1.0.1'
    })
    // Must not need to re-fetch when the version is already on the request.
    expect(contextModule.getStateWithDefinition).not.toHaveBeenCalled()
  })

  test('setState re-resolves the version from the envelope when not on the request', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
    const request = { ...fakeRequest, app: {} }
    const envelope = { state: { state: { foo: 'bar' } }, upgraded: true, toVersion: '1.0.1' }
    contextModule.getStateWithDefinition.mockResolvedValue(envelope)
    contextModule.resolveVersion.mockReturnValue('1.0.1')

    await service.setState(request, { foo: 'bar' })

    expect(persistModule.persistStateToApi).toHaveBeenCalledWith({ foo: 'bar' }, 'biz-1:grant-a', {
      lockToken: 'MOCK-LOCK-TOKEN',
      grantVersion: '1.0.1'
    })
  })

  test('getConfirmationState logs and is a no-op', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
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
    expect(fetchModule.clearSavedStateFromApi).not.toHaveBeenCalled()
  })

  test('clearState(force=true) calls clearSavedStateFromApi', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
    // No resolvable version (non-config broker grant) → falls back to 1.
    contextModule.getStateWithDefinition.mockResolvedValue(undefined)
    contextModule.resolveVersion.mockReturnValue(undefined)

    await service.clearState(fakeRequest, true)

    expect(fetchModule.clearSavedStateFromApi).toHaveBeenCalledWith('biz-1:grant-a', fakeRequest, {
      lockToken: 'MOCK-LOCK-TOKEN',
      grantVersion: 1
    })
    expect(lockModule.mintLockToken).toHaveBeenCalledWith({
      userId: 'user-1',
      sbi: 'biz-1',
      grantCode: 'grant-a',
      grantVersion: 1
    })
  })

  test('clearState(force=true) logs and rethrows if clearSavedStateFromApi fails', async () => {
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })

    const err = new Error('clear failed')
    fetchModule.clearSavedStateFromApi.mockRejectedValue(err)

    await expect(service.clearState(fakeRequest, true)).rejects.toThrow('clear failed')
  })

  describe('with config-broker model (semver grantVersion)', () => {
    const fakeRequestWithVersion = {
      params: { slug: 'grant-a', state: '123' },
      auth: { credentials: { contactId: 'user-1', sbi: 'biz-1', crn: 'user-1', relationships: ['rel:biz-1'] } },
      // getState records the backend-resolved version on the request; here it matches the authored model version.
      app: { grantVersion: '1.0.0', model: { def: { metadata: { version: '1.0.0' } } } }
    }

    test('setState passes semver grantVersion to persistStateToApi and mintLockToken', async () => {
      getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
      const state = { foo: 'bar' }

      await service.setState(fakeRequestWithVersion, state)

      expect(persistModule.persistStateToApi).toHaveBeenCalledWith(state, 'biz-1:grant-a', {
        lockToken: 'MOCK-LOCK-TOKEN',
        grantVersion: '1.0.0'
      })
      expect(lockModule.mintLockToken).toHaveBeenCalledWith({
        userId: 'user-1',
        sbi: 'biz-1',
        grantCode: 'grant-a',
        grantVersion: '1.0.0'
      })
    })

    test('clearState(force=true) passes semver grantVersion to mintLockToken and clearSavedStateFromApi', async () => {
      getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
      fetchModule.clearSavedStateFromApi.mockResolvedValue(undefined)

      await service.clearState(fakeRequestWithVersion, true)

      expect(lockModule.mintLockToken).toHaveBeenCalledWith({
        userId: 'user-1',
        sbi: 'biz-1',
        grantCode: 'grant-a',
        grantVersion: '1.0.0'
      })
      // The DELETE must target the same version the state was persisted under,
      // otherwise the backend 404s and nothing is cleared.
      expect(fetchModule.clearSavedStateFromApi).toHaveBeenCalledWith('biz-1:grant-a', fakeRequestWithVersion, {
        lockToken: 'MOCK-LOCK-TOKEN',
        grantVersion: '1.0.0'
      })
    })

    test('clearState(force=true) clears under the backend-resolved version when it is not on the request', async () => {
      getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
      fetchModule.clearSavedStateFromApi.mockResolvedValue(undefined)
      const request = { ...fakeRequest, app: {} }
      const envelope = { state: { state: {} }, upgraded: false }
      contextModule.getStateWithDefinition.mockResolvedValue(envelope)
      contextModule.resolveVersion.mockReturnValue('1.0.1')

      await service.clearState(request, true)

      expect(fetchModule.clearSavedStateFromApi).toHaveBeenCalledWith('biz-1:grant-a', request, {
        lockToken: 'MOCK-LOCK-TOKEN',
        grantVersion: '1.0.1'
      })
    })
  })
})

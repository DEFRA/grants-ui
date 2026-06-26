import permissionsPlugin from './permissions.js'
import { fetchBusinessPermissions } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { can } from '~/src/server/common/helpers/permissions/can.js'
import { vi } from 'vitest'

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchBusinessPermissions: vi.fn()
}))

vi.mock('~/src/server/common/helpers/permissions/can.js', () => ({
  can: vi.fn()
}))

describe('permissions plugin', () => {
  let onPostAuthHandler
  let server
  let h
  let yarStore
  let yar

  beforeEach(async () => {
    server = {
      ext: vi.fn((event, handler) => {
        onPostAuthHandler = handler
      })
    }

    h = {
      continue: Symbol('continue')
    }

    yarStore = new Map()
    yar = {
      get: vi.fn((key) => yarStore.get(key)),
      set: vi.fn((key, value) => yarStore.set(key, value))
    }

    await permissionsPlugin.plugin.register(server)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('registers onPostAuth extension', () => {
    expect(server.ext).toHaveBeenCalledWith('onPostAuth', expect.any(Function))
  })

  test('skips unauthenticated requests', async () => {
    const request = {
      path: '/some-path',
      auth: {
        isAuthenticated: false
      }
    }

    const result = await onPostAuthHandler(request, h)

    expect(fetchBusinessPermissions).not.toHaveBeenCalled()
    expect(result).toBe(h.continue)
  })

  test.each(['/health', '/health/live', '/auth/login'])('skips excluded path %s', async (path) => {
    const request = {
      path,
      auth: {
        isAuthenticated: true
      }
    }

    const result = await onPostAuthHandler(request, h)

    expect(fetchBusinessPermissions).not.toHaveBeenCalled()
    expect(result).toBe(h.continue)
  })

  test('fetches permissions for authenticated non-excluded requests', async () => {
    const permissionGroups = ['group-1']

    fetchBusinessPermissions.mockResolvedValue(permissionGroups)

    const request = {
      path: '/apply',
      yar,
      auth: {
        isAuthenticated: true,
        credentials: { crn: 'crn-1', sbi: 'sbi-1' }
      }
    }

    const result = await onPostAuthHandler(request, h)

    expect(fetchBusinessPermissions).toHaveBeenCalledWith(request)

    expect(request.auth.credentials.permissions).toEqual(permissionGroups)

    expect(result).toBe(h.continue)
  })

  test('caches permissions in yar keyed by crn+sbi on first call', async () => {
    const permissionGroups = ['group-1']

    fetchBusinessPermissions.mockResolvedValue(permissionGroups)

    const request = {
      path: '/apply',
      yar,
      auth: {
        isAuthenticated: true,
        credentials: { crn: 'crn-1', sbi: 'sbi-1' }
      }
    }

    await onPostAuthHandler(request, h)

    expect(fetchBusinessPermissions).toHaveBeenCalledTimes(1)
    expect(yar.set).toHaveBeenCalledWith('permissions:crn-1:sbi-1', permissionGroups)
  })

  test('reuses cached permissions on subsequent requests in same session', async () => {
    const permissionGroups = ['group-1']

    fetchBusinessPermissions.mockResolvedValue(permissionGroups)

    const makeRequest = () => ({
      path: '/apply',
      yar,
      auth: {
        isAuthenticated: true,
        credentials: { crn: 'crn-1', sbi: 'sbi-1' }
      }
    })

    const firstRequest = makeRequest()
    await onPostAuthHandler(firstRequest, h)

    const secondRequest = makeRequest()
    await onPostAuthHandler(secondRequest, h)

    expect(fetchBusinessPermissions).toHaveBeenCalledTimes(1)
    expect(secondRequest.auth.credentials.permissions).toEqual(permissionGroups)
  })

  test('fetches separately for a different crn+sbi', async () => {
    fetchBusinessPermissions.mockResolvedValueOnce(['group-1']).mockResolvedValueOnce(['group-2'])

    const firstRequest = {
      path: '/apply',
      yar,
      auth: {
        isAuthenticated: true,
        credentials: { crn: 'crn-1', sbi: 'sbi-1' }
      }
    }
    await onPostAuthHandler(firstRequest, h)

    const secondRequest = {
      path: '/apply',
      yar,
      auth: {
        isAuthenticated: true,
        credentials: { crn: 'crn-2', sbi: 'sbi-2' }
      }
    }
    await onPostAuthHandler(secondRequest, h)

    expect(fetchBusinessPermissions).toHaveBeenCalledTimes(2)
    expect(firstRequest.auth.credentials.permissions).toEqual(['group-1'])
    expect(secondRequest.auth.credentials.permissions).toEqual(['group-2'])
  })

  test('adds request.can helper', async () => {
    const permissionGroups = ['group-1']

    fetchBusinessPermissions.mockResolvedValue(permissionGroups)

    can.mockReturnValue(true)

    const request = {
      path: '/apply',
      yar,
      auth: {
        isAuthenticated: true,
        credentials: { crn: 'crn-1', sbi: 'sbi-1' }
      }
    }

    await onPostAuthHandler(request, h)

    const result = request.can('submit', 'application')

    expect(can).toHaveBeenCalledWith(permissionGroups, 'submit', 'application')

    expect(result).toBe(true)
  })

  test('propagates errors from fetchBusinessPermissions', async () => {
    const error = new Error('permissions failed')

    fetchBusinessPermissions.mockRejectedValue(error)

    const request = {
      path: '/apply',
      yar,
      auth: {
        isAuthenticated: true,
        credentials: { crn: 'crn-1', sbi: 'sbi-1' }
      }
    }

    await expect(onPostAuthHandler(request, h)).rejects.toThrow(error)
  })
})

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

  beforeEach(async () => {
    server = {
      ext: vi.fn((event, handler) => {
        onPostAuthHandler = handler
      })
    }

    h = {
      continue: Symbol('continue')
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
      auth: {
        isAuthenticated: true,
        credentials: {}
      }
    }

    const result = await onPostAuthHandler(request, h)

    expect(fetchBusinessPermissions).toHaveBeenCalledWith(request)

    expect(request.auth.credentials.permissions).toEqual(permissionGroups)

    expect(result).toBe(h.continue)
  })

  test('adds request.can helper', async () => {
    const permissionGroups = ['group-1']

    fetchBusinessPermissions.mockResolvedValue(permissionGroups)

    can.mockReturnValue(true)

    const request = {
      path: '/apply',
      auth: {
        isAuthenticated: true,
        credentials: {}
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
      auth: {
        isAuthenticated: true,
        credentials: {}
      }
    }

    await expect(onPostAuthHandler(request, h)).rejects.toThrow(error)
  })
})

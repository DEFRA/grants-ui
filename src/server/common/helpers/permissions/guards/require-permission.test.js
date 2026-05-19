import { describe, test, expect, vi, beforeEach } from 'vitest'
import { permissionPaths, getReturnToApplicationPath, requirePermission } from './require-permission.js'

import { getTaskListPath } from '~/src/server/task-list/task-list.helper.js'

vi.mock('~/src/server/task-list/task-list.helper.js', () => ({
  getTaskListPath: vi.fn()
}))

describe('permissionPaths', () => {
  test('exports cannotSubmit path', () => {
    expect(permissionPaths).toEqual({
      cannotSubmit: '/cannot-submit'
    })
  })
})

describe('getReturnToApplicationPath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns task list path when available', () => {
    getTaskListPath.mockReturnValue('/task-list')

    const model = { id: 'model' }

    const result = getReturnToApplicationPath(model, '/my-grant')

    expect(getTaskListPath).toHaveBeenCalledWith(model)

    expect(result).toBe('/my-grant/task-list')
  })

  test('falls back to summary path when task list path is not available', () => {
    getTaskListPath.mockReturnValue(undefined)

    const model = { id: 'model' }

    const result = getReturnToApplicationPath(model, '/my-grant')

    expect(getTaskListPath).toHaveBeenCalledWith(model)

    expect(result).toBe('/my-grant/summary')
  })

  test.each([null, ''])('falls back to summary path when task list path is %s', (taskListPath) => {
    getTaskListPath.mockReturnValue(taskListPath)

    const result = getReturnToApplicationPath({}, '/my-grant')

    expect(result).toBe('/my-grant/summary')
  })
})

describe('requirePermission', () => {
  let hasPermission
  let onFail
  let request
  let h

  beforeEach(() => {
    hasPermission = vi.fn()
    onFail = vi.fn()

    request = {
      auth: {
        credentials: {
          permissions: ['permission-1']
        }
      }
    }

    h = {
      continue: Symbol('continue')
    }
  })

  test('returns middleware function', () => {
    const middleware = requirePermission({
      hasPermission,
      onFail
    })

    expect(typeof middleware).toBe('function')
  })

  test('returns h.continue when permission check passes', () => {
    hasPermission.mockReturnValue(true)

    const middleware = requirePermission({
      hasPermission,
      onFail
    })

    const result = middleware(request, h)

    expect(hasPermission).toHaveBeenCalledWith(['permission-1'])

    expect(onFail).not.toHaveBeenCalled()

    expect(result).toBe(h.continue)
  })

  test('calls onFail when permission check fails', () => {
    hasPermission.mockReturnValue(false)

    onFail.mockReturnValue('redirected')

    const middleware = requirePermission({
      hasPermission,
      onFail
    })

    const context = {
      returnUrl: '/task-list'
    }

    const result = middleware(request, h, context)

    expect(hasPermission).toHaveBeenCalledWith(['permission-1'])

    expect(onFail).toHaveBeenCalledWith(request, h, context)

    expect(result).toBe('redirected')
  })

  test('uses empty permissions array when permissions are undefined', () => {
    request.auth.credentials.permissions = undefined

    hasPermission.mockReturnValue(true)

    const middleware = requirePermission({
      hasPermission,
      onFail
    })

    middleware(request, h)

    expect(hasPermission).toHaveBeenCalledWith([])
  })

  test('uses default empty context object', () => {
    hasPermission.mockReturnValue(false)

    const middleware = requirePermission({
      hasPermission,
      onFail
    })

    middleware(request, h)

    expect(onFail).toHaveBeenCalledWith(request, h, {})
  })
})

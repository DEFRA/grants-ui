import { describe, test, expect, vi, beforeEach } from 'vitest'
import { permissionPaths, getReturnToApplicationPath, requirePermission } from './require-permission.js'

import { getTaskListPath } from '~/src/server/task-list/task-list.helper.js'
import { isPermissionEnforced } from '../permission-config.js'
import { logPermissionEvent } from '../permission-logger.js'
import { getGrantCode } from '../../grant-code.js'

vi.mock('~/src/server/task-list/task-list.helper.js', () => ({
  getTaskListPath: vi.fn()
}))

vi.mock('../permission-config.js', () => ({
  isPermissionEnforced: vi.fn()
}))

vi.mock('../permission-logger.js', () => ({
  logPermissionEvent: vi.fn()
}))

vi.mock('../../grant-code.js', () => ({
  getGrantCode: vi.fn()
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
  let isAuthorised
  let onFail
  let request
  let h

  beforeEach(() => {
    vi.clearAllMocks()

    isAuthorised = vi.fn()
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

    isPermissionEnforced.mockReturnValue(true)
    getGrantCode.mockReturnValue('cs')
  })

  test('returns middleware function', () => {
    const middleware = requirePermission({
      permission: 'submit',
      isAuthorised,
      onFail
    })

    expect(typeof middleware).toBe('function')
  })

  test('returns h.continue when permission check passes', () => {
    isAuthorised.mockReturnValue(true)

    const middleware = requirePermission({
      permission: 'submit',
      isAuthorised,
      onFail
    })

    const result = middleware(request, h)

    expect(isAuthorised).toHaveBeenCalledWith(['permission-1'])

    expect(logPermissionEvent).toHaveBeenCalledWith({
      request,
      grantCode: 'cs',
      permission: 'submit',
      enforcementEnabled: true,
      authorised: true
    })

    expect(onFail).not.toHaveBeenCalled()

    expect(result).toBe(h.continue)
  })

  test('calls onFail when permission check fails', () => {
    isAuthorised.mockReturnValue(false)

    onFail.mockReturnValue('redirected')

    const middleware = requirePermission({
      permission: 'submit',
      isAuthorised,
      onFail
    })

    const context = {
      returnUrl: '/task-list'
    }

    const result = middleware(request, h, context)

    expect(isAuthorised).toHaveBeenCalledWith(['permission-1'])

    expect(logPermissionEvent).toHaveBeenCalledWith({
      request,
      grantCode: 'cs',
      permission: 'submit',
      enforcementEnabled: true,
      authorised: false
    })

    expect(onFail).toHaveBeenCalledWith(request, h, context)

    expect(result).toBe('redirected')
  })

  test('returns h.continue when permission enforcement is disabled', () => {
    isPermissionEnforced.mockReturnValue(false)

    const middleware = requirePermission({
      permission: 'submit',
      isAuthorised,
      onFail
    })

    const result = middleware(request, h)

    expect(isAuthorised).not.toHaveBeenCalled()

    expect(logPermissionEvent).toHaveBeenCalledWith({
      request,
      grantCode: 'cs',
      permission: 'submit',
      enforcementEnabled: false,
      authorised: true
    })

    expect(onFail).not.toHaveBeenCalled()

    expect(result).toBe(h.continue)
  })

  test('uses empty permissions array when permissions are undefined', () => {
    request.auth.credentials.permissions = undefined

    isAuthorised.mockReturnValue(true)

    const middleware = requirePermission({
      permission: 'submit',
      isAuthorised,
      onFail
    })

    middleware(request, h)

    expect(isAuthorised).toHaveBeenCalledWith([])
  })

  test('uses default empty context object', () => {
    isAuthorised.mockReturnValue(false)

    const middleware = requirePermission({
      permission: 'submit',
      isAuthorised,
      onFail
    })

    middleware(request, h)

    expect(onFail).toHaveBeenCalledWith(request, h, {})
  })
})

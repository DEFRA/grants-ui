import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('../logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    PERMISSIONS: {
      BYPASSED: 'PERMISSIONS_BYPASSED',
      FAILURE: 'PERMISSIONS_FAILURE'
    }
  }
}))

import { logPermissionEvent } from './permission-logger.js'
import { log, LogCodes } from '../logging/log.js'

describe('logPermissionEvent', () => {
  let request

  beforeEach(() => {
    vi.clearAllMocks()

    request = {
      auth: {
        credentials: {
          contactId: 'user-123'
        }
      },
      params: {
        slug: 'woodland',
        path: 'start'
      }
    }
  })

  test('logs bypassed enforcement', () => {
    logPermissionEvent({
      request,
      grantCode: 'cs',
      permission: 'submit',
      enforcementEnabled: false,
      authorised: true
    })

    expect(log).toHaveBeenCalledWith(
      LogCodes.PERMISSIONS.BYPASSED,
      {
        userId: 'user-123',
        grantCode: 'cs',
        permission: 'submit',
        authorised: true,
        path: 'start'
      },
      request
    )
  })

  test('logs successful permission check', () => {
    logPermissionEvent({
      request,
      grantCode: 'cs',
      permission: 'submit',
      enforcementEnabled: true,
      authorised: true
    })

    expect(log).toHaveBeenCalledWith(
      LogCodes.PERMISSIONS.SUCCESS,
      {
        userId: 'user-123',
        grantCode: 'cs',
        permission: 'submit',
        authorised: true,
        path: 'start'
      },
      request
    )
  })

  test('logs failed permission check', () => {
    logPermissionEvent({
      request,
      grantCode: 'cs',
      permission: 'submit',
      enforcementEnabled: true,
      authorised: false
    })

    expect(log).toHaveBeenCalledWith(
      LogCodes.PERMISSIONS.FAILURE,
      {
        userId: 'user-123',
        grantCode: 'cs',
        permission: 'submit',
        authorised: false,
        path: 'start'
      },
      request
    )
  })

  test('uses unknown when contactId is missing', () => {
    request.auth.credentials.contactId = undefined

    logPermissionEvent({
      request,
      grantCode: 'cs',
      permission: 'submit',
      enforcementEnabled: true,
      authorised: true
    })

    expect(log).toHaveBeenCalledWith(
      LogCodes.PERMISSIONS.SUCCESS,
      {
        userId: 'unknown',
        grantCode: 'cs',
        permission: 'submit',
        authorised: true,
        path: 'start'
      },
      request
    )
  })

  test('uses unknown when auth is missing', () => {
    request.auth = undefined

    logPermissionEvent({
      request,
      grantCode: 'cs',
      permission: 'submit',
      enforcementEnabled: true,
      authorised: true
    })

    expect(log).toHaveBeenCalledWith(
      LogCodes.PERMISSIONS.SUCCESS,
      {
        userId: 'unknown',
        grantCode: 'cs',
        permission: 'submit',
        authorised: true,
        path: 'start'
      },
      request
    )
  })
})

import { describe, test, expect, vi, beforeEach } from 'vitest'

import { logPermissionEvent } from './permission-logger.js'

describe('logPermissionEvent', () => {
  let request

  beforeEach(() => {
    request = {
      auth: {
        credentials: {
          contactId: 'user-123'
        }
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn()
      }
    }
  })

  test('logs bypassed enforcement as info', () => {
    logPermissionEvent({
      request,
      grantCode: 'cs',
      permission: 'submit',
      enforcementEnabled: false,
      authorised: true
    })

    expect(request.logger.info).toHaveBeenCalledWith(
      {
        grantCode: 'cs',
        permission: 'submit',
        userId: 'user-123',
        enforcementEnabled: false,
        authorised: true
      },
      'Permission enforcement bypassed'
    )

    expect(request.logger.warn).not.toHaveBeenCalled()
  })

  test('logs successful permission check as info', () => {
    logPermissionEvent({
      request,
      grantCode: 'cs',
      permission: 'submit',
      enforcementEnabled: true,
      authorised: true
    })

    expect(request.logger.info).toHaveBeenCalledWith(
      {
        grantCode: 'cs',
        permission: 'submit',
        userId: 'user-123',
        enforcementEnabled: true,
        authorised: true
      },
      'Permission check successful'
    )

    expect(request.logger.warn).not.toHaveBeenCalled()
  })

  test('logs failed permission check as warn', () => {
    logPermissionEvent({
      request,
      grantCode: 'cs',
      permission: 'submit',
      enforcementEnabled: true,
      authorised: false
    })

    expect(request.logger.warn).toHaveBeenCalledWith(
      {
        grantCode: 'cs',
        permission: 'submit',
        userId: 'user-123',
        enforcementEnabled: true,
        authorised: false
      },
      'Permission check failed'
    )

    expect(request.logger.info).not.toHaveBeenCalled()
  })

  test('handles missing contactId', () => {
    request.auth.credentials.contactId = undefined

    logPermissionEvent({
      request,
      grantCode: 'cs',
      permission: 'submit',
      enforcementEnabled: true,
      authorised: true
    })

    expect(request.logger.info).toHaveBeenCalledWith(
      {
        grantCode: 'cs',
        permission: 'submit',
        userId: undefined,
        enforcementEnabled: true,
        authorised: true
      },
      'Permission check successful'
    )
  })
})

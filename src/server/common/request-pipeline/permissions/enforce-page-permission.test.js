import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  enforcePagePermission,
  getReturnToApplicationPath,
  isCannotSubmitUser,
  isSubmittedApplication,
  isViewOnlyUser
} from './enforce-page-permission.js'

import { ApplicationStatus } from '../../constants/application-status.js'

vi.mock('~/src/server/task-list/task-list.helper.js', () => ({
  getTaskListPath: vi.fn()
}))

vi.mock('../../helpers/permissions/page-permissions.js', () => ({
  getRequiredPermission: vi.fn(),
  getPermissionResource: vi.fn()
}))

import { getTaskListPath } from '~/src/server/task-list/task-list.helper.js'
import { getPermissionResource, getRequiredPermission } from '../../helpers/permissions/page-permissions.js'

describe('isCannotSubmitUser', () => {
  it('returns true when user can amend but cannot submit', () => {
    const request = {
      can: vi.fn((action) => {
        if (action === 'amend') {
          return true
        }

        if (action === 'submit') {
          return false
        }

        return false
      })
    }

    const result = isCannotSubmitUser(request, 'submit', 'csApplications')

    expect(result).toBe(true)
  })

  it('returns false when required permission is not submit', () => {
    const request = {
      can: vi.fn(() => true)
    }

    const result = isCannotSubmitUser(request, 'view', 'csApplications')

    expect(result).toBe(false)
  })

  it('returns false when user can submit', () => {
    const request = {
      can: vi.fn(() => true)
    }

    const result = isCannotSubmitUser(request, 'submit', 'csApplications')

    expect(result).toBe(false)
  })
})

describe('isSubmittedApplication', () => {
  it('returns true for SUBMITTED', () => {
    const context = {
      state: {
        applicationStatus: ApplicationStatus.SUBMITTED
      }
    }

    expect(isSubmittedApplication(context)).toBe(true)
  })

  it('returns true for REOPENED', () => {
    const context = {
      state: {
        applicationStatus: ApplicationStatus.REOPENED
      }
    }

    expect(isSubmittedApplication(context)).toBe(true)
  })

  it('returns false for undefined status', () => {
    const context = {
      state: {}
    }

    expect(isSubmittedApplication(context)).toBe(false)
  })

  it('returns false for draft status', () => {
    const context = {
      state: {
        applicationStatus: 'IN_PROGRESS'
      }
    }

    expect(isSubmittedApplication(context)).toBe(false)
  })
})

describe('isViewOnlyUser', () => {
  it('returns true when user can only view', () => {
    const request = {
      can: vi.fn((action) => {
        return action === 'view'
      })
    }

    expect(isViewOnlyUser(request, 'csApplications')).toBe(true)
  })

  it('returns false when user can amend', () => {
    const request = {
      can: vi.fn((action) => {
        return ['view', 'amend'].includes(action)
      })
    }

    expect(isViewOnlyUser(request, 'csApplications')).toBe(false)
  })

  it('returns false when user cannot view', () => {
    const request = {
      can: vi.fn(() => false)
    }

    expect(isViewOnlyUser(request, 'csApplications')).toBe(false)
  })
})

describe('getReturnToApplicationPath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns task list path when available', () => {
    vi.mocked(getTaskListPath).mockReturnValue('/task-list')

    const result = getReturnToApplicationPath({}, '/sfi')

    expect(result).toEqual({ href: '/sfi/task-list', text: 'Return to task list' })
  })

  it('falls back to summary path when no task list exists', () => {
    vi.mocked(getTaskListPath).mockReturnValue(undefined)

    const result = getReturnToApplicationPath({}, '/sfi')

    expect(result).toEqual({ href: '/sfi/summary', text: 'Return to summary' })
  })
})

describe('enforcePagePermission', () => {
  let request
  let h
  let context

  beforeEach(() => {
    vi.clearAllMocks()

    request = {
      params: {
        slug: 'sfi',
        path: 'confirmation'
      },
      app: {
        model: {
          def: {
            metadata: {
              permissions: {
                enforce: true
              }
            }
          }
        }
      },
      can: vi.fn()
    }

    h = {
      continue: Symbol('continue'),
      redirect: vi.fn(() => ({
        takeover: vi.fn(() => 'redirected')
      }))
    }

    context = {
      state: {
        applicationStatus: ApplicationStatus.SUBMITTED
      }
    }

    vi.mocked(getRequiredPermission).mockReturnValue('view')
    vi.mocked(getPermissionResource).mockReturnValue('csApplications')
  })

  it('returns h.continue when permission enforcement disabled', () => {
    request.app.model.def.metadata.permissions.enforce = false

    expect(enforcePagePermission(request, h, context)).toBe(h.continue)
  })

  it('returns h.continue when user has required view permission', () => {
    request.can.mockImplementation((action) => action === 'view')

    expect(enforcePagePermission(request, h, context)).toBe(h.continue)
  })

  it('returns h.continue when user has required submit permission', () => {
    vi.mocked(getRequiredPermission).mockReturnValue('submit')

    request.can.mockImplementation((action) => action === 'submit')

    expect(enforcePagePermission(request, h, context)).toBe(h.continue)
  })

  it('throws Application not submitted when view page accessed before submission', () => {
    context.state.applicationStatus = 'IN_PROGRESS'

    request.can.mockImplementation((action) => action === 'view')

    expect(() => enforcePagePermission(request, h, context)).toThrow('Application not submitted')
  })

  it('redirects amend-only users attempting submit', () => {
    vi.mocked(getRequiredPermission).mockReturnValue('submit')
    vi.mocked(getTaskListPath).mockReturnValue('/task-list')

    request.can.mockImplementation((action) => {
      if (action === 'amend') {
        return true
      }

      if (action === 'submit') {
        return false
      }

      return false
    })

    const takeover = vi.fn(() => 'redirected')

    h.redirect.mockReturnValue({
      takeover
    })

    const result = enforcePagePermission(request, h, context)

    expect(h.redirect).toHaveBeenCalledWith(
      '/cannot-submit?returnUrl=%2Fsfi%2Ftask-list&returnText=Return%20to%20task%20list'
    )

    expect(takeover).toHaveBeenCalled()
    expect(result).toBe('redirected')
  })

  it('throws when model missing during cannot-submit redirect', () => {
    vi.mocked(getRequiredPermission).mockReturnValue('submit')

    request.app.model = undefined

    request.can.mockImplementation((action) => {
      if (action === 'amend') {
        return true
      }

      if (action === 'submit') {
        return false
      }

      return false
    })

    expect(() => enforcePagePermission(request, h, context)).toThrow('Form model missing')
  })

  it('throws forbidden when user has no permissions', () => {
    request.can.mockReturnValue(false)

    expect(() => enforcePagePermission(request, h, context)).toThrow('Insufficient permissions')
  })

  it('throws Boom 403 error', () => {
    request.can.mockReturnValue(false)

    try {
      enforcePagePermission(request, h, context)
    } catch (err) {
      expect(err.output.statusCode).toBe(403)
      expect(err.message).toBe('Insufficient permissions')
    }
  })
})

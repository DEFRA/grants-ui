import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  enforcePagePermission,
  getReturnToApplicationPath,
  isAllowedViewOnlyPath,
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

    expect(result).toBe('/sfi/task-list')
  })

  it('falls back to summary path when no task list exists', () => {
    vi.mocked(getTaskListPath).mockReturnValue(undefined)

    const result = getReturnToApplicationPath({}, '/sfi')

    expect(result).toBe('/sfi/summary')
  })
})

describe('isAllowedViewOnlyPath', () => {
  it('returns true for confirmation path', () => {
    expect(isAllowedViewOnlyPath('confirmation')).toBe(true)
  })

  it('returns true for print submitted application path', () => {
    expect(isAllowedViewOnlyPath('print-submitted-application')).toBe(true)
  })

  it('returns false for other paths', () => {
    expect(isAllowedViewOnlyPath('task-list')).toBe(false)
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

    const result = enforcePagePermission(request, h, context)

    expect(result).toBe(h.continue)
  })

  it('returns h.continue when user has required permission', () => {
    request.can.mockImplementation((action) => action === 'view')

    const result = enforcePagePermission(request, h, context)

    expect(result).toBe(h.continue)
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

    expect(h.redirect).toHaveBeenCalledWith('/cannot-submit?returnUrl=%2Fsfi%2Ftask-list')

    expect(takeover).toHaveBeenCalled()
    expect(result).toBe('redirected')
  })

  it('allows submitted view-only users to access confirmation page', () => {
    request.can.mockImplementation((action) => {
      return action === 'view'
    })

    const result = enforcePagePermission(request, h, context)

    expect(result).toBe(h.continue)
  })

  it('throws forbidden for view-only users on non-allowed paths', () => {
    request.params.path = 'task-list'

    request.can.mockImplementation((action) => {
      return action === 'view'
    })

    expect(() => enforcePagePermission(request, h, context)).toThrow()
  })

  it('throws forbidden for view-only users on unsubmitted applications', () => {
    context.state.applicationStatus = 'IN_PROGRESS'

    request.can.mockImplementation((action) => {
      return action === 'view'
    })

    expect(() => enforcePagePermission(request, h, context)).toThrow()
  })

  it('throws forbidden when user has no permissions', () => {
    request.can.mockReturnValue(false)

    expect(() => enforcePagePermission(request, h, context)).toThrow()
  })

  it('throws Boom forbidden error', () => {
    request.can.mockReturnValue(false)

    try {
      enforcePagePermission(request, h, context)
    } catch (err) {
      expect(err.output.statusCode).toBe(403)
      expect(err.message).toBe('Insufficient permissions')
    }
  })
})

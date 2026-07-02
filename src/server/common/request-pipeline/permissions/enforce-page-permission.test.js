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

const canView = (action) => action === 'view'
const canAmendNotSubmit = (action) => action === 'amend'

describe('isCannotSubmitUser', () => {
  it('returns true when user can amend but cannot submit', () => {
    const request = { can: vi.fn(canAmendNotSubmit) }

    expect(isCannotSubmitUser(request, 'submit', 'csApplications')).toBe(true)
  })

  it.each([
    ['required permission is not submit', 'view'],
    ['user can submit', 'submit']
  ])('returns false when %s', (_label, requiredPermission) => {
    const request = { can: vi.fn(() => true) }

    expect(isCannotSubmitUser(request, requiredPermission, 'csApplications')).toBe(false)
  })
})

describe('isSubmittedApplication', () => {
  it.each([
    [ApplicationStatus.SUBMITTED, true],
    [ApplicationStatus.REOPENED, false],
    [undefined, false],
    ['IN_PROGRESS', false]
  ])('isSubmittedApplication(%s) === %s', (applicationStatus, expected) => {
    expect(isSubmittedApplication({ state: { applicationStatus } })).toBe(expected)
  })
})

describe('isViewOnlyUser', () => {
  it.each([
    ['can only view', canView, true],
    ['can view and amend', (action) => ['view', 'amend'].includes(action), false],
    ['cannot view', () => false, false]
  ])('returns the right result when user %s', (_label, can, expected) => {
    expect(isViewOnlyUser({ can: vi.fn(can) }, 'csApplications')).toBe(expected)
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

  it('returns check-selected-land-actions for farm-payments when no task list exists', () => {
    vi.mocked(getTaskListPath).mockReturnValue(undefined)

    const result = getReturnToApplicationPath({}, '/farm-payments', 'farm-payments')

    expect(result).toEqual({
      href: '/farm-payments/check-selected-land-actions',
      text: 'Return to summary'
    })
  })

  it('still prefers task list over farm-payments exception when task list exists', () => {
    vi.mocked(getTaskListPath).mockReturnValue('/task-list')

    const result = getReturnToApplicationPath({}, '/farm-payments', 'farm-payments')

    expect(result).toEqual({
      href: '/farm-payments/task-list',
      text: 'Return to task list'
    })
  })
})

describe('isAllowedViewOnlyPath', () => {
  it.each([
    ['confirmation', true],
    ['print-submitted-application', true],
    ['task-list', false]
  ])('isAllowedViewOnlyPath(%s) === %s', (path, expected) => {
    expect(isAllowedViewOnlyPath(path)).toBe(expected)
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

  it('returns h.continue when user has required submit permission', () => {
    vi.mocked(getRequiredPermission).mockReturnValue('submit')

    request.can.mockImplementation((action) => action === 'submit')

    expect(enforcePagePermission(request, h, context)).toBe(h.continue)
  })

  it('redirects amend-only users attempting submit', () => {
    vi.mocked(getRequiredPermission).mockReturnValue('submit')
    vi.mocked(getTaskListPath).mockReturnValue('/task-list')

    request.can.mockImplementation(canAmendNotSubmit)

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

  it.each(['confirmation', 'print-submitted-application'])('allows submitted view-only users to access %s', (path) => {
    request.params.path = path
    request.can.mockImplementation(canView)

    const result = enforcePagePermission(request, h, context)

    expect(result).toBe(h.continue)
  })

  it('throws when view-only user accesses a non-allowed path', () => {
    request.params.path = 'task-list'

    request.can.mockImplementation(canView)

    expect(() => enforcePagePermission(request, h, context)).toThrow()
  })

  it.each([
    ['confirmation', 'IN_PROGRESS'],
    ['confirmation', ApplicationStatus.REOPENED],
    ['print-submitted-application', undefined],
    ['print-submitted-application', ApplicationStatus.REOPENED]
  ])('throws a 403 when a view-only user accesses %s while application is %s', (path, applicationStatus) => {
    context.state.applicationStatus = applicationStatus
    request.params.path = path

    request.can.mockImplementation(canView)

    let error
    try {
      enforcePagePermission(request, h, context)
    } catch (err) {
      error = err
    }

    expect(error.output.statusCode).toBe(403)
  })

  it('throws a 403 Boom forbidden error when the user has no permissions', () => {
    request.can.mockReturnValue(false)

    expect(() => enforcePagePermission(request, h, context)).toThrow(
      expect.objectContaining({
        message: 'Insufficient permissions',
        output: expect.objectContaining({ statusCode: 403 })
      })
    )
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

  it('redirects amend-only farm-payments users to check-selected-land-actions', () => {
    vi.mocked(getRequiredPermission).mockReturnValue('submit')
    vi.mocked(getTaskListPath).mockReturnValue(undefined)

    request.params.slug = 'farm-payments'
    request.can.mockImplementation(canAmendNotSubmit)

    const takeover = vi.fn(() => 'redirected')

    h.redirect.mockReturnValue({
      takeover
    })

    enforcePagePermission(request, h, context)

    expect(h.redirect).toHaveBeenCalledWith(
      '/cannot-submit?returnUrl=%2Ffarm-payments%2Fcheck-selected-land-actions&returnText=Return%20to%20summary'
    )
  })
})

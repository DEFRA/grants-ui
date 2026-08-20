import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  enforcePagePermission,
  getCannotSubmitContent,
  getRequiredStatusForViewOnlyPath,
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

  it.each([
    [ApplicationStatus.CLAIM_SUBMITTED, true],
    [ApplicationStatus.SUBMITTED, false],
    [undefined, false]
  ])(
    'isSubmittedApplication(%s, CLAIM_SUBMITTED) === %s when an explicit status is given',
    (applicationStatus, expected) => {
      expect(isSubmittedApplication({ state: { applicationStatus } }, ApplicationStatus.CLAIM_SUBMITTED)).toBe(expected)
    }
  )
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

describe('getRequiredStatusForViewOnlyPath', () => {
  it.each([
    ['confirmation', ApplicationStatus.SUBMITTED],
    ['print-submitted-application', ApplicationStatus.SUBMITTED],
    ['claim-confirmation', ApplicationStatus.CLAIM_SUBMITTED],
    ['task-list', undefined]
  ])('getRequiredStatusForViewOnlyPath(%s) === %s', (path, expected) => {
    expect(getRequiredStatusForViewOnlyPath(path)).toBe(expected)
  })
})

describe('getCannotSubmitContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const buildRequest = (metadata = {}) => ({
    params: { slug: 'sfi' },
    app: { model: { def: { metadata: { permissions: metadata } } } }
  })

  const applicationContent =
    '<p class="govuk-body">Your progress has been saved.</p>' +
    '<p class="govuk-body">You do not have permission to submit the application.</p>' +
    '<p class="govuk-body">Contact an authorised person from your business to review and submit the application.</p>'

  const claimContent =
    '<p class="govuk-body">Your progress has been saved.</p>' +
    '<p class="govuk-body">You do not have permission to submit the claim.</p>' +
    '<p class="govuk-body">Contact an authorised person from your business to review and submit the claim.</p>'

  it('falls back to application wording and the default return button for an unknown resource', () => {
    vi.mocked(getPermissionResource).mockReturnValue('somethingElse')
    vi.mocked(getTaskListPath).mockReturnValue(undefined)

    expect(getCannotSubmitContent(buildRequest())).toEqual({
      pageTitle: 'You cannot submit this application',
      content: applicationContent,
      returnUrl: '/sfi/summary',
      returnText: 'Return to summary'
    })
  })

  it('uses claim wording and the default return button when there is no cannotSubmit config block', () => {
    vi.mocked(getPermissionResource).mockReturnValue('csAgreements')
    vi.mocked(getTaskListPath).mockReturnValue('/task-list')

    expect(getCannotSubmitContent(buildRequest())).toEqual({
      pageTitle: 'You cannot submit this claim',
      content: claimContent,
      returnUrl: '/sfi/task-list',
      returnText: 'Return to task list'
    })
  })

  it('omits the default return button when a cannotSubmit config block exists without returnUrl/returnText', () => {
    vi.mocked(getPermissionResource).mockReturnValue('csAgreements')
    vi.mocked(getTaskListPath).mockReturnValue('/task-list')

    const request = buildRequest({
      cannotSubmit: {
        csAgreements: {}
      }
    })

    expect(getCannotSubmitContent(request)).toEqual({
      pageTitle: 'You cannot submit this claim',
      content: claimContent
    })
    expect(getTaskListPath).not.toHaveBeenCalled()
  })

  it('merges form-def overrides (title, content and return button) over the resource defaults', () => {
    vi.mocked(getPermissionResource).mockReturnValue('csApplications')

    const request = buildRequest({
      cannotSubmit: {
        csApplications: {
          content: '<p class="govuk-body">Custom content.</p>',
          returnUrl: '/sfi/task-list',
          returnText: 'Return to task list'
        }
      }
    })

    expect(getCannotSubmitContent(request)).toEqual({
      pageTitle: 'You cannot submit this application',
      content: '<p class="govuk-body">Custom content.</p>',
      returnUrl: '/sfi/task-list',
      returnText: 'Return to task list'
    })
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
      can: vi.fn(),
      sendAuditEventInBackground: vi.fn()
    }

    h = {
      continue: Symbol('continue'),
      view: vi.fn(() => ({
        takeover: vi.fn(() => 'rendered')
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

  it('renders the cannot-submit page in place with the default return button for amend-only users', () => {
    vi.mocked(getRequiredPermission).mockReturnValue('submit')
    vi.mocked(getTaskListPath).mockReturnValue(undefined)
    request.can.mockImplementation(canAmendNotSubmit)

    const result = enforcePagePermission(request, h, context)

    expect(h.view).toHaveBeenCalledWith('cannot-submit', {
      pageTitle: 'You cannot submit this application',
      content:
        '<p class="govuk-body">Your progress has been saved.</p>' +
        '<p class="govuk-body">You do not have permission to submit the application.</p>' +
        '<p class="govuk-body">Contact an authorised person from your business to review and submit the application.</p>',
      returnUrl: '/sfi/summary',
      returnText: 'Return to summary'
    })
    expect(result).toBe('rendered')
    expect(request.sendAuditEventInBackground).not.toHaveBeenCalled()
  })

  it('renders claim wording with the default return button when the page resource is csAgreements', () => {
    vi.mocked(getRequiredPermission).mockReturnValue('submit')
    vi.mocked(getPermissionResource).mockReturnValue('csAgreements')
    vi.mocked(getTaskListPath).mockReturnValue('/task-list')
    request.can.mockImplementation(canAmendNotSubmit)

    const result = enforcePagePermission(request, h, context)

    expect(h.view).toHaveBeenCalledWith('cannot-submit', {
      pageTitle: 'You cannot submit this claim',
      content:
        '<p class="govuk-body">Your progress has been saved.</p>' +
        '<p class="govuk-body">You do not have permission to submit the claim.</p>' +
        '<p class="govuk-body">Contact an authorised person from your business to review and submit the claim.</p>',
      returnUrl: '/sfi/task-list',
      returnText: 'Return to task list'
    })
    expect(result).toBe('rendered')
  })

  it('applies form-def cannotSubmit overrides (including the return button) for the matched resource', () => {
    vi.mocked(getRequiredPermission).mockReturnValue('submit')
    vi.mocked(getPermissionResource).mockReturnValue('csAgreements')
    request.app.model.def.metadata.permissions.cannotSubmit = {
      csAgreements: {
        pageTitle: 'You cannot submit this claim yet',
        content: '<p class="govuk-body">Custom claim content.</p>',
        returnUrl: '/sfi/claim-tasks',
        returnText: 'Return to claim'
      }
    }
    request.can.mockImplementation(canAmendNotSubmit)

    enforcePagePermission(request, h, context)

    expect(h.view).toHaveBeenCalledWith('cannot-submit', {
      pageTitle: 'You cannot submit this claim yet',
      content: '<p class="govuk-body">Custom claim content.</p>',
      returnUrl: '/sfi/claim-tasks',
      returnText: 'Return to claim'
    })
  })

  it.each(['confirmation', 'print-submitted-application'])('allows submitted view-only users to access %s', (path) => {
    request.params.path = path
    request.can.mockImplementation(canView)

    const result = enforcePagePermission(request, h, context)

    expect(result).toBe(h.continue)
    expect(request.sendAuditEventInBackground).not.toHaveBeenCalled()
  })

  it('allows claim-submitted view-only users to access claim-confirmation', () => {
    request.params.path = 'claim-confirmation'
    context.state.applicationStatus = ApplicationStatus.CLAIM_SUBMITTED
    request.can.mockImplementation(canView)

    const result = enforcePagePermission(request, h, context)

    expect(result).toBe(h.continue)
    expect(request.sendAuditEventInBackground).not.toHaveBeenCalled()
  })

  it.each([ApplicationStatus.SUBMITTED, ApplicationStatus.REOPENED, undefined])(
    'throws a 403 when a view-only user accesses claim-confirmation while application is %s',
    (applicationStatus) => {
      request.params.path = 'claim-confirmation'
      context.state.applicationStatus = applicationStatus
      request.can.mockImplementation(canView)

      let error
      try {
        enforcePagePermission(request, h, context)
      } catch (err) {
        error = err
      }

      expect(error.output.statusCode).toBe(403)
    }
  )

  it('throws and audits an unauthorised event when a view-only user is denied a non-allowed path', () => {
    request.params.path = 'task-list'

    request.can.mockImplementation(canView)

    expect(() => enforcePagePermission(request, h, context)).toThrow()
    expect(request.sendAuditEventInBackground).toHaveBeenCalledWith({
      action: 'unauthorised',
      status: 'denied',
      details: { reason: 'permission', grantCode: 'sfi', permission: 'view' }
    })
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

  it('throws a 403 and audits an unauthorised event when the user has no permissions', () => {
    vi.mocked(getRequiredPermission).mockReturnValue('submit')
    request.can.mockReturnValue(false)

    expect(() => enforcePagePermission(request, h, context)).toThrow(
      expect.objectContaining({
        message: 'Insufficient permissions',
        output: expect.objectContaining({ statusCode: 403 })
      })
    )
    expect(request.sendAuditEventInBackground).toHaveBeenCalledWith({
      action: 'unauthorised',
      status: 'denied',
      details: { reason: 'permission', grantCode: 'sfi', permission: 'submit' }
    })
  })

  it('throws when model missing while rendering the cannot-submit page', () => {
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
})

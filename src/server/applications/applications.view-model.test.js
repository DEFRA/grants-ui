import { expect, it, vi } from 'vitest'
import { buildApplicationsViewModel } from './applications.view-model.js'

vi.mock('../common/helpers/feedback-survey.js', () => ({
  buildFeedbackSurveyUrl: vi.fn(() => 'https://survey.example')
}))
vi.mock('../common/helpers/application-window.js', () => ({ isApplicationWindowOpen: vi.fn(() => true) }))

const request = {
  params: { slug: 'test-grant' },
  url: new URL('https://grants.example/test-grant/applications'),
  app: {}
}
const definition = { name: 'Test grant', metadata: { allowMultipleApplications: true } }
const rules = [
  { fromGrantsStatus: 'SUBMITTED', gasStatus: 'APPLICATION_AMEND', toGrantsStatus: 'REOPENED', toPath: '/summary' },
  { fromGrantsStatus: 'default', gasStatus: 'default', toGrantsStatus: 'SUBMITTED', toPath: '/confirmation' }
]
const submitted = { applicationRef: 'REF-1', applicationStatus: 'SUBMITTED', submittedAt: '2026-03-01T12:00:00Z' }

it.each([
  [
    'its own rules confirm it submitted',
    { rules, ownMajor: true },
    'RECEIVED',
    'Submitted',
    '/test-grant/print-submitted-application?ref=REF-1'
  ],
  [
    'only hint rules confirm it submitted',
    { rules, ownMajor: false },
    'RECEIVED',
    'Submitted',
    '/test-grant?ref=REF-1'
  ],
  [
    'hint rules say it is returned',
    { rules, ownMajor: false },
    'APPLICATION_AMEND',
    'Returned for amendments',
    '/test-grant?ref=REF-1'
  ],
  ['it has no rules', undefined, 'APPLICATION_AMEND', 'Submitted', '/test-grant?ref=REF-1'],
  ['GAS could not be read', { rules, ownMajor: true }, undefined, 'Submitted', '/test-grant?ref=REF-1']
])(
  'opens a submitted application as its print view only when %s',
  (_, applicationRules, gasStatus, statusText, href) => {
    const viewModel = buildApplicationsViewModel(request, definition, [submitted], {
      gasStatuses: new Map(gasStatus ? [['REF-1', gasStatus]] : []),
      postSubmissionRules: new Map(applicationRules ? [['REF-1', applicationRules]] : [])
    })

    expect(viewModel.applications).toEqual([expect.objectContaining({ referenceNumber: 'REF-1', statusText, href })])
  }
)

it('shows no submitted date for a returned application and keeps it for a submitted one', () => {
  const viewModel = buildApplicationsViewModel(
    request,
    definition,
    [submitted, { ...submitted, applicationRef: 'REF-2' }],
    {
      gasStatuses: new Map([
        ['REF-1', 'APPLICATION_AMEND'],
        ['REF-2', 'RECEIVED']
      ]),
      postSubmissionRules: new Map([
        ['REF-1', { rules, ownMajor: true }],
        ['REF-2', { rules, ownMajor: true }]
      ])
    }
  )

  expect(viewModel.applications.map(({ submittedAt, actionText }) => ({ submittedAt, actionText }))).toEqual([
    { submittedAt: null, actionText: 'Continue application' },
    { submittedAt: '2026-03-01T12:00:00Z', actionText: 'View application' }
  ])
})

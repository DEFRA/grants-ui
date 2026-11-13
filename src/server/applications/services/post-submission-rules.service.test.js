import { beforeEach, expect, it, vi } from 'vitest'
import { readPostSubmissionRules } from './post-submission-rules.service.js'
import { fetchLatestDefinitionFromApi } from '../../common/helpers/state/fetch-saved-state-helper.js'
import { loadSharedRedirectRules } from '../../common/forms/services/form.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'
import { logHandledError } from '../../common/helpers/logging/handled-error.js'

vi.mock('../../common/helpers/state/fetch-saved-state-helper.js', () => ({ fetchLatestDefinitionFromApi: vi.fn() }))
vi.mock('../../common/forms/services/form.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadSharedRedirectRules: vi.fn()
}))
vi.mock('../../common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})
vi.mock('../../common/helpers/logging/handled-error.js', () => ({ logHandledError: vi.fn() }))

const sharedRules = { postSubmission: [{ fromGrantsStatus: 'default', gasStatus: 'default', toPath: '/confirmation' }] }
const latestRules = [
  { fromGrantsStatus: 'SUBMITTED', gasStatus: 'SENT_BACK', toGrantsStatus: 'REOPENED', toPath: '/tasks' }
]
const majorOneRules = [
  { fromGrantsStatus: 'SUBMITTED', gasStatus: 'RETURNED', toGrantsStatus: 'REOPENED', toPath: '/summary' }
]
const latest = { major: 2, definition: { metadata: { grantRedirectRules: { postSubmission: latestRules } } } }
const majorOne = { major: 1, definition: { metadata: { grantRedirectRules: { postSubmission: majorOneRules } } } }
const request = { params: { slug: 'test-grant' } }
const application = (applicationRef, pinnedMajor) => ({ applicationRef, pinnedMajor })

beforeEach(() => {
  vi.clearAllMocks()
  loadSharedRedirectRules.mockResolvedValue(sharedRules)
  fetchLatestDefinitionFromApi.mockResolvedValue(majorOne)
})

it('serves the latest major from its own document and reads each other major from the backend once', async () => {
  const rules = await readPostSubmissionRules(request, 'test-grant', latest, [
    application('REF-A', 2),
    application('REF-B', 1),
    application('REF-C', 1)
  ])

  expect(fetchLatestDefinitionFromApi).toHaveBeenCalledTimes(1)
  expect(fetchLatestDefinitionFromApi).toHaveBeenCalledWith('test-grant', { major: 1 })
  expect(rules.get('REF-A')).toEqual({ rules: latestRules, ownMajor: true })
  expect(rules.get('REF-B')).toEqual({ rules: majorOneRules, ownMajor: true })
  expect(rules.get('REF-C').rules).toBe(rules.get('REF-B').rules)
  expect(log).not.toHaveBeenCalled()
})

it('starts the backend reads without waiting for the shared rules', async () => {
  let shareRules
  loadSharedRedirectRules.mockReturnValue(
    new Promise((resolve) => {
      shareRules = resolve
    })
  )

  const rules = readPostSubmissionRules(request, 'test-grant', latest, [application('REF-B', 1)])

  expect(fetchLatestDefinitionFromApi).toHaveBeenCalledWith('test-grant', { major: 1 })
  shareRules(sharedRules)
  expect((await rules).get('REF-B').rules).toEqual(majorOneRules)
})

it('gives a major whose definition has no rules of its own the shared rules', async () => {
  fetchLatestDefinitionFromApi.mockResolvedValue({ major: 1, definition: { metadata: {} } })

  const rules = await readPostSubmissionRules(request, 'test-grant', latest, [application('REF-B', 1)])

  expect(rules.get('REF-B')).toEqual({ rules: sharedRules.postSubmission, ownMajor: true })
})

it('reads every pinned major from the backend when the latest document has no major', async () => {
  const rules = await readPostSubmissionRules(request, 'test-grant', { definition: latest.definition }, [
    application('REF-A', 1)
  ])

  expect(fetchLatestDefinitionFromApi).toHaveBeenCalledWith('test-grant', { major: 1 })
  expect(rules.get('REF-A')).toEqual({ rules: majorOneRules, ownMajor: true })
})

it('reads nothing at all when no application is listed', async () => {
  const rules = await readPostSubmissionRules(request, 'test-grant', latest, [])

  expect(rules.size).toBe(0)
  expect(loadSharedRedirectRules).not.toHaveBeenCalled()
  expect(fetchLatestDefinitionFromApi).not.toHaveBeenCalled()
})

it("gives applications listed without a pinned major the latest definition's rules as a hint, and names them once", async () => {
  const rules = await readPostSubmissionRules(request, 'test-grant', latest, [
    application('REF-A', 2),
    application('REF-X', null),
    { applicationRef: 'REF-Y' }
  ])

  expect(fetchLatestDefinitionFromApi).not.toHaveBeenCalled()
  expect(rules.get('REF-A')).toEqual({ rules: latestRules, ownMajor: true })
  expect(rules.get('REF-X')).toEqual({ rules: latestRules, ownMajor: false })
  expect(rules.get('REF-Y')).toEqual({ rules: latestRules, ownMajor: false })
  expect(log).toHaveBeenCalledTimes(1)
  expect(log).toHaveBeenCalledWith(
    LogCodes.APPLICATIONS.NO_PINNED_MAJOR,
    { grantCode: 'test-grant', applicationRefs: 'REF-X, REF-Y' },
    request
  )
})

it.each([
  ['no active definition', null, 'No active definition'],
  ['a definition without content', { major: 1 }, 'Definition has no content']
])(
  "gives the applications of a major with %s the latest definition's rules as a hint, and says so",
  async (_, document, reason) => {
    fetchLatestDefinitionFromApi.mockResolvedValue(document)

    const rules = await readPostSubmissionRules(request, 'test-grant', latest, [
      application('REF-A', 2),
      application('REF-B', 1)
    ])

    expect(rules.get('REF-B')).toEqual({ rules: latestRules, ownMajor: false })
    expect(rules.get('REF-A')).toEqual({ rules: latestRules, ownMajor: true })
    expect(log).toHaveBeenCalledWith(
      LogCodes.APPLICATIONS.RULES_UNAVAILABLE,
      { grantCode: 'test-grant', major: 1, errorMessage: reason },
      request
    )
  }
)

it("gives the applications of a major whose definition failed to load the latest definition's rules as a hint, and logs the failure", async () => {
  const error = new Error('Failed to fetch grant definition: 503')
  fetchLatestDefinitionFromApi.mockRejectedValue(error)

  const rules = await readPostSubmissionRules(request, 'test-grant', latest, [
    application('REF-A', 2),
    application('REF-B', 1)
  ])

  expect(rules.get('REF-B')).toEqual({ rules: latestRules, ownMajor: false })
  expect(rules.get('REF-A')).toEqual({ rules: latestRules, ownMajor: true })
  expect(logHandledError).toHaveBeenCalledWith(error, request, {
    fallbackCode: LogCodes.APPLICATIONS.RULES_UNAVAILABLE,
    fallbackDetails: { grantCode: 'test-grant', major: 1 }
  })
})

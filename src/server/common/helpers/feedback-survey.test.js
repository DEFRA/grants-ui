import { config } from '~/src/config/config.js'
import {
  buildFeedbackSurveyUrl,
  resolveJourney,
  JOURNEY,
  SCHEME_LABELS
} from '~/src/server/common/helpers/feedback-survey.js'

const BASE_URL = 'https://defragroup.eu.qualtrics.com/jfe/form/SV_test'

/**
 * @param {object} [overrides]
 * @returns {any}
 */
function mockRequest({ slug = 'woodland', path = '/woodland/summary', href } = {}) {
  return {
    params: { slug },
    path,
    url: { href: href ?? `https://grants.example${path}` },
    info: { host: 'grants.example' },
    server: { info: { protocol: 'https' } }
  }
}

describe('#resolveJourney', () => {
  test.each([
    ['/woodland/confirmation', JOURNEY.submitted],
    ['/woodland/print-submitted-application', JOURNEY.submitted],
    ['/woodland/summary', JOURNEY.inProgress],
    [undefined, JOURNEY.inProgress]
  ])('resolves %s to %s', (path, expected) => {
    expect(resolveJourney(path)).toBe(expected)
  })
})

describe('#buildFeedbackSurveyUrl', () => {
  beforeEach(() => {
    config.set('feedback.surveyUrl', BASE_URL)
  })

  afterEach(() => {
    config.set('feedback.surveyUrl', '')
  })

  test('builds URL with grant, journey and url params for an in-scope grant', () => {
    const result = buildFeedbackSurveyUrl(mockRequest({ slug: 'woodland', path: '/woodland/summary' }))
    const url = new URL(/** @type {string} */ (result))

    expect(url.origin + url.pathname).toBe(BASE_URL)
    expect(url.searchParams.get('grant')).toBe('Woodland Management Plan')
    expect(url.searchParams.get('journey')).toBe(JOURNEY.inProgress)
    expect(url.searchParams.get('url')).toBe('https://grants.example/woodland/summary')
  })

  test('falls back to https protocol and host when request.url, server and path are absent', () => {
    const result = buildFeedbackSurveyUrl({
      params: { slug: 'woodland' },
      info: { host: 'grants.example' }
    })
    const url = new URL(/** @type {string} */ (result))
    expect(url.searchParams.get('url')).toBe('https://grants.example')
  })

  test('uses submitted journey on the confirmation page', () => {
    const result = buildFeedbackSurveyUrl(mockRequest({ slug: 'woodland', path: '/woodland/confirmation' }))
    const url = new URL(/** @type {string} */ (result))
    expect(url.searchParams.get('journey')).toBe(JOURNEY.submitted)
  })

  test('sends the Farm Payments label for the farm-payments slug', () => {
    const result = buildFeedbackSurveyUrl(mockRequest({ slug: 'farm-payments', path: '/farm-payments/start' }))
    const url = new URL(/** @type {string} */ (result))
    expect(url.searchParams.get('grant')).toBe('Farm Payments')
  })

  test('returns null for an out-of-scope grant (gating)', () => {
    expect(buildFeedbackSurveyUrl(mockRequest({ slug: 'some-other-grant' }))).toBeNull()
  })

  test('returns null when no slug is present', () => {
    expect(buildFeedbackSurveyUrl({ path: '/', params: {} })).toBeNull()
  })

  test('returns null when survey URL is not configured', () => {
    config.set('feedback.surveyUrl', '')
    expect(buildFeedbackSurveyUrl(mockRequest())).toBeNull()
  })

  test('returns null for an undefined request', () => {
    expect(buildFeedbackSurveyUrl(undefined)).toBeNull()
  })

  test('appends params with & when base URL already has a query string', () => {
    config.set('feedback.surveyUrl', `${BASE_URL}?existing=1`)
    const result = /** @type {string} */ (buildFeedbackSurveyUrl(mockRequest()))
    expect(result.startsWith(`${BASE_URL}?existing=1&`)).toBe(true)
    const url = new URL(result)
    expect(url.searchParams.get('existing')).toBe('1')
    expect(url.searchParams.get('grant')).toBe('Woodland Management Plan')
  })

  test('scope allowlist keys map to their exact labels', () => {
    expect(SCHEME_LABELS).toEqual({
      'farm-payments': 'Farm Payments',
      woodland: 'Woodland Management Plan'
    })
  })
})
